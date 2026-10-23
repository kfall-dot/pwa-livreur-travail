import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canTakeProcurementEditLock } from './procurementEditLock.js'

const base = { kind: 'requests' as const, status: 'submitted', role: 'purchasing', managerId: 'resource', supervisorId: 'head' }
test('chef et adjoints peuvent prendre en charge le chiffrage, sans ouvrir les autres étapes', () => {
  assert.equal(canTakeProcurementEditLock(base), true)
  assert.equal(canTakeProcurementEditLock({ ...base, managerId: 'head', supervisorId: null }), true)
  assert.equal(canTakeProcurementEditLock({ ...base, role: 'site_manager' }), false)
  assert.equal(canTakeProcurementEditLock({ ...base, status: 'delivered' }), false)
})
test('les visas restent réservés au valideur de l’étape', () => {
  assert.equal(canTakeProcurementEditLock({ ...base, status: 'sa_head_review', reviewerId: 'head' }), false)
  assert.equal(canTakeProcurementEditLock({ ...base, status: 'sa_head_review', managerId: 'head', supervisorId: null, reviewerId: 'head' }), true)
  assert.equal(canTakeProcurementEditLock({ ...base, status: 'cdg_review' }), false)
  assert.equal(canTakeProcurementEditLock({ ...base, status: 'cdg_review', role: 'controle_gestion' }), true)
})
test('un brouillon soumis ou supprimé ne peut plus être pris en charge', () => {
  assert.equal(canTakeProcurementEditLock({ ...base, kind: 'drafts', status: 'draft_review' }), true)
  assert.equal(canTakeProcurementEditLock({ ...base, kind: 'drafts', status: 'draft_review', linkedRequestId: 'request-1' }), false)
  assert.equal(canTakeProcurementEditLock({ ...base, kind: 'drafts', status: 'deleted' }), false)
})
