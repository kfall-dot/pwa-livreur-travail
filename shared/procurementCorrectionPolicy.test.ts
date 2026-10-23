import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canRequestCorrection, canDefinitivelyRefuse, correctionResumeStatus } from './procurementCorrectionPolicy.js'
import { canTakeProcurementEditLock } from './procurementEditLock.js'

test('seuls DAF et PDG peuvent refuser définitivement, à leur étape', () => {
  const roles = ['site_manager', 'technical_director', 'purchasing', 'controle_gestion', 'daf', 'pdg', 'accountant', 'treasury']
  const statuses = ['dt_review', 'sa_head_review', 'bc_head_review', 'cdg_review', 'daf_review', 'daf_bt_review', 'pdg_review', 'delivered', 'paid', 'rejected']
  for (const role of roles) for (const status of statuses) {
    assert.equal(canDefinitivelyRefuse(status, role), role === 'daf' && ['daf_review', 'daf_bt_review'].includes(status) || role === 'pdg' && ['daf_review', 'daf_bt_review', 'pdg_review'].includes(status), `${role}/${status}`)
  }
})
test('retours autorisés uniquement aux contrôleurs de l’étape, chef SA compris', () => {
  assert.equal(canRequestCorrection('dt_review', 'technical_director'), true)
  assert.equal(canRequestCorrection('cdg_review', 'controle_gestion'), true)
  assert.equal(canRequestCorrection('daf_review', 'controle_gestion'), false)
  assert.equal(canRequestCorrection('bc_head_review', 'purchasing', true), true)
  assert.equal(canRequestCorrection('bc_head_review', 'purchasing', false), false)
  assert.equal(canRequestCorrection('bt_ready', 'treasury'), true)
  assert.equal(canRequestCorrection('paid', 'treasury'), false)
})
test('correction économique : revalidation financière, documentaire : reprise de l’étape', () => {
  const base = { kind: 'documents' as const, changed: false, fromStatus: 'daf_review', targetRole: 'purchasing', horsSa: false, isSaResource: true }
  assert.equal(correctionResumeStatus(base), 'daf_review')
  assert.equal(correctionResumeStatus({ ...base, changed: true }), 'submitted')
  assert.equal(correctionResumeStatus({ ...base, changed: true, targetRole: 'site_manager' }), 'dt_review')
  assert.equal(correctionResumeStatus({ ...base, changed: true, horsSa: true, targetRole: 'technical_director' }), 'cdg_review')
})
test('seul le destinataire de correction peut prendre en charge le dossier suspendu', () => {
  const base = { kind: 'requests' as const, status: 'daf_review', role: 'purchasing', managerId: 'adjoint', correctionTargetId: 'adjoint' }
  assert.equal(canTakeProcurementEditLock(base), true)
  assert.equal(canTakeProcurementEditLock({ ...base, managerId: 'daf', role: 'daf' }), false)
})
