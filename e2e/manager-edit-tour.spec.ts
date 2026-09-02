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
    const editBtn = page.getByTestId(`mgr-suivi-edit-${DEMO_TOUR_ID}`)
    await expect(editBtn).toBeVisible({ timeout: 15_000 })
    await editBtn.click()
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toBeVisible({ timeout: 15_000 })
  })

  test('le DT ne voit pas le bouton Modifier (consultation seule)', async ({ page }) => {
    await loginManagerWithEmail(page, [DEMO_DT_MANAGER.email])
    await page.getByTestId(LIVRAISONS_TAB).click()
    await expect(page.getByTestId(`mgr-suivi-edit-${DEMO_TOUR_ID}`)).toHaveCount(0, { timeout: 15_000 })
  })
})