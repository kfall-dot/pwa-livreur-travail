import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertDatabaseResetAllowed,
  assertDatabaseWipeAllowed,
  databaseHostFingerprint,
  DatabaseProtectionError,
  isProtectedProductionDatabase,
} from './databaseProtection.js'

const PROD_HOST = 'ep-green-king-ajfusoom.c-3.us-east-2.db.netlify.com'
const PROD_URL = `postgresql://user:pass@${PROD_HOST}/netlifydb?sslmode=require`
const DEV_URL = 'postgresql://user:pass@ep-dev-branch-other.db.netlify.com/netlifydb'

describe('databaseProtection', () => {
  it('databaseHostFingerprint is stable for a hostname', () => {
    assert.equal(databaseHostFingerprint(PROD_URL), '16950163f70780b3')
    assert.equal(databaseHostFingerprint(DEV_URL).length, 16)
    assert.notEqual(databaseHostFingerprint(DEV_URL), '16950163f70780b3')
  })

  it('isProtectedProductionDatabase matches committed fingerprint', () => {
    assert.equal(isProtectedProductionDatabase(PROD_URL), true)
    assert.equal(isProtectedProductionDatabase(DEV_URL), false)
  })

  it('assertDatabaseWipeAllowed blocks wipe on prod DB', () => {
    const prevUrl = process.env.NETLIFY_DB_URL
    const prevE2e = process.env.E2E_DATABASE_URL
    const prevWipe = process.env.ALLOW_WIPE_USERS
    const prevBreak = process.env.ALLOW_PRODUCTION_DB_WIPE
    process.env.NETLIFY_DB_URL = PROD_URL
    delete process.env.E2E_DATABASE_URL
    process.env.ALLOW_WIPE_USERS = 'true'
    delete process.env.ALLOW_PRODUCTION_DB_WIPE
    try {
      assert.throws(() => assertDatabaseWipeAllowed(), DatabaseProtectionError)
      process.env.ALLOW_PRODUCTION_DB_WIPE = 'true'
      assert.doesNotThrow(() => assertDatabaseWipeAllowed())
    } finally {
      process.env.NETLIFY_DB_URL = prevUrl
      if (prevE2e !== undefined) process.env.E2E_DATABASE_URL = prevE2e
      else delete process.env.E2E_DATABASE_URL
      process.env.ALLOW_WIPE_USERS = prevWipe
      process.env.ALLOW_PRODUCTION_DB_WIPE = prevBreak
    }
  })

  it('assertDatabaseResetAllowed blocks local reset on prod DB', () => {
    const prevUrl = process.env.NETLIFY_DB_URL
    const prevE2e = process.env.E2E_DATABASE_URL
    const prevCtx = process.env.CONTEXT
    process.env.NETLIFY_DB_URL = PROD_URL
    delete process.env.E2E_DATABASE_URL
    delete process.env.CONTEXT
    try {
      assert.throws(() => assertDatabaseResetAllowed(), DatabaseProtectionError)
      process.env.CONTEXT = 'production'
      assert.doesNotThrow(() => assertDatabaseResetAllowed())
    } finally {
      process.env.NETLIFY_DB_URL = prevUrl
      if (prevE2e !== undefined) process.env.E2E_DATABASE_URL = prevE2e
      else delete process.env.E2E_DATABASE_URL
      process.env.CONTEXT = prevCtx
    }
  })
})
