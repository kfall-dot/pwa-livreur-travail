import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SA_FINANCE_REQUIRED_MESSAGE,
  hasComptantLines,
  isComptantPayment,
  saFinanceIncompleteMessage,
} from './saFinanceGate.ts'

const line = {
  label: 'Ciment',
  unitPriceFcfa: 1000,
  supplierName: 'CimIvoire Distribution',
  paymentMode: 'CREDIT',
  attachmentFileName: 'devis.pdf',
}

describe('saFinanceIncompleteMessage', () => {
  it('accepte une ligne complète', () => {
    assert.equal(saFinanceIncompleteMessage([line]), null)
  })

  it('refuse sans fournisseur, paiement ou PJ', () => {
    assert.equal(saFinanceIncompleteMessage([{ ...line, supplierName: '' }]), SA_FINANCE_REQUIRED_MESSAGE)
    assert.equal(saFinanceIncompleteMessage([{ ...line, paymentMode: '  ' }]), SA_FINANCE_REQUIRED_MESSAGE)
    assert.equal(
      saFinanceIncompleteMessage([{ ...line, attachmentFileName: null, attachmentBlobKey: null }]),
      SA_FINANCE_REQUIRED_MESSAGE,
    )
  })

  it('refuse un PU manquant avant le contrôle commercial', () => {
    assert.equal(
      saFinanceIncompleteMessage([{ ...line, unitPriceFcfa: 0 }]),
      'Saisissez le prix unitaire de chaque produit',
    )
  })
})

describe('isComptantPayment', () => {
  it('reconnaît COMPTANT et espèces', () => {
    assert.equal(isComptantPayment('COMPTANT'), true)
    assert.equal(isComptantPayment('espèces'), true)
    assert.equal(isComptantPayment('CREDIT'), false)
  })

  it('détecte une ligne COMPTANT sur l’EB', () => {
    assert.equal(hasComptantLines([{ label: 'Ciment', paymentMode: 'COMPTANT' }]), true)
    assert.equal(hasComptantLines([{ label: 'Ciment', paymentMode: 'CREDIT' }]), false)
  })
})
