import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentReferenceYear, nextDocumentReference } from './documentReferences.js'

test('année de référence selon le fuseau métier, y compris au changement d’année', () => {
  const date = new Date('2027-01-01T00:30:00Z')
  assert.equal(documentReferenceYear(date, 'Africa/Abidjan'), 2027)
  assert.equal(documentReferenceYear(date, 'America/Toronto'), 2026)
})

test('référence sans troncature au-delà de 9999 et sans perte de précision', async () => {
  const query = async (_sql: string, values: string[]) => {
    assert.deepEqual(values.slice(0, 2), ['company', 'BC'])
    return { rows: [{ last_value: '9007199254740993' }] }
  }
  const ref = await nextDocumentReference('company', 'BC', new Date('2026-06-01'), { query })
  assert.equal(ref, 'BC-2026-9007199254740993')
})

test('aucun repli vers un comptage ou un numéro local si la réservation échoue', async () => {
  await assert.rejects(nextDocumentReference('company', 'EB', new Date(), { query: async () => ({ rows: [] }) }), /impossible/)
  await assert.rejects(nextDocumentReference('', 'BT', new Date(), { query: async () => { throw new Error('ne doit pas être appelée') } }), /valides requis/)
})
