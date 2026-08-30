import { test, expect } from '@playwright/test'
import {
  resetAndSeed,
  prepareDriverLogin,
  loginDriver,
  loginManager,
  bringDeliveryDel1ToOtpSent,
  DEMO_DRIVER,
} from './helpers'

test.describe('Assistance OTP manager', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetAndSeed(request)
    await prepareDriverLogin(page)
    await loginDriver(page)
    await bringDeliveryDel1ToOtpSent(page)
  })

  test('renvoi OTP affiche le code pour relai vocal', async ({ page }) => {
    await page.context().clearCookies()
    await loginManager(page)
    await page.getByText('Carrefour City République').click()
    await expect(page.getByTestId('otp-assist-panel')).toBeVisible()
    await page.getByTestId('mgr-resend-otp').click()
    await expect(page.getByTestId('mgr-otp-code')).toHaveText('123456', { timeout: 15_000 })
  })

  test('validation manuelle sans OTP finalise la livraison', async ({ page }) => {
    await page.context().clearCookies()
    await loginManager(page)
    await page.getByText('Carrefour City République').click()
    await expect(page.getByTestId('otp-assist-panel')).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('mgr-manual-reason').fill(
      'Responsable magasin a confirmé par téléphone, SMS indisponible en test E2E.',
    )
    await page.getByTestId('mgr-confirm-manual').click()
    await expect(page.getByText(/Livraison validée/)).toBeVisible({ timeout: 15_000 })
    // La validation manuelle finalise la livraison → le toast + la référence
    // RCT- apparaissent, mais la réf. s'affiche aussi dans le modal → strict
    // mode. On cible l'alerte de rôle alert, unique, qui contient la réf.
    await expect(page.getByTestId('toast-success')).toContainText(/Livraison validée.*RCT-/)
  })
})

test.describe('Déverrouillage login livreur', () => {
  test('manager peut réinitialiser le verrouillage PIN', async ({ page, request }) => {
    await resetAndSeed(request)
    await prepareDriverLogin(page)

    // Le compte ne se verrouille qu'à partir de la 6ᵉ tentative (la 5ᵉ est
    // encore traitée en 401 par la sémantique count >= max du rate-limit).
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
      await page.getByTestId('pin-input').fill('0000')
      await page.getByTestId('login-submit').click()
      await expect(page.getByText(/Téléphone ou PIN incorrect/)).toBeVisible({ timeout: 10_000 })
    }
    // Déclenche le verrouillage en tentant jusqu'à obtenir un 429
    // (chaque échec incrémente le compteur du rate-limit ; le plafond de 12
    // tentatives garantit qu'on l'atteint même si un reset/expiration
    // a réinitialisé les échecs précédents). Déterministe, indépendant du
    // nombre exact d'échecs déjà enregistrés.
    let locked = false
    for (let i = 0; i < 12 && !locked; i++) {
      const respPromise = page.waitForResponse(
        (r) => r.url().includes('/auth/login-driver') && r.status() === 429,
        { timeout: 15_000 },
      )
      await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
      await page.getByTestId('pin-input').fill('0000')
      await page.getByTestId('login-submit').click()
      try {
        await respPromise
        locked = true
      } catch {
        // 401 continu — on retente (compteur pas encore assez haut)
      }
    }
    expect(locked, 'Le compte aurait dû être verrouillé (429)').toBeTruthy()
    await expect(page.getByRole('alert')).toContainText(/verrouillé|tentatives/i)

    await page.context().clearCookies()
    await loginManager(page)
    await page.getByRole('button', { name: /Équipe/i }).click()
    await page.getByRole('button', { name: /^Livreurs$/ }).click()
    // Cibler la ligne du livreur démo par son téléphone (le seed en crée 2 —
    // .first() peut ouvrir le modal de l'autre livreur et déverrouiller le mauvais).
    const demoRow = page.locator('tr', { hasText: DEMO_DRIVER.phone })
    await demoRow.getByRole('button', { name: /Modifier/i }).click()
    // Le bouton déverrouillage passe par window.confirm — Playwright rejette
    // les dialogs par défaut : il faut l'accepter explicitement.
    page.once('dialog', (d) => d.accept())
    await page.getByTestId('mgr-clear-login-lock').click()
    await expect(page.getByText(/Verrouillage.*réinitialisé/i)).toBeVisible()

    await page.context().clearCookies()
    await prepareDriverLogin(page)
    await loginDriver(page)
    await expect(page).toHaveURL('/')
  })
})
