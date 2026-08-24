import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchCatalogForStop, pickOtpContactPhone } from './resolveOtpContact.js'
import type { Supermarket } from '../db/schema.js'

describe('pickOtpContactPhone', () => {
  it('utilise le téléphone catalogue en priorité', () => {
    assert.equal(
      pickOtpContactPhone('+2250700000000', '+2250700430402'),
      '+2250700430402',
    )
  })

  it('retombe sur l’arrêt si le catalogue est vide', () => {
    assert.equal(pickOtpContactPhone('+2250102030405', ''), '+2250102030405')
    assert.equal(pickOtpContactPhone('+2250102030405', null), '+2250102030405')
  })

  it('retourne vide si aucun numéro', () => {
    assert.equal(pickOtpContactPhone('', '  '), '')
    assert.equal(pickOtpContactPhone(null, undefined), '')
  })
})

describe('matchCatalogForStop', () => {
  const points = [
    {
      id: 'sm-1',
      name: 'Entrepôt Yopougon',
      address: 'Zone Industrielle, Yopougon',
      contactPhone: '+2250700430402',
      active: true,
    },
  ] as Supermarket[]

  it('retrouve par nom si pas de supermarketId', () => {
    const found = matchCatalogForStop(
      { supermarketId: null, name: 'Entrepôt Yopougon', address: 'autre' },
      null,
      points,
    )
    assert.equal(found?.id, 'sm-1')
  })
})
