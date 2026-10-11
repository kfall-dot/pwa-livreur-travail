import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseDocumentRef } from './documentRef.ts'

describe('parseDocumentRef — identifiants de la chaîne documentaire', () => {
  it('reconnaît une EB et normalise casse et espaces', () => {
    assert.deepEqual(parseDocumentRef('  eb-2026-0007 '), { kind: 'eb', value: 'EB-2026-0007' })
  })

  it('tolère le suffixe de révision (« — v2 ») sur une EB', () => {
    assert.deepEqual(parseDocumentRef('EB-2026-0007 — v2'), { kind: 'eb', value: 'EB-2026-0007' })
    assert.deepEqual(parseDocumentRef('EB-2026-0007—v12'), { kind: 'eb', value: 'EB-2026-0007' })
  })

  it('tolère le libellé recopié depuis l’affichage (« EB EB-… », « BL RCT-… »)', () => {
    assert.deepEqual(parseDocumentRef('EB EB-2026-0007'), { kind: 'eb', value: 'EB-2026-0007' })
    assert.deepEqual(parseDocumentRef('BL RCT-a1b2c3d4'), { kind: 'bl', value: 'RCT-A1B2C3D4' })
  })

  it('reconnaît BT, avance AV, BC et BL', () => {
    assert.deepEqual(parseDocumentRef('BT-2026-0003'), { kind: 'bt', value: 'BT-2026-0003' })
    assert.deepEqual(parseDocumentRef('AV-20260712-0001'), { kind: 'bt', value: 'AV-20260712-0001' })
    assert.deepEqual(parseDocumentRef('BC-2026-0012'), { kind: 'bc', value: 'BC-2026-0012' })
    assert.deepEqual(parseDocumentRef('RCT-A1B2C3D4'), { kind: 'bl', value: 'RCT-A1B2C3D4' })
  })

  it('reconnaît un id technique (UUID) et le normalise en minuscules', () => {
    assert.deepEqual(parseDocumentRef('A1B2C3D4-1111-2222-3333-444455556666'), {
      kind: 'uuid',
      value: 'a1b2c3d4-1111-2222-3333-444455556666',
    })
  })

  it('refuse un format inconnu plutôt que de deviner', () => {
    assert.equal(parseDocumentRef('').kind, 'unknown')
    assert.equal(parseDocumentRef('BC-2026').kind, 'unknown')
    assert.equal(parseDocumentRef('RCT-!!').kind, 'unknown')
    assert.equal(parseDocumentRef('bon de commande 12').kind, 'unknown')
  })
})
