import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderCertificateHtml } from './certificateHtml.ts'

describe('renderCertificateHtml', () => {
  it('affiche le détail et échappe le HTML', () => {
    const html = renderCertificateHtml({
      receiptId: 'RCT-TEST01',
      deliveryName: 'Carrefour <script>',
      deliveryAddress: '45 Avenue',
      tourDate: '2026-07-12',
      driverName: 'Kouassi',
      orderRef: 'CMD-20260712-ABCD',
      outcome: 'partial',
      isPartial: true,
      isRejected: false,
      expectedLines: [{ label: 'Tomates cerises', qty: 100, unit: 'caisse' }],
      deliveredLines: [{ label: 'Tomates cerises', qty: 60, unit: 'caisse' }],
    })
    assert.match(html, /RCT-TEST01/)
    assert.match(html, /Livraison partielle/)
    assert.match(html, /Tomates cerises/)
    assert.match(html, /100 caisses/)
    assert.match(html, /60 caisses/)
    assert.match(html, /Carrefour &lt;script&gt;/)
    assert.doesNotMatch(html, /<script>/)
  })

  it('affiche la raison du refus à côté d’une ligne refusée (quantité 0)', () => {
    const html = renderCertificateHtml({
      receiptId: 'RCT-TEST02',
      deliveryName: 'Monoprix Bastille',
      deliveryAddress: '8 Place de la Bastille',
      tourDate: '2026-07-12',
      driverName: 'Kouassi',
      orderRef: 'CMD-2',
      outcome: 'rejected',
      isPartial: false,
      isRejected: true,
      expectedLines: [
        { label: 'Palettes œufs', qty: 2, unit: 'palette' },
        { label: "Jus d'orange", qty: 1, unit: 'caisse' },
      ],
      deliveredLines: [
        { label: 'Palettes œufs', qty: 0, unit: 'palette', justification: 'Produit cassé' },
        { label: "Jus d'orange", qty: 0, unit: 'caisse', justification: 'Client absent' },
      ],
    })
    assert.match(html, /Palettes œufs/)
    assert.match(html, /0 palette/)
    assert.match(html, /Produit cassé/)
    assert.match(html, /Motif/)
  })

  it('n’affiche pas le motif par défaut sur une livraison complète', () => {
    const html = renderCertificateHtml({
      receiptId: 'RCT-TEST03',
      deliveryName: 'Carrefour City',
      deliveryAddress: '45 Avenue',
      tourDate: '2026-07-12',
      driverName: 'Kouassi',
      orderRef: 'CMD-3',
      outcome: 'full',
      isPartial: false,
      isRejected: false,
      expectedLines: [{ label: 'Tomates', qty: 2, unit: 'caisse' }],
      deliveredLines: [{ label: 'Tomates', qty: 2, unit: 'caisse', justification: 'Réception conforme à la commande' }],
    })
    assert.match(html, /Tomates/)
    assert.doesNotMatch(html, /Réception conforme/)
    assert.doesNotMatch(html, /Motif/)
  })
})
