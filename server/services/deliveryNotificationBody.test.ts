import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildEmailBody } from './deliveryNotificationBody.ts'

describe('buildEmailBody', () => {
  it('détaille quantités et inclut le lien certificat HTML', () => {
    const certUrl = 'https://example.test/api/v1/certificates/RCT-TEST01?view=html&access=token'
    const { subject, text } = buildEmailBody(
      {
        name: 'Carrefour City',
        address: '45 Avenue de la République',
        units: 110,
        unitType: 'caisse',
        orderRef: 'CMD-20260712-ABCD',
        products: [
          { label: 'Tomates cerises', qty: 100, unit: 'caisse' },
          { label: 'Salade iceberg', qty: 10, unit: 'caisse' },
        ],
        tourDate: '2026-07-12',
        driverName: 'Kouassi',
      },
      'RCT-TEST01',
      'partial',
      [
        {
          productLabel: 'Tomates cerises',
          unit: 'caisse',
          quantityExpected: 100,
          quantityAccepted: 60,
          quantityRefused: 40,
        },
        {
          productLabel: 'Salade iceberg',
          unit: 'caisse',
          quantityExpected: 10,
          quantityAccepted: 10,
          quantityRefused: 0,
        },
      ],
      certUrl,
    )
    assert.match(subject, /Carrefour City/)
    assert.match(text, /partielle/)
    assert.match(text, /Quantité attendue/)
    assert.match(text, /Tomates cerises 100 caisses/)
    assert.match(text, /Salade iceberg 10 caisses/)
    assert.match(text, /Quantité livrée/)
    assert.match(text, /Tomates cerises 60 caisses/)
    assert.match(text, /Salade iceberg 10 caisses/)
    assert.match(text, /Voir le certificat :/)
    assert.match(text, /view=html/)
    assert.match(text, /access=token/)
    assert.doesNotMatch(text, /Lien\s*:/)
  })
})
