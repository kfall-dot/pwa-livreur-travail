import { expect, test } from '@playwright/test'

test.describe('Démo commerciale statique (QR)', () => {
  test('/demo/livreur — diaporama mobile sans API', async ({ page }) => {
    await page.goto('/demo/livreur', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /connexion rapide au terrain/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/démo visuelle/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /suivant/i })).toBeEnabled()

    await page.getByRole('button', { name: /suivant/i }).click()
    await expect(page.getByRole('heading', { name: /tournée du jour/i })).toBeVisible()

    await page.getByRole('button', { name: /suivant/i }).click()
    await expect(page.getByRole('heading', { name: /carte et itinéraire/i })).toBeVisible()

    await page.getByRole('button', { name: /suivant/i }).click()
    await expect(page.getByRole('heading', { name: /preuve à chaque remise/i })).toBeVisible()
  })

  test('/demo/manager — diaporama bureau sans API', async ({ page }) => {
    await page.goto('/demo/manager', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /espace gestionnaire/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/aucune connexion au système réel/i)).toBeVisible()

    await page.getByRole('button', { name: /suivant/i }).click()
    await expect(page.getByRole('heading', { name: /suivi en temps réel/i })).toBeVisible()

    await page.getByRole('button', { name: /suivant/i }).click()
    await expect(page.getByRole('heading', { name: /planification/i })).toBeVisible()
  })
})
