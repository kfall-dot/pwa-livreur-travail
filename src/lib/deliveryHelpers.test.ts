import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartialDeclareLines,
  buildRejectedLines,
  finalizeDeclarationLines,
  resolveDeclarationOutcome,
} from './deliveryHelpers.ts'
import { DEFAULT_FULL_JUSTIFICATION } from './declarationValidation.ts'

function line(label: string, unit: string, expected: number) {
  return { productLabel: label, unit, quantityExpected: expected }
}

describe('finalizeDeclarationLines — sélection partiel / refus', () => {
  it('produit non coché → livré en totalité (flag client retiré)', () => {
    const out = finalizeDeclarationLines(
      [
        {
          ...line('P1', 'caisse', 4),
          isPartial: false,
          quantityAccepted: undefined,
          quantityRefused: 0,
          justification: DEFAULT_FULL_JUSTIFICATION,
        },
      ],
      4,
      'partial',
    )
    assert.equal(out[0]?.quantityAccepted, 4)
    assert.equal(out[0]?.quantityRefused, 0)
    assert.equal(out[0]?.justification, DEFAULT_FULL_JUSTIFICATION)
    assert.equal(out[0]?.isPartial, undefined)
  })

  it('partielle : produit coché → refusé = commandé − accepté', () => {
    const out = finalizeDeclarationLines(
      [
        {
          ...line('P1', 'caisse', 4),
          isPartial: true,
          quantityAccepted: 1,
          quantityRefused: 0,
          justification: 'casse',
        },
      ],
      4,
      'partial',
    )
    assert.equal(out[0]?.quantityAccepted, 1)
    assert.equal(out[0]?.quantityRefused, 3)
    assert.equal(out[0]?.justification, 'casse')
  })

  it('refusée : produit coché → accepté 0 / refusé = commandé', () => {
    const out = finalizeDeclarationLines(
      [
        {
          ...line('P1', 'caisse', 4),
          isPartial: true,
          quantityAccepted: undefined,
          quantityRefused: 0,
          justification: 'produit périmé',
        },
      ],
      4,
      'rejected',
    )
    assert.equal(out[0]?.quantityAccepted, 0)
    assert.equal(out[0]?.quantityRefused, 4)
  })

  it('refusée mixte : produit refusé + produit livré en totalité', () => {
    const out = finalizeDeclarationLines(
      [
        {
          ...line('A', 'caisse', 2),
          isPartial: true,
          quantityAccepted: undefined,
          quantityRefused: 0,
          justification: 'refus',
        },
        {
          ...line('B', 'palette', 1),
          isPartial: false,
          quantityAccepted: undefined,
          quantityRefused: 0,
          justification: DEFAULT_FULL_JUSTIFICATION,
        },
      ],
      3,
      'rejected',
    )
    assert.deepEqual(
      out.map((l) => [l.quantityAccepted, l.quantityRefused]),
      [
        [0, 2],
        [1, 0],
      ],
    )
  })

  it('initialisation : buildPartialDeclareLines / buildRejectedLines démarrent tout en « livré total »', () => {
    const products = [line('A', 'caisse', 2), line('B', 'palette', 1)]
    for (const fn of [buildPartialDeclareLines, buildRejectedLines]) {
      const lines = fn(3, products, 'caisse')
      assert.equal(lines.length, 2)
      for (const l of lines) {
        assert.equal(l.isPartial, false)
        assert.equal(l.quantityAccepted, undefined)
        assert.equal(l.justification, DEFAULT_FULL_JUSTIFICATION)
      }
    }
  })
})

describe('resolveDeclarationOutcome — déduction du statut réel', () => {
  it('rien refusé → full', () => {
    const out = resolveDeclarationOutcome([
      { ...line('A', 'caisse', 2), quantityAccepted: 2, quantityRefused: 0 },
    ])
    assert.equal(out, 'full')
  })

  it('rien accepté → rejected (refus total)', () => {
    const out = resolveDeclarationOutcome([
      { ...line('A', 'caisse', 2), quantityAccepted: 0, quantityRefused: 2 },
    ])
    assert.equal(out, 'rejected')
  })

  it('mélange accepté + refusé → partial (et non refusé)', () => {
    const out = resolveDeclarationOutcome([
      { ...line('A', 'caisse', 2), quantityAccepted: 0, quantityRefused: 2 },
      { ...line('B', 'palette', 1), quantityAccepted: 1, quantityRefused: 0 },
    ])
    assert.equal(out, 'partial')
  })
})
