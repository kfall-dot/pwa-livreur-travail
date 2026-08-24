import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { sendOtpSms } from './sms.js'

const envBackup = { ...process.env }

afterEach(() => {
  process.env = { ...envBackup }
})

describe('sendOtpSms — mock', () => {
  it('réussit sans appel réseau', async () => {
    process.env.SMS_PROVIDER = 'mock'
    const result = await sendOtpSms('+2250102030405', '123456', {
      pointName: 'Carrefour City',
      orderRef: 'CMD-1',
      orderDetail: '2 palette',
    })
    assert.equal(result.success, true)
    assert.equal(result.provider, 'mock')
  })
})

describe('sendOtpSms — textbee', () => {
  it('appelle l’API Textbee avec la clé', async () => {
    process.env.SMS_PROVIDER = 'textbee'
    process.env.TEXTBEE_API_KEY = 'test-key'
    process.env.TEXTBEE_DEVICE_ID = 'device-1'
    process.env.TEXTBEE_API_BASE = 'https://api.textbee.dev/api/v1'

    let capturedUrl = ''
    let capturedBody = ''
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      capturedUrl = url
      capturedBody = String(init?.body ?? '')
      return new Response(JSON.stringify({ id: 'sms-1', status: 'queued' }), { status: 200 })
    }

    const result = await sendOtpSms(
      '+2250102030405',
      '123456',
      {
        pointName: 'Carrefour City',
        orderRef: 'CMD-1',
        orderDetail: '2 palette',
      },
      { fetchImpl },
    )

    assert.equal(result.success, true)
    assert.equal(result.provider, 'textbee')
    assert.match(capturedUrl, /device-1\/send-sms/)
    assert.match(capturedBody, /\+2250102030405/)
    assert.match(capturedBody, /123456/)
  })
})
