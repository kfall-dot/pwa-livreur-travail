import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  chargeFlowLabel,
  hasMixedFamilies,
  isHorsSaFamily,
  isHorsSaFlow,
  lineNature,
} from './chargeFlow.ts'

describe('chargeFlow — routage SA / hors SA (F02 lot B)', () => {
  it('une EB de matériaux suit le circuit SA', () => {
    const lines = [
      { label: 'Ciment', spendCategory: 'ciments' },
      { label: 'Carocol', spendCategory: 'carocol' },
    ]
    assert.equal(isHorsSaFlow(lines), false)
    assert.equal(chargeFlowLabel(lines), 'sa')
    assert.equal(hasMixedFamilies(lines), false)
  })

  it('une EB de main d’œuvre / engins / frais suit le circuit hors SA', () => {
    assert.equal(isHorsSaFlow([{ label: "Main d'œuvre carrelage", spendCategory: 'mo_carrelage' }]), true)
    assert.equal(isHorsSaFlow([{ label: 'Livraison de matériels', spendCategory: 'livraison_materiels' }]), true)
    assert.equal(isHorsSaFlow([{ label: 'Frais de dépôt', spendCategory: 'frais_depot' }]), true)
    assert.equal(
      chargeFlowLabel([{ label: 'Salaires technicien', spendCategory: 'salaire_technicien' }]),
      'hors_sa',
    )
  })

  it('une EB mixte reste sur le circuit SA et déclenche l’alerte (I105)', () => {
    const lines = [
      { label: 'Ciment', spendCategory: 'ciments' },
      { label: "Main d'œuvre carrelage", spendCategory: 'mo_carrelage' },
    ]
    assert.equal(isHorsSaFlow(lines), false, 'mixte → circuit SA : le DT doit scinder')
    assert.equal(hasMixedFamilies(lines), true)
  })

  it('une EB vide ou non chiffrée n’est pas hors SA', () => {
    assert.equal(isHorsSaFlow([]), false)
    assert.equal(isHorsSaFlow([{ label: '   ', spendCategory: 'mo_aides' }]), false)
    assert.equal(hasMixedFamilies([]), false)
    assert.equal(hasMixedFamilies([{ label: '  ', spendCategory: 'ciments' }]), false)
  })

  it('les anciennes familles aplaties sont routées vers leur vraie famille', () => {
    // Avant F02-A, `main_oeuvre` était aplatie en `autres_materiaux` (matériaux).
    assert.equal(lineNature({ spendCategory: 'main_oeuvre' }), 'mo_divers')
    assert.equal(isHorsSaFlow([{ label: 'Ancienne main d’œuvre', spendCategory: 'main_oeuvre' }]), true)
    assert.equal(lineNature({ spendCategory: 'sous_traitance' }), 'frais_divers')
    assert.equal(isHorsSaFlow([{ label: 'Ancienne sous-traitance', spendCategory: 'sous_traitance' }]), true)
    assert.equal(isHorsSaFlow([{ label: 'Ancien lot', spendCategory: 'materiaux' }]), false)
  })

  it('une nature inconnue retombe sur matériaux → circuit SA (jamais de routage accidentel)', () => {
    assert.equal(lineNature({ spendCategory: 'nawak' }), 'autres_materiaux')
    assert.equal(isHorsSaFlow([{ label: 'Inconnu', spendCategory: 'nawak' }]), false)
    assert.equal(lineNature({}), 'autres_materiaux')
  })

  it('isHorsSaFamily : tout sauf matériaux', () => {
    assert.equal(isHorsSaFamily('materiaux'), false)
    assert.equal(isHorsSaFamily('main_oeuvre'), true)
    assert.equal(isHorsSaFamily('engins'), true)
    assert.equal(isHorsSaFamily('frais'), true)
    assert.equal(isHorsSaFamily(null), false)
    assert.equal(isHorsSaFamily(undefined), false)
  })
})
