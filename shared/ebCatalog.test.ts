import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { catalogUnitFromEb } from './ebCatalog.ts'

describe('catalogUnitFromEb', () => {
  it('mappe tonne / tonnes / t vers tonne (pas colis)', () => {
    assert.equal(catalogUnitFromEb('tonne'), 'tonne')
    assert.equal(catalogUnitFromEb('tonnes'), 'tonne')
    assert.equal(catalogUnitFromEb('t'), 'tonne')
  })

  it('conserve sac et colis', () => {
    assert.equal(catalogUnitFromEb('sacs'), 'sac')
    assert.equal(catalogUnitFromEb('colis'), 'colis')
  })

  it('mappe bottes / barres vers botte (pas colis)', () => {
    assert.equal(catalogUnitFromEb('bottes'), 'botte')
    assert.equal(catalogUnitFromEb('botte'), 'botte')
    assert.equal(catalogUnitFromEb('barres'), 'botte')
    assert.equal(catalogUnitFromEb('barre'), 'botte')
  })

  it('mappe seau / litre / mètre (pas colis ni palette)', () => {
    assert.equal(catalogUnitFromEb('seaux'), 'seau')
    assert.equal(catalogUnitFromEb('litres'), 'litre')
    assert.equal(catalogUnitFromEb('mètres'), 'metre')
  })

  it('unité vide ou inconnue → unite / slug, jamais colis ni palette', () => {
    assert.equal(catalogUnitFromEb(''), 'unite')
    assert.equal(catalogUnitFromEb(null), 'unite')
    assert.equal(catalogUnitFromEb('fûts'), 'fut')
    assert.notEqual(catalogUnitFromEb(''), 'colis')
    assert.notEqual(catalogUnitFromEb('seaux'), 'palette')
  })
})
