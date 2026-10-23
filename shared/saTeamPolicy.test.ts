import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canValidateSaAction, canReleaseSaPurchaseOrders, isValidSaSupervisor, type SaActor } from './saTeamPolicy.js'

const head: SaActor = { id: 'sa-head', companyId: 'company-a', procurementRole: 'purchasing', saSupervisorId: null }
const resource: SaActor = { ...head, id: 'sa-resource', saSupervisorId: head.id }

test('seul le chef désigné peut valider les préparations de ses ressources', () => {
  assert.equal(canValidateSaAction(head, head.id), true)
  assert.equal(canValidateSaAction(resource, head.id), false)
  assert.equal(canValidateSaAction({ ...head, id: 'other-head' }, head.id), false)
  assert.equal(canValidateSaAction({ ...head, procurementRole: 'daf' }, head.id), false)
  assert.equal(canValidateSaAction(head, null), false)
})

test('une ressource ne peut être affectée qu’à un chef SA de son entreprise', () => {
  assert.equal(isValidSaSupervisor(resource, head), true)
  assert.equal(isValidSaSupervisor(resource, null), false)
  assert.equal(isValidSaSupervisor(resource, { ...head, companyId: 'company-b' }), false)
  assert.equal(isValidSaSupervisor(resource, { ...head, procurementRole: 'technical_director' }), false)
  assert.equal(isValidSaSupervisor(resource, { ...head, saSupervisorId: 'someone' }), false)
  assert.equal(isValidSaSupervisor(resource, { ...head, id: resource.id }), false)
})

test('le compte SA existant sans supérieur garde son circuit direct', () => {
  assert.equal(head.saSupervisorId, null)
  assert.equal(canValidateSaAction(head, 'unrelated-reviewer'), false)
})

test('les BC ressources bloquent la livraison tant que chaque signature manque', () => {
  assert.equal(canReleaseSaPurchaseOrders('po_ready', []), false)
  assert.equal(canReleaseSaPurchaseOrders('bc_head_review', [{ saApprovalRequired: true, saHeadSignature: 'signé' }]), false)
  assert.equal(canReleaseSaPurchaseOrders('po_ready', [{ saApprovalRequired: true, saHeadSignature: null }]), false)
  assert.equal(canReleaseSaPurchaseOrders('po_ready', [{ saApprovalRequired: true, saHeadSignature: 'Chef SA — NIP vérifié' }]), true)
  assert.equal(canReleaseSaPurchaseOrders('po_ready', [{ saApprovalRequired: false }]), true)
  assert.equal(canReleaseSaPurchaseOrders('po_ready', [{ saApprovalRequired: true, saHeadSignature: 'signé' }, { saApprovalRequired: true }]), false)
})
