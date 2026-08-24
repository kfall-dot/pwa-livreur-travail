import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatDriverDeliveryContent, formatQuantityWithUnit, formatTourContentSummary } from './deliveryUnits.ts'

describe('formatDriverDeliveryContent', () => {
  it('un seul produit → désignation · quantité + unité', () => {
    assert.equal(
      formatDriverDeliveryContent(4, 'caisse', [{ label: 'Salade', qty: 4, unit: 'caisse' }]),
      'Salade · 4 caisses',
    )
  })

  it('plusieurs produits → multiple', () => {
    assert.equal(
      formatDriverDeliveryContent(3, 'palette', [
        { label: 'Palettes œufs', qty: 2, unit: 'palette' },
        { label: 'Jus', qty: 1, unit: 'caisse' },
      ]),
      'multiple',
    )
  })

  it('sans produits → units + unitType', () => {
    assert.equal(formatDriverDeliveryContent(3, 'palette', null), '3 palettes')
  })

  it('une tonne planifiée → tonne (pas colis)', () => {
    assert.equal(
      formatDriverDeliveryContent(1, 'tonne', [{ label: 'Gravier', qty: 1, unit: 'tonne' }]),
      'Gravier · 1 tonne',
    )
  })

  it('fer en bottes → bottes (pas colis)', () => {
    assert.equal(
      formatDriverDeliveryContent(4, 'botte', [{ label: 'Fer 8/14', qty: 4, unit: 'bottes' }]),
      'Fer 8/14 · 4 bottes',
    )
  })

  it('unité manquante → unité, jamais palette par défaut', () => {
    assert.equal(formatQuantityWithUnit(2, ''), '2 unités')
    assert.equal(formatQuantityWithUnit(3, null), '3 unités')
    assert.doesNotMatch(formatQuantityWithUnit(2, ''), /palette/)
  })

  it('seaux de peinture → seaux (pas colis ni palette)', () => {
    assert.equal(
      formatDriverDeliveryContent(10, 'seau', [{ label: 'Peinture', qty: 10, unit: 'seaux' }]),
      'Peinture · 10 seaux',
    )
  })
})

describe('formatTourContentSummary', () => {
  it('regroupe par type d’unité sans les additionner', () => {
    const summary = formatTourContentSummary([
      {
        units: 6,
        unitType: 'caisse',
        products: [
          { qty: 4, unit: 'caisse' },
          { qty: 2, unit: 'plateau' },
        ],
      },
      { units: 3, unitType: 'palette', products: [{ qty: 3, unit: 'palette' }] },
      {
        units: 8,
        unitType: 'palette',
        products: [
          { qty: 5, unit: 'palette' },
          { qty: 3, unit: 'caisse' },
        ],
      },
    ])
    assert.match(summary, /7 caisses/)
    assert.match(summary, /2 plateaux/)
    assert.match(summary, /8 palettes/)
    assert.doesNotMatch(summary, /^19/)
    assert.doesNotMatch(summary, /colis/)
  })
})
