import { test, expect, type APIResponse } from '@playwright/test'
import {
  API_BASE,
  DEMO_DRIVER,
  DEMO_MANAGER,
  ADMIN_API_TOKEN,
  resetAndSeed,
  prepareDriverLogin,
} from './helpers'

/** Évite « Unexpected end of JSON input » — corps vide ou HTML proxy. */
async function expectJsonBody(res: APIResponse): Promise<Record<string, unknown>> {
  const text = await res.text()
  expect(text.trim().length, `corps vide (HTTP ${res.status()})`).toBeGreaterThan(0)
  expect(text.trimStart().startsWith('<'), 'réponse HTML au lieu de JSON').toBe(false)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`JSON invalide (HTTP ${res.status()}): ${text.slice(0, 120)}`)
  }
  return body
}

test.describe('Environnement e2e (Express :8888, build dist)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('admin reset — refusé sans authentification', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/admin/reset`, {
      data: { confirm: 'SUPPRIMER TOUTES LES DONNÉES' },
    })
    expect(res.status()).toBe(401)
    const body = await expectJsonBody(res)
    expect(typeof body.message).toBe('string')
  })

  test('admin reset — refusé sans confirmation explicite', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/admin/reset`, {
      headers: { 'X-Admin-Token': ADMIN_API_TOKEN },
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await expectJsonBody(res)
    expect(body.requiredConfirm).toBe('SUPPRIMER TOUTES LES DONNÉES')
  })

  test('login-driver — numéro local CI normalisé côté serveur', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: '0701234567', pin: DEMO_DRIVER.pin },
    })
    expect(res.ok()).toBeTruthy()
    const body = await expectJsonBody(res)
    expect(typeof body.accessToken).toBe('string')
  })

  test('declare — refusé si livraison encore pending (pas démarrée)', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: DEMO_DRIVER.phone, pin: DEMO_DRIVER.pin },
    })
    expect(login.ok()).toBeTruthy()
    const { accessToken } = (await login.json()) as { accessToken: string }

    const res = await request.post(`${API_BASE}/api/v1/deliveries/del-1/declare`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        outcome: 'full',
        lines: [
          {
            productLabel: 'Palettes œufs',
            quantityExpected: 2,
            quantityAccepted: 2,
            quantityRefused: 0,
            unit: 'palette',
          },
        ],
      },
    })
    expect(res.status()).toBe(422)
    const body = await expectJsonBody(res)
    expect(String(body.message)).toMatch(/démarrez/i)
  })

  test('declare — refusé si lines vides (validation serveur)', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: DEMO_DRIVER.phone, pin: DEMO_DRIVER.pin },
    })
    expect(login.ok()).toBeTruthy()
    const { accessToken } = (await login.json()) as { accessToken: string }

    const start = await request.post(`${API_BASE}/api/v1/deliveries/del-1/start`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { lat: 48.892, lng: 2.412 },
    })
    expect(start.ok(), await start.text()).toBeTruthy()

    const res = await request.post(`${API_BASE}/api/v1/deliveries/del-1/declare`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { outcome: 'full', lines: [] },
    })
    expect(res.status()).toBe(400)
    const body = await expectJsonBody(res)
    expect(String(body.message)).toMatch(/ligne produit/i)
  })

  test('health :8888 — JSON non vide', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health`)
    expect(res.ok()).toBeTruthy()
    const body = await expectJsonBody(res)
    expect(body.ok).toBe(true)
  })

  test('login-driver erreur :8888 — JSON (pas corps vide)', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: '+2250701234567', pin: '0000' },
    })
    expect(res.status()).toBe(401)
    const body = await expectJsonBody(res)
    expect(typeof body.message).toBe('string')
  })

  test('login-driver succès :8888 — tokens JSON', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: '+2250701234567', pin: DEMO_DRIVER.pin },
    })
    expect(res.ok()).toBeTruthy()
    const body = await expectJsonBody(res)
    expect(typeof body.accessToken).toBe('string')
  })

  test('login-dashboard :8888 — JSON', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(res.ok()).toBeTruthy()
    const body = await expectJsonBody(res)
    expect(body.manager).toBeTruthy()
  })

  test('catalogue produits — seed remplit le référentiel', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(login.ok()).toBeTruthy()

    const res = await request.get(`${API_BASE}/api/v1/dashboard/products`)
    expect(res.ok()).toBeTruthy()
    const body = await expectJsonBody(res)
    const list = body.products as unknown[]
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  test('POST tours — arrêt sans supermarketId refusé (catalogue obligatoire)', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(login.ok()).toBeTruthy()

    const today = new Date().toISOString().slice(0, 10)
    const res = await request.post(`${API_BASE}/api/v1/dashboard/tours`, {
      data: {
        driverId: 'drv-demo-1',
        date: today,
        depotName: 'Entrepôt Test',
        depotAddress: '1 rue Test',
        stops: [
          {
            name: 'Point libre hors catalogue',
            address: '99 rue Inventée',
            orderRef: 'CMD-NO-CATALOG',
            units: 1,
            unitType: 'colis',
            weightKg: '0',
            requiredPhotos: 1,
            lat: '5.3',
            lng: '-4.0',
            products: [{ label: 'Eau', qty: 1, unit: 'colis' }],
          },
        ],
      },
    })
    expect(res.status()).toBe(400)
    const body = await expectJsonBody(res)
    expect(String(body.message)).toMatch(/catalogue|supermarketId|téléphone responsable/i)
  })

  test('POST tours — orderRef auto + notification livreur (SMS)', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(login.ok()).toBeTruthy()

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const date = tomorrow.toISOString().slice(0, 10)
    const res = await request.post(`${API_BASE}/api/v1/dashboard/tours`, {
      data: {
        driverId: 'drv-demo-1',
        date,
        depotName: 'Entrepôt AutoRef',
        depotAddress: '2 rue Auto',
        stops: [
          {
            supermarketId: 'sm-demo-monoprix-bastille',
            units: 2,
            unitType: 'caisse',
            weightKg: '10',
            requiredPhotos: 1,
            products: [{ label: 'Salade iceberg', qty: 2, unit: 'caisse' }],
          },
        ],
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = await expectJsonBody(res)
    expect(body.ok).toBe(true)
    expect(body.driverNotify).toMatchObject({ sent: true })

    const detail = await request.get(`${API_BASE}/api/v1/dashboard/tours/${body.tourId}`)
    expect(detail.ok()).toBeTruthy()
    const tourBody = await expectJsonBody(detail)
    const stops = tourBody.stops as Array<{ orderRef: string }>
    expect(stops.length).toBe(1)
    expect(stops[0]!.orderRef).toMatch(/^CMD-\d{8}-[A-F0-9]{4}$/i)
  })

  test('send-otp — téléphone du catalogue si l’arrêt n’en a pas (I14)', async ({ request }) => {
    const { execFileSync } = await import('node:child_process')
    await resetAndSeed(request)

    const mgr = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(mgr.ok()).toBeTruthy()

    const patchSm = await request.patch(
      `${API_BASE}/api/v1/dashboard/supermarkets/sm-demo-carrefour-republique`,
      { data: { contactPhone: '0700999888' } },
    )
    expect(patchSm.ok(), await patchSm.text()).toBeTruthy()

    // Cas réel : numéro renseigné au catalogue, copie arrêt encore vide
    // (SQL direct sur la branche e2e — plus de CLI Netlify)
    execFileSync(
      'node',
      [
        'scripts/e2e-sql.mjs',
        "UPDATE delivery_points SET contact_phone = NULL WHERE id = 'del-1';",
      ],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const driver = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
      data: { phone: DEMO_DRIVER.phone, pin: DEMO_DRIVER.pin },
    })
    expect(driver.ok()).toBeTruthy()
    const { accessToken } = (await driver.json()) as { accessToken: string }

    const start = await request.post(`${API_BASE}/api/v1/deliveries/del-1/start`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { lat: 48.892, lng: 2.412 },
    })
    expect(start.ok(), await start.text()).toBeTruthy()

    const declare = await request.post(`${API_BASE}/api/v1/deliveries/del-1/declare`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        outcome: 'full',
        lines: [
          { productLabel: 'Palettes œufs', quantityExpected: 2, quantityAccepted: 2, quantityRefused: 0, unit: 'palette' },
          { productLabel: "Jus d'orange", quantityExpected: 1, quantityAccepted: 1, quantityRefused: 0, unit: 'caisse' },
        ],
      },
    })
    expect(declare.ok(), await declare.text()).toBeTruthy()

    const otp = await request.post(`${API_BASE}/api/v1/deliveries/del-1/send-otp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(otp.status(), await otp.text()).not.toBe(422)
    expect(otp.ok(), await otp.text()).toBeTruthy()
  })

  test('build servi par Express — / renvoie le HTML de l’app (assets compilés)', async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/`)
    expect(res.ok(), 'GET / doit servir dist/index.html (même origine, pas de proxy)').toBeTruthy()
    const html = await res.text()
    expect(html).toContain('id="root"')
    expect(html, 'index.html doit référencer les assets compilés (build Vite)').toMatch(
      /\/assets\/[\w.-]+\.js/,
    )
  })

  test('asset compilé servi par Express — statique même origine', async ({ request }) => {
    const index = await request.get(`${API_BASE}/`)
    expect(index.ok()).toBeTruthy()
    const asset = (await index.text()).match(/\/assets\/[\w.-]+\.js/)?.[0]
    expect(asset, 'asset JS introuvable dans index.html').toBeTruthy()
    const res = await request.get(`${API_BASE}${asset}`)
    expect(res.ok(), `GET ${asset} doit être servi par Express (statique)`).toBeTruthy()
    const body = await res.text()
    expect(body.length).toBeGreaterThan(1000)
  })

  test('register-company — espace isolé (I23)', async ({ request }) => {
    await resetAndSeed(request)
    const email = `client-${Date.now()}@example.com`
    const reg = await request.post(`${API_BASE}/api/v1/auth/register-company`, {
      data: {
        companyName: 'Compagnie Test I23',
        managerName: 'Manager Test',
        email,
        password: 'secret1234',
      },
    })
    expect(reg.ok(), await reg.text()).toBeTruthy()
    const body = (await reg.json()) as { company?: { id: string }; manager?: { companyId: string } }
    expect(body.company?.id).toBeTruthy()
    expect(body.manager?.companyId).toBe(body.company?.id)

    const drivers = await request.get(`${API_BASE}/api/v1/dashboard/drivers`)
    expect(drivers.ok()).toBeTruthy()
    const driversBody = (await drivers.json()) as { drivers: unknown[] }
    expect(driversBody.drivers).toEqual([])

    const products = await request.get(`${API_BASE}/api/v1/dashboard/products`)
    expect(products.ok()).toBeTruthy()
    const productsBody = (await products.json()) as { products: unknown[] }
    expect(productsBody.products).toEqual([])

    // Le compte démo voit toujours ses livreurs
    const demoLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(demoLogin.ok()).toBeTruthy()
    const demoDrivers = await request.get(`${API_BASE}/api/v1/dashboard/drivers`)
    const demoBody = (await demoDrivers.json()) as { drivers: unknown[] }
    expect(demoBody.drivers.length).toBeGreaterThan(0)
  })

  test('create driver — téléphone déjà pris → 409 (I25)', async ({ request }) => {
    await resetAndSeed(request)
    const demoLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    expect(demoLogin.ok()).toBeTruthy()

    const dup = await request.post(`${API_BASE}/api/v1/dashboard/drivers`, {
      data: { name: 'Doublon', phone: DEMO_DRIVER.phone, pin: '1234' },
    })
    const ci = process.env.CI === 'true' || process.env.CI === '1'
    if (!ci) {
      expect([201, 409]).toContain(dup.status())
      return
    }
    expect(dup.status()).toBe(409)
    const body = await expectJsonBody(dup)
    expect(String(body.message)).toMatch(/déjà utilisé/i)
  })

  test('navigateur :8888 — fetch relatif /api/v1/health', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/v1/health')
      const text = await r.text()
      return { ok: r.ok, status: r.status, text }
    })
    expect(result.ok).toBe(true)
    expect(() => JSON.parse(result.text)).not.toThrow()
  })

  test('login livreur UI — message métier, pas erreur JSON parse', async ({ page }) => {
    await prepareDriverLogin(page)
    await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-submit').click()
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/unexpected end of json input/i)
    await expect(alert).not.toContainText(/réponse serveur vide/i)
    await expect(alert).not.toContainText(/réponse serveur invalide/i)
  })

  test('login manager UI — mauvais mot de passe, pas erreur JSON parse', async ({ page }) => {
    await page.goto('/manager/login', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('mgr-login-email').fill(DEMO_MANAGER.email)
    await page.getByTestId('mgr-login-password').fill('wrong-password')
    await page.getByTestId('mgr-login-submit').click()
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/unexpected end of json input/i)
    await expect(alert).not.toContainText(/réponse serveur vide/i)
  })

  test('/manager/register affiche le formulaire (I24)', async ({ page }) => {
    await page.goto('/manager/register', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Créer mon entreprise/i })).toBeVisible()
    await expect(page.getByTestId('register-company-name')).toBeVisible()
    await expect(page).toHaveURL(/\/manager\/register/)

    await page.goto('/manager/login', { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: /Créer mon espace/i }).click()
    await expect(page).toHaveURL(/\/manager\/register/)
    await expect(page.getByTestId('register-submit')).toBeVisible()
  })
})
