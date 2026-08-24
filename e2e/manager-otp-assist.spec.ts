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
    await expect(page.getByText(/RCT-/)).toBeVisible()
  })
})

test.describe('Déverrouillage login livreur', () => {
  test('manager peut réinitialiser le verrouillage PIN', async ({ page, request }) => {
    await resetAndSeed(request)
    await prepareDriverLogin(page)

    for (let i = 0; i < 5; i++) {
      await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
      await page.getByTestId('pin-input').fill('0000')
      await page.getByTestId('login-submit').click()
      await expect(page.getByText(/verrouillé|tentatives/i)).toBeVisible({ timeout: 10_000 })
    }

    await page.context().clearCookies()
    await loginManager(page)
    await page.getByRole('button', { name: /Livreurs/i }).click()
    await page.getByRole('button', { name: /Modifier/i }).first().click()
    await page.getByTestId('mgr-clear-login-lock').click()
    await expect(page.getByText(/Verrouillage réinitialisé/i)).toBeVisible()

    await page.context().clearCookies()
    await prepareDriverLogin(page)
    await loginDriver(page)
    await expect(page).toHaveURL('/')
  })
})
