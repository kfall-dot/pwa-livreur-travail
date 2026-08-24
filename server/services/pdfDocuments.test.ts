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
  payeAvance: false,
  paiementLivraison: true,
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
    assert.match(html, /Payé d'avance/)
    assert.match(html, /Paiement à la livraison/)
    assert.match(html, /Quantité/)
    assert.match(html, /Unité/)
    assert.match(html, /Description/)
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
  lines: [{ objet: 'Ciment — 50 sacs (CimIvoire Distribution)', amountFcfa: 70_000 }],
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
})
