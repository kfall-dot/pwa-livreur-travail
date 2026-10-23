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
    assert.match(saFinanceIncompleteMessage([{ ...line, supplierName: '' }]) ?? '', /ligne 1 « Ciment » : fournisseur/)
    assert.match(saFinanceIncompleteMessage([{ ...line, paymentMode: '  ' }]) ?? '', /ligne 1 « Ciment » : mode de paiement/)
    const missingAttachment = saFinanceIncompleteMessage([{ ...line, attachmentFileName: null, attachmentBlobKey: null }]) ?? ''
    assert.ok(missingAttachment.startsWith(SA_FINANCE_REQUIRED_MESSAGE))
    assert.match(missingAttachment, /ligne 1 « Ciment » : pièce jointe/)
  })

  it('indique les numéros des lignes concernées et accepte une facture partagée', () => {
    const shared = { ...line, attachmentFileName: null, attachmentBlobKey: 'shared-invoice' }
    assert.equal(saFinanceIncompleteMessage([shared, { ...shared, label: 'Fer' }]), null)
    const message = saFinanceIncompleteMessage([line, { ...line, label: 'Fer', supplierName: '', paymentMode: '' }]) ?? ''
    assert.match(message, /ligne 2 « Fer » : fournisseur, mode de paiement/)
    assert.doesNotMatch(message, /ligne 1/)
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
