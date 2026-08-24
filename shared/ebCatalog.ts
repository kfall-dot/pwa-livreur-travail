/**
 * Unités et produits catalogue à partir des lignes EB.
 *
 * Une seule table de correspondance. Ne jamais retomber sur « colis » ou « palette »
 * si l’unité EB est vide ou inconnue : c’est la cause du bug récurrent
 * (parser → catalogue → tournée → affichage livreur avaient des fallbacks différents).
 */

const UNIT_MAP: Array<{ test: RegExp; code: string }> = [
  { test: /^(t|tonnes?)$/, code: 'tonne' },
  { test: /^sac/, code: 'sac' },
  { test: /^(kg|kilo)/, code: 'kg' },
  { test: /^palette/, code: 'palette' },
  { test: /^caisse/, code: 'caisse' },
  { test: /^bidon/, code: 'bidon' },
  { test: /^carton/, code: 'carton' },
  { test: /^plateau/, code: 'plateau' },
  { test: /^(bottes?|barres?|tiges?)$/, code: 'botte' },
  { test: /^colis/, code: 'colis' },
  { test: /^(unite|u|pieces?|pcs?)$/, code: 'unite' },
  { test: /^seaux?$/, code: 'seau' },
  { test: /^(m|metres?|ml)$/, code: 'metre' },
  { test: /^(l|litres?|ltr)$/, code: 'litre' },
  { test: /^rouleaux?$/, code: 'rouleau' },
  { test: /^(camions?|bennes?)$/, code: 'camion' },
]

export function catalogUnitFromEb(unit?: string | null): string {
  const n = (unit ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (!n) return 'unite'
  const hit = UNIT_MAP.find((m) => m.test.test(n))
  if (hit) return hit.code
  const slug = n.replace(/[^a-z0-9]+/g, '').replace(/s$/, '')
  return slug || 'unite'
}
