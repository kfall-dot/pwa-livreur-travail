import type { Coordinates } from '../types'

const EARTH_RADIUS_M = 6_371_000

export function haversineDistanceM(a: Coordinates, b: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function checkGeofence(
  current: Coordinates,
  target: Coordinates,
  maxM: number
): { ok: true } | { ok: false; distanceM: number } {
  const distanceM = haversineDistanceM(current, target)
  if (distanceM <= maxM) return { ok: true }
  return { ok: false, distanceM: Math.round(distanceM) }
}

export interface GpsReading extends Coordinates {
  accuracy: number
  timestamp: number
}

export function watchPosition(
  onUpdate: (reading: GpsReading) => void,
  onError?: (err: GeolocationPositionError) => void
): () => void {
  if (!navigator.geolocation) {
    onError?.({
      code: 0,
      message: 'Géolocalisation non supportée',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError)
    return () => {}
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      })
    },
    onError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    }
  )
  return () => navigator.geolocation.clearWatch(id)
}

export function getCurrentPosition(): Promise<GpsReading> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      reject,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    )
  })
}
