import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CI_PHONE_PLACEHOLDER,
  DEMO_DRIVER_PHONE,
  PHONE_FORMAT_HINT,
  isValidDriverPhone,
  normalizeDriverPhone,
} from './phone.ts'

describe('phone — Côte d\'Ivoire', () => {
  it('placeholder création distinct du compte démo', () => {
    assert.match(CI_PHONE_PLACEHOLDER, /^\+22507/)
    assert.equal(DEMO_DRIVER_PHONE, '+2250701234567')
    assert.notEqual(DEMO_DRIVER_PHONE, CI_PHONE_PLACEHOLDER)
  })

  it('hint UI ne mentionne pas +33 ni 418', () => {
    assert.doesNotMatch(PHONE_FORMAT_HINT, /\+33/)
    assert.doesNotMatch(PHONE_FORMAT_HINT, /418/)
  })

  it('normalise 10 chiffres locaux CI', () => {
    assert.equal(normalizeDriverPhone('0701234567'), '+2250701234567')
    assert.equal(isValidDriverPhone('0701234567'), true)
  })

  it('normalise espaces et tirets', () => {
    assert.equal(normalizeDriverPhone('+225 07 01 23 45 67'), '+2250701234567')
    assert.equal(normalizeDriverPhone('07-01-23-45-67'), '+2250701234567')
  })
})
