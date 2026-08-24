import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOtpSmsBody,
  buildTourAssignedSmsBody,
  formatOrderDetailForOtpSms,
  resolveSmsOrderReference,
} from './smsMessages.js'

describe('resolveSmsOrderReference', () => {
  it('ignore les UUID internes', () => {
    assert.equal(resolveSmsOrderReference('CMD-2026-8841'), 'CMD-2026-8841')
    assert.equal(
      resolveSmsOrderReference('550e8400-e29b-41d4-a716-446655440000'),
      '—',
    )
  })
})

describe('formatOrderDetailForOtpSms', () => {
  it('liste les produits planifiés', () => {
    const detail = formatOrderDetailForOtpSms(
      [
        { label: 'Palettes œufs', qty: 2, unit: 'palette' },
        { label: "Jus d'orange", qty: 1, unit: 'caisse' },
      ],
      3,
      'palette',
    )
    assert.match(detail, /Palettes œufs/)
    assert.match(detail, /Jus d'orange/)
  })
})

describe('buildOtpSmsBody', () => {
  it('inclut le code et la référence commande', () => {
    const body = buildOtpSmsBody('123456', {
      pointName: 'Carrefour City',
      orderRef: 'CMD-2026-8841',
      orderDetail: '3 palette',
      outcome: 'full',
    })
    assert.match(body, /123456/)
    assert.match(body, /CMD-2026-8841/)
    assert.match(body, /Carrefour City/)
  })

  it('adapte le message en cas de refus', () => {
    const body = buildOtpSmsBody('654321', {
      pointName: 'Monoprix',
      orderRef: 'CMD-1',
      outcome: 'rejected',
    })
    assert.match(body, /Refus/)
    assert.match(body, /654321/)
  })
})

describe('buildTourAssignedSmsBody', () => {
  it('indique la date, le nombre d’arrêts et le lien app', () => {
    const body = buildTourAssignedSmsBody({
      tourDate: '2026-07-12',
      stopCount: 3,
      depotName: 'Entrepôt Nord',
      appUrl: 'https://pwa-livreur.netlify.app',
    })
    assert.match(body, /2026-07-12/)
    assert.match(body, /3 arrêt/)
    assert.match(body, /Entrepôt Nord/)
    assert.match(body, /https:\/\/pwa-livreur\.netlify\.app/)
    assert.match(body, /pour démarrer/)
  })
})
