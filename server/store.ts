/**
 * @deprecated Phase 2 : toutes les données sont désormais persistées en base
 * via server/db/queries.ts (Drizzle + Netlify Database).
 * Ce fichier est conservé temporairement pour référence de types.
 * Les types canoniques se trouvent maintenant dans server/db/schema.ts.
 */

export type DeliveryStatus = 'pending' | 'in_progress' | 'otp_sent' | 'delivered' | 'failed'
export type UnitType = 'palette' | 'carton' | 'sac' | 'colis' | 'bidon'
export type FraudLevel = 'low' | 'medium' | 'high' | 'critical'
