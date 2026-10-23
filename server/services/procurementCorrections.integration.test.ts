import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import express from 'express'
import { eq } from 'drizzle-orm'
import { db, getPool } from '../db/index.js'
import { companies, sites, suppliers, managers, purchaseRequests, purchaseRequestLines, approvalSteps, purchaseOrders, treasuryOrders, treasuryDisbursements, procurementCorrections, purchaseRequestVersions } from '../db/schema.js'
import { correctionContext, requestCorrection, resubmitCorrection, approveCorrection, finalRefusal, archivedCorrectionDocument } from './procurementCorrections.js'
import { payMaterialInvoice } from './materialInvoicePayment.js'
import { getSiteBudget, listTreasuryOrdersToDisburse } from '../db/procurementQueries.js'
import { procurementRouter } from '../routes/procurement.js'
import { signManagerToken } from '../middleware/managerAuth.js'
import { disburseTreasuryOrder } from './procurementWorkflow.js'

test('corrections : droits, reprise, visas, chef SA, archives et paiement suspendu', { skip: process.env.RUN_PROCUREMENT_CORRECTION_INTEGRATION !== '1' }, async () => {
  const pool = getPool(), companyId = `test-correction-${randomUUID()}`, siteId = `${companyId}-site`, supplierId = `${companyId}-supplier`
  const migration = '20261024120000_procurement_corrections'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(readFileSync(`server/db/migrations/${migration}/migration.sql`, 'utf8'))
    await client.query('INSERT INTO __migration_history(name) VALUES ($1) ON CONFLICT(name) DO NOTHING', [migration])
    const followup = '20261024121000_correction_head_review'
    await client.query(readFileSync(`server/db/migrations/${followup}/migration.sql`, 'utf8'))
    await client.query('INSERT INTO __migration_history(name) VALUES ($1) ON CONFLICT(name) DO NOTHING', [followup])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  const person = (name: string, procurementRole: 'purchasing' | 'controle_gestion' | 'daf' | 'technical_director' | 'treasury' | 'pdg' | 'site_manager', parent: string | null = null) => ({ id: `${companyId}-${name}`, companyId, procurementRole, saSupervisorId: parent })
  const head = person('head', 'purchasing'), adj = person('adj', 'purchasing', head.id), cdg = person('cdg', 'controle_gestion'), daf = person('daf', 'daf'), dt = person('dt', 'technical_director'), treasury = person('treasury', 'treasury'), pdg = person('pdg', 'pdg'), cdc = person('cdc', 'site_manager')
  const app = express(); app.use(express.json()); app.use('/procurement', procurementRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const http = (id: string, actor: typeof adj, suffix: string, method = 'GET', body?: object) => fetch(`http://127.0.0.1:${address.port}/procurement/requests/${id}${suffix}`, {
    method, headers: { Authorization: `Bearer ${signManagerToken(actor.id, `${actor.id}@example.invalid`, companyId)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const ask = (id: string, actor = cdg, kind: 'commercial' | 'documents' | 'need' | 'bc' = 'commercial', target = adj.id) => requestCorrection({ companyId, requestId: id, actor, kind, targetManagerId: target, reason: 'Motif test obligatoire', pinVerified: true, ip: '127.0.0.1' })
  const line = (id: string, price = 100) => ({ id: `${id}-line`, label: 'Bois', quantity: 2, unit: 'u', unitPriceFcfa: price, supplierName: 'Fournisseur test', paymentMode: 'CREDIT', spendCategory: 'autres_materiaux', observation: '', attachmentBlobKey: `${id}-proof`, attachmentFileName: 'piece.pdf', attachmentContentType: 'application/pdf' })
  const submit = (id: string, actor = adj, price = 100) => resubmitCorrection({ companyId, requestId: id, actor, lines: [line(id, price)], comment: 'Correction effectuée', pinVerified: true, ip: '127.0.0.1' })
  const create = async (suffix: string, status: 'cdg_review' | 'delivered' | 'daf_review' | 'dt_review' = 'cdg_review', creator = adj.id) => {
    const id = `${companyId}-${suffix}`
    await db.insert(purchaseRequests).values({ id, companyId, siteId, reference: id, status, createdByManagerId: creator, saReviewerId: head.id, totalAmountFcfa: '200' })
    const l = line(id)
    await db.insert(purchaseRequestLines).values({ ...l, purchaseRequestId: id, quantity: '2', unitPriceFcfa: '100', amountFcfa: '200' })
    await db.insert(approvalSteps).values({ id: `${id}-visa`, purchaseRequestId: id, managerId: cdg.id, role: 'controle_gestion', decision: 'approved', pinVerified: true })
    return id
  }
  try {
    await db.insert(companies).values({ id: companyId, name: 'Test isolé corrections', slug: companyId })
    await db.insert(sites).values({ id: siteId, companyId, name: 'Chantier test', address: 'Test' })
    await db.insert(suppliers).values({ id: supplierId, companyId, name: 'Fournisseur test' })
    for (const actor of [head, adj, cdg, daf, dt, treasury, pdg, cdc]) await db.insert(managers).values({ ...actor, name: actor.id, email: `${actor.id}@example.invalid`, passwordHash: 'test-only' })
    const id = await create('economic')
    await db.insert(approvalSteps).values({ id: `${id}-dt-visa`, purchaseRequestId: id, managerId: dt.id, role: 'technical_director', decision: 'approved', pinVerified: true })
    await db.insert(purchaseOrders).values({ id: `${id}-bc`, companyId, purchaseRequestId: id, supplierId, reference: `${id}-BC`, docType: 'bc', amountFcfa: '200', pdfHtml: '<html>Original BC</html>' })
    await db.insert(treasuryOrders).values({ id: `${id}-bt`, companyId, purchaseRequestId: id, reference: `${id}-BT`, amountFcfa: '200', pdfHtml: '<html>Original BT</html>' })
    await assert.rejects(() => ask(id, daf), /étape/)
    await assert.rejects(() => ask(id, cdg, 'commercial', dt.id), /Destinataire/)
    await assert.rejects(() => correctionContext('other-company', id, cdg), /introuvable/)
    const c = await ask(id)
    const claim = await http(id, adj, '/lock', 'POST', {})
    assert.equal(claim.status, 200, await claim.text())
    const blocked = await http(id, cdg, '/approve', 'POST', {})
    assert.equal(blocked.status, 409, 'aucune approbation pendant le retour')
    const wrong = await http(id, head, '/correction/resubmit', 'POST', { lines: [line(id)], comment: 'Correction' })
    assert.equal(wrong.status, 403)
    await http(id, adj, '/lock', 'DELETE')
    await assert.rejects(() => ask(id), /changé/)
    await assert.rejects(() => submit(id, head), /destinataire/)
    assert.equal((await correctionContext(companyId, id, adj)).canEdit, true)
    assert.match(await archivedCorrectionDocument(companyId, id, c.id, `${id}-bc`), /Original BC/)
    const res = await submit(id, adj, 120)
    assert.equal(res.changed, true)
    assert.equal(res.nextStatus, 'correction_head_review')
    assert.equal(res.request.version, 2)
    assert.equal((await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, `${id}-bc`)))[0].correctionPending, true)
    assert.equal((await db.select().from(treasuryOrders).where(eq(treasuryOrders.id, `${id}-bt`)))[0].status, 'cancelled')
    assert.ok((await db.select().from(approvalSteps).where(eq(approvalSteps.id, `${id}-visa`)))[0].invalidatedAt)
    assert.equal((await db.select().from(approvalSteps).where(eq(approvalSteps.id, `${id}-dt-visa`)))[0].invalidatedAt, null, 'le besoin DT inchangé conserve son visa')
    await assert.rejects(() => approveCorrection(companyId, id, adj, ''), /chef SA/)
    assert.equal((await correctionContext(companyId, id, head)).canAsk, true, 'le chef peut retourner à nouveau')
    await ask(id, head, 'commercial')
    await submit(id, adj, 120)
    const approved = await approveCorrection(companyId, id, head, '')
    assert.equal(approved.request.status, 'submitted')
    assert.equal(approved.request.correctionTargetId, null)
    await assert.rejects(() => approveCorrection(companyId, id, head, ''), /chef SA/)

    const bcId = await create('bc-document')
    await db.update(purchaseRequests).set({ status: 'bc_head_review' }).where(eq(purchaseRequests.id, bcId))
    await db.insert(purchaseOrders).values({ id: `${bcId}-bc`, companyId, purchaseRequestId: bcId, supplierId, reference: `${bcId}-BC`, docType: 'bc', amountFcfa: '200', pdfHtml: '<html>Avant correction BC</html>', saApprovalRequired: true })
    const bcCorrection = await ask(bcId, head, 'bc')
    const bcResult = await resubmitCorrection({ companyId, requestId: bcId, actor: adj, lines: [{ ...line(bcId), observation: 'Livraison mardi' }], comment: 'Précision BC', pinVerified: false, ip: '' })
    assert.equal(bcResult.changed, false)
    const [correctedBc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, `${bcId}-bc`))
    assert.match(correctedBc.pdfHtml!, /Livraison mardi/)
    assert.equal(correctedBc.saHeadSignature, null)
    assert.match(await archivedCorrectionDocument(companyId, bcId, bcCorrection.id, correctedBc.id), /Avant correction BC/)
    assert.equal((await approveCorrection(companyId, bcId, head, '')).request.status, 'bc_head_review', 'la signature du BC reste obligatoire après validation de la correction')

    const docId = await create('documents', 'delivered')
    await db.insert(purchaseOrders).values({ id: `${docId}-bc`, companyId, purchaseRequestId: docId, supplierId, reference: `${docId}-BC`, docType: 'bc', amountFcfa: '200', saInvoice: 'INV', saInvoiceBlobKey: 'fake', saInvoiceTransmitted: true })
    await db.insert(treasuryOrders).values({ id: `${docId}-payment`, companyId, purchaseRequestId: docId, purchaseOrderId: `${docId}-bc`, purpose: 'material_invoice', reference: 'INV', amountFcfa: '200', status: 'issued' })
    const beforeBudget = await getSiteBudget(companyId, siteId)
    await ask(docId, treasury, 'documents', head.id)
    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 0)
    await assert.rejects(() => payMaterialInvoice({ companyId, treasuryOrderId: `${docId}-payment`, managerId: treasury.id, method: 'bank', paidAt: new Date(), invoice: { blobKey: 'fake', fileName: 'proof.pdf', contentType: 'application/pdf' } }), /correction/)
    await assert.rejects(() => submit(docId, head, 120), /documentaire/)
    await submit(docId, head)
    const [docRequest] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, docId))
    assert.equal(docRequest.status, 'delivered')
    assert.equal((await db.select().from(approvalSteps).where(eq(approvalSteps.id, `${docId}-visa`)))[0].invalidatedAt, null)
    assert.equal((await getSiteBudget(companyId, siteId))?.realizedFcfa, beforeBudget?.realizedFcfa)
    assert.equal((await listTreasuryOrdersToDisburse(companyId)).length, 1)
    await db.insert(treasuryDisbursements).values({ id: `${docId}-paid`, companyId, treasuryOrderId: `${docId}-payment`, amountFcfa: '200', method: 'bank', paidAt: new Date() })
    await assert.rejects(() => ask(docId, treasury, 'documents', head.id), /paiement existe/)

    const laborId = await create('labor', 'cdg_review', dt.id)
    await db.update(purchaseRequests).set({ status: 'bt_ready' }).where(eq(purchaseRequests.id, laborId))
    await db.update(purchaseRequestLines).set({ spendCategory: 'mo_divers', paymentMode: 'COMPTANT' }).where(eq(purchaseRequestLines.purchaseRequestId, laborId))
    await db.insert(treasuryOrders).values({ id: `${laborId}-bt`, companyId, purchaseRequestId: laborId, reference: `${laborId}-BT`, amountFcfa: '200', status: 'issued' })
    await ask(laborId, treasury, 'documents', dt.id)
    await assert.rejects(() => disburseTreasuryOrder({ companyId, treasuryOrderId: `${laborId}-bt`, managerId: treasury.id, method: 'bank', paidAt: new Date(), invoice: { blobKey: 'fake', fileName: 'proof.pdf', contentType: 'application/pdf' } }), /correction/)

    const needId = await create('need', 'dt_review', cdc.id)
    await ask(needId, dt, 'need', cdc.id)
    await assert.rejects(() => submit(needId, cdc, 110), /chiffrage reste/)
    const need = await resubmitCorrection({ companyId, requestId: needId, actor: cdc, lines: [{ ...line(needId), quantity: 3 }], comment: 'Quantité corrigée', pinVerified: false, ip: '' })
    assert.equal(need.nextStatus, 'dt_review')
    const refusalId = await create('refusal', 'daf_review')
    const forbidden = await http(refusalId, cdg, '/reject', 'POST', { comment: 'Non' })
    assert.equal(forbidden.status, 403)
    const noPin = await http(refusalId, daf, '/reject', 'POST', { comment: 'Non' })
    assert.equal(noPin.status, 401)
    await assert.rejects(() => finalRefusal({ companyId, requestId: refusalId, managerId: cdg.id, procurementRole: 'controle_gestion', comment: 'Non', pinVerified: true }), /DAF et le PDG/)
    await assert.rejects(() => finalRefusal({ companyId, requestId: refusalId, managerId: daf.id, procurementRole: 'daf', comment: 'Non' }), /NIP/)
    assert.equal((await finalRefusal({ companyId, requestId: refusalId, managerId: daf.id, procurementRole: 'daf', comment: 'Refus définitif motivé', pinVerified: true })).status, 'rejected')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await pool.query('DELETE FROM procurement_edit_locks WHERE company_id=$1', [companyId])
    await db.delete(procurementCorrections).where(eq(procurementCorrections.companyId, companyId))
    await db.delete(treasuryDisbursements).where(eq(treasuryDisbursements.companyId, companyId))
    await db.delete(treasuryOrders).where(eq(treasuryOrders.companyId, companyId))
    await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, companyId))
    const requests = await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.companyId, companyId))
    for (const r of requests) { await db.delete(purchaseRequestVersions).where(eq(purchaseRequestVersions.purchaseRequestId, r.id)); await db.delete(approvalSteps).where(eq(approvalSteps.purchaseRequestId, r.id)) }
    await db.delete(purchaseRequests).where(eq(purchaseRequests.companyId, companyId))
    await db.delete(managers).where(eq(managers.companyId, companyId))
    await db.delete(suppliers).where(eq(suppliers.companyId, companyId))
    await db.delete(sites).where(eq(sites.companyId, companyId))
    await db.delete(companies).where(eq(companies.id, companyId))
    await pool.end()
  }
})
