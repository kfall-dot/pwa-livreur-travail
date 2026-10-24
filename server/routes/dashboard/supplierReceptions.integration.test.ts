import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import { eq } from 'drizzle-orm'
import { db, getPool } from '../../db/index.js'
import { companies, managers, drivers, tours, deliveryPoints, sites, supermarkets, photoHashes } from '../../db/schema.js'
import { getPhotoCount } from '../../db/queries.js'
import { deliveriesRoutes } from './deliveries.routes.js'
import { signManagerToken } from '../../middleware/managerAuth.js'
import { savePhotoLocal } from '../../lib/deliveryPhotoLocal.js'

test('réception fournisseur : fichiers sans hash comptés, doublons, reprise et erreur stockage', { skip: process.env.RUN_SUPPLIER_RECEPTION_INTEGRATION !== '1' }, async () => {
  const id = `test-reception-${randomUUID()}`, managerId = `${id}-chef`, stopId = `${id}-stop`
  const folder = mkdtempSync(path.join(tmpdir(), 'supplier-reception-'))
  const previous = { PHOTOS_DIR: process.env.PHOTOS_DIR, PHOTO_STORAGE: process.env.PHOTO_STORAGE }
  process.env.PHOTOS_DIR = path.join(folder, 'photos'); process.env.PHOTO_STORAGE = 'local'
  const app = express(); app.use(express.json()); app.use(deliveriesRoutes)
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const token = signManagerToken(managerId, `${id}@example.invalid`, id)
  const upload = (bytes: Uint8Array) => { const body = new FormData(); body.append('photo', new Blob([bytes], { type: 'image/png' }), 'photo.png'); return fetch(`http://127.0.0.1:${address.port}/dashboard/deliveries/${stopId}/chef-photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }) }
  const confirm = () => fetch(`http://127.0.0.1:${address.port}/dashboard/deliveries/${stopId}/chef-confirm`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'full', lines: [{ productLabel: 'Bois', unit: 'u', quantityAccepted: 2, quantityRefused: 0, justification: '' }] }) })
  try {
    await db.insert(companies).values({ id, name: 'Test isolé réception', slug: id })
    await db.insert(managers).values({ id: managerId, companyId: id, email: `${id}@example.invalid`, name: 'Chef test', passwordHash: 'test', procurementRole: 'site_manager' })
    await db.insert(drivers).values({ id: `${id}-driver`, companyId: id, phone: id, name: 'Fournisseur test', isVirtual: true })
    await db.insert(supermarkets).values({ id: `${id}-point`, companyId: id, name: 'Chantier test', address: 'Test', contactPhone: '' })
    await db.insert(sites).values({ id: `${id}-site`, companyId: id, name: 'Chantier test', address: 'Test', supermarketId: `${id}-point`, managerId })
    await db.insert(tours).values({ id: `${id}-tour`, companyId: id, driverId: `${id}-driver`, date: '2026-10-23', depotName: 'Fournisseur', depotAddress: 'Test', depotLat: '0', depotLng: '0', deliverySource: 'supplier' })
    await db.insert(deliveryPoints).values({ id: stopId, tourId: `${id}-tour`, supermarketId: `${id}-point`, sequence: 1, name: 'Chantier test', address: 'Test', units: 2, unitType: 'u', orderRef: id, lat: '0', lng: '0', requiredPhotos: 3, products: [{ label: 'Bois', qty: 2, unit: 'u' }] })
    const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64'))
    const first = await upload(bytes)
    assert.equal(first.status, 200, await first.clone().text())
    assert.equal((await first.json() as { photosCount: number }).photosCount, 1)
    assert.equal((await upload(bytes)).status, 409)
    const second = await upload(new Uint8Array([...bytes, 1]))
    assert.equal(second.status, 200)
    assert.equal((await second.json() as { photosCount: number }).photosCount, 2)
    assert.equal(await getPhotoCount(stopId), 2)
    const incomplete = await confirm()
    assert.equal(incomplete.status, 422)
    assert.match((await incomplete.json() as { message: string }).message, /2\/3/)
    // Ancienne photo réellement stockée mais non indexée : elle reste utilisable.
    savePhotoLocal(`${stopId}/legacy`, Buffer.from(bytes), { deliveryId: stopId })
    await db.update(deliveryPoints).set({ requiredPhotos: 4 }).where(eq(deliveryPoints.id, stopId))
    const recovered = await confirm()
    assert.equal(recovered.status, 422)
    assert.match((await recovered.json() as { message: string }).message, /3\/4/)
    const blockedPath = path.join(folder, 'not-a-directory'); writeFileSync(blockedPath, 'test')
    process.env.PHOTOS_DIR = blockedPath
    const failed = await upload(new Uint8Array([...bytes, 2]))
    assert.equal(failed.status, 500)
    assert.equal(await getPhotoCount(stopId), 2, 'une erreur de stockage ne crée pas de fausse photo')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await db.delete(photoHashes).where(eq(photoHashes.deliveryId, stopId))
    await db.delete(deliveryPoints).where(eq(deliveryPoints.tourId, `${id}-tour`))
    await db.delete(tours).where(eq(tours.companyId, id))
    await db.delete(sites).where(eq(sites.companyId, id))
    await db.delete(supermarkets).where(eq(supermarkets.companyId, id))
    await db.delete(drivers).where(eq(drivers.companyId, id))
    await db.delete(managers).where(eq(managers.companyId, id))
    await db.delete(companies).where(eq(companies.id, id))
    await getPool().end()
    for (const key of ['PHOTOS_DIR', 'PHOTO_STORAGE'] as const) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
    rmSync(folder, { recursive: true, force: true })
  }
})
