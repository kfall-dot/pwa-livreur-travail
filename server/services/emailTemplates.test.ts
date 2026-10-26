import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { emailActionUrl, readableEmailText, renderEmailTemplate } from './emailTemplates.js'

const base = process.env.PUBLIC_BASE_URL
afterEach(() => { if (base === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = base })

test('le modèle échappe les saisies et conserve les retours à la ligne', () => {
  const html = renderEmailTemplate({ subject: '<img onerror=alert(1)>', text: 'Bonjour <script>\nBois & fer\n\nSuite' })
  assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'))
  assert.ok(html.includes('&lt;script&gt;<br>Bois &amp; fer'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('Cocody Riviera Palmeraie'))
  assert.ok(html.includes('<!-- efpc-email-template -->'))
})

test('les liens conservent leurs jetons et utilisent une URL publique absolue', () => {
  process.env.PUBLIC_BASE_URL = 'https://efpc.example/'
  const actionUrl = '/manager/invite?token=a%2Fb&source=mail'
  const html = renderEmailTemplate({ subject: 'Invitation', text: 'Bonjour', actionUrl, actionLabel: 'Activer mon compte' })
  assert.ok(html.includes('https://efpc.example/branding/efpc-logo.png'))
  assert.ok(html.includes('href="https://efpc.example/manager/invite?token=a%2Fb&amp;source=mail"'))
  assert.ok(html.includes('Activer mon compte'))
})

test('les URL dangereuses et invalides ne produisent pas de bouton', () => {
  for (const actionUrl of ['javascript:alert(1)', 'data:text/html,test', 'https://[']) {
    assert.equal(emailActionUrl(actionUrl), undefined)
    assert.ok(!renderEmailTemplate({ subject: 'Test', text: 'Texte', actionUrl, actionLabel: 'Cliquer ici' }).includes('Cliquer ici'))
  }
})

test('les statuts métier deviennent lisibles sans altérer les références et jetons', () => {
  assert.equal(readableEmailText('EB EB-2026-0034 — daf_bt_review'), 'EB-2026-0034 — Validation du bon de trésorerie par le DAF')
  assert.equal(readableEmailText('token=keep_this_token'), 'token=keep_this_token')
})
