import type { Supermarket } from '../db/schema.js'
import { getSupermarketById } from '../db/queries.js'

const UNIT_TYPES = [
  'palette', 'carton', 'sac', 'colis', 'bidon', 'kg', 'caisse', 'plateau',
  'unite', 'tonne', 'botte', 'seau', 'metre', 'litre', 'rouleau', 'camion',
] as const
export type TourStopUnitType = (typeof UNIT_TYPES)[number]

export function isTourStopUnitType(value: unknown): value is TourStopUnitType {
  return typeof value === 'string' && (UNIT_TYPES as readonly string[]).includes(value)
}

export type ResolvedCatalogStop = {
  supermarketId: string
  name: string
  address: string
  contactPhone?: string
  lat: string
  lng: string
  catalog: Supermarket
}

/**
 * Un arrêt de tournée doit référencer un point actif du catalogue.
 * Les champs lieu (nom, adresse, GPS, téléphone) sont pris du catalogue — pas du client.
 */
export async function resolveStopFromCatalog(
  supermarketIdRaw: unknown,
  stopIndex: number,
  companyId?: string,
): Promise<{ ok: true; stop: ResolvedCatalogStop } | { ok: false; message: string }> {
  const supermarketId = typeof supermarketIdRaw === 'string' ? supermarketIdRaw.trim() : ''
  if (!supermarketId) {
    return {
      ok: false,
      message: `Arrêt ${stopIndex + 1} : sélectionnez un point de livraison du catalogue (supermarketId requis).`,
    }
  }
  const catalog = await getSupermarketById(supermarketId)
  if (!catalog) {
    return {
      ok: false,
      message: `Arrêt ${stopIndex + 1} : point de livraison introuvable (${supermarketId}).`,
    }
  }
  if (companyId && catalog.companyId !== companyId) {
    return {
      ok: false,
      message: `Arrêt ${stopIndex + 1} : ce point n’appartient pas à votre entreprise.`,
    }
  }
  if (!catalog.active) {
    return {
      ok: false,
      message: `Arrêt ${stopIndex + 1} : le point « ${catalog.name} » est inactif.`,
    }
  }
  return {
    ok: true,
    stop: {
      supermarketId: catalog.id,
      name: catalog.name,
      address: catalog.address,
      contactPhone: catalog.contactPhone || undefined,
      lat: catalog.lat ?? '0',
      lng: catalog.lng ?? '0',
      catalog,
    },
  }
}
