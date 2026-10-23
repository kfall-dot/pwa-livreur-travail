import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isEbInitiator } from './ebOwnership.js'

test('une transmission par le DT conserve la visibilité pour le CdC initiateur uniquement', async () => {
  const request = { sourceDraftId: 'draft-1', createdByManagerId: 'dt' }
  const loadDraft = async () => ({ createdByManagerId: 'cdc-a' })
  assert.equal(await isEbInitiator(request, 'cdc-a', loadDraft), true)
  assert.equal(await isEbInitiator(request, 'cdc-b', loadDraft), false)
  assert.equal(await isEbInitiator(request, 'dt', loadDraft), false)
})

test('un brouillon sans auteur établi ne donne aucun accès par déduction', async () => {
  const request = { sourceDraftId: 'draft-1', createdByManagerId: 'cdc-a' }
  assert.equal(await isEbInitiator(request, 'cdc-a', async () => null), false)
  assert.equal(await isEbInitiator(request, 'cdc-a', async () => ({ createdByManagerId: null })), false)
})

test('une EB sans brouillon utilise son auteur enregistré', async () => {
  const loadDraft = async () => { throw new Error('Aucun brouillon ne doit être chargé') }
  assert.equal(await isEbInitiator({ sourceDraftId: null, createdByManagerId: 'cdc-a' }, 'cdc-a', loadDraft), true)
  assert.equal(await isEbInitiator({ sourceDraftId: null, createdByManagerId: 'cdc-a' }, 'cdc-b', loadDraft), false)
  assert.equal(await isEbInitiator({ sourceDraftId: null, createdByManagerId: null }, 'cdc-a', loadDraft), false)
})
