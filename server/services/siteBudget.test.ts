import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  amendmentWouldUndercutEngaged,
  computeBudgetKpis,
  computeBudgetTotals,
  firstOverrunAt,
  toFcfaInt,
} from './siteBudget.ts'

describe('siteBudget F01', () => {
  it('KPI « — » tant que l’enveloppe n’est pas gelée', () => {
    const t = computeBudgetTotals({
      budgetInitialFcfa: null,
      budgetFrozenAt: null,
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 1000,
      realizedFcfa: 500,
    })
    assert.equal(t.budgetInitialFcfa, null)
    assert.equal(t.budgetTotalFcfa, null)
    assert.equal(t.remainingFcfa, null)
    assert.equal(t.overBudget, false)
    assert.equal(t.engagedFcfa, 1000)
    const k = computeBudgetKpis({ totals: t, approvedAmendmentCount: 0 })
    assert.equal(k.trafficLight, 'none')
    assert.equal(k.engagementPct, null)
    assert.equal(k.missingAmendment, false)
  })

  it('total = initial + avenants ; reste = total − engagé', () => {
    const t = computeBudgetTotals({
      budgetInitialFcfa: '100000000',
      budgetFrozenAt: new Date(),
      approvedAmendmentSumFcfa: 15_000_000,
      engagedFcfa: 7_850_000,
      realizedFcfa: 5_000_000,
    })
    assert.equal(t.budgetInitialFcfa, 100_000_000)
    assert.equal(t.budgetTotalFcfa, 115_000_000)
    assert.equal(t.remainingFcfa, 107_150_000)
    assert.equal(t.realizedFcfa, 5_000_000)
    assert.equal(t.overBudget, false)
    const k = computeBudgetKpis({ totals: t, approvedAmendmentCount: 1 })
    assert.equal(k.trafficLight, 'ok')
    assert.equal(k.engagementPct, 6.83)
    assert.equal(k.varianceFcfa, 110_000_000)
    assert.equal(k.variancePct, 95.65)
    assert.equal(k.missingAmendment, false)
  })

  it('overBudget si engagé > total (warning, pas un calcul bloqué)', () => {
    const t = computeBudgetTotals({
      budgetInitialFcfa: 1000,
      budgetFrozenAt: '2026-08-19',
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 50_000,
      realizedFcfa: 30_000,
    })
    assert.equal(t.overBudget, true)
    assert.equal(t.remainingFcfa, 1000 - 50_000)
    assert.equal(t.realizedFcfa, 30_000)
  })

  it('Koestrem : +2,60 % = vigilance, avenant manquant', () => {
    const t = computeBudgetTotals({
      budgetInitialFcfa: 17_280_052,
      budgetFrozenAt: '2026-04-02',
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 17_730_182,
      realizedFcfa: 17_730_182,
    })
    assert.equal(t.overBudget, true)
    assert.equal(t.remainingFcfa, 17_280_052 - 17_730_182)
    assert.equal(t.realizedFcfa, 17_730_182)
    const k = computeBudgetKpis({
      totals: t,
      approvedAmendmentCount: 0,
      overrunSinceAt: '2026-07-20T10:00:00.000Z',
      now: new Date('2026-08-19T21:53:00.000Z'),
    })
    assert.equal(k.varianceFcfa, -450_130)
    assert.equal(k.variancePct, -2.6)
    assert.equal(k.engagementPct, 102.6)
    assert.equal(k.trafficLight, 'watch')
    assert.equal(k.missingAmendment, true)
    assert.equal(k.overrunDays, 30)
  })

  it('feu alerte dès 5 % ; avenant approuvé enlève « manquant »', () => {
    const watchTotals = computeBudgetTotals({
      budgetInitialFcfa: 1000,
      budgetFrozenAt: '2026-08-19',
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 1100,
      realizedFcfa: 1030,
    })
    const watch = computeBudgetKpis({ totals: watchTotals, approvedAmendmentCount: 0 })
    assert.equal(watch.varianceFcfa, -30)
    assert.equal(watch.variancePct, -3)
    assert.equal(watch.trafficLight, 'watch')
    assert.equal(watch.missingAmendment, true)

    const alertTotals = computeBudgetTotals({
      budgetInitialFcfa: 1000,
      budgetFrozenAt: '2026-08-19',
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 1100,
      realizedFcfa: 1050,
    })
    const alert = computeBudgetKpis({ totals: alertTotals, approvedAmendmentCount: 0 })
    assert.equal(alert.varianceFcfa, -50)
    assert.equal(alert.variancePct, -5)
    assert.equal(alert.trafficLight, 'alert')

    const covered = computeBudgetKpis({ totals: watchTotals, approvedAmendmentCount: 1 })
    assert.equal(covered.missingAmendment, false)
    assert.equal(covered.trafficLight, 'watch')
  })

  it('BC hors enveloppe sans avenant : feu allumé dès l’engagement, pas seulement au réalisé (I74)', () => {
    const t = computeBudgetTotals({
      budgetInitialFcfa: 1000,
      budgetFrozenAt: '2026-09-16',
      approvedAmendmentSumFcfa: 0,
      engagedFcfa: 5000,
      realizedFcfa: 0,
    })
    const k = computeBudgetKpis({ totals: t, approvedAmendmentCount: 0 })
    assert.equal(k.trafficLight, 'alert')
    assert.equal(k.missingAmendment, true)

    // Avenant approuvé couvrant : pas d'escalade, la variance réalisée décide.
    const covered = computeBudgetKpis({ totals: t, approvedAmendmentCount: 1 })
    assert.equal(covered.trafficLight, 'ok')

    // Dépassement d'engagement dans la tolérance d'alerte → vigilance.
    const mild = computeBudgetKpis({
      totals: computeBudgetTotals({
        budgetInitialFcfa: 1000,
        budgetFrozenAt: '2026-09-16',
        approvedAmendmentSumFcfa: 0,
        engagedFcfa: 1025,
        realizedFcfa: 0,
      }),
      approvedAmendmentCount: 0,
    })
    assert.equal(mild.trafficLight, 'watch')
  })

  it('firstOverrunAt = premier BC qui fait dépasser le total', () => {
    const a = new Date('2026-06-01T08:00:00.000Z')
    const b = new Date('2026-07-15T08:00:00.000Z')
    const c = new Date('2026-07-20T08:00:00.000Z')
    const at = firstOverrunAt(1000, [
      { amountFcfa: 400, createdAt: a },
      { amountFcfa: 400, createdAt: b },
      { amountFcfa: 300, createdAt: c },
    ])
    assert.equal(at?.toISOString(), c.toISOString())
    assert.equal(firstOverrunAt(2000, [{ amountFcfa: 400, createdAt: a }]), null)
  })

  it('avenant de baisse sous l’engagé est détecté', () => {
    assert.equal(amendmentWouldUndercutEngaged(5_000_000, -4_800_000, 350_000), true)
    assert.equal(amendmentWouldUndercutEngaged(5_000_000, -100_000, 350_000), false)
  })

  it('toFcfaInt tronque les numériques string', () => {
    assert.equal(toFcfaInt('7850000'), 7_850_000)
    assert.equal(toFcfaInt(null), 0)
  })
})

