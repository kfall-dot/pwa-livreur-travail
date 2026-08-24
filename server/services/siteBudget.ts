/** Formules F01 — une seule source pour budget total / engagé / reste. */

export const ENGAGED_BC_STATUSES = ['po_ready', 'delivery_scheduled', 'delivered'] as const

export function toFcfaInt(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

export const BUDGET_TOLERANCE_PCT = 2
export const BUDGET_ALERT_PCT = 5

export type BudgetTrafficLight = 'none' | 'ok' | 'watch' | 'alert'

export type SiteBudgetTotals = {
  budgetInitialFcfa: number | null
  budgetTotalFcfa: number | null
  engagedFcfa: number
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

export function roundPct(value: number): number {
  return Math.round(value * 100) / 100
}

export function computeBudgetTotals(input: {
  budgetInitialFcfa: string | number | null
  budgetFrozenAt: Date | string | null
  approvedAmendmentSumFcfa: number
  engagedFcfa: number
}): SiteBudgetTotals {
  const frozen = Boolean(input.budgetFrozenAt)
  const engagedFcfa = Math.max(0, Math.trunc(input.engagedFcfa))
  if (!frozen || input.budgetInitialFcfa == null || input.budgetInitialFcfa === '') {
    return {
      budgetInitialFcfa: null,
      budgetTotalFcfa: null,
      engagedFcfa,
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
  const varianceFcfa = engagedFcfa - budgetTotalFcfa
  const variancePct = roundPct((varianceFcfa / budgetTotalFcfa) * 100)
  const engagementPct = roundPct((engagedFcfa / budgetTotalFcfa) * 100)
  const trafficLight: BudgetTrafficLight =
    variancePct <= BUDGET_TOLERANCE_PCT ? 'ok' : variancePct < BUDGET_ALERT_PCT ? 'watch' : 'alert'

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
