import { Router } from 'express'
import type { Request } from 'express'
import { requireAuth, type AuthPayload } from '../middleware/auth.js'
import {
  getScheduleDays,
  getStopsForDriverOnDate,
  getStopsForTour,
  getTourById,
} from '../db/queries.js'
import type { DeliveryPoint, Tour } from '../db/schema.js'
import { paramId } from '../utils/params.js'

export const toursRouter = Router()
toursRouter.use(requireAuth)

type AuthRequest = Request & { user: AuthPayload }

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(t: string | null | undefined): string {
  return t ?? '—'
}

function assembleDirectTour(tourList: Tour[], stops: DeliveryPoint[]) {
  const tour = tourList[0]!
  const depotByTourId = new Map(tourList.map((t) => [t.id, t.depotName]))
  const totalUnits = stops.reduce((s, p) => s + p.units, 0)
  const totalWeightKg = stops.reduce((s, p) => s + Number(p.weightKg), 0)
  const deliveredCount = stops.filter((p) => p.status === 'delivered').length
  return {
    id: tour.id,
    date: tour.date,
    tourCount: tourList.length,
    depot: {
      name: tour.depotName,
      address: tour.depotAddress,
      lat: Number(tour.depotLat),
      lng: Number(tour.depotLng),
    },
    stops: stops.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      tourId: s.tourId,
      tourDepotName: depotByTourId.get(s.tourId) ?? tour.depotName,
      name: s.name,
      address: s.address,
      instructions: s.instructions ?? undefined,
      status: s.status,
      units: s.units,
      unitType: s.unitType,
      weightKg: Number(s.weightKg),
      orderRef: s.orderRef,
      distanceFromPrevM: s.distanceFromPrevM,
      timeWindow: { start: fmt(s.timeWindowStart), end: fmt(s.timeWindowEnd) },
      estimatedArrival: fmt(s.estimatedArrival),
      coordinates: { lat: Number(s.lat), lng: Number(s.lng) },
      contactPhone: s.contactPhone ?? undefined,
      requiredPhotos: s.requiredPhotos,
      receiptId: s.receiptId ?? undefined,
      products: Array.isArray(s.products)
        ? (s.products as Array<{ label: string; qty: number; unit: string }>)
        : undefined,
      declarationOutcome:
        (s as DeliveryPoint & { declarationOutcome?: string | null }).declarationOutcome ?? null,
    })),
    totalUnits,
    totalWeightKg,
    optimizationScore: tour.optimizationScore,
    routePolyline: stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) })),
    deliveredCount,
  }
}

function assembleLivraisonTour(tourList: Tour[], stops: DeliveryPoint[], date: string) {
  const depotByTourId = new Map(tourList.map((t) => [t.id, t.depotName]))
  return {
    date,
    count: stops.length,
    tour_count: tourList.length,
    deliveries: stops.map((s) => ({
    id: s.id,
    status: s.status,
      tour_id: s.tourId,
      tour_depot_name: depotByTourId.get(s.tourId) ?? null,
    supermarket_name: s.name,
    supermarket_address: s.address,
    expected_palettes: s.units,
      expected_weight_kg: Number(s.weightKg),
    planned_unit: s.unitType,
      time_window_start: s.timeWindowStart,
      time_window_end: s.timeWindowEnd,
      supermarket_lat: Number(s.lat),
      supermarket_lng: Number(s.lng),
    stop_order: s.sequence - 1,
    order_reference: s.orderRef,
      products: Array.isArray(s.products)
        ? (s.products as Array<{ label: string; qty: number; unit: string }>)
        : undefined,
      declaration_outcome:
        (s as DeliveryPoint & { declarationOutcome?: string | null }).declarationOutcome ?? null,
      receipt_id: s.receiptId ?? null,
    })),
  }
}

const emptyTourDirect = (date: string) => ({
  id: `tour-${date}`,
  date,
  depot: { name: 'Dépôt', address: '—', lat: 0, lng: 0 },
  stops: [],
  totalUnits: 0,
  totalWeightKg: 0,
  optimizationScore: 0,
  routePolyline: [],
  deliveredCount: 0,
})

toursRouter.get('/today', async (req, res) => {
  const driverId = (req as AuthRequest).user.sub
  const today = todayIso()
  try {
    const { tours, stops } = await getStopsForDriverOnDate(driverId, today)
    if (tours.length === 0) {
      res.json(emptyTourDirect(today))
      return
    }
    res.json(assembleDirectTour(tours, stops))
  } catch (err) {
    console.error('[tours] today error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

toursRouter.get('/schedule', async (req, res) => {
  const driverId = (req as AuthRequest).user.sub
  const today = todayIso()
  const from = String(req.query.from ?? today)
  const to = String(req.query.to ?? today)
  try {
    const days = await getScheduleDays(driverId, from, to)
  res.json({ from, to, days })
  } catch (err) {
    console.error('[tours] schedule error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

toursRouter.get('/by-date/:date', async (req, res) => {
  const driverId = (req as unknown as AuthRequest).user.sub
  const date = paramId(req, 'date')
  try {
    const { tours, stops } = await getStopsForDriverOnDate(driverId, date)
    if (tours.length === 0) {
      res.json({ date, count: 0, deliveries: [] })
      return
    }
    res.json(assembleLivraisonTour(tours, stops, date))
  } catch (err) {
    console.error('[tours] by-date error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

toursRouter.post('/:id/reroute', async (req, res) => {
  const driverId = (req as unknown as AuthRequest).user.sub
  try {
    const tour = await getTourById(paramId(req))
    if (!tour || tour.driverId !== driverId) {
    res.status(404).json({ message: 'Tournée introuvable' })
    return
  }
  const { lat, lng } = req.body as { lat?: number; lng?: number }
  if (lat == null || lng == null) {
    res.status(400).json({ message: 'Position requise' })
    return
  }
    const stops = await getStopsForTour(tour.id)
    res.json(assembleDirectTour([tour], stops))
  } catch (err) {
    console.error('[tours] reroute error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})
