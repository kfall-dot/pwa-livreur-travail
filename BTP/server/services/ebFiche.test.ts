import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ficheLinesFromParsed, generateEbFicheHtml, signoffFromApprovalSteps } from './ebFiche.ts'

describe('generateEbFicheHtml', () => {
  it('reprend les libellés de FICHE DE BESOIN ACHAT', () => {
    const html = generateEbFicheHtml({
      reference: 'EB-TEST-01',
      siteName: 'Résidence Cocody — Tour A',
      objet: 'BESOIN - Ciment, Fer, Gravier',
      requesterName: 'Chef chantier',
      treatmentDate: '14/08/2026',
      neededBy: 'demain matin',
      urgency: 'urgent',
      validatedByName: 'Kouamé DT',
      validatedBySignature: 'Kouamé DT (DT)\nPIN vérifié',
      lines: ficheLinesFromParsed([
        {
          label: 'Ciment',
          quantity: 50,
          unit: 'sacs',
          supplierName: 'Cimenterie du Plateau',
          paymentMode: 'CREDIT',
        },
        { label: 'Fer 8/14', quantity: 4, unit: 'bottes', observation: 'Ø8mm / Ø14mm' },
      ]),
    })
    assert.match(html, /EXPRESSION DU BESOIN/)
    assert.match(html, /DEMANDEUR/)
    assert.match(html, /SITE :/)
    assert.match(html, /SERVICE:/)
    assert.match(html, /Direction Technique/)
    assert.doesNotMatch(html, />ACHAT</)
    assert.match(html, /OBJET/)
    assert.match(html, /NOM DEMANDEUR :/)
    assert.match(html, /Chef chantier/)
    assert.match(html, /DATE DE TRAITEMENT :/)
    assert.match(html, /Désignations/)
    assert.match(html, /Unité/)
    assert.match(html, /Quantité/)
    assert.match(html, /Prix Unitaire/)
    assert.match(html, /Montant/)
    assert.match(html, /Fournisseur/)
    assert.match(html, /Mode de paiement/)
    assert.match(html, /Observations/)
    assert.match(html, /Cimenterie du Plateau/)
    assert.match(html, /CREDIT/)
    assert.match(html, /TRAITE PAR/)
    assert.match(html, /VALIDE PAR/)
    assert.match(html, /Kouamé DT/)
    assert.match(html, /PIN vérifié/)
    assert.match(html, /Ciment/)
    assert.match(html, /50/)
    assert.match(html, /sacs/)
    assert.doesNotMatch(html, /<script/i)
  })

  it('échappe le HTML injecté dans les champs', () => {
    const html = generateEbFicheHtml({
      reference: 'EB-<script>',
      siteName: 'Site <b>x</b>',
      objet: 'BESOIN - <img>',
      requesterName: 'A&B',
      treatmentDate: '01/01/2026',
      lines: [{ ref: '1', label: 'Ciment <script>', unit: 'sacs', quantity: '1' }],
    })
    assert.doesNotMatch(html, /<script>/)
    assert.match(html, /Ciment &lt;script&gt;/)
    assert.match(html, /A&amp;B/)
  })

  it('mappe TRAITE PAR = SA et VALIDE PAR = DT', () => {
    const signoff = signoffFromApprovalSteps([
      {
        role: 'technical_director',
        decision: 'approved',
        comment: 'Kouamé DT (DT)\nPIN vérifié',
        createdAt: '2026-08-14T10:00:00.000Z',
      },
      {
        role: 'purchasing',
        decision: 'approved',
        comment: 'Mamadou SA\nChiffrage SA',
        createdAt: '2026-08-14T11:00:00.000Z',
      },
    ])
    assert.equal(signoff.validatedByName, 'Kouamé DT')
    assert.equal(signoff.treatedByName, 'Mamadou SA')
    assert.match(String(signoff.treatedBySignature), /Chiffrage SA/)
  })
})
