import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineAmountFcfa,
  needsPdgApproval,
  shouldDisplayPdgSignature,
  sumLineAmountsFcfa,
  unitPriceFromAmount,
} from './ebPricing.ts'

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

  it('case PDG de la fiche EB : le seuil décide qui approuve, le visa décide ce qui s’imprime', () => {
    // ≥ seuil : la case est due au circuit d'approbation, signée ou non.
    assert.equal(shouldDisplayPdgSignature(500_000, 500_000, false), true)
    assert.equal(shouldDisplayPdgSignature(1_200_000, 500_000, true), true)
    // < seuil sans visa : rien à imprimer (cas normal d'une EB sous le seuil).
    assert.equal(shouldDisplayPdgSignature(499_999, 500_000, false), false)
    assert.equal(shouldDisplayPdgSignature(0, 500_000, false), false)
    // < seuil MAIS visa PDG (révision qui a réduit les quantités) : la signature
    // apposée doit rester visible, sous peine d'un bandeau « révisée par le PDG »
    // sans case PDG.
    assert.equal(shouldDisplayPdgSignature(499_999, 500_000, true), true)
    assert.equal(shouldDisplayPdgSignature(0, 500_000, true), true)
  })
})
