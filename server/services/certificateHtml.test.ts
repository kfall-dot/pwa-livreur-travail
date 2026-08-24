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
})
