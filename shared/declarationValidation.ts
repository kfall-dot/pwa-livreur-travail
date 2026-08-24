/**
 * Validation déclaration livraison — partagée client (UI) + serveur (API).
 */

export type DeclarationOutcome = 'full' | 'partial' | 'rejected'

export type AdjustmentLine = {
  productLabel: string
  unit: string
  quantityExpected?: number
  quantityAccepted?: number
  quantityRefused?: number
  justification: string
}

export type DeliveryProductOption = {
  productLabel: string
  unit: string
  quantityExpected?: number
}

export function minAcceptedPalettesMessage(expectedPalettes: number): string {
  const n = Math.max(expectedPalettes || 1, 1)
  return (
    `Aucune quantité acceptée (${n} unité(s) commandée(s)). ` +
    `Indiquez au moins 1 acceptée, ou choisissez « Livraison refusée ».`
  )
}

export const REJECTION_JUSTIFICATION_MESSAGE = 'Veuillez indiquer le motif du refus.'
export const DEFAULT_FULL_JUSTIFICATION = 'Réception conforme à la commande'
export const PARTIAL_JUSTIFICATION_MESSAGE = 'Veuillez indiquer le motif du partiel.'

function formatUnitLabel(unit: string | null | undefined): string {
  const raw = String(unit || '').trim().toLowerCase()
  if (raw === 'unite' || raw === 'unité') return 'unité'
  return raw || 'unité'
}

function toQty(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function isPaletteUnit(unit: string | undefined): boolean {
  return (unit || 'palette').toLowerCase() === 'palette'
}

export function sumAcceptedPalettes(lines: AdjustmentLine[]): number {
  return lines.reduce((sum, line) => {
    if (!isPaletteUnit(line.unit)) return sum
    return sum + toQty(line.quantityAccepted)
  }, 0)
}

function sumAllAccepted(lines: AdjustmentLine[]): number {
  return lines.reduce((sum, line) => sum + toQty(line.quantityAccepted), 0)
}

function sumAllRefused(lines: AdjustmentLine[]): number {
  return lines.reduce((sum, line) => sum + toQty(line.quantityRefused), 0)
}

function resolveLineExpected(
  line: AdjustmentLine,
  expectedPalettes: number,
  lineCount: number,
): number | null {
  const qe = line.quantityExpected
  if (typeof qe === 'number' && Number.isFinite(qe) && qe > 0) return qe
  if (lineCount === 1) return expectedPalettes
  return null
}

export function lineNeedsJustification(
  acc: number,
  ref: number,
  lineExpected: number | null,
): boolean {
  if (ref > 0) return true
  if (lineExpected != null && acc < lineExpected) return true
  return false
}

function isMeaningfulJustification(
  justification: string,
  acc: number,
  ref: number,
  lineExpected: number | null,
): boolean {
  const text = (justification || '').trim()
  if (text.length < 3) return false
  if (!lineNeedsJustification(acc, ref, lineExpected)) return true
  if (text === DEFAULT_FULL_JUSTIFICATION) return false
  return true
}

export function lineJustificationMessage(
  acc: number,
  ref: number,
  lineExpected: number | null,
): string {
  if (lineExpected != null && acc > 0 && acc < lineExpected) {
    return PARTIAL_JUSTIFICATION_MESSAGE
  }
  if (ref > 0) return REJECTION_JUSTIFICATION_MESSAGE
  return PARTIAL_JUSTIFICATION_MESSAGE
}

export function lineJustificationFieldLabel(
  acc: number,
  ref: number,
  lineExpected: number | null,
): string {
  if (!lineNeedsJustification(acc, ref, lineExpected)) return 'Commentaire (optionnel)'
  if (lineExpected != null && acc > 0 && acc < lineExpected) return 'Motif du partiel *'
  return 'Motif du refus *'
}

export function lineJustificationPlaceholder(
  acc: number,
  ref: number,
  lineExpected: number | null,
): string {
  if (!lineNeedsJustification(acc, ref, lineExpected)) {
    return 'Facultatif si la livraison est conforme à la commande'
  }
  return lineJustificationMessage(acc, ref, lineExpected)
}

function resolveExpectedTotal(lines: AdjustmentLine[], expectedPalettes: number): number {
  const fromLines = lines.reduce((sum, line) => {
    const qe = line.quantityExpected
    return sum + (typeof qe === 'number' && Number.isFinite(qe) && qe > 0 ? qe : 0)
  }, 0)
  return fromLines > 0 ? fromLines : Math.max(expectedPalettes || 1, 1)
}

export function isValidDeclarationOutcome(value: unknown): value is DeclarationOutcome {
  return value === 'full' || value === 'partial' || value === 'rejected'
}

/** Normalise le corps API / UI vers des lignes typées (ou null si structure invalide). */
export function parseDeclarationLines(raw: unknown): AdjustmentLine[] | null {
  if (!Array.isArray(raw)) return null
  const lines: AdjustmentLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    lines.push({
      productLabel: String(row.productLabel ?? '').trim(),
      unit: String(row.unit ?? 'palette').trim() || 'palette',
      quantityExpected:
        row.quantityExpected == null || row.quantityExpected === ''
          ? undefined
          : Number(row.quantityExpected),
      quantityAccepted:
        row.quantityAccepted == null || row.quantityAccepted === ''
          ? undefined
          : Number(row.quantityAccepted),
      quantityRefused:
        row.quantityRefused == null || row.quantityRefused === ''
          ? undefined
          : Number(row.quantityRefused),
      justification: String(row.justification ?? ''),
    })
  }
  return lines
}

