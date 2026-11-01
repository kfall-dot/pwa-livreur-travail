import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryBucket, deliveryReceptionLabel, deliveryInvoicePaymentLabel } from './deliveryBucket.ts'

describe('réception et paiement indépendants', () => {
  it('une réception partielle reste partielle même lorsque le BC est payé', () => {
    assert.equal(deliveryReceptionLabel('delivered', 'partial'), 'Réception partielle')
    assert.equal(deliveryInvoicePaymentLabel(true, 'paid'), 'Payé')
  })
  it('une livraison échouée ou refusée n’est pas une réception partielle', () => {
    assert.equal(deliveryReceptionLabel('failed'), 'Livraison échouée')
    assert.equal(deliveryReceptionLabel('delivered', 'rejected'), 'Réception refusée')
    assert.equal(deliveryReceptionLabel('delivered', 'refused'), 'Réception refusée')
  })
  it('un BC livré n’est pas considéré payé sans confirmation financière', () => {
    assert.equal(deliveryReceptionLabel('delivered', 'full'), 'Livrée')
    assert.equal(deliveryInvoicePaymentLabel(true, 'due'), 'À payer')
    assert.equal(deliveryInvoicePaymentLabel(true, 'untransmitted'), 'Non transmis')
    assert.equal(deliveryInvoicePaymentLabel(true, undefined), 'Non renseigné')
    assert.equal(deliveryInvoicePaymentLabel(false, null), 'Sans BC')
  })
})

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
