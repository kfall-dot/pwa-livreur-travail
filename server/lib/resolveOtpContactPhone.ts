import type { DeliveryPoint, Supermarket } from '../db/schema.js'
import { DEMO_COMPANY_ID } from '../db/schema.js'
import { getAllSupermarkets, getSupermarketById, getTourById } from '../db/queries.js'
import { matchCatalogForStop, pickOtpContactPhone } from './resolveOtpContact.js'

/**
 * Résout le téléphone OTP pour un arrêt : catalogue (id / nom / adresse) puis copie arrêt.
 * Le catalogue est limité à l’entreprise de l’arrêt (via supermarket ou tournée).
 */
export async function resolveOtpContactPhone(
  stop: Pick<DeliveryPoint, 'supermarketId' | 'name' | 'address' | 'contactPhone' | 'tourId'>,
): Promise<{ recipient: string; catalog: Supermarket | null }> {
  const byId = stop.supermarketId ? await getSupermarketById(stop.supermarketId) : null
  let companyId = byId?.companyId
  if (!companyId && stop.tourId) {
    const tour = await getTourById(stop.tourId)
    companyId = tour?.companyId
  }
  companyId = companyId ?? DEMO_COMPANY_ID

  let catalog = byId
  let recipient = pickOtpContactPhone(stop.contactPhone, catalog?.contactPhone)
  if (!recipient) {
    const all = await getAllSupermarkets(companyId)
    catalog = matchCatalogForStop(stop, null, all) ?? byId
    recipient = pickOtpContactPhone(stop.contactPhone, catalog?.contactPhone)
  }
  return { recipient, catalog }
}
