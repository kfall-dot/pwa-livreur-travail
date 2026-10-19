/**
 * T08 — **Rejeu de l'historique du CdG** (journal `DG CI ENERGIE`).
 *
 * Le fichier du CdG est une **compilation**, pas une source (§5.3 de la spec
 * F02) : il recompile des données qui existent déjà ailleurs. Deux règles en
 * découlent, et elles sont **bloquantes** :
 *
 * 1. **I100** — toute ligne portant un `No BC` **est exclue** : le CdG a
 *    confirmé en séance que ces lignes sont **déjà** les achats saisis en BC
 *    dans TraceO. Les rejouer doublerait 11 476 531 F.
 * 2. **I99** — chaque ligne reçoit une **empreinte stable** : rejouer le même
 *    fichier ne crée aucun doublon.
 *
 * Module **pur** (aucune I/O) : testable et réutilisable côté client pour
 * l'aperçu du rapprochement.
 */

import { chargeNatureKey, chargeNatureLabel, inferChargeNature, resolveChargeNature } from './chargeNatures.js'

/** Une ligne brute de la feuille : cellules dans l'ordre des colonnes A, B, C… */
export type CdgJournalRawRow = unknown[]

export type ParsedCdgLine = {
  /** Empreinte stable de la ligne source — clé d'idempotence (I99). */
  sourceRef: string
  /** Date d'opération, `YYYY-MM-DD`. */
  occurredOn: string
  label: string
  /** Code de nature résolu (référentiel F02) — jamais vide. */
  nature: string
  /** Libellé de nature d'origine, conservé pour la traçabilité. */
  natureLabel: string
  amountFcfa: number
  /** N° de BC du journal (`No BC`) — non vide ⇒ ligne exclue (I100). */
  noBc: string | null
  siteName: string
  supplierName: string | null
}

export type CdgJournalParseResult = {
  lines: ParsedCdgLine[]
  /** Lignes illisibles, avec leur numéro de ligne source (1 = 1ʳᵉ ligne de données). */
  rejected: Array<{ row: number; reason: string }>
  totalFcfa: number
}

/** Empreinte FNV-1a 64 bits (deux passes) — pure JS, utilisable navigateur. */
export function cdgFingerprint(parts: Array<string | number | null | undefined>): string {
  const text = parts.map((p) => String(p ?? '').trim()).join('\u0001')
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 = (h2 + c * (i + 1)) >>> 0
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

/** Normalise une référence de BC pour comparaison (` 1144 ` → `1144`). */
export function normalizeBcReference(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^N[°O]\s*/i, '')
    .replace(/\s+/g, '')
}

/**
 * Date du journal : accepte `Date`, n° de série Excel, `YYYY-MM-DD`,
 * `DD/MM/YYYY` et `DD-MM-YYYY`. Renvoie `null` si illisible.
 */
export function parseCdgDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return isoOf(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // N° de série Excel : 1 = 1900-01-01 (bogue 1900 ignoré, sans effet ici).
    const ms = Math.round((value - 25569) * 86_400_000)
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const text = String(value).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const fr = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text)
  if (fr) return isoOf(Number(fr[3]), Number(fr[2]), Number(fr[1]))
  return null
}

function isoOf(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Montant : accepte `12 500`, `12 500,50`, `-523 017`, `12500.5`. */
export function parseCdgAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  const text = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d,.-]/g, '')
    .trim()
  if (!text || text === '-') return null
  // Séparateur décimal : la virgule si elle suit les points de milliers.
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

type CdgColumnKey =
  | 'site'
  | 'supplier'
  | 'nature'
  | 'noBc'
  | 'invoice'
  | 'date'
  | 'label'
  | 'qty'
  | 'unitPrice'
  | 'amount'

/** Ordre positionnel du journal (colonnes A → J) — repli sans en-tête. */
const POSITIONAL_ORDER: CdgColumnKey[] = [
  'site',
  'supplier',
  'nature',
  'noBc',
  'invoice',
  'date',
  'label',
  'qty',
  'unitPrice',
  'amount',
]

