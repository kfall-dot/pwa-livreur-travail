import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lineAmountFcfa, needsPdgApproval, sumLineAmountsFcfa, unitPriceFromAmount } from './ebPricing.ts'

describe('ebPricing', () => {
  it('montant = PU × quantité', () => {
    assert.equal(lineAmountFcfa(2500, 50), 125_000)
    assert.equal(lineAmountFcfa(10.4, 3), 31)
  })

  it('seuil PDG inclusif à 500 000 XOF', () => {
    assert.equal(needsPdgApproval(499_999), false)
    assert.equal(needsPdgApproval(500_000), true)
    assert.equal(needsPdgApproval(500_001), true)
  })

  it('somme des lignes et PU déduit du montant', () => {
    assert.equal(
      sumLineAmountsFcfa([
        { unitPriceFcfa: 1000, quantity: 10 },
        { unitPriceFcfa: 2500, quantity: 4 },
      ]),
      20_000,
    )
    assert.equal(unitPriceFromAmount(125_000, 50), 2500)
  })
})
