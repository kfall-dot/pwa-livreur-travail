/** Lignes d’une EB / d’un BC rattachées à un seul fournisseur. */

import { isComptantPayment } from '../../shared/saFinanceGate.js'

export function namesMatch(a?: string | null, b?: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

export function distinctSupplierNames<T extends { supplierName?: string | null; label?: string | null }>(
  lines: T[],
): string[] {
  const names: string[] = []
  for (const l of lines) {
    if (!(l.label ?? '').trim()) continue
    const name = (l.supplierName ?? '').trim()
    if (!name) continue
    if (!names.some((n) => namesMatch(n, name))) names.push(name)
  }
  return names
}

export function comptantLines<T extends { paymentMode?: string | null; label?: string | null }>(
  lines: T[],
): T[] {
  return lines.filter((l) => (l.label ?? '').trim() && isComptantPayment(l.paymentMode))
}

export function linesForSupplier<T extends { supplierName?: string | null }>(
  lines: T[],
  supplierName: string,
): T[] {
  const matching = lines.filter((l) => namesMatch(l.supplierName, supplierName))
  if (matching.length > 0) return matching
  const unassigned = lines.filter((l) => !(l.supplierName ?? '').trim())
  return unassigned.length > 0 ? unassigned : lines
}
