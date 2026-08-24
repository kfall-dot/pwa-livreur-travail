import type { ParsedEbLine } from '../db/schema.js'
import { inferEbSpendCategory } from '../../shared/ebSpendCategory.js'

/**
 * Parseur EB inspiré de `docs/whatsapp_eb_parser.py` :
 * message WhatsApp informel → lignes quantité / unité / désignation + chantier + urgence.
 */

export type ParsedEbResult = {
  lines: ParsedEbLine[]
  urgency?: string | null
  destination?: string | null
  neededBy?: string | null
  objet?: string | null
  missingInfo?: string[]
  dtActions?: string[]
  confidenceScore: number
  promptVersion?: string
  rawExtracted?: unknown
  isPurchaseRequest?: boolean
}

export type EbParseContext = {
  siteName?: string
  fromPhone?: string
  fromName?: string
}

const PROMPT_VERSION = 'whatsapp-eb-v1'

const UNIT_PATTERNS: Record<string, string[]> = {
  sac: ['sac', 'sacs', 'sachet', 'sachets'],
  botte: ['botte', 'bottes', 'barre', 'barres', 'tige', 'tiges'],
  tonne: ['tonne', 'tonnes', 't', 'ton'],
  kg: ['kg', 'kilos', 'kilo', 'kilogramme', 'kilogrammes'],
  metre: ['m', 'mètre', 'mètres', 'metre', 'metres', 'ml'],
  litre: ['l', 'litre', 'litres', 'ltr'],
  piece: ['pièce', 'pièces', 'piece', 'pieces', 'pc', 'pcs', 'unité', 'unités', 'unite', 'unites'],
  rouleau: ['rouleau', 'rouleaux'],
  palette: ['palette', 'palettes'],
  camion: ['camion', 'camions', 'benne', 'bennes'],
  seau: ['seau', 'seaux'],
  bidon: ['bidon', 'bidons'],
  carton: ['carton', 'cartons'],
  caisse: ['caisse', 'caisses'],
  colis: ['colis'],
}

const UNIT_LOOKUP = new Map<string, string>()
for (const [canonical, variants] of Object.entries(UNIT_PATTERNS)) {
  for (const variant of variants) UNIT_LOOKUP.set(variant, canonical)
}

const MATERIAL_KEYWORDS: Record<string, { category: string; specsHint: string }> = {
  ciment: { category: 'Matériau de construction', specsHint: 'Type de ciment (CPJ 42.5, CPJ 32.5, etc.)' },
  fer: { category: 'Acier / Fer', specsHint: 'Diamètre (Ø), longueur par barre, type (HA, rond lisse)' },
  gravier: { category: 'Granulat', specsHint: 'Granulométrie (5/15, 15/25, etc.)' },
  sable: { category: 'Granulat', specsHint: 'Type (sable fin, sable concassé, sable de rivière)' },
  béton: { category: 'Béton', specsHint: 'Dosage / résistance (B25, B30, etc.)' },
  beton: { category: 'Béton', specsHint: 'Dosage / résistance (B25, B30, etc.)' },
  tuile: { category: 'Couverture', specsHint: 'Type (mécanique, plate, etc.), dimension' },
  tôle: { category: 'Tôle', specsHint: 'Épaisseur, dimension, type (ondulée, plate)' },
  tole: { category: 'Tôle', specsHint: 'Épaisseur, dimension, type (ondulée, plate)' },
  brique: { category: 'Brique / Bloc', specsHint: 'Type (creuse, pleine, hourdis), dimension' },
  parpaing: { category: 'Brique / Bloc', specsHint: 'Type (15x20x50, etc.), plein / creux' },
  bois: { category: 'Bois', specsHint: 'Essence, section, longueur' },
  peinture: { category: 'Peinture', specsHint: 'Type (acrylique, glycéro), couleur, rendement' },
  câble: { category: 'Électricité', specsHint: 'Section (mm²), type (U1000R2V, etc.)' },
  cable: { category: 'Électricité', specsHint: 'Section (mm²), type (U1000R2V, etc.)' },
  tuyau: { category: 'Plomberie', specsHint: 'Diamètre, matériau (PVC, PEHD, etc.)' },
}

