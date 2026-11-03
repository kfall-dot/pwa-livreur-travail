import { afterEach, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import { emailConfig } from '../config/email.js'
import { sendEmail } from './email.js'

const originalConfig = { ...emailConfig, smtp: { ...emailConfig.smtp } }
const originalFetch = globalThis.fetch
afterEach(() => {
  mock.restoreAll()
  Object.assign(emailConfig, originalConfig, { smtp: { ...originalConfig.smtp } })
  globalThis.fetch = originalFetch
})

test('SMTP : compose le message EFPC avec le vrai Nodemailer, sans connexion réseau', async () => {
  emailConfig.provider = 'smtp'
  emailConfig.from = 'sender@example.com'
  emailConfig.fromName = 'EFPC'
  emailConfig.smtp.host = 'smtp.invalid'
  const transport = nodemailer.createTransport({ jsonTransport: true })
  const originalSend = transport.sendMail.bind(transport)
  let composed: Record<string, unknown> = {}
  mock.method(transport, 'sendMail', async (message: nodemailer.SendMailOptions) => {
    const info = await originalSend(message)
    composed = JSON.parse(info.message)
    return info
  })
  mock.method(nodemailer, 'createTransport', () => transport)
  const result = await sendEmail({ to: 'recipient@example.com', subject: 'Validation EB-2026-0001', text: 'Montant <script> & détails' })
  assert.equal(result.success, true)
  assert.equal(result.provider, 'smtp')
  assert.ok(result.messageId)
  assert.deepEqual(composed.from, { name: 'EFPC', address: 'sender@example.com' })
  assert.deepEqual(composed.to, [{ address: 'recipient@example.com', name: '' }])
  assert.match(String(composed.html), /efpc-email-template/)
  assert.match(String(composed.html), /&lt;script&gt;/)
  assert.equal(composed.text, 'Montant <script> & détails')
})

test('Brevo : sendEmail utilise exclusivement HTTPS et conserve le modèle EFPC', async () => {
  emailConfig.provider = 'brevo'
  emailConfig.from = 'sender@example.com'
  emailConfig.fromName = 'EFPC'
  emailConfig.brevoApiKey = 'test-only'
  mock.method(nodemailer, 'createTransport', () => { throw new Error('SMTP interdit dans ce test') })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    const body = JSON.parse(String(options?.body))
    assert.deepEqual(body.to, [{ email: 'recipient@example.com' }])
    assert.equal(body.sender.name, 'EFPC')
    assert.match(body.htmlContent, /efpc-email-template/)
    return Response.json({ messageId: 'simulated-brevo-id' }, { status: 201 })
  }
  const result = await sendEmail({ to: 'recipient@example.com', subject: 'Validation', text: 'Dossier à consulter' })
  assert.equal(result.success, true)
  assert.equal(result.messageId, 'simulated-brevo-id')
})
