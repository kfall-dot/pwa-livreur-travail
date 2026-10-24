import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test('réception : ouvrir ne vide pas les photos, erreur persistante, nouvelle tentative et succès visible', { skip: process.env.RUN_SUPPLIER_RECEPTION_UI !== '1' }, async () => {
  let vite, browser
  try {
    vite = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null }, plugins: [{
      name: 'supplier-reception-test-page', configureServer(server) {
        server.middlewares.use('/__reception-test', async (_req, res, next) => {
          try {
            const html = await server.transformIndexHtml('/__reception-test', '<html><body><div id="root"></div><script type="module">import React from "react"; import {createRoot} from "react-dom/client"; import {SupplierReceptions} from "/src/pages/manager/procurement/SupplierReceptions.tsx"; createRoot(document.getElementById("root")).render(React.createElement(SupplierReceptions, {handleAuth: () => false}));</script></body></html>')
            res.setHeader('Content-Type', 'text/html'); res.end(html)
          } catch (err) { next(err) }
        })
      },
    }] })
    await vite.listen()
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) })
    const page = await browser.newPage()
    let uploads = 0, confirmations = 0, confirmed = false, legacy = false
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      // Toutes les requêtes métier sont simulées ; aucune écriture réelle ni notification.
      if (url.origin !== base) { await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (url.pathname.endsWith('/supplier-receptions')) {
        await route.fulfill({ json: { receptions: confirmed ? [] : [{ id: 'reception-test', supplierName: 'Fournisseur test', siteName: 'Chantier test', tourDate: '2026-10-24', requiredPhotos: 2, units: 15, unitType: 'botte', products: legacy ? null : [{ label: 'Fer', qty: 15, unit: 'botte' }] }] } }); return
      }
      if (url.pathname.endsWith('/chef-photo')) { uploads++; await route.fulfill({ json: { ok: true, photosCount: uploads } }); return }
      if (url.pathname.endsWith('/chef-confirm')) {
        const body = route.request().postDataJSON()
        assert.equal(body.lines[0].productLabel, legacy ? 'Produit commandé' : 'Fer')
        assert.equal(body.lines[0].quantityAccepted, 15)
        confirmations++
        if (confirmations === 1) { await route.fulfill({ status: 422, json: { message: 'Confirmation de test à reprendre' } }); return }
        confirmed = true
        await route.fulfill({ json: { ok: true, receiptId: 'RCT-TEST', certificateUrl: `${base}/certificate-test` } }); return
      }
      await route.fulfill({ status: 404, json: { message: 'Route de test inattendue' } })
    })
    await page.goto(`${base}/__reception-test`)
    const card = page.getByTestId('mgr-supplier-receptions')
    await card.getByRole('button', { name: 'Ouvrir la réception', exact: true }).click()
    const files = [{ name: 'materiel.png', mimeType: 'image/png', buffer: Buffer.from([1]) }, { name: 'BL.png', mimeType: 'image/png', buffer: Buffer.from([2]) }]
    await card.locator('input[type=file]').setInputFiles(files)
    await expect(card.getByRole('button', { name: 'Réception ouverte', exact: true })).toBeDisabled()
    await expect(card.getByText('materiel.png', { exact: false })).toBeVisible()
    assert.equal(uploads, 0, 'la sélection de photos précède leur enregistrement')
    await card.getByRole('button', { name: '✅ Valider la réception', exact: true }).click()
    await expect(card.getByRole('alert')).toContainText('Confirmation de test à reprendre')
    await page.clock.install(); await page.clock.runFor(5_000)
    await expect(card.getByRole('alert')).toContainText('Confirmation de test à reprendre')
    await expect(card.getByText('materiel.png', { exact: false })).toBeVisible()
    assert.equal(uploads, 2)
    await card.getByRole('button', { name: '✅ Valider la réception', exact: true }).click()
    await expect(card.getByRole('status')).toContainText('Réception confirmée — bon RCT-TEST')
    await expect(card.getByRole('link', { name: 'Voir le bon de réception RCT-TEST' })).toBeVisible()
    assert.equal(uploads, 2, 'réessayer ne renvoie pas les pièces déjà enregistrées')
    await expect(card.getByRole('button', { name: 'Ouvrir la réception' })).toHaveCount(0)
    legacy = true; confirmed = false
    await page.reload()
    await card.getByRole('button', { name: 'Ouvrir la réception', exact: true }).click()
    await expect(card.getByText('Produit commandé (15 botte)')).toBeVisible()
    await card.getByRole('button', { name: '✅ Valider la réception', exact: true }).click()
    await expect(card.getByRole('status')).toContainText('Réception confirmée — bon RCT-TEST')
  } finally { await browser?.close(); await vite?.close() }
})
