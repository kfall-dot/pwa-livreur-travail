import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adaptLivraisonToday } from './livraisonAdapter.ts'

describe('adaptLivraisonToday', () => {
  it('conserve receiptId pour le profil livreur', () => {
    const tour = adaptLivraisonToday({
      date: '2026-07-22',
      count: 2,
      deliveries: [
        {
          id: 'del-k1',
          status: 'delivered',
          supermarket_name: 'Marché A',
          supermarket_address: 'Rue A',
          expected_palettes: 2,
          expected_weight_kg: 10,
          declaration_outcome: 'full',
          receipt_id: 'RCT-AAA11111',
        },
        {
          id: 'del-k2',
          status: 'delivered',
          supermarket_name: 'Marché B',
          supermarket_address: 'Rue B',
          expected_palettes: 1,
          expected_weight_kg: 5,
          declaration_outcome: 'partial',
          receipt_id: 'RCT-BBB22222',
        },
      ],
    })

    assert.equal(tour.stops.length, 2)
    assert.equal(tour.stops[0]?.receiptId, 'RCT-AAA11111')
    assert.equal(tour.stops[1]?.receiptId, 'RCT-BBB22222')
    assert.equal(tour.stops[1]?.declarationOutcome, 'partial')
  })
})
