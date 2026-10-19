import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHARGE_FAMILIES,
  CHARGE_NATURES,
  chargeFamilyLabel,
  chargeNatureFamily,
  chargeNatureKey,
  chargeNatureLabel,
  chargeNaturesByFamily,
  inferChargeNature,
  isChargeFamily,
  isChargeNature,
  isMaterialsNature,
  resolveChargeNature,
} from './chargeNatures.ts'
import {
  EB_SPEND_CATEGORIES,
  isMaterialsSpendCategory,
  normalizeEbSpendCategory,
} from './ebSpendCategory.ts'

/** Les 17 postes matériaux Koestrem 5.1 stockés avant F02-A. */
const LEGACY_KOESTREM = [
  'menuiserie',
  'peinture',
  'electricite',
  'plomberie',
  'ferraille',
  'charpente',
  'platre',
  'cadres_portes',
  'ciments',
  'carburant',
  'etancheite',
  'sable',
  'maconnerie',
  'agglos',
  'nettoyage',
  'carocol',
  'autres_materiaux',
]

describe('chargeNatures — référentiel F02 lot A', () => {
  it('contient 42 natures réparties en 4 familles', () => {
    assert.equal(CHARGE_NATURES.length, 42)
    const counts = Object.fromEntries(
      CHARGE_FAMILIES.map((f) => [f.value, chargeNaturesByFamily(f.value).length]),
    )
    assert.deepEqual(counts, { materiaux: 23, main_oeuvre: 14, engins: 3, frais: 2 })
  })

  it('conserve les 17 valeurs Koestrem historiques (aucune ligne à migrer)', () => {
    for (const legacy of LEGACY_KOESTREM) {
      assert.ok(isChargeNature(legacy), `${legacy} doit rester une nature`)
      assert.equal(chargeNatureFamily(legacy), 'materiaux', `${legacy} doit rester matériaux`)
    }
  })

  it('codes uniques, familles valides, libellés non vides', () => {
    const values = new Set(CHARGE_NATURES.map((n) => n.value))
    assert.equal(values.size, CHARGE_NATURES.length)
    for (const n of CHARGE_NATURES) {
      assert.ok(isChargeFamily(n.family), `${n.value} : famille inconnue ${n.family}`)
      assert.ok(n.label.trim().length > 0, `${n.value} : libellé vide`)
    }
  })

  it('chaque libellé et chaque alias se résout vers sa propre nature (aucune collision)', () => {
    for (const n of CHARGE_NATURES) {
      assert.equal(resolveChargeNature(n.label), n.value, `libellé ${n.label}`)
      assert.equal(resolveChargeNature(n.value), n.value, `code ${n.value}`)
      for (const alias of n.aliases) {
        assert.equal(resolveChargeNature(alias), n.value, `alias ${alias} de ${n.value}`)
      }
    }
  })

  it('rapproche les dérives de libellé du journal du CdG', () => {
    assert.equal(resolveChargeNature('MENUISIRIE ALUMINUIN'), 'menuiserie_aluminium')
    assert.equal(resolveChargeNature('MATERIELS DE NETOYAGE'), 'nettoyage')
    assert.equal(resolveChargeNature('MATERIELS DE FERRAILLE'), 'ferraille')
    assert.equal(resolveChargeNature('MANŒUVRE ET AIDES'), 'mo_aides')
    assert.equal(resolveChargeNature('POSE DE MARBRE/PLINTHES'), 'pose_marbre_plinthes')
    assert.equal(resolveChargeNature('SALAIRES'), 'salaire_technicien')
    assert.equal(resolveChargeNature('LIVRAISON DE MATERIELS'), 'livraison_materiels')
    assert.equal(resolveChargeNature('FRAIS DE DEPOT'), 'frais_depot')
    assert.equal(resolveChargeNature('LIBELLE INCONNU DU JOURNAL'), null)
  })

  it('sépare les familles : la « part des matériaux » redevient juste', () => {
    assert.equal(isMaterialsNature('ciments'), true)
    assert.equal(isMaterialsNature('marbre_plinthes'), true)
    assert.equal(isMaterialsNature('mo_aides'), false)
    assert.equal(isMaterialsNature('salaire_technicien'), false)
    assert.equal(isMaterialsNature('livraison_materiels'), false)
    assert.equal(isMaterialsNature('frais_depot'), false)
    assert.equal(isMaterialsNature('nature_inconnue'), false)
  })

  it('infère la main d’œuvre AVANT les matériaux', () => {
    assert.equal(inferChargeNature("MAIN D'ŒUVRE PEINTRE"), 'mo_peinture')
    assert.equal(inferChargeNature('MATERIELS DE PEINTURE'), 'peinture')
    assert.equal(inferChargeNature('50 sacs ciment'), 'ciments')
    assert.equal(inferChargeNature('20 barres fer'), 'ferraille')
    assert.equal(inferChargeNature('LIVRAISON DE MATERIELS'), 'livraison_materiels')
    assert.equal(inferChargeNature('FRAIS DE DEPOT'), 'frais_depot')
    assert.equal(inferChargeNature(''), 'autres_materiaux')
    assert.equal(inferChargeNature('XYZ INCONNU'), 'autres_materiaux')
  })

  it('expose libellés, familles et clés normalisées', () => {
    assert.equal(chargeNatureLabel('mo_aides'), "Main d'œuvre et aides")
    assert.equal(chargeFamilyLabel('main_oeuvre'), "Main d'œuvre")
    assert.equal(chargeFamilyLabel('inconnue'), 'Famille inconnue')
    assert.equal(chargeNatureKey('MANŒUVRE'), 'MANOEUVRE')
    assert.equal(chargeNatureKey('Main d’œuvre et aides'), "MAIN D'OEUVRE ET AIDES")
  })
})

describe('ebSpendCategory — façade rétro-compatible', () => {
  it('EB_SPEND_CATEGORIES = les 23 natures de famille matériaux', () => {
    assert.equal(EB_SPEND_CATEGORIES.length, 23)
    assert.ok(EB_SPEND_CATEGORIES.every((c) => c.family === 'materiaux'))
  })

  it('les anciennes familles ne sont plus aplaties en matériaux', () => {
    assert.equal(normalizeEbSpendCategory('main_oeuvre'), 'mo_divers')
    assert.equal(isMaterialsSpendCategory('main_oeuvre'), false)
    assert.equal(normalizeEbSpendCategory('sous_traitance'), 'frais_divers')
    assert.equal(isMaterialsSpendCategory('sous_traitance'), false)
    assert.equal(normalizeEbSpendCategory('services'), 'frais_divers')
    assert.equal(normalizeEbSpendCategory('materiaux'), 'autres_materiaux')
    assert.equal(isMaterialsSpendCategory('materiaux'), true)
  })

  it('une valeur inconnue retombe sur le fourre-tout matériaux', () => {
    assert.equal(normalizeEbSpendCategory('nawak'), 'autres_materiaux')
    assert.equal(normalizeEbSpendCategory(null), 'autres_materiaux')
    assert.equal(normalizeEbSpendCategory(undefined), 'autres_materiaux')
  })

  it('isMaterialsSpendCategory ne retourne plus true pour toute valeur', () => {
    assert.equal(isMaterialsSpendCategory('ciments'), true)
    assert.equal(isMaterialsSpendCategory('mo_carrelage'), false)
    assert.equal(isMaterialsSpendCategory('frais_depot'), false)
    assert.equal(isMaterialsSpendCategory('chargement_dechargement'), false)
  })
})
