import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSelfSignupAllowed, slugifyCompanyName } from './tenant.js'

describe('tenant helpers', () => {
  it('slugifyCompanyName normalise accents et espaces', () => {
    assert.equal(slugifyCompanyName('Ferme Dupont & Fils'), 'ferme-dupont-fils')
    assert.equal(slugifyCompanyName('  Côte d’Ivoire Express  '), 'cote-d-ivoire-express')
  })

  it('isSelfSignupAllowed lit ALLOW_SELF_SIGNUP', () => {
    const prev = process.env.ALLOW_SELF_SIGNUP
    const prevCtx = process.env.CONTEXT
    process.env.ALLOW_SELF_SIGNUP = 'true'
    process.env.CONTEXT = 'production'
    assert.equal(isSelfSignupAllowed(), true)
    process.env.ALLOW_SELF_SIGNUP = 'false'
    assert.equal(isSelfSignupAllowed(), false)
    delete process.env.ALLOW_SELF_SIGNUP
    process.env.CONTEXT = 'production'
    assert.equal(isSelfSignupAllowed(), false)
    if (prev === undefined) delete process.env.ALLOW_SELF_SIGNUP
    else process.env.ALLOW_SELF_SIGNUP = prev
    if (prevCtx === undefined) delete process.env.CONTEXT
    else process.env.CONTEXT = prevCtx
  })
})
