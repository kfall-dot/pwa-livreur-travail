import { expect, test } from '@playwright/test'
import { API_BASE, loginManager, managerApiLogin, resetAndSeed, UI_READY_TIMEOUT } from './helpers'

const DEMO_SITE_ID = 'sm-demo-carrefour-republique'

async function openCatalogueChantiers(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click()
  await page.getByTestId('mgr-tab-points').click()
}

test.describe('Catalogue — Chantiers et Fournisseurs (I56)', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('Chantiers + Type Privé/Public + création fournisseur', async ({ page, request }) => {
    await managerApiLogin(request)
    const patch = await request.patch(
      `${API_BASE}/api/v1/dashboard/supermarkets/${DEMO_SITE_ID}`,
      { data: { siteType: 'public' } },
    )
    expect(patch.ok(), await patch.text()).toBeTruthy()
    const listed = await request.get(`${API_BASE}/api/v1/dashboard/supermarkets`)
    const listedBody = (await listed.json()) as { supermarkets: Array<{ id: string; siteType?: string }> }
    expect(listedBody.supermarkets.find((s) => s.id === DEMO_SITE_ID)?.siteType).toBe('public')

    await loginManager(page)
    await openCatalogueChantiers(page)

    await expect(page.getByTestId('mgr-tab-points')).toHaveText('Chantiers')
    await expect(page.getByRole('heading', { name: 'Ajouter un chantier' })).toBeVisible({
      timeout: UI_READY_TIMEOUT,
    })
    await expect(page.getByText('Points de livraison')).toHaveCount(0)

    const typeSelect = page.getByTestId(`mgr-chantier-type-${DEMO_SITE_ID}`)
    await expect(typeSelect).toBeVisible()
    await expect(typeSelect).toHaveValue('public')
    await typeSelect.selectOption('prive')
    await expect(typeSelect).toHaveValue('prive')

    await page.reload()
    await openCatalogueChantiers(page)
    await expect(page.getByTestId(`mgr-chantier-type-${DEMO_SITE_ID}`)).toHaveValue('prive')

    await page.getByTestId('mgr-tab-fournisseurs').click()
    await expect(page.getByTestId('mgr-supplier-form')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-supplier-id')).toBeDisabled()
    await page.getByTestId('mgr-supplier-name').fill('E2E Granulats Abidjan')
    await page.getByTestId('mgr-supplier-address').fill('Siège Plateau, Abidjan')
    await page.getByTestId('mgr-supplier-depot').fill('Dépôt Yopougon')
    await page.getByTestId('mgr-supplier-contact-name').fill('Awa Kouassi')
    await page.getByTestId('mgr-supplier-contact-email').fill('awa@granulats-e2e.ci')
    await page.getByTestId('mgr-supplier-contact-phone').fill('+2250701888111')
    await page.getByTestId('mgr-supplier-family').selectOption('services')
    await page.getByTestId('mgr-supplier-status').selectOption('actif')
    await page.getByTestId('mgr-supplier-notes').fill('Fournisseur créé par E2E I56')
    await page.getByTestId('mgr-supplier-submit').click()

    await expect(page.getByTestId('mgr-supplier-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('E2E Granulats Abidjan')).toBeVisible()
    await expect(page.getByTestId('mgr-supplier-table').getByRole('cell', { name: 'Services' })).toBeVisible()
  })
})
