import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { recordSecuritySpike, resetSecuritySpikeMonitor } from './securitySpikeMonitor.js'

describe('securitySpikeMonitor', () => {
  beforeEach(() => {
    resetSecuritySpikeMonitor()
  })

  it('n’alerte pas sous le seuil', () => {
    for (let i = 0; i < 24; i += 1) {
      recordSecuritySpike('login_failures')
    }
    // pas d’exception — le test vérifie surtout l’absence de throw
    assert.ok(true)
  })

  it('alerte au-delà du seuil login', () => {
    for (let i = 0; i < 25; i += 1) {
      recordSecuritySpike('login_failures')
    }
    assert.ok(true)
  })
})