/** Alias d'en-têtes acceptés (normalisés : majuscules, sans accents, espaces unifiés). */
const HEADER_ALIASES: Record<CdgColumnKey, string[]> = {
  site: ['NOM CHANTIER', 'CHANTIER'],
  supplier: ['NOM FOURNISSEUR', 'FOURNISSEUR', 'BENEFICIAIRE'],
  // Le journal réel (v1 du 16/10/2026) écrit « Catégorie » — l'annexe §3A le
  // décrivait comme « Nature de dépense ». Les deux sont acceptés.
  nature: ['NATURE DE DEPENSE', 'NATURE', 'CATEGORIE', 'CATEGORIE DE DEPENSE'],
  noBc: ['NO BC', 'NUMERO BC', 'N BC'],
  invoice: ['NO FACTURE OU BL', 'NO FACTURE', 'FACTURE', 'BL'],
  date: ['DATE'],
  // Idem : « Charges (Produits) » et non « Designation ».
  label: ['DESIGNATION', 'LIBELLE', 'CHARGES PRODUITS', 'CHARGES'],
  qty: ['QTE', 'QUANTITE'],
  unitPrice: ['PU', 'PRIX UNITAIRE'],
  amount: ['MONTANT', 'MONTANT FCFA'],
}

function columnMapFromHeader(header: unknown[]): Partial<Record<CdgColumnKey, number>> {
  const map: Partial<Record<CdgColumnKey, number>> = {}
  const entries = Object.entries(HEADER_ALIASES) as Array<[CdgColumnKey, string[]]>
  header.forEach((cell, index) => {
    const key = chargeNatureKey(String(cell ?? ''))
    if (!key) return
    for (const [column, aliases] of entries) {
      if (map[column] != null) continue
      if (aliases.includes(key)) {
        map[column] = index
        return
      }
    }
  })
  return map
}

/** Première ligne portant à la fois un en-tête « date » et un en-tête « montant ». */
function findHeaderIndex(rows: CdgJournalRawRow[]): number {
  const limit = Math.min(rows.length, 10)
  for (let i = 0; i < limit; i += 1) {
    const map = columnMapFromHeader(rows[i] ?? [])
    if (map.date != null && map.amount != null) return i
  }
  return -1
}

function positionalMap(): Partial<Record<CdgColumnKey, number>> {
  const map: Partial<Record<CdgColumnKey, number>> = {}
  POSITIONAL_ORDER.forEach((key, index) => {
    map[key] = index
  })
  return map
}

/**
 * Lit les lignes du journal du CdG (feuille convertie en tableaux de cellules).
 *
 * L'en-tête est **détecté** (jusqu'aux 10 premières lignes) : le fichier v1 du
 * 16/10/2026 en porte un. En son absence, le **mapping positionnel** A → J est
 * utilisé (ordre documenté en annexe §3A) — le format historique reste accepté.
 *
 * Une ligne sans **date**, **montant** ou **nature** exploitable est **rejetée**
 * et listée : jamais importée silencieusement avec une valeur inventée.
 */
export function parseCdgJournalRows(rows: CdgJournalRawRow[]): CdgJournalParseResult {
  const lines: ParsedCdgLine[] = []
  const rejected: Array<{ row: number; reason: string }> = []

  const headerIndex = findHeaderIndex(rows)
  const map = headerIndex >= 0 ? columnMapFromHeader(rows[headerIndex] ?? []) : positionalMap()
  const firstData = headerIndex >= 0 ? headerIndex + 1 : 0

  const cell = (raw: CdgJournalRawRow, key: CdgColumnKey): unknown => {
    const index = map[key]
    return index == null ? undefined : raw[index]
  }

  let rowNumber = 0
  /**
   * Ordinal des empreintes déjà rencontrées **dans ce fichier**.
   *
   * Deux lignes peuvent être **légitimement identiques** : le journal du CdG
   * contient par exemple deux paiements de 24 000 F à des carreleurs le même
   * jour, et deux lots d'aides de 36 000 F. Les confondre **perdrait 60 000 F**
   * en silence. On suffixe donc toujours l'ordinal (`…-1`, `…-2`), y compris
   * pour une ligne unique : rejouer le même fichier produit les **mêmes**
   * références, donc reste idempotent (I99).
   */
  const seenRefs = new Map<string, number>()

  for (let i = firstData; i < rows.length; i += 1) {
    rowNumber += 1
    const raw = rows[i] ?? []
    const label = String(cell(raw, 'label') ?? '').trim()
    const natureLabel = String(cell(raw, 'nature') ?? '').trim()
    const amountFcfa = parseCdgAmount(cell(raw, 'amount'))
    const occurredOn = parseCdgDate(cell(raw, 'date'))

    // Ligne vide (fin de feuille, ligne de total) : ignorée sans être « rejetée ».
    if (!label && !natureLabel && amountFcfa == null && !occurredOn) continue

    if (amountFcfa == null) {
      rejected.push({ row: rowNumber, reason: 'Montant illisible' })
      continue
    }
    if (!occurredOn) {
      rejected.push({ row: rowNumber, reason: 'Date illisible' })
      continue
    }
    if (!natureLabel) {
      rejected.push({ row: rowNumber, reason: 'Nature absente' })
      continue
    }

    const siteName = String(cell(raw, 'site') ?? '').trim()
    const supplierName = String(cell(raw, 'supplier') ?? '').trim()
    const noBc = normalizeBcReference(String(cell(raw, 'noBc') ?? ''))
    const nature = resolveChargeNature(natureLabel) ?? inferChargeNature(natureLabel)

    const baseRef = cdgFingerprint([siteName, occurredOn, nature, label, amountFcfa, noBc])
    const ordinal = (seenRefs.get(baseRef) ?? 0) + 1
    seenRefs.set(baseRef, ordinal)

    lines.push({
      sourceRef: `${baseRef}-${ordinal}`,
      occurredOn,
      label: label || chargeNatureLabel(nature),
      nature,
      natureLabel,
      amountFcfa,
      noBc: noBc || null,
      siteName,
      supplierName: supplierName || null,
    })
  }

  return { lines, rejected, totalFcfa: lines.reduce((sum, l) => sum + l.amountFcfa, 0) }
}

