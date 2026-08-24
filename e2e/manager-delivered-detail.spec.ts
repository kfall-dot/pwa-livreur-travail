import { test, expect } from '@playwright/test'
import {
  resetAndSeed,
  prepareDriverLogin,
  loginDriver,
  loginManager,
  completeDeliveryDel1,
} from './helpers'

test.describe('Consultation livraison livrée', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetAndSeed(request)
    await prepareDriverLogin(page)
    await loginDriver(page)
    await completeDeliveryDel1(page)
  })

  test('livreur — consultation affiche quantité livrée', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await expect(page.getByTestId('delivery-terminal-view')).toBeVisible()
    const delivered = page.getByTestId('delivered-quantity-lines')
    await expect(delivered).toContainText('2 palettes')
    await expect(delivered).toContainText('1 caisse')
  })

  test('gestionnaire — détail affiche quantité livrée', async ({ page }) => {
    await page.context().clearCookies()
    await loginManager(page)
    await page.getByText('Carrefour City République').click()
    const qty = page.getByTestId('mgr-delivered-quantity')
    await expect(qty).toContainText('2 palettes')
    await expect(qty).toContainText('1 caisse')
  })

  test('gestionnaire — certificat HTML (pas page login)', async ({ page }) => {
    await page.context().clearCookies()
    await loginManager(page)
    await page.getByText('Carrefour City République').click()
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: /RCT-/ }).click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    await expect(popup.locator('h1')).toContainText('Carrefour City République')
    await expect(popup.getByText('Bon de livraison')).toBeVisible()
    await expect(popup.getByText('Quantité attendue')).toBeVisible()
    await expect(popup.getByText('Quantité livrée')).toBeVisible()
    await expect(popup).not.toHaveURL(/login/)
  })
})
