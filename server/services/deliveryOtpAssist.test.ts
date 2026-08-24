import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isTourDatePast,
  otpAssistStatusBlock,
  todayIso,
} from './deliveryOtpAssistLogic.js'

describe('deliveryOtpAssistLogic', () => {
  describe('isTourDatePast', () => {
    it('retourne false pour la date du jour', () => {
      assert.equal(isTourDatePast(todayIso()), false)
    })

    it('retourne true pour une date passée', () => {
      assert.equal(isTourDatePast('2020-01-01'), true)
    })
  })

  describe('otpAssistStatusBlock', () => {
    it('refuse une livraison déjà livrée', () => {
      const msg = otpAssistStatusBlock('delivered', todayIso())
      assert.match(msg!, /terminée/i)
    })

    it('refuse une livraison failed', () => {
      const msg = otpAssistStatusBlock('failed', todayIso())
      assert.match(msg!, /terminée/i)
    })

    it('refuse une tournée passée', () => {
      const msg = otpAssistStatusBlock('otp_sent', '2020-01-01')
      assert.match(msg!, /passée/i)
    })

    it('refuse si le livreur n’a pas démarré', () => {
      const msg = otpAssistStatusBlock('pending', todayIso())
      assert.match(msg!, /démarré/i)
    })

    it('autorise in_progress et otp_sent sur tournée du jour', () => {
      assert.equal(otpAssistStatusBlock('in_progress', todayIso()), null)
      assert.equal(otpAssistStatusBlock('otp_sent', todayIso()), null)
    })
  })
})
