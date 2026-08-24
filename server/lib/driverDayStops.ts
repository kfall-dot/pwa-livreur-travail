import type { DeliveryPoint } from '../db/schema.js'

/**
 * Arrêts visibles côté livreur pour une date.
 * - Exclut les arrêts `failed` (replan / obsolètes / non effectués).
 * - Inclut toutes les tournées du jour (pas seulement la dernière).
 */
export function isStopVisibleToDriver(stop: Pick<DeliveryPoint, 'status'>): boolean {
  return stop.status !== 'failed'
}

export function mergeDriverStopsForDay<T extends Pick<DeliveryPoint, 'status'>>(
  stops: T[],
): Array<T & { sequence: number }> {
  const filtered = stops.filter((stop) => isStopVisibleToDriver(stop))
  let sequence = 1
  return filtered.map((stop) => ({ ...stop, sequence: sequence++ }))
}

export function countDriverVisibleStops(stops: Pick<DeliveryPoint, 'status'>[]): number {
  return stops.filter((stop) => isStopVisibleToDriver(stop)).length
}
