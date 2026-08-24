import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeliveredProductsDisplay,
  deliveredQuantityEmptyLabel,
  expectedProductsDisplay,
  parseDeclLinesForDisplay,
} from './deliveredQuantity.ts'

describe('buildDeliveredProductsDisplay — régressions connues', () => {
  const threePalettes = expectedProductsDisplay(null, 3, 'palette')

  it('livré complet sans déclaration → quantité attendue', () => {
    const out = buildDeliveredProductsDisplay(threePalettes, null, 'delivered', 'full')
    assert.deepEqual(out, [{ label: 'Produit', qty: 3, unit: 'palette' }])
  })

  it('livré complet, déclaration avec libellé différent → quantité attendue (pas 0)', () => {
    const decl = [
      {
        productLabel: 'Produit commandé',
        quantityAccepted: 3,
        quantityExpected: 3,
        unit: 'palette',
      },
    ]
    const out = buildDeliveredProductsDisplay(threePalettes, decl, 'delivered', 'full')
    assert.equal(out[0]?.qty, 3)
  })

  it('livré complet, déclaration sans quantityAccepted mais quantityExpected → quantité attendue', () => {
    const decl = [{ productLabel: 'Produit commandé', quantityExpected: 3, unit: 'palette' }]
    const parsed = parseDeclLinesForDisplay(decl)
    assert.equal(parsed[0]?.qty, 3)
    const out = buildDeliveredProductsDisplay(threePalettes, decl, 'delivered', null)
    assert.equal(out[0]?.qty, 3)
  })

  it('multi-produits caisses, libellés alignés', () => {
    const expected = expectedProductsDisplay(
      [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
      4,
      'caisse',
    )
    const decl = [
      {
        productLabel: 'Salade iceberg',
        quantityAccepted: 4,
        quantityExpected: 4,
        unit: 'caisse',
      },
    ]
    const out = buildDeliveredProductsDisplay(expected, decl, 'delivered', 'full')
    assert.deepEqual(out, [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }])
  })

  it('refusée → vide', () => {
    const out = buildDeliveredProductsDisplay(threePalettes, [], 'delivered', 'rejected')
    assert.deepEqual(out, [])
  })

  it('failed → vide', () => {
    const out = buildDeliveredProductsDisplay(threePalettes, [], 'failed', null)
    assert.deepEqual(out, [])
  })

  it('en attente → zéro livré', () => {
    const out = buildDeliveredProductsDisplay(threePalettes, null, 'pending', null)
    assert.deepEqual(out, [{ label: 'Produit', qty: 0, unit: 'palette' }])
  })
})

describe('deliveredQuantityEmptyLabel', () => {
  it('refusée → message refusée', () => {
    assert.equal(
      deliveredQuantityEmptyLabel('delivered', 'rejected'),
      'Aucun produit livré (livraison refusée).',
    )
  })

  it('annulée (failed) → message annulée', () => {
    assert.equal(
      deliveredQuantityEmptyLabel('failed', null),
      'Aucun produit livré (livraison annulée).',
    )
  })

  it('autre → message déclaré', () => {
    assert.equal(
      deliveredQuantityEmptyLabel('delivered', 'full'),
      'Aucun produit livré déclaré.',
    )
  })
})

describe('expectedProductsDisplay', () => {
  it('ne produit jamais « undefined » si units/qty manquent', () => {
    const out = expectedProductsDisplay(null, Number.NaN as unknown as number, undefined as unknown as string)
    assert.equal(out.length, 1)
    assert.equal(out[0]?.label, 'Produit')
    assert.equal(out[0]?.qty, 1)
    assert.equal(out[0]?.unit, 'unite')
  })

  it('accepte quantity comme alias de qty', () => {
    const out = expectedProductsDisplay(
      [{ label: 'Tomates', qty: undefined as unknown as number, unit: 'caisse', quantity: 4 } as never],
      1,
      'palette',
    )
    assert.equal(out[0]?.qty, 4)
    assert.equal(out[0]?.unit, 'caisse')
  })
})
