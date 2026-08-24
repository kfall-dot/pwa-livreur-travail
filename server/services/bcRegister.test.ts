import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  bcRegisterInvoice,
  deliveredAmountFcfa,
  formatBcRegisterQuantities,
  paymentModeFromLines,
  quantitiesFromDelivery,
  availableBcRegisterMonths,
  filterBcRegisterByMonth,
  recapCreditBySupplier,
  recapBySupplier,
} from './bcRegister.ts'

describe('bcRegister', () => {
  it('formate les quantités des BC', () => {
    assert.equal(
      formatBcRegisterQuantities([
        { label: 'Ciment', quantity: 50, unit: 'sac' },
        { label: 'Gravier', quantity: 1, unit: 'tonne' },
      ]),
      '50 sac Ciment, 1 tonne Gravier',
    )
  })

  it('CREDIT → facture reçu ; ESPECE → N/A', () => {
    assert.equal(bcRegisterInvoice('CREDIT'), 'reçu')
    assert.equal(bcRegisterInvoice('ESPECE'), 'N/A')
    assert.equal(paymentModeFromLines([{ label: 'Ciment', quantity: 1, unit: 'sac', unitPriceFcfa: 1, paymentMode: 'CREDIT' }]), 'CREDIT')
  })

  it('montant partiel = qté acceptée × PU', () => {
    const amount = deliveredAmountFcfa(80_000, [
      { label: 'Ciment', quantity: 50, unit: 'sac', unitPriceFcfa: 1600, paymentMode: 'CREDIT' },
    ], {
      outcome: 'partial',
      lines: [{ productLabel: 'Ciment', unit: 'sac', quantityAccepted: 10 }],
    })
    assert.equal(amount, 16_000)
  })

  it('quantités livrées si déclaration présente', () => {
    assert.equal(
      quantitiesFromDelivery(
        [{ label: 'Ciment', quantity: 50, unit: 'sac', unitPriceFcfa: 1600 }],
        { outcome: 'full', lines: [{ productLabel: 'Ciment', unit: 'sac', quantityAccepted: 50 }] },
      ),
      '50 sac Ciment',
    )
  })
})

describe('bcRegister mois / recap', () => {
  it('extrait le mois JUILLET et recap CREDIT par fournisseur', () => {
    const rows = [
      {
        date: '04/07/2026',
        supplierName: 'UBH 01',
        bon: 'N° 1351',
        paymentMode: 'CREDIT',
        amountFcfa: 16_000,
        amountLabel: '16 000 FCFA',
        siteName: 'TEBIKOI',
        observation: 'RAS',
      },
      {
        date: '05/07/2026',
        supplierName: 'UBH 01',
        bon: 'N° 1352',
        paymentMode: 'CREDIT',
        amountFcfa: 77_000,
        amountLabel: '77 000 FCFA',
        siteName: 'ANADER',
        observation: 'RAS',
      },
      {
        date: '05/07/2026',
        supplierName: 'PARTICULIER CIMENT',
        bon: 'N° 1354',
        paymentMode: 'ESPECE',
        amountFcfa: 0,
        amountLabel: 'N/A',
        siteName: 'BINGERVILLE',
      },
    ]
    const months = availableBcRegisterMonths(rows)
    assert.deepEqual(months, [{ key: '2026-07', label: 'JUILLET' }])
    const juillet = filterBcRegisterByMonth(rows, '2026-07')
    assert.equal(juillet.length, 3)
    const recap = recapCreditBySupplier(juillet)
    assert.equal(recap.length, 1)
    assert.equal(recap[0]?.supplierName, 'UBH 01')
    assert.equal(recap[0]?.totalFcfa, 93_000)
    assert.equal(recap[0]?.rows.length, 2)
    assert.match(recap[0]?.rows[0]?.bon ?? '', /N° 1351/)
    assert.doesNotMatch(recap[0]?.totalLabel ?? '', /CFA/)
  })

  it('recap tous modes : un tableau par fournisseur (montants attribués)', () => {
    const recap = recapBySupplier([
      {
        date: '04/07/2026',
        supplierName: 'UBH 01',
        bon: 'N° 1351',
        paymentMode: 'CREDIT',
        amountFcfa: 16_000,
        amountLabel: '16 000',
        siteName: 'TEBIKOI',
      },
      {
        date: '05/07/2026',
        supplierName: 'PARTICULIER CIMENT',
        bon: 'N° 1354',
        paymentMode: 'ESPECE',
        amountFcfa: 0,
        amountLabel: '0',
        siteName: 'BINGERVILLE',
      },
    ])
    assert.equal(recap.length, 2)
    assert.ok(recap.some((g) => g.supplierName === 'UBH 01' && g.totalFcfa === 16_000))
  })
})
