import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { versionBadge, versionSuffix } from './requestVersion.ts'

describe('requestVersion — identification de la version révisée', () => {
  it('version 1 (ou absente) → aucun suffixe, aucun badge', () => {
    assert.equal(versionSuffix(1), '')
    assert.equal(versionSuffix(undefined), '')
    assert.equal(versionSuffix(null), '')
    assert.equal(versionBadge(1), null)
    assert.equal(versionBadge(undefined), null)
  })

  it('version révisée → suffixe « — vN » et badge « vN »', () => {
    assert.equal(versionSuffix(2), ' — v2')
    assert.equal(versionSuffix(3), ' — v3')
    assert.equal(versionBadge(2), 'v2')
    assert.equal(versionBadge(3), 'v3')
  })
})
