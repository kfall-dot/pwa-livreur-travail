import type { ConfirmResult, DriverProfile, Tour } from '../types'
import { todayIso } from './dates'

const mockTour: Tour = {
  id: 'tour-demo-1',
  date: todayIso(),
  depot: {
    name: 'Entrepôt Nord',
    address: '12 Rue des Logistiques, 93000 Bobigny',
    lat: 48.9102,
    lng: 2.4395,
  },
  optimizationScore: 87,
  totalUnits: 14,
  totalWeightKg: 428,
  deliveredCount: 0,
  routePolyline: [
    { lat: 48.9102, lng: 2.4395 },
    { lat: 48.892, lng: 2.412 },
    { lat: 48.875, lng: 2.358 },
    { lat: 48.861, lng: 2.321 },
    { lat: 48.848, lng: 2.295 },
  ],
  stops: [
    {
      id: 'del-1',
      sequence: 1,
      name: 'Carrefour City République',
      address: '45 Avenue de la République, 75011 Paris',
      instructions: 'Livraison quai arrière — sonner 2 fois',
      status: 'pending',
      units: 3,
      unitType: 'palette',
      weightKg: 120,
      orderRef: 'CMD-2026-8841',
      distanceFromPrevM: 4200,
      timeWindow: { start: '08:00', end: '10:00' },
      estimatedArrival: '08:45',
      coordinates: { lat: 48.892, lng: 2.412 },
      contactPhone: '+2250102030405',
      requiredPhotos: 3,
      products: [
        { label: 'Palettes œufs', qty: 2, unit: 'palette' },
        { label: 'Jus d\'orange', qty: 1, unit: 'caisse' },
      ],
    },
    {
      id: 'del-2',
      sequence: 2,
      name: 'Monoprix Bastille',
      address: '8 Place de la Bastille, 75004 Paris',
      status: 'pending',
      units: 4,
      unitType: 'caisse',
      weightKg: 85,
      orderRef: 'CMD-2026-8842',
      distanceFromPrevM: 2100,
      timeWindow: { start: '10:00', end: '12:00' },
      estimatedArrival: '10:30',
      coordinates: { lat: 48.875, lng: 2.358 },
      requiredPhotos: 4,
      products: [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
    },
    {
      id: 'del-3',
      sequence: 3,
      name: 'Chantier Résidence Les Lilas',
      address: '3 Rue des Lilas, 93260 Les Lilas',
      instructions: 'Accès par portail chantier — badge requis',
      status: 'pending',
      units: 5,
      unitType: 'sac',
      weightKg: 150,
      orderRef: 'CMD-2026-8843',
      distanceFromPrevM: 3800,
      timeWindow: { start: '12:00', end: '14:00' },
      estimatedArrival: '12:15',
      coordinates: { lat: 48.861, lng: 2.321 },
      requiredPhotos: 5,
    },
    {
      id: 'del-4',
      sequence: 4,
      name: 'Lidl Express Montreuil',
      address: '22 Rue de Paris, 93100 Montreuil',
      status: 'pending',
      units: 2,
      unitType: 'colis',
      weightKg: 73,
      orderRef: 'CMD-2026-8844',
      distanceFromPrevM: 1900,
      timeWindow: { start: '14:00', end: '16:00' },
      estimatedArrival: '14:40',
      coordinates: { lat: 48.848, lng: 2.295 },
      requiredPhotos: 2,
    },
  ],
}

export function getMockTour(): Tour {
  const tour = JSON.parse(JSON.stringify(mockTour)) as Tour
  tour.date = todayIso()
  return tour
}

export function emptyTourForDate(date: string): Tour {
  return {
    id: `tour-${date}`,
    date,
    depot: { name: 'Dépôt', address: '—', lat: 0, lng: 0 },
    stops: [],
    totalUnits: 0,
    totalWeightKg: 0,
    optimizationScore: 0,
    routePolyline: [],
    deliveredCount: 0,
  }
}

export function mockScheduleDays(from: string, to: string): { date: string; count: number }[] {
  if (mockTour.date >= from && mockTour.date <= to && mockTour.stops.length > 0) {
    return [{ date: mockTour.date, count: mockTour.stops.length }]
  }
  return []
}

export function updateMockStop(
  id: string,
  patch: Partial<(typeof mockTour.stops)[0]>
): void {
  mockTour.stops = mockTour.stops.map((s) => (s.id === id ? { ...s, ...patch } : s))
  mockTour.deliveredCount = mockTour.stops.filter((s) => s.status === 'delivered').length
}

export const mockDriver: DriverProfile = {
  id: 'drv-demo-1',
  phone: '+2250701234567',
  name: 'Kouassi Livreur',
}

export function mockLogin(phone: string, pin: string): boolean {
  const normalized = phone.trim().replace(/[\s.\-()]/g, '')
  const okPhone =
    normalized.length >= 10 &&
    (normalized.startsWith('+225') ||
      normalized.startsWith('225') ||
      /^418[0-9]{7}$/.test(normalized) ||
      normalized.startsWith('+1418'))
  return okPhone && pin === '1234'
}

export function mockConfirm(): ConfirmResult {
  const receiptId = `RCT-${Date.now()}`
  return {
    receiptId,
    certificateUrl: `https://cert.example.com/${receiptId}`,
    fraudScore: 12,
    fraudLevel: 'low',
  }
}
