/**
 * Primitives de **feu budgétaire** (F01) — partagées serveur ↔ client.
 *
 * Extraites de `server/services/siteBudget.ts` pour que `shared/` puisse les
 * utiliser sans dépendre du serveur (F03 : tableau budget vs réalisé).
 * `siteBudget.ts` les ré-exporte : aucun import existant ne change.
 */

/** Tolérance : en deçà de 2 % de dépassement, le feu reste vert. */
export const BUDGET_TOLERANCE_PCT = 2

/** Au-delà de 5 % de dépassement, le feu passe à l'alerte. */
export const BUDGET_ALERT_PCT = 5

export type BudgetTrafficLight = 'none' | 'ok' | 'watch' | 'alert'

/** Arrondi à 2 décimales — convention unique pour tous les pourcentages affichés. */
export function roundPct(value: number): number {
  return Math.round(value * 100) / 100
}
