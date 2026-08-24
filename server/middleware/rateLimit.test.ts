import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  resetRateLimitMemoryForTests,
} from './rateLimit.js'

describe('rateLimit — mémoire (fallback sans Blobs)', () => {
  beforeEach(() => {
    resetRateLimitMemoryForTests()
    delete process.env.VITE_E2E
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

  it('désactivé en E2E (VITE_E2E)', async () => {
    process.env.VITE_E2E = 'true'
    const key = 'test:e2e:bypass'
    for (let i = 0; i < 20; i += 1) {
      assert.equal((await checkRateLimit(key, 2, 60_000)).allowed, true)
    }
  })
})
