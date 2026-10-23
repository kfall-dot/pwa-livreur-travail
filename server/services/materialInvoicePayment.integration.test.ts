import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import express from 'express'
import { eq } from 'drizzle-orm'
import { db, getPool } from '../db/index.js'
import { companies, sites, suppliers, managers, purchaseRequests, purchaseOrders, treasuryOrders, treasuryDisbursements } from '../db/schema.js'
import { transmitMaterialInvoice, payMaterialInvoice, materialPaymentStatuses } from './materialInvoicePayment.js'
import { listTreasuryOrdersToDisburse, listTreasuryPaymentHistory, getSiteBudget, listSiteMonthlyExpenses, listSiteDirectExpenseEvents } from '../db/procurementQueries.js'
import { procurementRouter } from '../routes/procurement.js'
import { signManagerToken } from '../middleware/managerAuth.js'

test('matériaux : transmission, droits, paiement unique et statuts partagés sans doubler le budget', { skip: process.env.RUN_MATERIAL_PAYMENT_INTEGRATION !== '1' }, async () => {
  const pool = getPool()
  const prefix = `test-invoice-${randomUUID()}`
  const companyId = prefix, siteId = `${prefix}-site`, supplierId = `${prefix}-supplier`, requestId = `${prefix}-request`
  const migration = '20261023120000_material_invoice_payments'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(readFileSync(`server/db/migrations/${migration}/migration.sql`, 'utf8'))
    await client.query('INSERT INTO __migration_history(name) VALUES ($1) ON CONFLICT(name) DO NOTHING', [migration])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err }
  finally { client.release() }
  const app = express(); app.use(express.json()); app.use('/procurement', procurementRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  try {
    await db.insert(companies).values({ id: companyId, name: 'Test isolé règlements', slug: companyId })
    await db.insert(sites).values({ id: siteId, companyId, name: 'Chantier test isolé', address: 'Test' })
    await db.insert(suppliers).values({ id: supplierId, companyId, name: 'Fournisseur test' })
    for (const role of ['treasury', 'accountant', 'purchasing'] as const) {
      await db.insert(managers).values({ id: `${prefix}-${role}`, companyId, name: role, email: `${prefix}-${role}@example.invalid`, passwordHash: 'test-only', procurementRole: role })
    }
    await db.insert(purchaseRequests).values({ id: requestId, companyId, siteId, reference: `${prefix}-EB`, status: 'delivered' })
    for (const [i, amount] of [[1, '10000'], [2, '20000']] as const) {
      await db.insert(purchaseOrders).values({ id: `${prefix}-po${i}`, companyId, purchaseRequestId: requestId, supplierId,
        reference: `${prefix}-BC${i}`, docType: 'bc', amountFcfa: amount, saInvoice: `INV${i}`,
        saInvoiceBlobKey: `${prefix}-fake-invoice`, saInvoiceFileName: 'facture.pdf' })
    }
    // L'API interdit le changement manuel, y compris au SA.
    for (const role of ['accountant', 'purchasing']) {
      const token = signManagerToken(`${prefix}-${role}`, `${prefix}-${role}@example.invalid`, companyId)
      const response = await fetch(`http://127.0.0.1:${address.port}/procurement/bc-register/${prefix}-po1`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ invoicePaid: true }),
      })
      assert.equal(response.status, 403)
      const payment = await fetch(`http://127.0.0.1:${address.port}/procurement/treasury/not-an-id/disburse`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
      })
      assert.equal(payment.status, 403)
    }
    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 0)
    await assert.rejects(() => transmitMaterialInvoice(`${prefix}-other-company`, `${prefix}-po1`), /introuvable/)
    await Promise.all([transmitMaterialInvoice(companyId, `${prefix}-po1`), transmitMaterialInvoice(companyId, `${prefix}-po1`)])
    await transmitMaterialInvoice(companyId, `${prefix}-po2`)
    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 2, 'retransmettre ne double pas la file')
    assert.equal((await materialPaymentStatuses(companyId)).get(requestId), 'pending')
    const beforeBudget = await getSiteBudget(companyId, siteId)
    const beforeMonthly = await listSiteMonthlyExpenses(companyId, new Date().toISOString().slice(0, 7))
    const input = { companyId, treasuryOrderId: `invoice-${prefix}-po1`, managerId: `${prefix}-treasury`,
      method: 'bank' as const, paidAt: new Date(), invoice: { blobKey: `${prefix}-fake-proof`, fileName: 'preuve.pdf', contentType: 'application/pdf' } }
    await assert.rejects(() => payMaterialInvoice({ ...input, invoice: null }), /obligatoire/)
    await assert.rejects(() => payMaterialInvoice({ ...input, amountFcfa: 1 }), /montant/)
    const concurrent = await Promise.allSettled([payMaterialInvoice(input), payMaterialInvoice(input)])
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1, 'un seul paiement concurrent')
    assert.equal(concurrent.find(r => r.status === 'fulfilled')?.status === 'fulfilled' && (concurrent.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof payMaterialInvoice>>>).value.allPaid, false)
    assert.equal((await materialPaymentStatuses(companyId)).get(requestId), 'partial')
    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 1)
    await payMaterialInvoice({ ...input, treasuryOrderId: `invoice-${prefix}-po2` })
    assert.equal((await materialPaymentStatuses(companyId)).get(requestId), 'paid')
    const token = signManagerToken(`${prefix}-accountant`, `${prefix}-accountant@example.invalid`, companyId)
    for (const path of ['/requests', `/requests/${requestId}`]) {
      const response = await fetch(`http://127.0.0.1:${address.port}/procurement${path}`, { headers: { Authorization: `Bearer ${token}` } })
      assert.equal(response.status, 200)
      const body = await response.json() as { request?: { paymentStatus: string }; requests?: Array<{ id: string; paymentStatus: string }> }
      assert.equal(body.request?.paymentStatus ?? body.requests?.find(r => r.id === requestId)?.paymentStatus, 'paid')
    }

    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 0)
    assert.equal((await listTreasuryPaymentHistory(companyId)).length, 2)
    const orders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, companyId))
    assert.ok(orders.every(po => po.saInvoicePaid), 'SA et Comptabilité lisent le même statut payé')
    const [request] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId))
    assert.equal(request.status, 'delivered', 'la livraison et les stocks sont préservés')
    const afterBudget = await getSiteBudget(companyId, siteId)
    assert.equal(afterBudget?.engagedFcfa, beforeBudget?.engagedFcfa)
    assert.equal(afterBudget?.realizedFcfa, beforeBudget?.realizedFcfa)
    assert.deepEqual(await listSiteMonthlyExpenses(companyId, new Date().toISOString().slice(0, 7)), beforeMonthly)
    assert.deepEqual(await listSiteDirectExpenseEvents(companyId, siteId), [], 'pas de seconde dépense via le paiement matériaux')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    // Uniquement les données fictives de cette compagnie UUID, jamais les données métier.
    await db.delete(treasuryDisbursements).where(eq(treasuryDisbursements.companyId, companyId))
    await db.delete(treasuryOrders).where(eq(treasuryOrders.companyId, companyId))
    await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, companyId))
    await db.delete(purchaseRequests).where(eq(purchaseRequests.companyId, companyId))
    await db.delete(managers).where(eq(managers.companyId, companyId))
    await db.delete(suppliers).where(eq(suppliers.companyId, companyId))
    await db.delete(sites).where(eq(sites.companyId, companyId))
    await db.delete(companies).where(eq(companies.id, companyId))
    await pool.end()
  }
})
