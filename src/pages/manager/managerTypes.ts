import { generateOrderRef } from '../../../shared/orderRef'
import type { UnitType } from './managerConstants'

export interface TourRow {
  tourId: string; tourDate: string; driverId: string; driverName: string
  driverPhone: string; depotName: string; totalStops: number; delivered: number; inProgress: number
}

export interface DeliveryRow {
  deliveryId: string; deliveryName: string; deliveryAddress: string; status: string
  units: number; unitType: string; tourDate: string; driverId: string; driverName: string; tourId: string
  depotName: string
  products?: Array<{ label: string; qty: number; unit: string }> | null
  declarationOutcome?: string | null
  declarationLines?: unknown
}

export interface DriverRow { id: string; name: string; phone: string; status: string }

export interface ManagerRow { id: string; name: string; email: string; role?: 'admin' | 'manager'; procurementRole?: string | null; createdAt?: string }

export interface ManagerInviteRow { id: string; email: string; name: string; expiresAt: string; createdAt?: string }

export interface Supermarket {
  id: string; name: string; address: string; contactPhone: string
  contactName?: string; contactEmail?: string; lat?: string; lng?: string; active: boolean
  /** Chantier : prive | public */
  siteType?: string
}

/** Interprète le champ `active` renvoyé par l’API (booléen strict ou legacy string/number). */
export function isSupermarketActive(active: unknown): boolean {
  return active === true || active === 1 || active === '1' || active === 'true'
}

export function normalizeSupermarket(raw: Supermarket): Supermarket {
  return { ...raw, active: isSupermarketActive(raw.active) }
}

export function normalizeSupermarkets(list: Supermarket[]): Supermarket[] {
  return list.map(normalizeSupermarket)
}

export interface ProductRow { id: string; label: string; unit: string; displayOrder: number; active: boolean }

export interface UnitRow { id: string; code: string; label: string; displayOrder: number; active: boolean }

export interface TaskPayload {
  deliveryId?: string
  tourId?: string
  tourDate?: string
  refusedLines?: Array<{ productLabel?: string; quantityExpected?: number; quantityRefused?: number; unit?: string }>
  previousDriverName?: string
}

export interface TaskRow {
  id: string
  type: string
  title: string
  description: string
  payload?: TaskPayload | null
  relatedTourId?: string | null
  deliveryId?: string | null
  deliveryName?: string
  deliveryDate?: string
  driverName?: string
  resolved: boolean
  resolvedAt?: string | null
  createdAt: string
  canReplan?: boolean
}

export interface ProductLine { label: string; qty: string; unit: string }

export interface StopDraft {
  supermarketId?: string
  lat?: string
  lng?: string
  name: string; address: string; instructions: string; units: string
  unitType: UnitType; weightKg: string; orderRef: string
  contactPhone: string; timeWindowStart: string; timeWindowEnd: string; requiredPhotos: string
  products: ProductLine[]
  status?: string
  declarationLines?: unknown
  declarationOutcome?: string | null
}

export interface StopDetail {
  id: string
  name: string
  address: string
  instructions?: string
  units: number
  unitType: string
  weightKg: string
  orderRef: string
  contactPhone?: string
  timeWindowStart?: string
  timeWindowEnd?: string
  requiredPhotos: number
  supermarketId?: string | null
  status: string
  products?: { label: string; qty: number; unit: string }[] | null
  declarationLines?: unknown
  declarationOutcome?: string | null
}

export interface TourDetail {
  id: string
  driverId: string
  driverName: string
  date: string
  depotName: string
  depotAddress: string
  /** Présent si la tournée est issue d'un bon de commande : lignes produit verrouillées. */
  purchaseOrderId?: string | null
}

export function emptyProduct(): ProductLine {
  return { label: '', qty: '1', unit: 'colis' }
}

export function emptyStop(): StopDraft {
  return {
    name: '', address: '', instructions: '', units: '1', unitType: 'colis', weightKg: '',
    orderRef: generateOrderRef(), contactPhone: '', timeWindowStart: '', timeWindowEnd: '', requiredPhotos: '1', products: [],
  }
}
