/**
 * Unicité des produits attendus par arrêt de tournée.
 */

export function expectedProductLabelKey(label: string): string {
  return String(label ?? '').trim().toLowerCase()
}

/** Retourne le libellé en doublon, ou null si chaque produit n’apparaît qu’une fois. */
export function findDuplicateProductInList(
  products: Array<{ label: string }>,
): { label: string } | null {
  const seen = new Set<string>()
  for (const p of products) {
    const label = String(p.label ?? '').trim()
    if (!label) continue
    const key = expectedProductLabelKey(label)
    if (seen.has(key)) return { label }
    seen.add(key)
  }
  return null
}

export function duplicateProductErrorMessage(
  dup: { label: string },
  stopLabel?: string,
): string {
  const where = stopLabel ? ` pour l'arrêt « ${stopLabel} »` : ''
  return (
    `Le produit « ${dup.label} » est présent plusieurs fois${where}. ` +
    'Modifiez la quantité sur la ligne existante ou retirez le doublon.'
  )
}

export function validateStopProducts(
  products: Array<{ label: string }>,
  stopLabel?: string,
): string | null {
  const dup = findDuplicateProductInList(products)
  if (!dup) return null
  return duplicateProductErrorMessage(dup, stopLabel)
}
