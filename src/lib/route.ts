import type { Coordinates, Tour } from '../types'

/** Vue par défaut (pilote CI) quand aucun arrêt n’a de coordonnées. */
export const DEFAULT_MAP_CENTER: Coordinates = { lat: 5.348, lng: -4.027 }

const geocodeCache = new Map<string, Coordinates>()

function isValidCoord(c: Coordinates): boolean {
  return (
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat !== 0 &&
    c.lng !== 0 &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const key = address.trim().toLowerCase()
  if (!key) return null
  const cached = geocodeCache.get(key)
  if (cached) return cached

  try {
    const q = encodeURIComponent(address)
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'fr' } },
      4000
    )
    if (!res.ok) return null
    const data = (await res.json()) as { lat: string; lon: string }[]
    if (!data.length) return null
    const coords = { lat: Number(data[0].lat), lng: Number(data[0].lon) }
    if (!isValidCoord(coords)) return null
    geocodeCache.set(key, coords)
    return coords
  } catch {
    return null
  }
}

async function fetchOsrmRoute(points: Coordinates[]): Promise<Coordinates[]> {
  if (points.length < 2) return points
  const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(';')
  try {
    const res = await fetchWithTimeout(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
      undefined,
      5000
    )
    if (!res.ok) return points
    const data = (await res.json()) as {
      routes?: { geometry?: { coordinates?: [number, number][] } }[]
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!coords?.length) return points
    return coords.map(([lng, lat]) => ({ lat, lng }))
  } catch {
    return points
  }
}

/** Complète les coordonnées manquantes et calcule la polyline d'itinéraire. */
export async function enrichTourForMap(tour: Tour): Promise<Tour> {
  const stops = [...tour.stops]

  for (let i = 0; i < stops.length; i++) {
    if (!isValidCoord(stops[i].coordinates)) {
      const geo = await geocodeAddress(stops[i].address)
      if (geo) stops[i] = { ...stops[i], coordinates: geo }
    }
  }

  const waypoints = stops
    .filter((s) => isValidCoord(s.coordinates))
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => s.coordinates)

  const depotValid = isValidCoord(tour.depot)
  const routePoints = depotValid ? [tour.depot, ...waypoints] : waypoints

  let routePolyline: Coordinates[] = []
  if (routePoints.length >= 2) {
    routePolyline = await fetchOsrmRoute(routePoints)
  } else if (waypoints.length) {
    routePolyline = waypoints
  }

  const firstStop = waypoints[0]
  const depot =
    depotValid || !firstStop
      ? tour.depot
      : { ...tour.depot, lat: firstStop.lat, lng: firstStop.lng }

  return {
    ...tour,
    depot,
    stops,
    routePolyline,
  }
}

export { isValidCoord }
