import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertDriverLoginNotLocked,
  clearDriverLoginFailures,
  recordDriverLoginFailure,
} from './driverLoginLockout.js'
import { resetRateLimitMemoryForTests } from '../middleware/rateLimit.js'

describe('driverLoginLockout', () => {
  afterEach(() => {
    resetRateLimitMemoryForTests()
  })

  it('verrouille après 5 échecs', async () => {
    const phone = '+2250700000001'
    for (let i = 0; i < 5; i++) {
      await recordDriverLoginFailure(phone)
    }
    const msg = await assertDriverLoginNotLocked(phone)
    assert.ok(msg)
    assert.match(msg!, /verrouillé/i)
  })

  it('déverrouille après clear', async () => {
    const phone = '+2250700000002'
    for (let i = 0; i < 5; i++) await recordDriverLoginFailure(phone)
    await clearDriverLoginFailures(phone)
    assert.equal(await assertDriverLoginNotLocked(phone), null)
  })
})
