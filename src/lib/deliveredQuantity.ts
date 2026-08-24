/**
 * Calcul des quantités livrées — source unique (manager + livreur).
 *
 * Invariants (ne pas casser — voir src/lib/deliveredQuantity.test.ts) :
 * - Statut « delivered » + livraison complète → quantité livrée = attendue si déclaration absente ou libellés non alignés.
 * - Statut « failed » ou outcome « rejected » → quantité livrée vide.
 * - Lignes de déclaration : accepter quantityAccepted, sinon expected − refused, sinon expected seul.
 */

export interface DisplayProductLine { label: string; qty: number; unit: string }

export function normalizeProductLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed === 'Produit commandé') return 'Produit'
  return trimmed
}

function productLineKey(line: Pick<DisplayProductLine, 'label' | 'unit'>) {
  return `${normalizeProductLabel(line.label).toLowerCase()}|${line.unit}`
}

export function acceptedQtyFromDeclRecord(r: Record<string, unknown>): number {
  const acc = r.quantityAccepted ?? r.quantity_accepted
  if (acc != null && acc !== '') {
    const n = Number(acc)
    if (!Number.isNaN(n)) return Math.max(0, n)
  }
  const expected = Number(r.quantityExpected ?? r.quantity_expected ?? 0)
  const refused = Number(r.quantityRefused ?? r.quantity_refused ?? 0)
  if (expected > 0) {
    if (refused > 0) return Math.max(0, expected - refused)
    return expected
  }
  return Math.max(0, Number(r.qty ?? 0))
}

export function parseDeclLinesForDisplay(raw: unknown): DisplayProductLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((line) => {
      const r = line as Record<string, unknown>
      const label = normalizeProductLabel(String(r.productLabel ?? r.product_label ?? r.label ?? ''))
      const unit = String(r.unit ?? r.productUnit ?? '').trim() || 'unite'
      const qty = acceptedQtyFromDeclRecord(r)
      return { label, qty, unit }
    })
    .filter((l) => l.qty > 0 && l.label)
}

export function expectedProductsDisplay(
  products: { label: string; qty: number; unit: string }[] | null | undefined,
  units: number,
  unitType: string,
): DisplayProductLine[] {
  const fallbackUnits = Number(units)
  const safeUnits = Number.isFinite(fallbackUnits) && fallbackUnits > 0 ? fallbackUnits : 0
  const safeUnit = String(unitType || '').trim() || 'unite'

  if (products && products.length > 0) {
    return products.map((p) => {
      const raw = p as { label?: string; qty?: number; quantity?: number; unit?: string }
      const qty = Number(raw.qty ?? raw.quantity)
      return {
        label: normalizeProductLabel(String(raw.label ?? 'Produit')),
        qty: Number.isFinite(qty) && qty > 0 ? qty : safeUnits || 1,
        unit: String(raw.unit || safeUnit),
      }
    })
  }
  return [{ label: 'Produit', qty: safeUnits || 1, unit: safeUnit }]
}

function findMatchingDeclLine(
  parsed: DisplayProductLine[],
  exp: DisplayProductLine,
): DisplayProductLine | undefined {
  const byKey = parsed.find((d) => productLineKey(d) === productLineKey(exp))
  if (byKey) return byKey
  return parsed.find((d) => d.label.toLowerCase() === exp.label.toLowerCase())
}

export function isAnnuleStop(status?: string, declarationOutcome?: string | null): boolean {
  return status === 'failed' || declarationOutcome === 'rejected'
}

/** Message vide pour « Quantité livrée » selon le motif d’absence de livraison. */
export function deliveredQuantityEmptyLabel(
  status?: string,
  declarationOutcome?: string | null,
): string {
  if (declarationOutcome === 'rejected') {
    return 'Aucun produit livré (livraison refusée).'
  }
  if (status === 'failed') {
    return 'Aucun produit livré (livraison annulée).'
  }
  return 'Aucun produit livré déclaré.'
}

/**
 * Quantités livrées affichées en consultation (modale manager, arrêt verrouillé, livreur).
 */
export function buildDeliveredProductsDisplay(
  expected: DisplayProductLine[],
  declarationLines: unknown,
  status?: string,
  declarationOutcome?: string | null,
): DisplayProductLine[] {
  if (isAnnuleStop(status, declarationOutcome)) return []

  const parsed = parseDeclLinesForDisplay(declarationLines)
  const isDelivered = status === 'delivered'

  if (expected.length > 0) {
    return expected.map((exp) => {
      const match = findMatchingDeclLine(parsed, exp)
      if (match) return { label: exp.label, qty: match.qty, unit: exp.unit }

      if (!isDelivered) return { label: exp.label, qty: 0, unit: exp.unit }

      if (declarationOutcome === 'rejected') {
        return { label: exp.label, qty: 0, unit: exp.unit }
      }

      if (declarationOutcome === 'partial') {
        if (expected.length === 1 && parsed.length === 1) {
          return { label: exp.label, qty: parsed[0]!.qty, unit: exp.unit }
        }
        if (expected.length === 1 && parsed.length > 0) {
          const total = parsed.reduce((sum, line) => sum + line.qty, 0)
          if (total > 0) return { label: exp.label, qty: total, unit: exp.unit }
        }
        return { label: exp.label, qty: 0, unit: exp.unit }
      }

      // Livraison complète (ou outcome absent) : tout livré par défaut
      return { label: exp.label, qty: exp.qty, unit: exp.unit }
    })
  }

  if (parsed.length > 0) return parsed.map((p) => ({ ...p, label: normalizeProductLabel(p.label) }))
  return []
}
