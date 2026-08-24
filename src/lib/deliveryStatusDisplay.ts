import type { DeliveryStatus } from '../types'

export type DeliveryDisplayStatus =
  | DeliveryStatus
  | 'delivered_full'
  | 'delivered_partial'
  | 'delivered_rejected'

export function resolveDeliveryDisplayStatus(
  status: string,
  declarationOutcome?: string | null
): DeliveryDisplayStatus {
  if (status === 'failed') return 'failed'
  if (status === 'delivered') {
    if (declarationOutcome === 'partial') return 'delivered_partial'
    if (declarationOutcome === 'rejected') return 'delivered_rejected'
    return 'delivered_full'
  }
  if (status === 'in_progress') return 'in_progress'
  if (status === 'otp_sent') return 'otp_sent'
  return 'pending'
}

const LABELS: Record<DeliveryDisplayStatus, string> = {
  pending: 'À démarrer',
  in_progress: 'En cours',
  otp_sent: 'OTP envoyé',
  delivered: 'Livrée',
  delivered_full: 'Livrée',
  delivered_partial: 'Partielle',
  delivered_rejected: 'Refusée',
  failed: 'Échouée',
}

const CLASS_NAMES: Record<DeliveryDisplayStatus, string> = {
  pending: 'status-pending',
  in_progress: 'status-progress',
  otp_sent: 'status-otp',
  delivered: 'status-delivered',
  delivered_full: 'status-delivered',
  delivered_partial: 'status-partial',
  delivered_rejected: 'status-rejected',
  failed: 'status-failed',
}

export function deliveryDisplayStatusLabel(
  status: string,
  declarationOutcome?: string | null
): string {
  return LABELS[resolveDeliveryDisplayStatus(status, declarationOutcome)]
}

export function deliveryDisplayStatusMeta(
  status: string,
  declarationOutcome?: string | null
): { label: string; className: string; displayStatus: DeliveryDisplayStatus } {
  const displayStatus = resolveDeliveryDisplayStatus(status, declarationOutcome)
  return {
    displayStatus,
    label: LABELS[displayStatus],
    className: CLASS_NAMES[displayStatus],
  }
}

/** Arrêt clôturé côté gestionnaire (consultation seule). */
export function isStopClosedForEdit(status?: string, declarationOutcome?: string | null): boolean {
  if (status === 'failed') return true
  if (status === 'delivered') return true
  void declarationOutcome
  return false
}

export function stopClosedEditHint(status?: string, declarationOutcome?: string | null): string {
  if (status === 'failed') return 'Livraison échouée — consultation seule.'
  if (declarationOutcome === 'partial') {
    return 'Livraison partielle — reliquat à replanifier depuis Tâches. Consultation seule.'
  }
  if (declarationOutcome === 'rejected') return 'Livraison refusée — consultation seule.'
  if (status === 'delivered') return 'Livraison complète — consultation seule.'
  return 'Consultation seule.'
}
