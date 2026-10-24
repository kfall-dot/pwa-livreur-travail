import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { eq } from 'drizzle-orm'
import { db, getPool } from '../db/index.js'
import { companies, managers, drivers, tours, deliveryPoints, sites, supermarkets, suppliers, purchaseRequests, purchaseRequestLines, purchaseOrders, declarations } from '../db/schema.js'
import { listSiteStock } from '../db/procurementQueries.js'
import { procurementRouter } from '../routes/procurement.js'
import { dailyReportsRouter } from '../routes/dailyReports.js'
import { signManagerToken } from '../middleware/managerAuth.js'

test('stock CdC : réception acceptée seulement, prévisions séparées et périmètre chantier', { skip: process.env.RUN_SITE_STOCK_INTEGRATION !== '1' }, async () => {
  const id = `test-stock-${randomUUID()}`, chefId = `${id}-chef`, otherId = `${id}-other`
  const app = express(); app.use(express.json()); app.use('/procurement', procurementRouter); app.use('/daily-reports', dailyReportsRouter)
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const token = signManagerToken(chefId, `${id}@example.invalid`, id, 'manager', 'site_manager')
  const get = (path: string) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  try {
    await db.insert(companies).values({ id, name: 'Stock test isolé', slug: id })
    for (const managerId of [chefId, otherId]) await db.insert(managers).values({ id: managerId, companyId: id, email: `${managerId}@example.invalid`, name: managerId, passwordHash: 'test', procurementRole: 'site_manager' })
    await db.insert(drivers).values({ id: `${id}-driver`, companyId: id, phone: id, name: 'Fournisseur test', isVirtual: true })
    await db.insert(suppliers).values({ id: `${id}-supplier`, companyId: id, name: 'Fournisseur test' })
    await db.insert(tours).values({ id: `${id}-tour`, companyId: id, driverId: `${id}-driver`, date: '2026-11-01', depotName: 'Fournisseur test', depotAddress: 'Test', depotLat: '0', depotLng: '0', deliverySource: 'supplier' })
    for (const [suffix, managerId] of [['a', chefId], ['b', chefId], ['private', otherId]]) {
      await db.insert(supermarkets).values({ id: `${id}-point-${suffix}`, companyId: id, name: suffix, address: 'Test', contactPhone: '' })
      await db.insert(sites).values({ id: `${id}-site-${suffix}`, companyId: id, name: suffix, address: 'Test', supermarketId: `${id}-point-${suffix}`, managerId })
      await db.insert(purchaseRequests).values({ id: `${id}-pr-${suffix}`, companyId: id, siteId: `${id}-site-${suffix}`, reference: `${id}-EB-${suffix}`, status: 'delivery_scheduled' })
      await db.insert(purchaseRequestLines).values({ id: `${id}-line-${suffix}`, purchaseRequestId: `${id}-pr-${suffix}`, label: 'Ciment', unit: 'sac', quantity: '1000', supplierName: 'Fournisseur test', spendCategory: 'autres_materiaux' })
      await db.insert(purchaseOrders).values({ id: `${id}-po-${suffix}`, companyId: id, purchaseRequestId: `${id}-pr-${suffix}`, supplierId: `${id}-supplier`, reference: `${id}-BC-${suffix}`, docType: 'bc', amountFcfa: '1000', tourId: `${id}-tour` })
    }
    const stop = async (suffix: string, site: string, status: 'delivered' | 'pending' | 'failed', quantity: number, outcome?: 'partial' | 'full' | 'rejected', accepted = quantity) => {
      const stopId = `${id}-stop-${suffix}`
      await db.insert(deliveryPoints).values({ id: stopId, tourId: `${id}-tour`, supermarketId: `${id}-point-${site}`, purchaseOrderId: `${id}-po-${site}`, sequence: 1, name: site, address: 'Test', units: quantity, unitType: 'sac', orderRef: id, lat: '0', lng: '0', status, products: [{ label: 'Ciment', qty: quantity, unit: 'sacs' }] })
      if (outcome) await db.insert(declarations).values({ deliveryId: stopId, outcome, lines: [{ productLabel: 'Ciment', unit: 'sacs', quantityAccepted: accepted, quantityRefused: quantity - accepted }] })
    }
    await stop('accepted-1', 'a', 'delivered', 10, 'partial', 6)
    await stop('accepted-2', 'a', 'delivered', 4, 'full')
    await stop('refused', 'a', 'delivered', 9, 'rejected', 0)
    await stop('partial-zero', 'a', 'delivered', 3, 'partial', 0)
    await stop('planned', 'a', 'pending', 8)
    await stop('failed', 'a', 'failed', 20)
    await stop('other-site', 'b', 'delivered', 50, 'full')
    await stop('private', 'private', 'pending', 99)
    const stock = await listSiteStock(id)
    const material = stock.find(row => row.siteId === `${id}-site-a`)
    assert.equal(material?.onHand, 10, '6 + 4 acceptés, sans refus, commandes ou autres chantiers')
    assert.equal(material?.onOrder, 8)
    assert.equal(material?.unit, 'sacs')
    const response = await get(`/procurement/site-stock?siteId=${id}-site-a`)
    assert.equal(response.status, 200, await response.clone().text())
    const body = await response.json() as { rows: Array<{ siteId: string; onHand: number }>; deliveries: Array<{ id: string; supplierName: string; date: string }> }
    assert.equal(body.rows.length, 1)
    assert.equal(body.rows[0].onHand, 10)
    assert.deepEqual(body.deliveries.map(delivery => delivery.id), [`${id}-stop-planned`])
    assert.equal(body.deliveries[0].supplierName, 'Fournisseur test')
    assert.equal(body.deliveries[0].date, '2026-11-01')
    assert.equal((await get(`/procurement/site-stock?siteId=${id}-site-private`)).status, 403)
    const mySites = await get('/daily-reports/my-sites')
    assert.equal(mySites.status, 200)
    assert.deepEqual((await mySites.json() as { sites: Array<{ id: string }> }).sites.map(site => site.id).sort(), [`${id}-site-a`, `${id}-site-b`])
    await db.update(purchaseOrders).set({ correctionPending: true }).where(eq(purchaseOrders.id, `${id}-po-a`))
    const archived = await get(`/procurement/site-stock?siteId=${id}-site-a`)
    const excluded = await archived.json() as { rows: unknown[]; deliveries: unknown[] }
    assert.deepEqual(excluded, { rows: [], deliveries: [] }, 'un BC archivé ne gonfle pas le stock ni les prévisions')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    const stops = await db.select({ id: deliveryPoints.id }).from(deliveryPoints).where(eq(deliveryPoints.tourId, `${id}-tour`))
    for (const stop of stops) await db.delete(declarations).where(eq(declarations.deliveryId, stop.id))
    await db.delete(deliveryPoints).where(eq(deliveryPoints.tourId, `${id}-tour`))
    await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, id))
    await db.delete(purchaseRequests).where(eq(purchaseRequests.companyId, id))
    await db.delete(tours).where(eq(tours.companyId, id))
    await db.delete(sites).where(eq(sites.companyId, id))
    await db.delete(supermarkets).where(eq(supermarkets.companyId, id))
    await db.delete(drivers).where(eq(drivers.companyId, id))
    await db.delete(suppliers).where(eq(suppliers.companyId, id))
    await db.delete(managers).where(eq(managers.companyId, id))
    await db.delete(companies).where(eq(companies.id, id))
    await getPool().end()
  }
})
