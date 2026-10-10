import { sql, type SQL } from 'drizzle-orm'
import { purchaseRequests, sites } from './schema.js'

/**
 * Chantiers ayant reçu au moins une EB émise par `managerId`
 * (`purchase_requests.created_by_manager_id`) — condition SQL pure,
 * sans connexion.
 *
 * Partagée par les deux périmètres « mes chantiers » :
 * - `dailyReportQueries` (sélecteur Chantier du Suivi, rapports/photos) ;
 * - `procurementQueries` (budgets, stock, dépenses mensuelles).
 * Les deux doivent employer la même union, sinon le sélecteur proposerait
 * un chantier dont les panneaux renverraient des listes vides (I95).
 */
export function sitesWithEbCreatedBy(companyId: string, managerId: string): SQL {
  return sql`${sites.id} IN (
    SELECT ${purchaseRequests.siteId}
    FROM ${purchaseRequests}
    WHERE ${purchaseRequests.companyId} = ${companyId}
      AND ${purchaseRequests.createdByManagerId} = ${managerId}
  )`
}
