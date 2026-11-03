import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { clientIpFromRequest } from '../lib/clientIp.js'
import {
  checkRateLimit,
  resetRateLimitMemoryForTests,
} from './rateLimit.js'

describe('résolution de l’adresse IP', () => {
  const railway = { RAILWAY_PROJECT_ID: 'test', RAILWAY_SERVICE_ID: 'test' }
  const request = (headers: Record<string, string | string[]>) => ({ headers, socket: { remoteAddress: '::ffff:192.0.2.10' } })

  it('ignore les en-têtes falsifiés en accès direct', () => {
    assert.equal(clientIpFromRequest(request({ 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' }), {}), '192.0.2.10')
  })

  it('utilise X-Real-IP de Railway sans croire la chaîne XFF', () => {
    assert.equal(clientIpFromRequest(request({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '198.51.100.1, 192.0.2.3' }), railway), '198.51.100.2')
  })

  it('refuse listes, doublons et adresses invalides, sans repli sur XFF', () => {
    for (const value of ['bad', '198.51.100.1, 198.51.100.2', ['198.51.100.1', '198.51.100.2'], 'fe80::1%eth0']) {
      assert.equal(clientIpFromRequest(request({ 'x-real-ip': value, 'x-forwarded-for': '198.51.100.1' }), railway), '192.0.2.10')
    }
  })

  it('normalise les variantes IPv6 et ne fabrique pas une IP manquante', () => {
    assert.equal(clientIpFromRequest(request({ 'x-real-ip': '2001:0db8:0:0:0:0:0:1' }), railway), '2001:db8::1')
    assert.equal(clientIpFromRequest({ headers: {} }, {}), undefined)
  })
})

describe('rateLimit — mémoire (fallback sans Blobs)', () => {
  beforeEach(() => {
    resetRateLimitMemoryForTests()
    delete process.env.VITE_E2E
    delete process.env.RATE_LIMIT_DISABLED
  })

  it('autorise jusqu’à max puis refuse', async () => {
    const key = 'test:login:user-a'
    const max = 3
    const windowMs = 60_000

    assert.equal((await checkRateLimit(key, max, windowMs)).allowed, true)
    assert.equal((await checkRateLimit(key, max, windowMs)).allowed, true)
    assert.equal((await checkRateLimit(key, max, windowMs)).allowed, true)

    const blocked = await checkRateLimit(key, max, windowMs)
    assert.equal(blocked.allowed, false)
    if (!blocked.allowed) {
      assert.ok(blocked.retryAfterSec >= 1)
    }
  })

  it('reste ACTIF en E2E (VITE_E2E ne désactive plus — le test du verrouillage PIN a besoin d’un vrai 429)', async () => {
    process.env.VITE_E2E = 'true'
    const key = 'test:e2e:active'
    assert.equal((await checkRateLimit(key, 2, 60_000)).allowed, true)
    assert.equal((await checkRateLimit(key, 2, 60_000)).allowed, true)
    assert.equal((await checkRateLimit(key, 2, 60_000)).allowed, false)
  })

  it('désactivé uniquement via RATE_LIMIT_DISABLED=true', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true'
    const key = 'test:disabled:bypass'
    for (let i = 0; i < 20; i += 1) {
      assert.equal((await checkRateLimit(key, 2, 60_000)).allowed, true)
    }
  })
})
