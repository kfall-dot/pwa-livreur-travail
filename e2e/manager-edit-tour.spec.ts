import { test, expect } from '@playwright/test'
import {
  resetAndSeed,
  loginManagerWithEmail,
  DEMO_SA_MANAGER,
  DEMO_DT_MANAGER,
  DEMO_TOUR_ID,
} from './helpers'

const LIVRAISONS_TAB = 'mgr-tab-suivi'

test.describe('Modification de tournée réservée au SA (Service Achats)', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetAndSeed(request)
    await page.context().clearCookies()
  })

  test('le SA voit et peut ouvrir le formulaire de modification', async ({ page }) => {
    await loginManagerWithEmail(page, [DEMO_SA_MANAGER.email])
    await page.getByTestId(LIVRAISONS_TAB).click()
    // La page Livraisons ouvre en vue mois : les actions de tournée (Modifier /
    // Supprimer) vivent sur les chips de tournée, affichés en vue jour uniquement.
    await page.getByTestId('mgr-suivi-filter-day').click()
    const editBtn = page.getByTestId(`mgr-suivi-edit-${DEMO_TOUR_ID}`)
    await expect(editBtn).toBeVisible({ timeout: 15_000 })
    await editBtn.click()
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toBeVisible({ timeout: 15_000 })
  })

  test('le DT ne voit pas le bouton Modifier (consultation seule)', async ({ page }) => {
    await loginManagerWithEmail(page, [DEMO_DT_MANAGER.email])
    await page.getByTestId(LIVRAISONS_TAB).click()
    // Même point de départ que le SA : vue jour, où les chips de tournée existent.
    await page.getByTestId('mgr-suivi-filter-day').click()
    await expect(page.getByTestId('mgr-suivi-tourbar')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`mgr-suivi-edit-${DEMO_TOUR_ID}`)).toHaveCount(0, { timeout: 15_000 })
  })
})