import { expect, test } from '@playwright/test'
import { API_BASE, loginManager, managerApiLogin, resetAndSeed, UI_READY_TIMEOUT } from './helpers'

const DEMO_SITE_NAME = 'Carrefour City République'

/**
 * Ouvre le catalogue manager puis le chip « Chantiers ». Le sous-nav catalogue
 * (bouton `mgr-tab-points`) a été retiré : les chips de `CatalogueTab` sont les
 * seuls points d'entrée de la section.
 */
async function openCatalogueChantiers(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('mgr-tab-catalogue').click()
  await page.locator('.ctg .tabs').getByRole('button', { name: 'Chantiers', exact: true }).click()
}

test.describe('Chantiers — statut actif/inactif', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('désactivation persiste après rechargement API', async ({ request }) => {
    await managerApiLogin(request)

    const supermarketId = 'sm-demo-carrefour-republique'
    const deactivate = await request.post(
      `${API_BASE}/api/v1/dashboard/supermarkets/${supermarketId}/deactivate`,
    )
    expect(deactivate.ok(), await deactivate.text()).toBeTruthy()
    const body = (await deactivate.json()) as { supermarket?: { active?: boolean } }
    expect(body.supermarket?.active).toBe(false)

    const list = await request.get(`${API_BASE}/api/v1/dashboard/supermarkets?_=${Date.now()}`)
    expect(list.ok()).toBeTruthy()
    const data = (await list.json()) as { supermarkets: Array<{ id: string; active: boolean }> }
    const row = data.supermarkets.find((s) => s.id === supermarketId)
    expect(row?.active).toBe(false)
  })

  test('désactivation visible dans l’UI manager après reload', async ({ page }) => {
    await loginManager(page)

    await openCatalogueChantiers(page)
    const row = page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME })
    await expect(row).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(row.getByText('Actif', { exact: true })).toBeVisible()

    // Le chip désactive sans boîte de confirmation (PATCH direct), contrairement
    // à l'ancienne page « Points de livraison ».
    await row.getByRole('button', { name: 'Désactiver' }).click()
    await expect(row.getByText('Inactif', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await openCatalogueChantiers(page)
    await expect(
      page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME }).getByText('Inactif', { exact: true }),
    ).toBeVisible({ timeout: UI_READY_TIMEOUT })
  })
})
