import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  findDuplicateProductInList,
  validateStopProducts,
} from './expectedProducts.ts'

describe('expectedProducts', () => {
  it('détecte un doublon sur le même libellé (insensible à la casse)', () => {
    const dup = findDuplicateProductInList([
      { label: 'Tomates' },
      { label: 'tomates' },
    ])
    assert.ok(dup)
    assert.equal(dup.label, 'tomates')
  })

  it('autorise des produits distincts', () => {
    const dup = findDuplicateProductInList([
      { label: 'Tomates' },
      { label: 'Salade' },
    ])
    assert.equal(dup, null)
  })

  it('validateStopProducts inclut le nom de l’arrêt', () => {
    const err = validateStopProducts(
      [{ label: 'Tomates' }, { label: 'Tomates' }],
      'Abidjan Centre',
    )
    assert.match(err ?? '', /Abidjan Centre/)
    assert.match(err ?? '', /Tomates/)
  })
})
