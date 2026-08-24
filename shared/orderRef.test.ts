import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateOrderRef, isValidOrderRef } from './orderRef.ts'

describe('orderRef', () => {
  it('génère CMD-YYYYMMDD-XXXX', () => {
    const ref = generateOrderRef(new Date('2026-07-12T12:00:00Z'))
    assert.match(ref, /^CMD-20260712-[A-F0-9]{4}$/i)
    assert.equal(isValidOrderRef(ref), true)
  })

  it('rejette les refs manuelles hors format', () => {
    assert.equal(isValidOrderRef('CMD-2026-8841'), false)
    assert.equal(isValidOrderRef(''), false)
  })
})
