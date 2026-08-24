import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidContactEmail, normalizeContactEmail } from './email.js'

describe('contact email', () => {
  it('normalise et valide un e-mail', () => {
    assert.equal(normalizeContactEmail('  Test@Example.COM '), 'test@example.com')
    assert.equal(isValidContactEmail('test@example.com'), true)
  })

  it('refuse vide ou invalide', () => {
    assert.equal(isValidContactEmail(''), false)
    assert.equal(isValidContactEmail('pas-un-email'), false)
  })
})
