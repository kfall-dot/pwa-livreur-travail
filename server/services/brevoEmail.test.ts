import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBrevoEmail } from './brevoEmail.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const payload = { to: 'recipient@example.com', subject: 'Test', text: 'Texte' }

test('Brevo transmet le message HTTPS et exige un identifiant fournisseur', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal((options?.headers as Record<string, string>)['api-key'], 'test-secret')
    const body = JSON.parse(String(options?.body))
    assert.deepEqual(body.to, [{ email: payload.to }])
    assert.equal(body.sender.email, 'sender@example.com')
    assert.equal(body.textContent, 'Texte')
    assert.equal(body.htmlContent, undefined)
    assert.ok(options?.signal)
    return Response.json({ messageId: '<id@example.com>' }, { status: 201 })
  }
  assert.equal((await sendBrevoEmail(payload, 'sender@example.com', 'test-secret')).messageId, '<id@example.com>')
})

test('Brevo conserve le HTML des notifications', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body))
    assert.equal(body.htmlContent, '<b>Message</b>')
    assert.equal(body.textContent, undefined)
    return Response.json({ messageId: 'id' }, { status: 201 })
  }
  await sendBrevoEmail({ ...payload, html: '<b>Message</b>' }, 'sender@example.com', 'test-secret')
})

test('Brevo ne masque pas les refus et ne divulgue pas leur contenu', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response('secret-provider-body', { status })
    await assert.rejects(sendBrevoEmail(payload, 'sender@example.com', 'test-secret'), error => {
      const value = error as Error & { responseCode: number }
      assert.equal(value.responseCode, status)
      assert.doesNotMatch(value.message, /secret-provider-body|test-secret/)
      return true
    })
  }
})

test('Brevo refuse une configuration absente et une réponse sans messageId', async () => {
  globalThis.fetch = async () => { throw new Error('aucun appel réseau attendu') }
  await assert.rejects(sendBrevoEmail(payload, 'sender@example.com', ''), /BREVO_CONFIG_MISSING/)
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(sendBrevoEmail(payload, 'sender@example.com', 'key'), /BREVO_INVALID_RESPONSE/)
})

test('Brevo remonte un délai dépassé ou une erreur réseau sans exposer les secrets', async () => {
  globalThis.fetch = async () => { throw new DOMException('secret', 'TimeoutError') }
  await assert.rejects(sendBrevoEmail(payload, 'sender@example.com', 'key'), /ETIMEDOUT/)
  globalThis.fetch = async () => { throw new Error('secret') }
  await assert.rejects(sendBrevoEmail(payload, 'sender@example.com', 'key'), /BREVO_NETWORK_ERROR/)
})
