import { test, expect } from '@playwright/test'
import {
  resetAndSeed,
  DEMO_DRIVER,
  API_BASE,
  prepareDriverLogin,
  loginDriver,
  managerApiLogin,
} from './helpers'

test.describe('Authentification', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    await resetAndSeed(request)
  })

  test.beforeEach(async ({ page }) => {
    await prepareDriverLogin(page)
  })

  test('affiche le formulaire de connexion', async ({ page }) => {
    await expect(page.getByTestId('phone-input')).toBeVisible()
    await expect(page.getByTestId('pin-input')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('refuse un PIN invalide', async ({ page }) => {
    await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('connecte avec PIN valide et affiche le tableau de bord', async ({ page }) => {
    await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
    await page.getByTestId('pin-input').fill(DEMO_DRIVER.pin)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('delivery-card-del-1')).toBeVisible()
    await expect(page.getByTestId('delivery-card-del-1')).toContainText('multiple')
    await expect(page.getByTestId('delivery-card-del-2')).toContainText('4 caisses')
    await expect(page.getByTestId('delivery-card-del-2')).not.toContainText('palette')
  })

  test('plusieurs tournées le même jour → tous les arrêts visibles (I20)', async ({ page, request }) => {
    await resetAndSeed(request)
    await managerApiLogin(request)

    const today = new Date().toISOString().slice(0, 10)
    const create = await request.post(`${API_BASE}/api/v1/dashboard/tours`, {
      data: {
        driverId: 'drv-demo-1',
        date: today,
        depotName: 'Entrepôt Bis',
        depotAddress: '2 rue Bis',
        stops: [
          {
            supermarketId: 'sm-demo-abidjan-centre',
            units: 2,
            unitType: 'caisse',
            weightKg: '20',
            requiredPhotos: 1,
            products: [{ label: 'Salade iceberg', qty: 2, unit: 'caisse' }],
          },
        ],
      },
    })
    expect(create.ok(), await create.text()).toBeTruthy()

    await prepareDriverLogin(page)
    await loginDriver(page)

    await expect(page.getByTestId('driver-tour-count')).toContainText('2 tournées')
    await expect(page.getByTestId('driver-stop-count')).toBeVisible()
    await expect(page.getByTestId('delivery-card-del-1')).toBeVisible()
    await expect(page.getByText('Supermarché Abidjan Centre')).toBeVisible()
  })
})

/** I26 — pas de seed DB : purement UI login */
test.describe('Login livreur — champ téléphone', () => {
  test('saisie 10 chiffres nationaux sans débordement du champ (I26)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const phone = page.getByTestId('phone-input')
    await expect(phone).toBeVisible()
    await phone.fill('+2250701234567')
    await expect(phone).toHaveValue('0701234567')
    const fits = await phone.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
    expect(fits, 'le numéro ne doit pas déborder du champ').toBe(true)
  })
})
