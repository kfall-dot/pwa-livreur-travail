import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FULL_JUSTIFICATION,
  parseDeclarationLines,
  validateDeclarationBeforeSubmit,
} from './declarationValidation.ts'

describe('declarationValidation — serveur / partagé', () => {
  it('parseDeclarationLines refuse un non-tableau', () => {
    assert.equal(parseDeclarationLines(null), null)
    assert.equal(parseDeclarationLines({}), null)
  })

  it('refuse sans choix de type de livraison', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Tomates',
        unit: 'caisse',
        quantityExpected: 4,
        quantityAccepted: 4,
        quantityRefused: 0,
        justification: DEFAULT_FULL_JUSTIFICATION,
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 4, null)
    assert.match(err ?? '', /Choisissez une option/)
  })

  it('refuse lines vides', () => {
    const err = validateDeclarationBeforeSubmit([], 3, 'full')
    assert.match(err ?? '', /ligne produit/)
  })

  it('accepte une livraison full conforme', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Tomates',
        unit: 'caisse',
        quantityExpected: 4,
        quantityAccepted: 4,
        quantityRefused: 0,
        justification: DEFAULT_FULL_JUSTIFICATION,
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 4, 'full', [
      { productLabel: 'Tomates', unit: 'caisse', quantityExpected: 4 },
    ])
    assert.equal(err, null)
  })

  it('refuse full avec quantités partielles', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Tomates',
        unit: 'caisse',
        quantityExpected: 4,
        quantityAccepted: 2,
        quantityRefused: 2,
        justification: 'casse',
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 4, 'full', [
      { productLabel: 'Tomates', unit: 'caisse', quantityExpected: 4 },
    ])
    assert.match(err ?? '', /partielle|refusée/)
  })

  it('accepte une livraison refusée mixte (un produit refusé + un livré)', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Palettes œufs',
        unit: 'palette',
        quantityExpected: 2,
        quantityAccepted: 0,
        quantityRefused: 2,
        justification: 'Produit refusé par le client',
      },
      {
        productLabel: "Jus d'orange",
        unit: 'caisse',
        quantityExpected: 1,
        quantityAccepted: 1,
        quantityRefused: 0,
        justification: DEFAULT_FULL_JUSTIFICATION,
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 3, 'rejected', [
      { productLabel: 'Palettes œufs', unit: 'palette', quantityExpected: 2 },
      { productLabel: "Jus d'orange", unit: 'caisse', quantityExpected: 1 },
    ])
    assert.equal(err, null)
  })

  it('refusée sans aucun produit refusé → erreur', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Palettes œufs',
        unit: 'palette',
        quantityExpected: 2,
        quantityAccepted: 2,
        quantityRefused: 0,
        justification: DEFAULT_FULL_JUSTIFICATION,
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 2, 'rejected', [
      { productLabel: 'Palettes œufs', unit: 'palette', quantityExpected: 2 },
    ])
    assert.match(err ?? '', /au moins un produit refusé/)
  })

  it('refusée sans motif sur le produit refusé → erreur', () => {
    const lines = parseDeclarationLines([
      {
        productLabel: 'Palettes œufs',
        unit: 'palette',
        quantityExpected: 2,
        quantityAccepted: 0,
        quantityRefused: 2,
        justification: '',
      },
    ])
    assert.ok(lines)
    const err = validateDeclarationBeforeSubmit(lines!, 2, 'rejected', [
      { productLabel: 'Palettes œufs', unit: 'palette', quantityExpected: 2 },
    ])
    assert.match(err ?? '', /motif du refus/i)
  })
})
