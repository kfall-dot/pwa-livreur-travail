import { isHorsSaFlow, type ChargeFlowLine } from '../../shared/chargeFlow.js'
/** Formules F01 — une seule source pour budget total / engagé / reste. */

import {
  BUDGET_ALERT_PCT,
  BUDGET_TOLERANCE_PCT,
  roundPct,
  type BudgetTrafficLight,
} from '../../shared/budgetTrafficLight.js'

// Ré-export : les primitives vivent dans `shared/` (F03 les réutilise côté
// client), mais les imports historiques depuis ce module restent valides.
export { BUDGET_ALERT_PCT, BUDGET_TOLERANCE_PCT, roundPct }
export type { BudgetTrafficLight }

export const ENGAGED_BC_STATUSES = ['po_ready', 'delivery_scheduled', 'delivered'] as const

export function toFcfaInt(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

export type SiteBudgetTotals = {
  budgetInitialFcfa: number | null
  budgetTotalFcfa: number | null
  engagedFcfa: number
  realizedFcfa: number
  remainingFcfa: number | null
  overBudget: boolean
}

export type SiteBudgetKpis = {
  engagementPct: number | null
  varianceFcfa: number | null
  variancePct: number | null
  trafficLight: BudgetTrafficLight
  missingAmendment: boolean
  overrunSinceAt: string | null
  overrunDays: number | null
}

export function computeBudgetTotals(input: {
  budgetInitialFcfa: string | number | null
  budgetFrozenAt: Date | string | null
  approvedAmendmentSumFcfa: number
  engagedFcfa: number
  realizedFcfa: number
}): SiteBudgetTotals {
  const frozen = Boolean(input.budgetFrozenAt)
  const engagedFcfa = Math.max(0, Math.trunc(input.engagedFcfa))
  const realizedFcfa = Math.max(0, Math.trunc(input.realizedFcfa))
  if (!frozen || input.budgetInitialFcfa == null || input.budgetInitialFcfa === '') {
    return {
      budgetInitialFcfa: null,
      budgetTotalFcfa: null,
      engagedFcfa,
      realizedFcfa,
      remainingFcfa: null,
      overBudget: false,
    }
  }
  const budgetInitialFcfa = toFcfaInt(input.budgetInitialFcfa)
  const budgetTotalFcfa = budgetInitialFcfa + Math.trunc(input.approvedAmendmentSumFcfa)
  const remainingFcfa = budgetTotalFcfa - engagedFcfa
  return {
    budgetInitialFcfa,
    budgetTotalFcfa,
    engagedFcfa,
    realizedFcfa,
    remainingFcfa,
    overBudget: engagedFcfa > budgetTotalFcfa,
  }
}

export function amendmentWouldUndercutEngaged(
  budgetTotalFcfa: number,
  signedAmountFcfa: number,
  engagedFcfa: number,
): boolean {
  return budgetTotalFcfa + signedAmountFcfa < engagedFcfa
}

/** Premier BC (chrono) dont la somme cumulée dépasse le budget total courant. */
export function firstOverrunAt(
  budgetTotalFcfa: number,
  bcs: Array<{ amountFcfa: number; createdAt: Date }>,
): Date | null {
  let running = 0
  const ordered = [...bcs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const bc of ordered) {
    running += Math.trunc(bc.amountFcfa)
    if (running > budgetTotalFcfa) return bc.createdAt
  }
  return null
}

export function computeBudgetKpis(input: {
  totals: SiteBudgetTotals
  approvedAmendmentCount: number
  overrunSinceAt?: Date | string | null
  now?: Date
}): SiteBudgetKpis {
  const { totals, approvedAmendmentCount } = input
  const empty: SiteBudgetKpis = {
    engagementPct: null,
    varianceFcfa: null,
    variancePct: null,
    trafficLight: 'none',
    missingAmendment: false,
    overrunSinceAt: null,
    overrunDays: null,
  }
  if (totals.budgetTotalFcfa == null || totals.budgetTotalFcfa <= 0) return empty

  const budgetTotalFcfa = totals.budgetTotalFcfa
  const engagedFcfa = totals.engagedFcfa
  const realizedFcfa = totals.realizedFcfa
  const varianceFcfa = budgetTotalFcfa - realizedFcfa
  const variancePct = roundPct((varianceFcfa / budgetTotalFcfa) * 100)
  const engagementPct = roundPct((engagedFcfa / budgetTotalFcfa) * 100)
  let trafficLight: BudgetTrafficLight =
    variancePct >= -BUDGET_TOLERANCE_PCT ? 'ok' : variancePct > -BUDGET_ALERT_PCT ? 'watch' : 'alert'
  // I74 : un BC hors enveloppe SANS avenant approuvé allume le feu dès
  // l'ENGAGEMENT — la variance sur le réalisé peut rester « ok » tant que
  // les livraisons n'ont pas rattrapé les BC émis.
  if (trafficLight === 'ok' && totals.overBudget && approvedAmendmentCount === 0) {
    trafficLight = engagementPct > 100 + BUDGET_ALERT_PCT ? 'alert' : 'watch'
  }

  const overrunDate =
    input.overrunSinceAt == null
      ? null
      : input.overrunSinceAt instanceof Date
        ? input.overrunSinceAt
        : new Date(input.overrunSinceAt)
  const overrunSinceAt = overrunDate && Number.isFinite(overrunDate.getTime()) ? overrunDate.toISOString() : null
  const now = input.now ?? new Date()
  const overrunDays =
    overrunSinceAt == null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(overrunSinceAt).getTime()) / 86_400_000))

  return {
    engagementPct,
    varianceFcfa,
    variancePct,
    trafficLight,
    missingAmendment: totals.overBudget && approvedAmendmentCount === 0,
    overrunSinceAt,
    overrunDays,
  }
}

/** Même source hors SA pour les totaux individuels, les listes et les dépassements. */
export function buildDirectBudgetEntries(
  orders: Array<{ requestId: string; siteId: string | null; amount: string | number | null;
    paidAmount: string | number | null; createdAt: Date }>,
  lines: Array<ChargeFlowLine & { requestId: string }>,
  history: Array<{ siteId: string | null; amount: string | number | null; date: string }>,
) {
  const byRequest = new Map<string, typeof lines>()
  for (const line of lines) byRequest.set(line.requestId, [...(byRequest.get(line.requestId) ?? []), line])
  return [
    ...orders.filter(r => r.siteId && isHorsSaFlow(byRequest.get(r.requestId) ?? [])).map(r => ({
      siteId: r.siteId!, engaged: toFcfaInt(r.amount), realized: toFcfaInt(r.paidAmount), createdAt: r.createdAt,
    })),
    ...history.filter(r => r.siteId).map(r => ({ siteId: r.siteId!, engaged: toFcfaInt(r.amount),
      realized: toFcfaInt(r.amount), createdAt: new Date(r.date + 'T12:00:00') })),
  ]
}
