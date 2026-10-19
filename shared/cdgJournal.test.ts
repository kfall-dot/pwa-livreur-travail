import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cdgFingerprint,
  normalizeBcReference,
  parseCdgAmount,
  parseCdgDate,
  parseCdgJournalRows,
  reconcileCdgJournal,
  resolveJournalSiteId,
  type CdgJournalRawRow,
} from './cdgJournal.ts'

/** En-tête réel du journal `DG CI ENERGIE` (v1 du 16/10/2026, feuille `Feuil1`). */
const HEADER: CdgJournalRawRow = [
  'Nom Chantier',
  'Nom fournisseur',
  'Catégorie',
  'No BC',
  'No Facture ou BL',
  'Date',
  'Charges (Produits)',
  'Qté',
  'PU',
  'Montant',
]

const row = (
  site: string,
  supplier: string,
  nature: string,
  noBc: string,
  date: unknown,
  label: string,
  amount: unknown,
): CdgJournalRawRow => [site, supplier, nature, noBc, 'F-000', date, label, 1, 1, amount]

const JOURNAL: CdgJournalRawRow[] = [
  HEADER,
  row('SANTA LUCIA', 'SOTRA MAT', 'MATERIELS DE PEINTURE', '1144', '15/01/2026', 'Peinture blanche', 25_000),
  row('SANTA LUCIA', 'KONE', 'SALAIRES', '', '16/01/2026', 'Salaires janvier', 150_000),
  row('SANTA LUCIA', '', 'RAMASSAGE/DEMOLITION ET DECAPAGE', '', '17/01/2026', 'Évacuation gravats', 60_000),
  row('SANTA LUCIA', 'X', 'CIMENT', '726', 'date illisible', 'Ciment', 5_000),
  row('SANTA LUCIA', 'Y', 'CIMENT', '', '18/01/2026', 'Ciment', 'montant illisible'),
  [],
  row('SANTA LUCIA', 'Z', '', '', '19/01/2026', 'Ligne sans nature', 1_000),
]

