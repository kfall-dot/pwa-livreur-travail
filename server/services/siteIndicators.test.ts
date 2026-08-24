import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSiteIndicators,
  expenseDateIso,
  isoDaysInclusive,
  productAmountsFromDelivery,
  rankTopProducts,
} from './siteIndicators.ts'

describe('siteIndicators Koestrem', () => {
  it('remplit chaque jour depuis la 1re dépense jusqu’à aujourd’hui', () => {
    const snap = buildSiteIndicators({
      asOf: '2026-07-27',
      budgetInitialFcfa: 17_280_052,
      budgetTotalFcfa: 17_280_052,
      events: [
        {
          date: '2026-07-01',
          amountFcfa: 10_000_000,
          products: [
            { label: 'Menuiserie', amountFcfa: 6_000_000, category: 'menuiserie' },
            { label: 'Peinture', amountFcfa: 4_000_000, category: 'peinture' },
          ],
        },
        {
          date: '2026-07-27',
          amountFcfa: 7_730_182,
          products: [
            { label: 'Électricité', amountFcfa: 4_195_083, category: 'electricite' },
            { label: 'Peinture', amountFcfa: 3_535_099, category: 'peinture' },
          ],
        },
      ],
    })
    assert.equal(snap.firstExpenseOn, '2026-07-01')
    assert.equal(snap.daily.length, 27)
    assert.equal(snap.daily[0]?.realizedFcfa, 10_000_000)
    assert.equal(snap.daily[1]?.realizedFcfa, 10_000_000)
    assert.equal(snap.realizedFcfa, 17_730_182)
    assert.equal(snap.varianceFcfa, 450_130)
    assert.equal(snap.variancePct, 2.6)
    assert.equal(snap.realizedPct, 102.6)
    assert.equal(snap.materialsFcfa, 17_730_182)
    assert.equal(snap.materialsSharePct, 102.6)
    assert.equal(snap.daily.at(-1)?.date, '2026-07-27')
  })

  it('classe les 3 postes matériaux 5.1 par part du budget initial', () => {
    const totals = new Map([
      ['menuiserie', 5_000_000],
      ['peinture', 3_000_000],
      ['electricite', 2_195_083],
      ['carocol', 100_000],
    ] as const)
    const top3 = rankTopProducts(
      new Map(
        [...totals].map(([category, amountFcfa]) => [
          category,
          { label: category, amountFcfa, category },
        ]),
      ),
      17_280_052,
    )
    assert.equal(top3.length, 3)
    assert.match(top3[0]?.label ?? '', /menuiserie/i)
    assert.match(top3[1]?.label ?? '', /peinture/i)
    assert.match(top3[2]?.label ?? '', /électri/i)
    assert.ok((top3[0]?.shareOfInitialPct ?? 0) > (top3[1]?.shareOfInitialPct ?? 0))
  })

  it('écart du jour = réalisé cumulé − budget total', () => {
    const snap = buildSiteIndicators({
      asOf: '2026-08-21',
      budgetInitialFcfa: 1_000_000,
      budgetTotalFcfa: 1_000_000,
      events: [{ date: '2026-08-21', amountFcfa: 70_000, products: [{ label: 'Ciment', amountFcfa: 70_000 }] }],
    })
    assert.equal(snap.varianceFcfa, -930_000)
    assert.equal(snap.daily[0]?.varianceFcfa, -930_000)
  })

  it('sans livraison : réalisé 0, série vide', () => {
    const snap = buildSiteIndicators({
      asOf: '2026-08-21',
      budgetInitialFcfa: 1_000_000,
      budgetTotalFcfa: 1_000_000,
      events: [],
    })
    assert.equal(snap.realizedFcfa, 0)
    assert.equal(snap.firstExpenseOn, null)
    assert.equal(snap.daily.length, 0)
    assert.equal(snap.materialsSharePct, null)
    assert.equal(snap.varianceFcfa, -1_000_000)
  })

  it('préfère la date de tournée à l’horodatage de déclaration', () => {
    assert.equal(expenseDateIso('2026-08-20', '2026-08-21T23:00:00.000Z'), '2026-08-20')
    assert.equal(isoDaysInclusive('2026-08-20', '2026-08-22').join(','), '2026-08-20,2026-08-21,2026-08-22')
  })

  it('répartit le montant livré par produit (livraison complète)', () => {
    const products = productAmountsFromDelivery(
      [
        { label: 'Ciment', quantity: 50, unit: 'sacs', unitPriceFcfa: 1000 },
        { label: 'Fer', quantity: 20, unit: 'barres', unitPriceFcfa: 1000 },
      ],
      { outcome: 'full', lines: [] },
      70_000,
    )
    const ciment = products.find((p) => p.label === 'Ciment')
    const fer = products.find((p) => p.label === 'Fer')
    assert.equal(ciment?.amountFcfa, 50_000)
    assert.equal(fer?.amountFcfa, 20_000)
  })

  it('ventile les postes 5.1 et calcule la part matériaux / budget total', () => {
    const snap = buildSiteIndicators({
      asOf: '2026-07-27',
      budgetInitialFcfa: 17_280_052,
      budgetTotalFcfa: 17_280_052,
      events: [
        {
          date: '2026-07-01',
          amountFcfa: 14_517_892,
          products: [
            { label: 'Menuiserie', amountFcfa: 3_576_800, category: 'menuiserie' },
            { label: 'Peinture', amountFcfa: 3_457_002, category: 'peinture' },
            { label: 'Électricité', amountFcfa: 3_161_281, category: 'electricite' },
            { label: 'Plomberie', amountFcfa: 4_322_809, category: 'plomberie' },
          ],
        },
      ],
    })
    assert.equal(snap.materialsFcfa, 14_517_892)
    assert.equal(snap.materialsSharePct, 84.02)
    assert.equal(snap.byCategory[0]?.category, 'plomberie')
    assert.match(snap.top3[0]?.label ?? '', /plomberie/i)
    assert.match(snap.top3[1]?.label ?? '', /menuiserie/i)
    assert.match(snap.top3[2]?.label ?? '', /peinture/i)
  })
})
