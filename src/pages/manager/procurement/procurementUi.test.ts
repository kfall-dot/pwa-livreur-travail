import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { approvalDecisionLabel, canEditDraft, canReviseRequest, chainHighlightMatches, chainReferencesLabel, ProcurementRoleOptions } from './procurementUi.tsx'

it('propose tous les espaces métier, notamment comptabilité, trésorerie et équipe SA', () => {
  const html = renderToStaticMarkup(createElement(ProcurementRoleOptions))
  for (const role of ['site_controller', 'technical_director', 'purchasing', 'controle_gestion', 'daf', 'pdg', 'site_manager', 'accountant', 'treasury']) {
    assert.ok(html.includes(`value="${role}"`), `${role} doit être proposé`)
  }
  assert.ok(html.includes('Chef SA / Ressource SA'))
  assert.ok(!html.includes('value="admin"'), 'les droits d’accès restent distincts du profil métier')
})

it('autorise le SA à préparer des brouillons, sans ouvrir ce droit aux valideurs financiers', () => {
  assert.equal(canEditDraft('purchasing'), true)
  assert.equal(canEditDraft('technical_director'), true)
  assert.equal(canEditDraft('site_manager'), true)
  assert.equal(canEditDraft('daf'), false)
  assert.equal(canEditDraft('controle_gestion'), false)
  assert.equal(canEditDraft('pdg'), false)
  assert.equal(canEditDraft(null), false)
})

/**
 * Historique des approbations (page Achats chantier) : la révision PDG des
 * quantités est un acte de validation, pas un rejet — elle s'affichait
 * « PDG — Rejeté » avant le correctif (décision `revised` non gérée).
 */
describe('approvalDecisionLabel — historique des approbations', () => {
  it('libelle la révision PDG « Modifié », jamais « Rejeté »', () => {
    assert.equal(approvalDecisionLabel('pdg', 'revised'), 'Modifié')
  })

  it('conserve les libellés d’approbation par rôle', () => {
    assert.equal(approvalDecisionLabel('technical_director', 'approved'), 'Validé')
    assert.equal(approvalDecisionLabel('purchasing', 'approved'), 'Traité')
    assert.equal(approvalDecisionLabel('daf', 'approved'), 'Montant approuvé')
    assert.equal(approvalDecisionLabel('controle_gestion', 'approved'), 'Approuvé')
    assert.equal(approvalDecisionLabel('pdg', 'approved'), 'Approuvé')
  })

  it('réserve « Rejeté » au véritable rejet', () => {
    assert.equal(approvalDecisionLabel('pdg', 'rejected'), 'Rejeté')
    assert.equal(approvalDecisionLabel('daf', 'rejected'), 'Rejeté')
  })
})

describe('canReviseRequest — révision réservée au PDG au statut pdg_review', () => {
  it('autorise le PDG seul, et seulement au statut pdg_review', () => {
    assert.equal(canReviseRequest('pdg_review', 'pdg'), true)
    assert.equal(canReviseRequest('pdg_review', 'daf'), false)
    assert.equal(canReviseRequest('daf_review', 'pdg'), false)
    assert.equal(canReviseRequest('sa_review', 'pdg'), false)
  })
})

describe('chainReferencesLabel — réfs. croisées EB → BT → BC → BL', () => {
  it('compose la chaîne complète dans l’ordre des documents', () => {
    assert.equal(
      chainReferencesLabel({
        eb: 'EB-2026-0007 — v2',
        bt: 'BT-2026-0003, BT-2026-0004',
        bc: 'BC-2026-0012',
        bl: 'RCT-A1B2C3D4',
      }),
      'EB EB-2026-0007 — v2 · BT BT-2026-0003, BT-2026-0004 · BC BC-2026-0012 · BL RCT-A1B2C3D4',
    )
  })

  it('omet les maillons absents au lieu d’afficher un tiret', () => {
    assert.equal(chainReferencesLabel({ eb: 'EB-2026-0008', bt: '', bc: null }), 'EB EB-2026-0008')
    assert.equal(chainReferencesLabel({}), '')
  })

  it('ignore les espaces parasites des références', () => {
    assert.equal(chainReferencesLabel({ eb: '  EB-1  ', bc: ' BC-2 ' }), 'EB EB-1 · BC BC-2')
  })
})

describe('chainHighlightMatches — maillon trouvé par le résolveur d’identifiants', () => {
  const bt = { kind: 'bt', id: 'bt-1', reference: 'BT-2026-0003' }

  it('surligne le maillon dont l’id et le type correspondent', () => {
    assert.equal(chainHighlightMatches(bt, 'bt', 'bt-1'), true)
    assert.equal(chainHighlightMatches(bt, 'eb', 'bt-1'), false)
    assert.equal(chainHighlightMatches(bt, 'bt', 'bt-2'), false)
  })

  it('ne surligne rien sans recherche (chaîne ouverte depuis la liste)', () => {
    assert.equal(chainHighlightMatches(null, 'bt', 'bt-1'), false)
    assert.equal(chainHighlightMatches(undefined, 'bt', 'bt-1'), false)
  })
})

