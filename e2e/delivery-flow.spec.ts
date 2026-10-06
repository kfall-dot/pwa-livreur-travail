import { test, expect } from '@playwright/test'
import { resetAndSeed, prepareDriverLogin, loginDriver } from './helpers'

test.describe('Flux livraison complet', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetAndSeed(request)
    await prepareDriverLogin(page)
    await loginDriver(page)
  })

  test('parcours start → photos → déclaration → OTP → confirmation', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await expect(page).toHaveURL(/\/delivery\/del-1/)

    await page.getByTestId('start-delivery').click()
    await expect(page.getByRole('heading', { name: 'Photos produits' })).toBeVisible()
    await expect(page.getByTestId('take-photo')).toBeVisible()

    await page.getByTestId('simulate-photo').click()
    await expect(page.getByText('✓ Photo 1')).toBeVisible()
    await expect(page.getByTestId('go-declare')).toBeVisible()

    await page.getByTestId('go-declare').click()
    await expect(page.getByText('Déclaration de livraison')).toBeVisible()

    await page.getByTestId('declare-outcome-full').check()
    await page.getByTestId('save-declaration').click()
    await expect(page.getByText(/Déclaration enregistrée/)).toBeVisible()

    await page.getByTestId('send-otp').click()
    await expect(page.getByLabel('Code à 6 chiffres')).toBeVisible()

    // Renvoi OTP : feedback visible + pas de re-déclaration
    await expect(page.getByTestId('resend-otp')).toBeEnabled({ timeout: 5_000 })
    await page.getByTestId('resend-otp').click()
    await expect(page.getByText(/Enregistrez d’abord la déclaration/)).toHaveCount(0)
    await expect(page.getByTestId('otp-status')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Code à 6 chiffres')).toBeVisible()

    await page.getByLabel('Code à 6 chiffres').fill('123456')
    await page.getByTestId('otp-continue').click()

    await expect(page.getByText('Confirmation')).toBeVisible()
    await page.getByTestId('confirm-delivery').click()

    await expect(page.getByTestId('confirm-receipt')).toBeVisible()
    await expect(page).toHaveURL('/')
    await expect(page.getByText('1 / 4 livré(s)')).toBeVisible()
  })

  test('livraison partielle → coche un produit partiel, l’autre livré en totalité', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await page.getByTestId('start-delivery').click()
    await page.getByTestId('simulate-photo').click()
    await page.getByTestId('go-declare').click()

    await page.getByText('Livraison partielle', { exact: true }).click()
    // Produit 1 « Palettes œufs » (2 commandées) : coché partiel → 1 acceptée
    await page.getByTestId('select-product-0').check()
    const firstCard = page.locator('.declare-line-card').first()
    await firstCard.locator('input[type="number"]').first().fill('1')
    await firstCard.locator('textarea').fill('Client a refusé 1 palette')
    // Produit 2 « Jus d’orange » (1 commandée) : non coché → livré en totalité
    await page.getByTestId('save-declaration').click()
    await expect(page.getByText(/Déclaration enregistrée/)).toBeVisible()

    await page.getByTestId('send-otp').click()
    await page.getByLabel('Code à 6 chiffres').fill('123456')
    await page.getByTestId('otp-continue').click()
    await page.getByTestId('confirm-delivery').click()
    await expect(page.getByTestId('confirm-receipt')).toBeVisible()
    await expect(page).toHaveURL('/')

    const card = page.getByTestId('delivery-card-del-1')
    await expect(card.getByLabel('Partielle')).toBeVisible()
    await expect(card.getByLabel('Livrée')).toHaveCount(0)
  })

  test('livraison refusée partielle → badge Partielle (pas Refusée)', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await page.getByTestId('start-delivery').click()
    await page.getByTestId('simulate-photo').click()
    await page.getByTestId('go-declare').click()

    await page.getByText('Livraison refusée', { exact: true }).click()
    // Produit 1 « Palettes œufs » (2 commandées) : coché refusé
    await page.getByTestId('select-product-0').check()
    await page.locator('.declare-line-card').first().locator('textarea').fill('Produit refusé par le client')
    // Produit 2 « Jus d’orange » (1 commandée) : non coché → livré en totalité
    await page.getByTestId('save-declaration').click()
    await expect(page.getByText(/Déclaration enregistrée/)).toBeVisible()

    await page.getByTestId('send-otp').click()
    await page.getByLabel('Code à 6 chiffres').fill('123456')
    await page.getByTestId('otp-continue').click()
    await page.getByTestId('confirm-delivery').click()
    await expect(page.getByTestId('confirm-receipt')).toBeVisible()
    await expect(page).toHaveURL('/')

    const card = page.getByTestId('delivery-card-del-1')
    await expect(card.getByLabel('Partielle')).toBeVisible()
    await expect(card.getByLabel('Refusée')).toHaveCount(0)
    await expect(card.getByLabel('Livrée')).toHaveCount(0)
  })

  test('livraison refusée totale → badge Refusée', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await page.getByTestId('start-delivery').click()
    await page.getByTestId('simulate-photo').click()
    await page.getByTestId('go-declare').click()

    await page.getByText('Livraison refusée', { exact: true }).click()
    // Les deux produits sont refusés → refus total
    await page.getByTestId('select-product-0').check()
    await page.locator('.declare-line-card').first().locator('textarea').fill('Produit refusé par le client')
    await page.getByTestId('select-product-1').check()
    await page.locator('.declare-line-card').nth(1).locator('textarea').fill('Produit refusé par le client')
    await page.getByTestId('save-declaration').click()
    await expect(page.getByText(/Déclaration enregistrée/)).toBeVisible()

    await page.getByTestId('send-otp').click()
    await page.getByLabel('Code à 6 chiffres').fill('123456')
    await page.getByTestId('otp-continue').click()
    await page.getByTestId('confirm-delivery').click()
    await expect(page.getByTestId('confirm-receipt')).toBeVisible()
    await expect(page).toHaveURL('/')

    const card = page.getByTestId('delivery-card-del-1')
    await expect(card.getByLabel('Refusée')).toBeVisible()
    await expect(card.getByLabel('Livrée')).toHaveCount(0)
  })

  test('annulation depuis photos remet la livraison à démarrer', async ({ page }) => {
    await page.getByTestId('delivery-card-del-1').click()
    await page.getByTestId('start-delivery').click()
    await expect(page.getByRole('heading', { name: 'Photos produits' })).toBeVisible()
    await page.getByTestId('simulate-photo').click()

    await page.getByTestId('cancel-delivery').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('cancel-delivery-confirm').click()

    await expect(page.getByTestId('start-delivery')).toBeVisible()
    await expect(page.getByText('À démarrer')).toBeVisible()
  })
})
