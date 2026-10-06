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

export type SupplierChangeLine = { id: string; supplierName?: string | null; attachmentBlobKey?: string | null }

/**
 * Lignes dont le fournisseur change (réaffectation) ET qui portent une pièce
 * jointe : la facture vaut pour l'ancien fournisseur, elle est donc détachée de
 * ces lignes. Le blob n'est supprimé du stockage que si plus aucune ligne ne le
 * référence (une facture partagée survit au retrait d'une seule de ses lignes).
 */
export function supplierChangeDetachTargets(
  currentLines: SupplierChangeLine[],
  patches: Array<{ id: string; supplierName?: string }>,
): Array<{ lineId: string; blobKey: string }> {
  const byId = new Map(currentLines.map((l) => [l.id, l]))
  const targets: Array<{ lineId: string; blobKey: string }> = []
  for (const patch of patches) {
    if (patch.supplierName === undefined) continue
    const current = byId.get(patch.id)
    if (!current) continue
    const oldSupplier = (current.supplierName ?? '').trim()
    const newSupplier = (patch.supplierName ?? '').trim()
    if (!oldSupplier || !newSupplier || namesMatch(oldSupplier, newSupplier)) continue
    const key = (current.attachmentBlobKey ?? '').trim()
    if (key) {
      targets.push({ lineId: current.id, blobKey: key })
    }
  }
  return targets
}

/**
 * Détache la pièce jointe des lignes réaffectées à un autre fournisseur, en
 * appelant `detach(lineId)` pour chaque ligne concernée. Renvoie les clés de
 * blob détachées (dédupliquées) pour le nettoyage éventuel du stockage.
 */
export async function detachSupplierChangeAttachments(
  currentLines: SupplierChangeLine[],
  patches: Array<{ id: string; supplierName?: string }>,
  detach: (lineId: string) => Promise<unknown>,
): Promise<string[]> {
  const targets = supplierChangeDetachTargets(currentLines, patches)
  const detachedKeys = new Set<string>()
  for (const t of targets) {
    await detach(t.lineId)
    detachedKeys.add(t.blobKey)
  }
  return Array.from(detachedKeys)
}
