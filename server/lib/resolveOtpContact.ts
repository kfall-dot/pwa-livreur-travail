import type { DeliveryPoint, Supermarket } from '../db/schema.js'

/**
 * Destinataire SMS OTP : le téléphone du catalogue (point de livraison)
 * prime sur la copie éventuellement obsolète stockée sur l’arrêt.
 */
export function pickOtpContactPhone(
  stopContactPhone: string | null | undefined,
  catalogContactPhone: string | null | undefined,
): string {
  const fromCatalog = String(catalogContactPhone ?? '').trim()
  if (fromCatalog) return fromCatalog
  return String(stopContactPhone ?? '').trim()
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Retrouve un point catalogue par id, sinon par nom / adresse (arrêts legacy). */
export function matchCatalogForStop(
  stop: Pick<DeliveryPoint, 'supermarketId' | 'name' | 'address'>,
  catalogById: Supermarket | null,
  allCatalog: Supermarket[],
): Supermarket | null {
  if (catalogById) return catalogById
  const nameKey = normalizeKey(stop.name)
  const byName = allCatalog.find((s) => s.active && normalizeKey(s.name) === nameKey)
  if (byName) return byName
  const addressKey = normalizeKey(stop.address)
  if (!addressKey) return null
  return allCatalog.find((s) => s.active && normalizeKey(s.address) === addressKey) ?? null
}
