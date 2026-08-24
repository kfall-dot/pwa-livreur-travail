import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DeliveryPoint } from './schema.js'
import { formatTimeHHMM, stopPayloadDiffersFromExisting } from './stopPayloadCompare.js'

const monoprixBase = {
  id: 'del-2',
  tourId: 'tour-1',
  sequence: 2,
  name: 'Monoprix Bastille',
  address: '8 Place de la Bastille, 75004 Paris',
  instructions: null,
  status: 'delivered' as const,
  units: 4,
  unitType: 'caisse' as const,
  weightKg: '85.00',
  orderRef: 'CMD-2026-8842',
  distanceFromPrevM: 2100,
  timeWindowStart: '10:00:00',
  timeWindowEnd: '12:00:00',
  estimatedArrival: null,
  lat: '48.8750000',
  lng: '2.3580000',
  contactPhone: null,
  requiredPhotos: 2,
  products: [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
  receiptId: null,
  createdAt: new Date(),
} as DeliveryPoint

describe('formatTimeHHMM', () => {
  it('normalise HH:MM:SS → HH:MM', () => {
    assert.equal(formatTimeHHMM('10:00:00'), '10:00')
    assert.equal(formatTimeHHMM('10:00'), '10:00')
  })
})

describe('stopPayloadDiffersFromExisting', () => {
  it('round-trip formulaire manager (créneaux HH:MM) = pas de modification', () => {
    const payload = {
      id: 'del-2',
      name: 'Monoprix Bastille',
      address: '8 Place de la Bastille, 75004 Paris',
      units: 4,
      unitType: 'caisse',
      weightKg: '85.00',
      orderRef: 'CMD-2026-8842',
      timeWindowStart: '10:00',
      timeWindowEnd: '12:00',
      requiredPhotos: 2,
      products: [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
    }
    assert.equal(stopPayloadDiffersFromExisting(monoprixBase, payload), false)
  })

  it('détecte une vraie modification sur arrêt livré', () => {
    const payload = {
      name: 'Monoprix Bastille',
      address: '8 Place de la Bastille, 75004 Paris',
      units: 5,
      unitType: 'caisse',
      weightKg: '85.00',
      orderRef: 'CMD-2026-8842',
      requiredPhotos: 2,
      products: [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
    }
    assert.equal(stopPayloadDiffersFromExisting(monoprixBase, payload), true)
  })
})
