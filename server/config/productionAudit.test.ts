import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { auditProductionEnvironment } from './productionAudit.js'

describe('productionAudit', () => {
  const saved = { ...process.env }

  afterEach(() => {
    process.env = { ...saved }
  })

  it('signale SMS mock en production', () => {
    process.env.CONTEXT = 'production'
    process.env.JWT_SECRET = 'x'.repeat(32)
    process.env.SMS_PROVIDER = 'mock'
    const issues = auditProductionEnvironment()
    assert.ok(issues.some((i) => i.code === 'SMS_MOCK' && i.level === 'error'))
  })

  it('signale GEOFENCE_BYPASS sans ALLOW_GEOFENCE_BYPASS', () => {
    process.env.CONTEXT = 'production'
    process.env.JWT_SECRET = 'x'.repeat(32)
    process.env.SMS_PROVIDER = 'textbee'
    process.env.GEOFENCE_BYPASS = 'true'
    delete process.env.ALLOW_GEOFENCE_BYPASS
    const issues = auditProductionEnvironment()
    assert.ok(issues.some((i) => i.code === 'GEOFENCE_BYPASS'))
  })
})
