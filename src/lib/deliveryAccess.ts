import { todayIso } from './dates'
import type { DeliveryStatus } from '../types'
import { deliveryDisplayStatusLabel } from './deliveryStatusDisplay'

const TERMINAL_STATUSES: DeliveryStatus[] = ['delivered', 'failed']

export function isDeliveryTerminal(status: DeliveryStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function isPastTourDate(tourDate: string): boolean {
  return tourDate < todayIso()
}

export function isFutureTourDate(tourDate: string): boolean {
  return tourDate > todayIso()
}

export function isTodayTourDate(tourDate: string): boolean {
  return tourDate === todayIso()
}

export function canOpenDelivery(status: DeliveryStatus, tourDate: string): boolean {
  if (isDeliveryTerminal(status)) return false
  if (isPastTourDate(tourDate)) return false
  return true
}

export function deliveryAccessLabel(
  status: DeliveryStatus,
  tourDate: string,
  declarationOutcome?: string | null
): string | null {
  if (isDeliveryTerminal(status)) {
    return deliveryDisplayStatusLabel(status, declarationOutcome)
  }
  if (isPastTourDate(tourDate)) return 'Date passée'
  if (isFutureTourDate(tourDate)) return 'Date future'
  return null
}

/**
 * Libellé CTA / pastille timeline livreur.
 * Pas de statut DB « expired » : une date passée non terminale reste pending/in_progress,
 * mais l’UI doit afficher « Date passée », pas « À venir ».
 */
export function driverStopCtaLabel(opts: {
  status: DeliveryStatus
  tourDate: string
  isNext: boolean
  /** Variante carte : « Continuer » ; feuille carte : « Suivant » */
  nextLabel?: 'Continuer' | 'Suivant'
}): string {
  if (isDeliveryTerminal(opts.status)) return 'Livré'
  if (isPastTourDate(opts.tourDate)) return 'Date passée'
  if (opts.isNext && canOpenDelivery(opts.status, opts.tourDate)) {
    return opts.nextLabel ?? 'Continuer'
  }
  if (isFutureTourDate(opts.tourDate)) return 'Date future'
  return 'À venir'
}
