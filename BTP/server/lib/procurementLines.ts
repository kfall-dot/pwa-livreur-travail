/** Lignes d’une EB / d’un BC rattachées à un seul fournisseur. */

export function namesMatch(a?: string | null, b?: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
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
