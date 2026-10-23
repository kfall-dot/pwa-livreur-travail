import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inAccountingDateRange } from './accountingFilters.ts'

test('dates comptables : bornes inclusives et plage sur plusieurs mois', () => {
  const dates = ['30/09/2026', '01/10/2026', '20/10/2026', '01/11/2026']
  assert.deepEqual(dates.filter(d => inAccountingDateRange(d, '2026-09-30', '2026-10-20')), dates.slice(0, 3))
  assert.equal(inAccountingDateRange('1/10/2026', '2026-10-01', '2026-10-01'), true)
  assert.equal(inAccountingDateRange('2026-10-20T12:30:00Z', '2026-10-20', ''), true)
  assert.equal(inAccountingDateRange('—', '2026-10-01', ''), false)
  assert.equal(inAccountingDateRange('20/10/2026', '2026-10-21', '2026-10-01'), false)
  assert.equal(inAccountingDateRange('—', '', ''), true)
})
