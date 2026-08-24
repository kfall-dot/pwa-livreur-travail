import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPgUniqueViolation } from './pgErrors.js'

describe('isPgUniqueViolation', () => {
  it('détecte le code Postgres 23505', () => {
    assert.equal(isPgUniqueViolation({ code: '23505', message: 'boom' }), true)
  })

  it('détecte l’enveloppe Drizzle (cause Neon)', () => {
    const err = new Error('Failed query: insert into "drivers"')
    ;(err as Error & { cause?: unknown }).cause = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "drivers_phone_key"',
    }
    assert.equal(isPgUniqueViolation(err), true)
  })

  it('ignore les autres erreurs', () => {
    assert.equal(isPgUniqueViolation(new Error('foreign key constraint')), false)
    assert.equal(isPgUniqueViolation(null), false)
  })
})
