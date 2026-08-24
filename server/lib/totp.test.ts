import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateTotpSecret, totpAt, verifyTotpCode } from './totp.js'

describe('totp', () => {
  it('génère et vérifie un code à 6 chiffres', () => {
    const secret = generateTotpSecret()
    const code = totpAt(secret)
    assert.match(code, /^\d{6}$/)
    assert.equal(verifyTotpCode(secret, code), true)
    assert.equal(verifyTotpCode(secret, '000000'), false)
  })
})
