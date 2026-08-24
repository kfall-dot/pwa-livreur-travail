import { expect, test } from '@playwright/test'
import { API_BASE, loginManager, managerApiLogin, resetAndSeed } from './helpers'

/** Ouvre la section Catalogue → sous-onglet « Chantiers ». */
async function openPointsTab(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click()
  await page.getByTestId('mgr-tab-points').click()
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

    await openPointsTab(page)
    const status = page.getByTestId('mgr-point-status-sm-demo-carrefour-republique')
    await expect(status).toHaveText('Actif')

    const row = page.locator('tr', { has: status })
    page.once('dialog', (dialog) => dialog.accept())
    await row.getByRole('button', { name: 'Actif' }).click()
    await expect(status).toHaveText('Inactif', { timeout: 10_000 })

    await page.reload()
    await openPointsTab(page)
    await expect(page.getByTestId('mgr-point-status-sm-demo-carrefour-republique')).toHaveText('Inactif')
  })
})
