import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateBcHtml, generateBtHtml, type BcTemplateData, type BtTemplateData } from './pdfDocuments.ts'

const sample: BcTemplateData = {
  reference: 'BC-2026-0001',
  companyName: 'BTP Pilote TraceO',
  siteName: 'Résidence Cocody — Tour A',
  siteAddress: 'Boulevard Latrille, Cocody, Abidjan',
  receveur: 'Chef chantier',
  supplierName: 'CimIvoire Distribution',
  supplierAddress: 'Yopougon',
  amountFcfa: 70_000,
  modePaiement: 'Comptant',
  lines: [
    { label: 'Ciment', quantity: '50', unit: 'sacs', unitPriceFcfa: 1400, amountFcfa: 70_000 },
  ],
  createdAt: '2026-08-16',
}

describe('generateBcHtml — formulaire papier', () => {
  it('reproduit les zones du bon de commande (quantité, PU, TVA, autorisation)', () => {
    const html = generateBcHtml(null, sample)
    assert.match(html, /BON DE COMMANDE N°BC-2026-0001/)
    assert.match(html, /Date B\.C\./)
    assert.match(html, /Receveur/)
    assert.match(html, /MODE DE PAIEMENT/)
    assert.match(html, /Comptant/)
    assert.match(html, /Quantité/)
    assert.match(html, /Unité/)
    assert.match(html, /Désignation/)
    assert.match(html, /Prix unitaire/)
    assert.match(html, /TOTAL TTC/)
    assert.match(html, /Autorisation/)
    assert.match(html, /Autorisé par \/ Comptabilité/)
    assert.match(html, /Ciment/)
    assert.match(html, /CimIvoire Distribution/)
    assert.doesNotMatch(html, /<script/i)
  })
})

const btSample: BtTemplateData = {
  reference: 'BT-2026-0001',
  siteName: 'Résidence Cocody — Tour A',
  amountFcfa: 70_000,
  requesterName: 'Chef chantier',
  currency: 'XOF',
  createdAt: '2026-08-16',
  lines: [
    { objet: 'Ciment (CimIvoire Distribution)', quantity: '50 sacs', unitPriceFcfa: 1400, amountFcfa: 70_000 },
  ],
}

describe('generateBtHtml — fiche trésorerie achats', () => {
  it('reproduit la demande d’avance (objet, montant, VALIDATION DAF/PDG)', () => {
    const html = generateBtHtml(null, btSample)
    assert.match(html, /Demande d’avance de trésorerie/)
    assert.match(html, /N° de l’avance<\/th><td><\/td>/)
    assert.doesNotMatch(html, /N° de l’avance<\/th><td>BT-/)
    assert.match(html, /Objet/)
    assert.match(html, /Montant/)
    assert.match(html, /Ciment/)
    assert.match(html, /VALIDATION DAF/)
    assert.match(html, /VALIDATION PDG/)
    assert.match(html, /XOF/)
    assert.doesNotMatch(html, /<script/i)
  })

  it('insère les colonnes Quantité et Prix unitaire après Objet (I87)', () => {
    const html = generateBtHtml(null, btSample)
    const objet = html.indexOf('>Objet<')
    const quantite = html.indexOf('>Quantité<')
    const prixUnitaire = html.indexOf('>Prix unitaire<')
    const montant = html.indexOf('>Montant<')
    assert.ok(objet > -1 && quantite > objet && prixUnitaire > quantite && montant > prixUnitaire)
    assert.match(html, /<td class="qty">50 sacs<\/td>/)
    assert.match(html, /<td class="pu">1 400 F<\/td>/)
    // Ligne de repli (avance forfaitaire sans lignes chiffrées) : cellules vides.
    const fallback = generateBtHtml(null, { ...btSample, lines: undefined })
    assert.match(fallback, /<td class="qty"><\/td><td class="pu"><\/td>/)
  })

  it('reporte la signature DAF/PDG sur le BT', () => {
    const html = generateBtHtml(null, {
      ...btSample,
      dafName: 'Aya DAF',
      dafDate: '18/08/2026',
      dafSignature: 'Aya DAF (DAF)\nNIP vérifié',
      pdgName: 'Diabaté PDG',
      pdgDate: '18/08/2026',
      pdgSignature: 'Diabaté PDG (PDG)\nNIP vérifié',
    })
    assert.match(html, /Aya DAF/)
    assert.match(html, /Diabaté PDG/)
    assert.match(html, /NIP vérifié/)
    assert.equal((html.match(/Aya DAF/g) ?? []).length, 1)
    assert.equal((html.match(/Diabaté PDG/g) ?? []).length, 1)
  })

  it('affiche le bandeau « version modifiée » et le visa PDG sur un BT révisé (I95)', () => {
    const revised = generateBtHtml(null, {
      ...btSample,
      version: 2,
      revisedAt: '2026-10-10T12:00:00.000Z',
      revisionComment: 'Quantité ciment ajustée',
      dafName: 'Aya DAF',
      dafDate: '18/08/2026',
      dafSignature: 'Aya DAF (DAF)\n18/08/2026\nNIP vérifié',
      pdgName: 'Diabaté PDG',
      pdgDate: '10/10/2026',
      pdgSignature: 'Diabaté PDG (PDG)\n10/10/2026\nNIP vérifié',
    })
    // Bandeau rouge en tête de fiche : version, auteur et motif de la révision.
    assert.match(
      revised,
      /VERSION MODIFIÉE n° 2 — révisée par le PDG le \d{2}\/\d{2}\/\d{4} — Motif : Quantité ciment ajustée/,
    )
    assert.match(revised, /<title>Fiche trésorerie BT-2026-0001 — v2<\/title>/)
    // Les deux visas coexistent sur le BT régénéré.
    assert.match(revised, /Aya DAF/)
    assert.match(revised, /Diabaté PDG/)
    assert.match(revised, /NIP vérifié/)
    assert.match(revised, /VALIDATION PDG/)

    // BT initial (v1) : ni bandeau, ni suffixe de version.
    const initial = generateBtHtml(null, btSample)
    assert.doesNotMatch(initial, /VERSION MODIFIÉE/)
    assert.doesNotMatch(initial, /révisée par le PDG/)
    assert.match(initial, /<title>Fiche trésorerie BT-2026-0001<\/title>/)
  })
})