export function validateDeclarationBeforeSubmit(
  lines: AdjustmentLine[],
  expectedPalettes: number,
  outcome: DeclarationOutcome | null = null,
  plannedProducts?: DeliveryProductOption[],
): string | null {
  if (!outcome || !isValidDeclarationOutcome(outcome)) {
    return 'Choisissez une option : livraison acceptée, partielle ou refusée.'
  }

  if (!lines.length) return 'Ajoutez au moins une ligne produit.'

  const seen = new Set<string>()
  for (const line of lines) {
    const key = `${String(line.productLabel || '').trim()}|${String(line.unit || 'palette').trim().toLowerCase()}`
    if (!line.productLabel?.trim()) return 'Chaque ligne doit indiquer le produit concerné.'
    if (seen.has(key)) return `Le produit « ${line.productLabel} » est déclaré plusieurs fois.`
    seen.add(key)
  }

  if (plannedProducts && plannedProducts.length > 0) {
    if (lines.length !== plannedProducts.length) {
      return `Déclarez chaque produit commandé (${plannedProducts.length} produit(s) attendu(s)).`
    }
    for (const p of plannedProducts) {
      const key = `${p.productLabel}|${String(p.unit || 'palette').trim().toLowerCase()}`
      if (!seen.has(key)) {
        return `Produit manquant dans la déclaration : « ${p.productLabel} ».`
      }
    }
  }

  const expected = Math.max(expectedPalettes || 1, 1)
  const expectedTotal =
    plannedProducts && plannedProducts.length > 0
      ? plannedProducts.reduce(
          (sum, p) => sum + (p.quantityExpected != null && p.quantityExpected > 0 ? p.quantityExpected : 0),
          0,
        ) || resolveExpectedTotal(lines, expected)
      : resolveExpectedTotal(lines, expected)
  const lineCount = lines.length

  for (const line of lines) {
    const acc = toQty(line.quantityAccepted)
    const ref = toQty(line.quantityRefused)
    if (acc <= 0 && ref <= 0) {
      return `Indiquez une quantité acceptée ou refusée pour « ${line.productLabel} ».`
    }
    const lineExpected = resolveLineExpected(line, expected, lineCount)
    if (lineExpected != null && acc + ref !== lineExpected) {
      return (
        `Pour « ${line.productLabel} » : accepté (${acc}) + refusé (${ref}) = ${acc + ref}, ` +
        `prévu ${lineExpected} ${formatUnitLabel(line.unit)}.`
      )
    }
  }

  const totalAccepted = sumAllAccepted(lines)
  const totalRefused = sumAllRefused(lines)
  const totalDeclared = totalAccepted + totalRefused
  if (totalDeclared !== expectedTotal) {
    return (
      `Quantités (total) : accepté (${totalAccepted}) + refusé (${totalRefused}) = ${totalDeclared}, ` +
      `attendu ${expectedTotal} selon la commande.`
    )
  }

  if (outcome === 'rejected') {
    if (totalAccepted > 0) return 'Refus total : aucune quantité ne doit être acceptée.'
    const hasJustification = lines.some((line) => {
      const acc = toQty(line.quantityAccepted)
      const ref = toQty(line.quantityRefused)
      const lineExpected = resolveLineExpected(line, expected, lineCount)
      return isMeaningfulJustification(line.justification || '', acc, ref, lineExpected)
    })
    if (!hasJustification) return REJECTION_JUSTIFICATION_MESSAGE
    return null
  }

  if (outcome === 'full' && (totalRefused > 0 || totalAccepted < expectedTotal)) {
    return 'Quantité incomplète ou refus indiqué : choisissez « Livraison partielle » ou « Livraison refusée ».'
  }

  if (sumAllAccepted(lines) < 1) return minAcceptedPalettesMessage(expected)

  if (outcome === 'partial' && totalAccepted >= expectedTotal && totalRefused === 0) {
    return 'Livraison complète : utilisez « Livraison acceptée » ou indiquez des refus / quantités partielles.'
  }

  for (const line of lines) {
    const acc = toQty(line.quantityAccepted)
    const ref = toQty(line.quantityRefused)
    const lineExpected = resolveLineExpected(line, expected, lineCount)
    if (
      lineNeedsJustification(acc, ref, lineExpected) &&
      !isMeaningfulJustification(line.justification || '', acc, ref, lineExpected)
    ) {
      return lineJustificationMessage(acc, ref, lineExpected)
    }
  }

  return null
}
