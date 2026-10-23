export type CorrectionKind = 'need' | 'commercial' | 'documents' | 'bc'
export const CORRECTION_LABELS: Record<CorrectionKind, string> = {
  need: 'Besoin, désignation ou quantité', commercial: 'Prix, fournisseur ou paiement',
  documents: 'Pièces justificatives', bc: 'Préparation du BC',
}
export function canRequestCorrection(status: string, role?: string | null, isSaHead = false): boolean {
  if (role === 'technical_director') return status === 'dt_review'
  if (role === 'purchasing' && isSaHead) return status === 'sa_head_review' || status === 'bc_head_review'
  if (role === 'controle_gestion') return status === 'cdg_review'
  if (role === 'daf') return status === 'daf_review' || status === 'daf_bt_review'
  if (role === 'pdg') return ['pdg_review', 'daf_review', 'daf_bt_review'].includes(status)
  if (role === 'treasury') return ['bt_ready', 'delivered', 'delivery_scheduled', 'po_ready'].includes(status)
  return false
}
export function canDefinitivelyRefuse(status: string, role?: string | null): boolean {
  return (role === 'daf' && ['daf_review', 'daf_bt_review'].includes(status)) ||
    (role === 'pdg' && ['pdg_review', 'daf_review', 'daf_bt_review'].includes(status))
}
/** Revalidation conservatrice : toute modification économique repasse par les visas financiers. */
export function correctionResumeStatus(input: { kind: CorrectionKind; changed: boolean; fromStatus: string; targetRole: string; horsSa: boolean; isSaResource: boolean }): string {
  if (!input.changed) return input.fromStatus
  if (input.targetRole === 'site_manager') return 'dt_review'
  if (input.horsSa) return 'cdg_review'
  // Les ressources SA repassent par leur chef via le circuit submitted → sa_head_review.
  return 'submitted'
}
