import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { allowTestBypass, isProduction, resolveOtpCode, allowDevDuplicateDriverPhone } from './production.js'

describe('isProduction / resolveOtpCode (CONTEXT Netlify)', () => {
  const saved = {
    CONTEXT: process.env.CONTEXT,
    NETLIFY_DEV: process.env.NETLIFY_DEV,
    NODE_ENV: process.env.NODE_ENV,
    OTP_CODE: process.env.OTP_CODE,
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    CI: process.env.CI,
  }

  afterEach(() => {
    if (saved.CONTEXT === undefined) delete process.env.CONTEXT
    else process.env.CONTEXT = saved.CONTEXT
    if (saved.NETLIFY_DEV === undefined) delete process.env.NETLIFY_DEV
    else process.env.NETLIFY_DEV = saved.NETLIFY_DEV
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = saved.NODE_ENV
    if (saved.OTP_CODE === undefined) delete process.env.OTP_CODE
    else process.env.OTP_CODE = saved.OTP_CODE
    if (saved.SMS_PROVIDER === undefined) delete process.env.SMS_PROVIDER
    else process.env.SMS_PROVIDER = saved.SMS_PROVIDER
    if (saved.CI === undefined) delete process.env.CI
    else process.env.CI = saved.CI
  })

  it('CONTEXT=production → pas de bypass même si NODE_ENV=development', () => {
    process.env.CONTEXT = 'production'
    process.env.NODE_ENV = 'development'
    delete process.env.OTP_CODE
    assert.equal(isProduction(), true)
    assert.equal(allowTestBypass(), false)
    const code = resolveOtpCode()
    assert.match(code, /^\d{6}$/)
  })

  it('SMS_PROVIDER réel → OTP aléatoire même hors CONTEXT production', () => {
    process.env.CONTEXT = 'dev'
    process.env.SMS_PROVIDER = 'textbee'
    delete process.env.OTP_CODE
    assert.equal(allowTestBypass(), false)
    const code = resolveOtpCode()
    assert.match(code, /^\d{6}$/)
  })

  it('CI=1 hors production → doublon téléphone refusé (I25)', () => {
    process.env.CONTEXT = 'dev'
    process.env.NETLIFY_DEV = 'true'
    process.env.CI = '1'
    assert.equal(isProduction(), false)
    assert.equal(allowDevDuplicateDriverPhone(), false)
  })

  it('netlify:dev sans CI → doublon téléphone autorisé', () => {
    process.env.CONTEXT = 'dev'
    process.env.NETLIFY_DEV = 'true'
    delete process.env.CI
    assert.equal(isProduction(), false)
    assert.equal(allowDevDuplicateDriverPhone(), true)
  })

  it('CONTEXT=production → doublon téléphone refusé', () => {
    process.env.CONTEXT = 'production'
    delete process.env.CI
    assert.equal(allowDevDuplicateDriverPhone(), false)
  })
})