const DESTINATION_PATTERNS = [
  /pour\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]{1,}?)(?=\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)/iu,
  /sur\s+le\s+chantier\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]{1,}?)(?=\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)/iu,
  /chantier\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]{1,}?)(?=\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)/iu,
  /site\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s-]{1,}?)(?=\s+demain|\s+aujourd|\s+ce\s+soir|\s+matin|\s+soir|$)/iu,
]

const DELAY_FIXED: Array<{ pattern: RegExp; days: number; period: string; urgent: boolean }> = [
  { pattern: /demain\s+matin/i, days: 1, period: 'Matinée', urgent: true },
  { pattern: /demain\s+soir/i, days: 1, period: 'Soirée', urgent: true },
  { pattern: /demain/i, days: 1, period: 'Journée', urgent: true },
  { pattern: /aujourd['’]?hui/i, days: 0, period: 'Immédiat', urgent: true },
  { pattern: /ce\s+soir/i, days: 0, period: 'Soirée', urgent: true },
  { pattern: /ce\s+matin/i, days: 0, period: 'Matinée', urgent: true },
  { pattern: /avant\s+la\s+fin\s+de\s+la\s+semaine/i, days: 3, period: 'Fin de semaine', urgent: false },
  { pattern: /urgent|asap|vite|au\s+plus\s+t[oô]t|d[eè]s\s+que\s+possible/i, days: 0, period: 'Immédiat', urgent: true },
]

const SEGMENT_SPLIT = /\s*,\s*|\s+et\s+|\s*;\s+/i
const QTY_UNIT_LINE =
  /(\d+(?:[.,]\d+)?)\s+([\p{L}]+)\s+(?:de\s+|d['’])?(.+)/iu

const NUMBER_WORDS: Array<[string, string]> = [
  ['une tonne', '1 tonne'],
  ['un sac', '1 sac'],
  ['une botte', '1 botte'],
  ['cinquante', '50'],
  ['quarante', '40'],
  ['soixante', '60'],
  ['trente', '30'],
  ['vingt', '20'],
  ['quatre', '4'],
  ['trois', '3'],
  ['mille', '1000'],
  ['cent', '100'],
  ['dix', '10'],
  ['neuf', '9'],
  ['huit', '8'],
  ['sept', '7'],
  ['cinq', '5'],
  ['deux', '2'],
  ['une', '1'],
  ['un', '1'],
  ['six', '6'],
]

function parseQuantity(raw: string): number {
  const value = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : 0
}

function detectUnit(word: string): { canonical: string; original: string } | null {
  const normalized = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^[.,;:!?]+|[.,;:!?]+$/g, '')
  const canonical = UNIT_LOOKUP.get(word.toLowerCase()) ?? UNIT_LOOKUP.get(normalized)
  if (!canonical) return null
  return { canonical, original: word.toLowerCase() }
}

function detectMaterial(text: string): { name: string; category: string; specsHint: string } | null {
  const lower = text.toLowerCase()
  const keys = Object.keys(MATERIAL_KEYWORDS).sort((a, b) => b.length - a.length)
  for (const name of keys) {
    if (lower.includes(name)) return { name, ...MATERIAL_KEYWORDS[name]! }
  }
  return null
}

function normalizeNumbers(text: string): string {
  let next = text
  for (const [word, num] of NUMBER_WORDS) {
    next = next.replace(new RegExp(`\\b${word}\\b`, 'giu'), num)
  }
  return next
}

function capitalizeLabel(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Fautes fréquentes des messages WhatsApp chantier (FR / CI). */
const WHATSAPP_SPELLING: Array<[RegExp, string]> = [
  [/\bsimen(?:t|ts)?\b/giu, 'ciment'],
  [/\bcimen(?:t+s?)?\b/giu, 'ciment'],
  [/\bsimant(?:s)?\b/giu, 'ciment'],
  [/\bgravie(?:r)?s?\b/giu, 'gravier'],
  [/\bgravels?\b/giu, 'gravier'],
  [/\bsabl(?:e|es)?\b/giu, 'sable'],
  [/\bparpains?\b/giu, 'parpaing'],
  [/\btoles?\b/giu, 'tôle'],
  [/\btôles\b/giu, 'tôle'],
  [/\btones?\b/giu, 'tonne'],
  [/\btonnes\b/giu, 'tonnes'],
  [/\bchantie\b/giu, 'chantier'],
  [/\bshantiers?\b/giu, 'chantier'],
  [/\bchantiés?\b/giu, 'chantier'],
  [/\bdemin\b/giu, 'demain'],
  [/\baujourdhui\b/giu, "aujourd'hui"],
  [/\baujourdui\b/giu, "aujourd'hui"],
  [/\bbetons?\b/giu, 'béton'],
  [/\bferaille\b/giu, 'fer'],
  [/\bsacks?\b/giu, 'sacs'],
]

export function correctWhatsappSpelling(text: string): string {
  let next = text
  for (const [pattern, replacement] of WHATSAPP_SPELLING) {
    next = next.replace(pattern, replacement)
  }
  return next
}

function cleanDesignation(text: string): string {
  let cleaned = text.replace(
    /\s+(?:pour|à|au|sur|demain|matin|soir|aujourd['’]?hui?|ce)\s+.+$/iu,
    '',
  )
  cleaned = cleaned.replace(/\s+(?:et\s+.+|pour\s+.+)$/iu, '')
  cleaned = cleaned.replace(/^[.,;\s]+|[.,;\s]+$/g, '')
  return capitalizeLabel(cleaned)
}

function buildSpecifications(
  designation: string,
  material: { category: string; specsHint: string } | null,
): { specs: string; missing: string[]; observation: string } {
  const parts: string[] = []
  const missing: string[] = []
  if (material) {
    parts.push(`Catégorie: ${material.category}`)
    missing.push(material.specsHint)
  }
  const diameter = designation.match(/(\d+)\s*[/-]\s*(\d+)/)
  if (diameter) {
    parts.push(`Diamètres Ø${diameter[1]}mm et Ø${diameter[2]}mm`)
  }
  const dim = designation.match(/(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+)/)
  if (dim) {
    parts.push(`Dimensions: ${dim[0].replace(/\s+/g, '')}`)
  }
  const specs = parts.length > 0 ? parts.join(' | ') : 'Spécifications à compléter par le DT'
  const observation = parts.filter((p) => !p.startsWith('Catégorie:')).join(' · ')
  return { specs, missing, observation }
}

function detectDestination(text: string): string | null {
  for (const pattern of DESTINATION_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const dest = match[1].trim().replace(/[.,;]+$/g, '')
      if (dest.length >= 3) return capitalizeLabel(dest)
    }
  }
  return null
}

function formatNeededBy(days: number, period: string): string {
  const target = new Date()
  target.setDate(target.getDate() + days)
  const date = target.toLocaleDateString('fr-FR')
  return period ? `${date} — ${period}` : date
}

function detectDelay(text: string): { neededBy: string | null; urgency: 'urgent' | 'normal' } {
  const relativeDays = text.match(/dans\s+(\d+)\s+jour/i)
  if (relativeDays) {
    const nb = Number.parseInt(relativeDays[1]!, 10)
    return { neededBy: formatNeededBy(nb, 'Jours'), urgency: nb <= 1 ? 'urgent' : 'normal' }
  }
  const relativeWeeks = text.match(/dans\s+(\d+)\s+semaine/i)
  if (relativeWeeks) {
    const nb = Number.parseInt(relativeWeeks[1]!, 10)
    return { neededBy: formatNeededBy(nb * 7, 'Semaines'), urgency: 'normal' }
  }
  for (const rule of DELAY_FIXED) {
    if (rule.pattern.test(text)) {
      return {
        neededBy: formatNeededBy(rule.days, rule.period),
        urgency: rule.urgent ? 'urgent' : 'normal',
      }
    }
  }
  return { neededBy: null, urgency: 'normal' }
}

function parseProductSegments(text: string): ParsedEbLine[] {
  const normalized = normalizeNumbers(text)
  const segments = normalized.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean)
  const lines: ParsedEbLine[] = []

  for (const segment of segments) {
    const match = segment.match(QTY_UNIT_LINE)
    if (!match) continue
    const quantity = parseQuantity(match[1]!)
    const unitHit = detectUnit(match[2]!)
    if (!unitHit || quantity <= 0) continue
    const designation = cleanDesignation(match[3] ?? '')
    if (!designation) continue
    const material = detectMaterial(designation)
    const { observation } = buildSpecifications(designation, material)
    lines.push({
      label: designation,
      quantity,
      unit: unitHit.original,
      spendCategory: inferEbSpendCategory(designation),
      ...(observation ? { observation } : {}),
    })
  }

  return lines
}

export function buildEbObjet(lines: ParsedEbLine[], destination?: string | null): string {
  const names = [
    ...new Set(
      lines
        .map((l) => l.label.replace(/\s+\d.*$/, '').trim())
        .filter(Boolean),
    ),
  ]
  const part = names.slice(0, 4).join(', ')
  if (part) return `BESOIN - ${part}`
  if (destination && destination !== 'À préciser') return `BESOIN - ${destination}`
  return 'BESOIN'
}

export function matchSiteFromDestination<T extends { name: string }>(
  sites: T[],
  destination?: string | null,
): T | null {
  const dest = destination?.trim().toLowerCase()
  if (!dest || dest === 'à préciser' || dest.length < 3) return null
  return (
    sites.find((s) => {
      const name = s.name.toLowerCase()
      return name.includes(dest) || dest.includes(name)
    }) ?? null
  )
}

function parseEbFromTextSync(text: string, context?: EbParseContext): ParsedEbResult {
  const trimmed = correctWhatsappSpelling(text).trim()
  if (!trimmed) {
    return { lines: [], confidenceScore: 0, promptVersion: PROMPT_VERSION }
  }

  const lines = parseProductSegments(trimmed)
  const destination = detectDestination(trimmed)
  const delay = detectDelay(trimmed)
  const missingInfo: string[] = []
  const dtActions = [
    'Vérifier et compléter les spécifications techniques',
    'Ajouter le contact livraison sur site',
    'Préciser l’heure de livraison souhaitée',
  ]

  if (!destination) missingInfo.push('Destination / chantier non détectée')
  if (!delay.neededBy) missingInfo.push('Date de besoin non détectée')
  for (const [index, line] of lines.entries()) {
    const material = detectMaterial(line.label)
    if (material) missingInfo.push(`Ligne ${index + 1} (${line.label}): ${material.specsHint}`)
  }
  if (delay.urgency === 'urgent') {
    dtActions.unshift('Vérifier la disponibilité des fonds avec le DAF (urgence D+1)')
  }

  const confidenceScore =
    lines.length === 0
      ? 0.1
      : Math.min(0.95, 0.55 + lines.length * 0.12 + (destination ? 0.08 : 0) + (delay.neededBy ? 0.05 : 0))

  const objet = buildEbObjet(lines, destination)

  const rawExtracted = {
    demandeur: context?.fromName ?? 'À identifier',
    projetChantier: destination ?? 'À préciser',
    dateBesoin: delay.neededBy ?? 'À préciser',
    objet,
    urgence: delay.urgency,
    lines,
    infosManquantes: missingInfo,
    actionsDt: dtActions,
  }

  return {
    lines,
    urgency: delay.urgency,
    destination,
    neededBy: delay.neededBy,
    objet,
    missingInfo,
    dtActions,
    confidenceScore,
    promptVersion: PROMPT_VERSION,
    rawExtracted,
    isPurchaseRequest: lines.length > 0,
  }
}

/** Parseur EB rule-based (WhatsApp informel). */
export function parseEbText(text: string): ParsedEbResult {
  return parseEbFromTextSync(text)
}

export async function parseEbFromText(text: string, context?: EbParseContext): Promise<ParsedEbResult> {
  const ruled = parseEbFromTextSync(text, context)
  if (ruled.lines.length > 0) return ruled

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return ruled

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EB_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extrais une expression de besoin chantier BTP en JSON: { "lines": [{ "label", "quantity", "unit", "observation" }], "urgency": "urgent"|"normal"|null, "destination": string|null, "confidenceScore": number }',
          },
          { role: 'user', content: text },
        ],
      }),
    })
    if (!res.ok) return ruled
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content) return ruled
    const parsed = JSON.parse(content) as ParsedEbResult
    if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) return ruled
    return {
      ...ruled,
      ...parsed,
      promptVersion: 'openai-v1',
      rawExtracted: parsed,
      isPurchaseRequest: true,
    }
  } catch (err) {
    console.warn('[ebParser] OpenAI fallback', err)
    return ruled
  }
}
