import type { DeliveryPoint, Tour, UnitType } from '../types'
import { normalizeDeliveryUnit } from './deliveryUnits'
import { isValidCoord } from './route'

interface LivraisonDelivery {
  id: string
  status: string
  supermarket_name: string
  supermarket_address: string
  expected_palettes: number
  expected_weight_kg: number
  time_window_start?: string
  time_window_end?: string
  supermarket_lat?: number | string | null
  supermarket_lng?: number | string | null
  stop_order?: number
  order_reference?: string
  planned_unit?: string | null
  declaration_outcome?: string | null
  receipt_id?: string | null
  certificate_url?: string | null
  tour_id?: string | null
  tour_depot_name?: string | null
  products?: Array<{ label: string; qty: number; unit: string }> | null
}

interface LivraisonTodayResponse {
  date: string
  count: number
  tour_count?: number
  deliveries: LivraisonDelivery[]
}

export function mapDeliveryStatus(status: string): DeliveryPoint['status'] {
  const map: Record<string, DeliveryPoint['status']> = {
    pending: 'pending',
    in_progress: 'in_progress',
    otp_sent: 'otp_sent',
    delivered: 'delivered',
    delivered_partial: 'delivered',
    failed: 'failed',
    blocked: 'failed',
    missed: 'failed',
    disputed: 'failed',
    cancelled: 'failed',
  }
  return map[status] ?? 'pending'
}

function mapUnitType(unit?: string | null): UnitType {
  return normalizeDeliveryUnit(unit) as UnitType
}

function fmtTime(t?: string): string {
  if (!t) return '—'
  return t.slice(0, 5)
}

export function adaptLivraisonToday(data: LivraisonTodayResponse): Tour {
  const stops: DeliveryPoint[] = data.deliveries
    .map((d, i) => ({
      id: d.id,
      sequence: d.stop_order ?? i + 1,
      tourId: d.tour_id ?? undefined,
      tourDepotName: d.tour_depot_name ?? undefined,
      name: d.supermarket_name,
      address: d.supermarket_address,
      status: mapDeliveryStatus(d.status),
      units: d.expected_palettes,
      unitType: mapUnitType(d.planned_unit),
      weightKg: Number(d.expected_weight_kg) || 0,
      orderRef: d.order_reference ?? '—',
      distanceFromPrevM: 0,
      timeWindow: {
        start: fmtTime(d.time_window_start),
        end: fmtTime(d.time_window_end),
      },
      estimatedArrival: fmtTime(d.time_window_start),
      coordinates: {
        lat: Number(d.supermarket_lat) || 0,
        lng: Number(d.supermarket_lng) || 0,
      },
      requiredPhotos: 1,
      products: Array.isArray(d.products) ? d.products : undefined,
      declarationOutcome:
        (d.declaration_outcome as DeliveryPoint['declarationOutcome']) ?? null,
      receiptId: d.receipt_id ?? undefined,
      certificateUrl: d.certificate_url ?? undefined,
    }))
    .sort((a, b) => a.sequence - b.sequence)

  const validStops = stops.filter((s) => isValidCoord(s.coordinates))

  const deliveredCount = stops.filter((s) => s.status === 'delivered').length
  const totalUnits = stops.reduce((a, s) => a + s.units, 0)
  const totalWeightKg = stops.reduce((a, s) => a + s.weightKg, 0)

  const distinctTours = new Set(stops.map((s) => s.tourId).filter(Boolean)).size
  return {
    id: `tour-${data.date}`,
    date: data.date,
    tourCount: data.tour_count ?? (distinctTours > 1 ? distinctTours : undefined),
    depot: {
      name: 'Dépôt',
      address: '—',
      lat: validStops[0]?.coordinates.lat ?? 0,
      lng: validStops[0]?.coordinates.lng ?? 0,
    },
    stops,
    totalUnits,
    totalWeightKg,
    optimizationScore: stops.length ? 85 : 0,
    routePolyline: validStops.map((s) => s.coordinates),
    deliveredCount,
  }
}

export function normalizeApiBase(raw: string): string {
  const base = raw.trim().replace(/\/$/, '')
  if (!base) return ''
  if (base.endsWith('/api/v1')) return base
  if (base.endsWith('/api')) return `${base}/v1`
  return base
}

export function isLivraisonBackend(base: string): boolean {
  return base.includes('/api/v1') || import.meta.env.VITE_API_BACKEND === 'livraison'
}
