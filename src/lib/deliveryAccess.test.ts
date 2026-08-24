import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { todayIso } from './dates.ts'
import {
  canOpenDelivery,
  deliveryAccessLabel,
  driverStopCtaLabel,
} from './deliveryAccess.ts'

function shiftIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('deliveryAccess — dates passées', () => {
  it('verrouille une livraison pending sur une date passée', () => {
    const past = shiftIso(-2)
    assert.equal(canOpenDelivery('pending', past), false)
    assert.equal(deliveryAccessLabel('pending', past), 'Date passée')
  })

  it('affiche Date passée (pas À venir) sur le CTA des arrêts expirés', () => {
    const past = shiftIso(-1)
    assert.equal(
      driverStopCtaLabel({ status: 'pending', tourDate: past, isNext: true }),
      'Date passée',
    )
    assert.equal(
      driverStopCtaLabel({ status: 'in_progress', tourDate: past, isNext: false }),
      'Date passée',
    )
  })

  it('garde À venir / Continuer pour aujourd’hui', () => {
    const today = todayIso()
    assert.equal(
      driverStopCtaLabel({ status: 'pending', tourDate: today, isNext: false }),
      'À venir',
    )
    assert.equal(
      driverStopCtaLabel({ status: 'pending', tourDate: today, isNext: true }),
      'Continuer',
    )
  })

  it('affiche Date future pour une tournée à venir', () => {
    const future = shiftIso(3)
    assert.equal(
      driverStopCtaLabel({ status: 'pending', tourDate: future, isNext: false }),
      'Date future',
    )
  })
})
