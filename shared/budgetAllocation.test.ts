import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeFamilyVariance, groupRealizedByNature, normalizeAllocations } from './budgetAllocation.ts'

describe('budgetAllocation — budget vs réalisé par famille (F03)', () => {
  it('présente TOUJOURS les 4 familles, même sans allocation ni dépense', () => {
    const result = computeFamilyVariance({ allocations: [], realized: [] })
    assert.equal(result.rows.length, 4)
    assert.deepEqual(
      result.rows.map((r) => r.family).sort(),
      ['engins', 'frais', 'main_oeuvre', 'materiaux'],
    )
    assert.equal(result.allocatedFcfa, 0)
    assert.equal(result.realizedFcfa, 0)
    assert.ok(result.rows.every((r) => r.trafficLight === 'none'))
  })

  it('calcule l’écart par famille : alloué − réalisé', () => {
    const result = computeFamilyVariance({
      allocations: [
        { family: 'materiaux', amountFcfa: 10_000_000 },
        { family: 'main_oeuvre', amountFcfa: 3_000_000 },
      ],
      realized: [
        { family: 'materiaux', amountFcfa: 6_000_000 },
        { family: 'main_oeuvre', amountFcfa: 3_300_000 },
      ],
      budgetTotalFcfa: 15_000_000,
    })
    const mat = result.rows.find((r) => r.family === 'materiaux')!
    const mo = result.rows.find((r) => r.family === 'main_oeuvre')!

    assert.equal(mat.varianceFcfa, 4_000_000)
    assert.equal(mat.consumedPct, 60)
    assert.equal(mat.overrun, false)
    assert.equal(mat.trafficLight, 'ok')

    // 3 300 000 / 3 000 000 = 110 % → écart −10 % → alerte (seuil 5 %)
    assert.equal(mo.varianceFcfa, -300_000)
    assert.equal(mo.consumedPct, 110)
    assert.equal(mo.overrun, true)
    assert.equal(mo.trafficLight, 'alert')

    assert.equal(result.allocatedFcfa, 13_000_000)
    assert.equal(result.realizedFcfa, 9_300_000)
    assert.equal(result.varianceFcfa, 3_700_000)
    assert.deepEqual(result.overrunFamilies, ['main_oeuvre'])
  })

  it('barème d’alerte : ok ≤ 2 % · watch ≤ 5 % · alert au-delà', () => {
    const light = (realized: number) =>
      computeFamilyVariance({
        allocations: [{ family: 'materiaux', amountFcfa: 1_000_000 }],
        realized: [{ family: 'materiaux', amountFcfa: realized }],
      }).rows.find((r) => r.family === 'materiaux')!.trafficLight

    assert.equal(light(1_000_000), 'ok')
    assert.equal(light(1_020_000), 'ok', '2 % de dépassement reste toléré')
    assert.equal(light(1_030_000), 'watch', '3 % → vigilance')
    assert.equal(light(1_100_000), 'alert', '10 % → alerte')
  })

  it('famille allouée à 0 mais dépensée → alerte immédiate (dépassement non calculable en %)', () => {
    const result = computeFamilyVariance({
      allocations: [],
      realized: [{ family: 'engins', amountFcfa: 500_000 }],
    })
    const engins = result.rows.find((r) => r.family === 'engins')!
    assert.equal(engins.allocatedFcfa, 0)
    assert.equal(engins.consumedPct, null)
    assert.equal(engins.overrun, true)
    assert.equal(engins.trafficLight, 'alert')
    assert.deepEqual(result.overrunFamilies, ['engins'])
  })

  it('mesure l’enveloppe NON ventilée et signale une ventilation hors enveloppe', () => {
    const result = computeFamilyVariance({
      allocations: [
        { family: 'materiaux', amountFcfa: 8_000_000 },
        { family: 'main_oeuvre', amountFcfa: 5_000_000 },
      ],
      realized: [],
      budgetTotalFcfa: 10_000_000,
    })
    assert.equal(result.allocatedFcfa, 13_000_000)
    assert.equal(result.unallocatedFcfa, -3_000_000)
    assert.equal(result.allocationOverBudget, true)
  })

  it('sans enveloppe gelée : `unallocatedFcfa` reste indéterminé', () => {
    const result = computeFamilyVariance({
      allocations: [{ family: 'materiaux', amountFcfa: 1_000_000 }],
      realized: [],
      budgetTotalFcfa: null,
    })
    assert.equal(result.unallocatedFcfa, null)
    assert.equal(result.allocationOverBudget, false)
  })

  it('trie les lignes de la plus grave à la plus saine', () => {
    const result = computeFamilyVariance({
      allocations: [
        { family: 'materiaux', amountFcfa: 1_000_000 },
        { family: 'main_oeuvre', amountFcfa: 1_000_000 },
      ],
      realized: [
        { family: 'materiaux', amountFcfa: 1_500_000 }, // alert
        { family: 'main_oeuvre', amountFcfa: 1_030_000 }, // watch
      ],
    })
    assert.equal(result.rows[0]?.family, 'materiaux')
    assert.equal(result.rows[1]?.family, 'main_oeuvre')
  })
})

