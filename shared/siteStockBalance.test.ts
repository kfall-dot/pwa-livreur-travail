import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSiteStockBalances } from './siteStockBalance.js'

const received = { siteId: 'a', siteName: 'Chantier A', productLabel: 'Ciment', unit: 'sacs', onHand: 10, onOrder: 80 }
test('disponible = réceptionné moins consommé, sans les commandes attendues', () => {
  const [row] = buildSiteStockBalances([received], [{ siteId: 'a', productLabel: 'Ciment', unit: 'sacs', consumed: 3 }])
  assert.equal(row.onHand, 10); assert.equal(row.consumed, 3); assert.equal(row.available, 7)
  assert.equal(buildSiteStockBalances([received], [])[0].available, 10, 'supprimer une consommation rétablit le disponible')
})
test('regroupe casse, espaces et unités usuelles sans mélanger chantiers ou dimensions', () => {
  const rows = buildSiteStockBalances([received, { ...received, siteId: 'b' }, { ...received, unit: 'kg', onHand: 100 }, { ...received, unit: 'tonne', onHand: 2 }], [
    { siteId: 'a', productLabel: ' CIMENT ', unit: 'sac', consumed: 2 },
    { siteId: 'a', productLabel: 'Ciment', unit: 'SACS', consumed: 1 },
    { siteId: 'a', productLabel: 'Ciment', unit: 'kg', consumed: 30 },
  ])
  assert.equal(rows.find(row => row.siteId === 'a' && row.unit === 'sacs')?.available, 7)
  assert.equal(rows.find(row => row.siteId === 'b')?.available, 10)
  assert.equal(rows.find(row => row.unit === 'kg')?.available, 70)
  assert.equal(rows.find(row => row.unit === 'tonne')?.available, 2)
})
test('conserve les matériaux épuisés et les écarts négatifs, sans arrondis parasites', () => {
  const rows = buildSiteStockBalances([{ ...received, onHand: 0.3 }], [
    { siteId: 'a', productLabel: 'Ciment', unit: 'sac', consumed: 0.1 },
    { siteId: 'a', productLabel: 'Ciment', unit: 'sacs', consumed: 0.2 },
    { siteId: 'a', productLabel: 'Fer', unit: 'botte', consumed: 2 },
  ])
  assert.equal(rows.find(row => row.productLabel === 'Ciment')?.available, 0)
  assert.equal(rows.find(row => row.productLabel === 'Fer')?.available, -2)
})