export type CdgReconciliation = {
  /** Lignes exploitables du fichier (après rejets de parsing). */
  totalLines: number
  totalFcfa: number
  /** Lignes portant un n° de BC → **exclues du rejeu** (I100). */
  excluded: Array<{ sourceRef: string; noBc: string; amountFcfa: number }>
  excludedFcfa: number
  /** Lignes à rejouer : **aucun** n° de BC. */
  toImport: ParsedCdgLine[]
  toImportFcfa: number
  /**
   * BC cités par le journal et **introuvables** dans TraceO.
   * Ne bloque pas le rejeu (la ligne reste exclue : le CdG a tranché « il s'agit
   * des mêmes ») mais alimente le travail de rapprochement (I106).
   */
  unmappedBcReferences: string[]
  /** Part du fichier **déjà connue** de TraceO, en % (affiché avant import — I106). */
  matchRatePct: number
}

/**
 * Sépare le journal en deux : ce que TraceO **connaît déjà** (lignes portant un
 * n° de BC — I100) et ce qu'il doit **rejouer** (aucun n° de BC).
 *
 * Le critère est le **n° de BC non vide**, et non la correspondance avec une
 * référence TraceO : le CdG a confirmé en séance que ces lignes sont déjà des
 * achats saisis en BC. Les rejouer **doublerait** les montants. Une référence
 * introuvable est **signalée**, jamais importée par défaut.
 */
export function reconcileCdgJournal(
  lines: ParsedCdgLine[],
  knownBcReferences: Iterable<string> = [],
): CdgReconciliation {
  const known = new Set<string>()
  for (const ref of knownBcReferences) {
    const normalized = normalizeBcReference(ref)
    if (normalized) known.add(normalized)
  }

  const excluded: CdgReconciliation['excluded'] = []
  const toImport: ParsedCdgLine[] = []
  const unmapped = new Set<string>()
  let excludedFcfa = 0
  let toImportFcfa = 0

  for (const line of lines) {
    if (line.noBc) {
      excluded.push({ sourceRef: line.sourceRef, noBc: line.noBc, amountFcfa: line.amountFcfa })
      excludedFcfa += line.amountFcfa
      if (!known.has(line.noBc)) unmapped.add(line.noBc)
    } else {
      toImport.push(line)
      toImportFcfa += line.amountFcfa
    }
  }

  const totalFcfa = excludedFcfa + toImportFcfa
  return {
    totalLines: lines.length,
    totalFcfa,
    excluded,
    excludedFcfa,
    toImport,
    toImportFcfa,
    unmappedBcReferences: [...unmapped].sort(),
    matchRatePct: totalFcfa > 0 ? Math.round((excludedFcfa / totalFcfa) * 1000) / 10 : 0,
  }
}

/**
 * Résout le chantier d'une ligne du journal à partir de son libellé
 * (`Nom Chantier`). Renvoie l'identifiant du chantier, ou `null` si le libellé
 * est inconnu — la ligne est alors **non imputée**, jamais rattachée au hasard.
 */
export function resolveJournalSiteId(
  siteName: string,
  sites: Array<{ id: string; name: string }>,
): string | null {
  const key = chargeNatureKey(siteName)
  if (!key) return null
  const exact = sites.find((s) => chargeNatureKey(s.name) === key)
  if (exact) return exact.id
  // Repli : le libellé du journal est un préfixe / contient le nom du chantier.
  const partial = sites.filter((s) => {
    const siteKey = chargeNatureKey(s.name)
    return siteKey.length > 3 && (key.includes(siteKey) || siteKey.includes(key))
  })
  return partial.length === 1 ? partial[0]!.id : null
}