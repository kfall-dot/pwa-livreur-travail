/** Palette distincte pour les tournées d’un même jour (carte + légende) — alignée TraceO. */
export const TOUR_ROUTE_COLORS = [
  '#0b4a2c', // vert forêt (brand)
  '#e85d04', // orange action
  '#0f766e', // teal
  '#b45309', // ambre
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#be123c', // rose foncé
  '#334155', // ardoise
] as const

export function tourColorForIndex(index: number): string {
  return TOUR_ROUTE_COLORS[index % TOUR_ROUTE_COLORS.length]!
}

/** Assigne une couleur stable par `tourId` selon l’ordre d’apparition. */
export function buildTourColorMap(tourIds: Array<string | undefined | null>): Map<string, string> {
  const map = new Map<string, string>()
  let i = 0
  for (const id of tourIds) {
    const key = id?.trim() || 'day'
    if (map.has(key)) continue
    map.set(key, tourColorForIndex(i++))
  }
  return map
}