describe('normalizeAllocations — entrées client', () => {
  it('ignore les familles inconnues et les montants invalides', () => {
    const out = normalizeAllocations([
      { family: 'materiaux', amountFcfa: 1_000 },
      { family: 'inconnue', amountFcfa: 9_999 },
      { family: 'engins', amountFcfa: -5 },
      { family: 'frais', amountFcfa: 'nawak' },
      null,
      'texte',
    ])
    assert.deepEqual(out, [{ family: 'materiaux', amountFcfa: 1_000 }])
  })

  it('fusionne les doublons et tronque les décimales', () => {
    const out = normalizeAllocations([
      { family: 'materiaux', amountFcfa: 1_000.9 },
      { family: 'materiaux', amountFcfa: 2_000 },
      { family: 'frais', amountFcfa: 500 },
    ])
    assert.deepEqual(out, [
      { family: 'materiaux', amountFcfa: 3_000 },
      { family: 'frais', amountFcfa: 500 },
    ])
  })

  it('tolère une entrée non-tableau', () => {
    assert.deepEqual(normalizeAllocations(undefined), [])
    assert.deepEqual(normalizeAllocations('x'), [])
    assert.deepEqual(normalizeAllocations({}), [])
  })
})

describe('groupRealizedByNature — drill-down CdG par nature (façon Feuil2)', () => {
  it('regroupe par famille, trie par montant décroissant et libelle chaque nature', () => {
    const out = groupRealizedByNature([
      { category: 'livraison_materiels', label: 'Livraison de matériels', amountFcfa: 100_000 },
      { category: 'salaire_technicien', label: 'Salaires technicien', amountFcfa: 300_000 },
      { category: 'ciments', label: 'Ciments', amountFcfa: 500_000 },
      { category: 'ramassage_demolition', label: 'Ramassage / démolition et décapage', amountFcfa: 200_000 },
    ])
    assert.equal(out.size, 3)
    assert.deepEqual(
      (out.get('main_oeuvre') ?? []).map((r) => r.category),
      ['salaire_technicien'],
    )
    assert.deepEqual(
      (out.get('engins') ?? []).map((r) => r.category),
      ['ramassage_demolition', 'livraison_materiels'],
      'tri par montant décroissant au sein de la famille',
    )
    const ciment = out.get('materiaux')![0]!
    assert.equal(ciment.label, 'Ciments')
    assert.equal(ciment.amountFcfa, 500_000)
  })

  it('la part est calculée sur le réalisé de la famille (Σ natures = sous-total famille, I113)', () => {
    const out = groupRealizedByNature([
      { category: 'ciments', label: 'Ciments', amountFcfa: 300_000 },
      { category: 'ferraille', label: 'Ferraille', amountFcfa: 100_000 },
    ])
    const rows = out.get('materiaux')!
    assert.equal(rows.reduce((sum, r) => sum + r.amountFcfa, 0), 400_000)
    assert.equal(rows.find((r) => r.category === 'ciments')!.shareOfFamilyPct, 75)
    assert.equal(rows.find((r) => r.category === 'ferraille')!.shareOfFamilyPct, 25)
  })

  it('fusionne les doublons de nature (plusieurs jours de dépense)', () => {
    const out = groupRealizedByNature([
      { category: 'livraison_materiels', label: 'Livraison de matériels', amountFcfa: 60_000 },
      { category: 'livraison_materiels', label: 'Livraison de matériels', amountFcfa: 40_000 },
    ])
    const rows = out.get('engins')!
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.amountFcfa, 100_000)
    assert.equal(rows[0]!.shareOfFamilyPct, 100)
  })

  it('ignore les montants ≤ 0 et les natures hors référentiel — jamais de nature à 0 affichée', () => {
    const out = groupRealizedByNature([
      { category: 'ciments', label: 'Ciments', amountFcfa: 0 },
      { category: 'sable', label: 'Sable', amountFcfa: -50 },
      { category: 'nature_inconnue', label: '???', amountFcfa: 1_000 },
      { category: 'peinture', label: 'Peinture', amountFcfa: 200_000 },
    ])
    assert.equal(out.size, 1)
    assert.deepEqual(
      (out.get('materiaux') ?? []).map((r) => r.category),
      ['peinture'],
    )
  })

  it('sans dépense : aucune famille ne ressort (pas de chevron côté UI)', () => {
    assert.equal(groupRealizedByNature([]).size, 0)
  })
})
