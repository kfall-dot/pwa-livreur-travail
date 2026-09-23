import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryBucket } from './deliveryBucket.ts'

describe('deliveryBucket — classement livrée / écart (source unique tuiles + chips)', () => {
  it('livraison complète → delivered', () => {
    assert.equal(deliveryBucket({ status: 'delivered', declarationOutcome: 'full' }), 'delivered')
    assert.equal(deliveryBucket({ status: 'delivered' }), 'delivered')
    assert.equal(deliveryBucket({ status: 'validated' }), 'delivered')
  })

  it('partielle → failed (écart) même quand l’arrêt est passé à « delivered »', () => {
    assert.equal(deliveryBucket({ status: 'delivered', declarationOutcome: 'partial' }), 'failed')
  })

  it('refus « rejected » (valeur canonique du formulaire livreur) → failed, jamais livrée', () => {
    assert.equal(deliveryBucket({ status: 'delivered', declarationOutcome: 'rejected' }), 'failed')
  })

  it('refus « refused » → failed (repli pour données anciennes)', () => {
    assert.equal(deliveryBucket({ status: 'delivered', declarationOutcome: 'refused' }), 'failed')
  })

  it('statut failed → failed même sans déclaration', () => {
    assert.equal(deliveryBucket({ status: 'failed' }), 'failed')
  })

  it('otp / en cours / à démarrer', () => {
    assert.equal(deliveryBucket({ status: 'otp_sent' }), 'otp')
    assert.equal(deliveryBucket({ status: 'in_progress' }), 'progress')
    assert.equal(deliveryBucket({ status: 'pending' }), 'pending')
  })
})