describe('cdgJournal — rejeu de l’historique du CdG (T08)', () => {
  it('détecte l’en-tête et lit les lignes exploitables', () => {
    const result = parseCdgJournalRows(JOURNAL)
    assert.equal(result.lines.length, 3)
    assert.equal(result.totalFcfa, 235_000)

    const salaires = result.lines.find((l) => l.natureLabel === 'SALAIRES')!
    assert.equal(salaires.nature, 'salaire_technicien')
    assert.equal(salaires.occurredOn, '2026-01-16')
    assert.equal(salaires.amountFcfa, 150_000)
    assert.equal(salaires.noBc, null)
    assert.equal(salaires.siteName, 'SANTA LUCIA')

    const gravats = result.lines.find((l) => l.label === 'Évacuation gravats')!
    assert.equal(gravats.nature, 'ramassage_demolition')
  })

  it('rejette les lignes illisibles au lieu de les importer avec une valeur inventée', () => {
    const { rejected } = parseCdgJournalRows(JOURNAL)
    assert.deepEqual(rejected, [
      { row: 4, reason: 'Date illisible' },
      { row: 5, reason: 'Montant illisible' },
      { row: 7, reason: 'Nature absente' },
    ])
  })

  it('accepte le format historique sans en-tête (mapping positionnel A → J)', () => {
    const withoutHeader = JOURNAL.filter((r) => r !== HEADER)
    const result = parseCdgJournalRows(withoutHeader)
    assert.equal(result.lines.length, 3)
    assert.equal(result.lines[0]!.amountFcfa, 25_000)
    assert.equal(result.lines[0]!.occurredOn, '2026-01-15')
    assert.equal(result.lines[1]!.nature, 'salaire_technicien')
  })

  it('est idempotent : deux lectures du même fichier donnent les mêmes empreintes (I99)', () => {
    const first = parseCdgJournalRows(JOURNAL).lines.map((l) => l.sourceRef)
    const second = parseCdgJournalRows(JOURNAL).lines.map((l) => l.sourceRef)
    assert.deepEqual(first, second)
    assert.equal(new Set(first).size, first.length)
  })


describe('cdgJournal — rapprochement journal ↔ BC (I100 / I106)', () => {
  it('exclut TOUTE ligne portant un n° de BC — elle est déjà dans TraceO', () => {
    const { lines } = parseCdgJournalRows(JOURNAL)
    const recon = reconcileCdgJournal(lines)
    assert.equal(recon.totalLines, 3)
    assert.equal(recon.excluded.length, 1)
    assert.equal(recon.excluded[0]!.noBc, '1144')
    assert.equal(recon.excludedFcfa, 25_000)
    assert.equal(recon.toImport.length, 2)
    assert.equal(recon.toImportFcfa, 210_000)
    assert.equal(recon.totalFcfa, 235_000)
  })

  it('signale les BC du journal introuvables dans TraceO, sans les importer', () => {
    const { lines } = parseCdgJournalRows(JOURNAL)
    assert.deepEqual(reconcileCdgJournal(lines, ['1144', 'BC-2026-0001']).unmappedBcReferences, [])

    const withUnknown = reconcileCdgJournal(lines, ['BC-2026-0001'])
    assert.deepEqual(withUnknown.unmappedBcReferences, ['1144'])
    // Le rapprochement non résolu NE débloque PAS l'import de la ligne.
    assert.equal(withUnknown.toImport.length, 2)
  })

  it('affiche le taux de rapprochement (I106)', () => {
    const { lines } = parseCdgJournalRows(JOURNAL)
    assert.equal(reconcileCdgJournal(lines).matchRatePct, 10.6)
    assert.equal(reconcileCdgJournal([]).matchRatePct, 0)
  })

  it('sépare 192 lignes avec BC / 315 hors BC à l’échelle du fichier réel', () => {
    const rows: CdgJournalRawRow[] = [HEADER]
    for (let i = 0; i < 192; i += 1) {
      rows.push(row('SANTA LUCIA', 'F', 'CIMENT', `BC${i}`, '01/02/2026', `Achat ${i}`, 10_000))
    }
    for (let i = 0; i < 315; i += 1) {
      rows.push(row('SANTA LUCIA', 'F', 'SALAIRES', '', '01/02/2026', `Salaire ${i}`, 20_000))
    }
    const { lines, rejected } = parseCdgJournalRows(rows)
    const recon = reconcileCdgJournal(lines)
    assert.equal(rejected.length, 0)
    assert.equal(recon.excluded.length, 192)
    assert.equal(recon.toImport.length, 315)
    assert.equal(recon.excludedFcfa, 1_920_000)
    assert.equal(recon.toImportFcfa, 6_300_000)
    assert.equal(recon.matchRatePct, 23.4)
  })
})

describe('cdgJournal — primitives', () => {
  it('normalise les références de BC', () => {
    assert.equal(normalizeBcReference(' 1144 '), '1144')
    assert.equal(normalizeBcReference('n° 726'), '726')
    assert.equal(normalizeBcReference('bc 12 34'), 'BC1234')
    assert.equal(normalizeBcReference(null), '')
  })

  it('lit les montants du journal (espaces, virgule, négatif)', () => {
    assert.equal(parseCdgAmount('12 500'), 12_500)
    assert.equal(parseCdgAmount('12 500,50'), 12_500)
    assert.equal(parseCdgAmount('1 234 567,89'), 1_234_567)
    assert.equal(parseCdgAmount(-523_017), -523_017)
    assert.equal(parseCdgAmount(''), null)
    assert.equal(parseCdgAmount('n/a'), null)
  })

  it('lit les dates du journal (Date, série Excel, FR, ISO)', () => {
    assert.equal(parseCdgDate('15/01/2026'), '2026-01-15')
    assert.equal(parseCdgDate('2026-01-15'), '2026-01-15')
    assert.equal(parseCdgDate(new Date(Date.UTC(2026, 0, 15))), '2026-01-15')
    assert.match(parseCdgDate(46_000) ?? '', /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(parseCdgDate('date illisible'), null)
    assert.equal(parseCdgDate(null), null)
  })

  it('produit une empreinte stable et sensible au contenu', () => {
    assert.equal(cdgFingerprint(['a', 'b']), cdgFingerprint(['a', 'b']))
    assert.notEqual(cdgFingerprint(['a', 'b']), cdgFingerprint(['a', 'c']))
    assert.notEqual(cdgFingerprint(['ab']), cdgFingerprint(['a', 'b']))
    assert.equal(cdgFingerprint(['a', 'b']).length, 16)
  })

  it('résout le chantier d’une ligne, ou renvoie null (jamais au hasard)', () => {
    const sites = [
      { id: 's1', name: 'SANTA LUCIA' },
      { id: 's2', name: 'Résidence Akwaba' },
    ]
    assert.equal(resolveJournalSiteId('SANTA LUCIA', sites), 's1')
    assert.equal(resolveJournalSiteId('santa lucia', sites), 's1')
    assert.equal(resolveJournalSiteId('SANTA LUCIA - PHASE 2', sites), 's1')
    assert.equal(resolveJournalSiteId('CHANTIER INCONNU', sites), null)
    assert.equal(resolveJournalSiteId('', sites), null)
  })
})

  it('distingue deux lignes identiques mais de montant différent', () => {
    const a = parseCdgJournalRows([HEADER, row('S', 'F', 'CIMENT', '', '01/02/2026', 'Ciment', 1_000)]).lines[0]!
    const b = parseCdgJournalRows([HEADER, row('S', 'F', 'CIMENT', '', '01/02/2026', 'Ciment', 2_000)]).lines[0]!
    assert.notEqual(a.sourceRef, b.sourceRef)
  })

  /**
   * Cas **réel** du journal du CdG : deux paiements de 24 000 F à des carreleurs
   * le même jour, et deux lots d'aides de 36 000 F. Ce sont deux dépenses
   * distinctes — les confondre perdrait 60 000 F **en silence**.
   */
  it('deux lignes STRICTEMENT identiques restent deux dépenses distinctes', () => {
    const rows = [
      HEADER,
      row('DG CI ENERGIE', '', "MAIN D'OEUVRE CARRELEUR", '', '10/04/2026', 'CARRELEURS', 24_000),
      row('DG CI ENERGIE', '', "MAIN D'OEUVRE CARRELEUR", '', '10/04/2026', 'CARRELEURS', 24_000),
      row('DG CI ENERGIE', '', 'MANOEUVRE ET AIDES', '', '10/04/2026', 'AIDES', 36_000),
      row('DG CI ENERGIE', '', 'MANOEUVRE ET AIDES', '', '10/04/2026', 'AIDES', 36_000),
    ]
    const { lines } = parseCdgJournalRows(rows)
    assert.equal(lines.length, 4)
    assert.equal(new Set(lines.map((l) => l.sourceRef)).size, 4)
    assert.equal(reconcileCdgJournal(lines).toImportFcfa, 120_000)
  })

  it('l’ordinal rend le ré-import idempotent même avec des doublons légitimes', () => {
    const rows = [
      HEADER,
      row('DG CI ENERGIE', '', "MAIN D'OEUVRE CARRELEUR", '', '10/04/2026', 'CARRELEURS', 24_000),
      row('DG CI ENERGIE', '', "MAIN D'OEUVRE CARRELEUR", '', '10/04/2026', 'CARRELEURS', 24_000),
    ]
    const first = parseCdgJournalRows(rows).lines.map((l) => l.sourceRef)
    const second = parseCdgJournalRows(rows).lines.map((l) => l.sourceRef)
    assert.deepEqual(first, second)
    assert.ok(first[0]!.endsWith('-1'))
    assert.ok(first[1]!.endsWith('-2'))
  })

  /**
   * L'annexe §3A décrivait les colonnes C et G comme « Nature de dépense » et
   * « Designation ». Le fichier v1 dit **« Catégorie »** et **« Charges
   * (Produits) »** — l'exécution sur le vrai fichier l'a montré. Les deux
   * formulations sont acceptées.
   */
  it('lit l’en-tête RÉEL du journal (`Catégorie` / `Charges (Produits)`)', () => {
    const { lines, rejected } = parseCdgJournalRows([
      HEADER,
      // Ligne réelle : n° de série Excel en colonne Date, n° de BC numérique.
      ['DG CI ENERGIE', 'UBH 1', 'ASSECCOIRES MENUISIERIE', 824, '', 46122, 'PETIT GRATOIRE', 3, 1000, 3000],
    ])
    assert.equal(rejected.length, 0)
    assert.equal(lines.length, 1)
    assert.equal(lines[0]!.nature, 'accessoires_menuiserie')
    assert.equal(lines[0]!.label, 'PETIT GRATOIRE')
    assert.equal(lines[0]!.noBc, '824')
    assert.equal(lines[0]!.occurredOn, '2026-04-10')
    assert.equal(lines[0]!.amountFcfa, 3000)
  })

  it('résout les natures via les alias du référentiel F02', () => {
    const { lines } = parseCdgJournalRows([
      HEADER,
      row('S', 'F', 'MATERIELS DE PEINTURE', '', '01/02/2026', 'Peinture', 1),
      row('S', 'F', 'MAIN D’OEUVRE CARRELEUR', '', '01/02/2026', 'Carrelage', 1),
      row('S', 'F', 'MENUISIRIE ALUMINUIN', '', '01/02/2026', 'Alu', 1),
      row('S', 'F', 'LIBELLE INCONNU XYZ', '', '01/02/2026', 'Divers', 1),
    ])
    assert.deepEqual(
      lines.map((l) => l.nature),
      ['peinture', 'mo_carrelage', 'menuiserie_aluminium', 'autres_materiaux'],
    )
  })
})
