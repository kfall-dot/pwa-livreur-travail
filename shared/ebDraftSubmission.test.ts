import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ebDraftSubmissionStatus } from './ebDraftSubmission.js'
import { saFinanceIncompleteMessage } from './saFinanceGate.js'

test('les EB SA passent en préparation commerciale sans validation DT, quelle que soit la famille', () => {
  assert.equal(ebDraftSubmissionStatus('purchasing', false), 'submitted')
  assert.equal(ebDraftSubmissionStatus('purchasing', true), 'submitted')
})

test('les EB CdC conservent la validation DT obligatoire', () => {
  assert.equal(ebDraftSubmissionStatus('site_manager', false), 'dt_review')
  assert.equal(ebDraftSubmissionStatus('site_manager', true), 'dt_review')
})

test('le circuit des EB DT reste inchangé', () => {
  assert.equal(ebDraftSubmissionStatus('technical_director', false), 'submitted')
  assert.equal(ebDraftSubmissionStatus('technical_director', true), 'cdg_review')
})

test('une EB SA exige encore les pièces et le paiement avant la soumission au CdG', () => {
  const line = { label: 'Ciment', unitPriceFcfa: 5000, supplierName: 'Fournisseur A' }
  assert.ok(saFinanceIncompleteMessage([line]))
  assert.ok(saFinanceIncompleteMessage([{ ...line, paymentMode: 'CREDIT' }]))
  assert.equal(saFinanceIncompleteMessage([{ ...line, paymentMode: 'CREDIT', attachmentFileName: 'facture.pdf' }]), null)
})
