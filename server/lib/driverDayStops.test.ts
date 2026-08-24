import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  countDriverVisibleStops,
  isStopVisibleToDriver,
  mergeDriverStopsForDay,
} from './driverDayStops.ts'

describe('driverDayStops — multi-tournées le même jour', () => {
  it('masque les arrêts failed (replan / obsolètes)', () => {
    assert.equal(isStopVisibleToDriver({ status: 'failed' }), false)
    assert.equal(isStopVisibleToDriver({ status: 'pending' }), true)
    assert.equal(isStopVisibleToDriver({ status: 'delivered' }), true)
  })

  it('conserve les arrêts actifs de toutes les tournées', () => {
    const merged = mergeDriverStopsForDay([
      { status: 'pending' as const, tourId: 'tour-a', id: '1' },
      { status: 'failed' as const, tourId: 'tour-a', id: '2' },
      { status: 'pending' as const, tourId: 'tour-b', id: '3' },
      { status: 'delivered' as const, tourId: 'tour-a', id: '4' },
    ])
    assert.deepEqual(
      merged.map((s) => s.id),
      ['1', '3', '4'],
    )
    assert.deepEqual(
      merged.map((s) => s.sequence),
      [1, 2, 3],
    )
  })

  it('compte tous les arrêts visibles (pas seulement la dernière tournée)', () => {
    assert.equal(
      countDriverVisibleStops([
        { status: 'pending' },
        { status: 'pending' },
        { status: 'failed' },
        { status: 'delivered' },
      ]),
      3,
    )
  })
})
