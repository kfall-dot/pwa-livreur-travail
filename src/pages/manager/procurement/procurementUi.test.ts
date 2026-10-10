import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { approvalDecisionLabel, canReviseRequest } from './procurementUi.tsx'

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
