import { expect, test } from '@playwright/test'
import { API_BASE, loginManager, managerApiLogin, resetAndSeed, UI_READY_TIMEOUT } from './helpers'
import { loginBtpManager, resetAndSeedBtp } from './btp-helpers'

const DEMO_SITE_ID = 'sm-demo-carrefour-republique'
const DEMO_SITE_NAME = 'Carrefour City République'
/** Seed BTP : ce point du catalogue est relié au chantier achats `site-btp-pilote-1`. */
const BTP_SITE_NAME = 'Résidence Cocody — Tour A'

/**
 * Ouvre le catalogue manager puis le chip demandé. Le sous-nav catalogue
 * (`mgr-tab-points` / `mgr-tab-fournisseurs` / `mgr-tab-produits` /
 * `mgr-tab-unites`) a été retiré : les chips de `CatalogueTab` sont les seuls
 * points d'entrée de la section.
 */
async function openCatalogueChip(
  page: import('@playwright/test').Page,
  chip: 'Chantiers' | 'Fournisseurs',
): Promise<void> {
  await page.getByTestId('mgr-tab-catalogue').click()
  await page.locator('.ctg .tabs').getByRole('button', { name: chip, exact: true }).click()
}

test.describe('Catalogue — Chantiers et Fournisseurs (I56)', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('chantier : type Privé/Public éditable via le chip Chantiers et persisté', async ({ page, request }) => {
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
    await openCatalogueChip(page, 'Chantiers')

    // Le sous-nav catalogue a disparu : « Points de livraison » n'existe plus.
    await expect(page.getByTestId('mgr-tab-points')).toHaveCount(0)
    await expect(page.getByText('Points de livraison')).toHaveCount(0)

    const row = page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME })
    await expect(row).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible()
    await expect(row.getByText('Public', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Modifier' }).click()
    const typeSelect = page.getByTestId('mgr-chantier-type-edit')
    await expect(typeSelect).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(typeSelect).toHaveValue('public')
    await typeSelect.selectOption('prive')
    // Le chantier démo n'a pas d'e-mail en seed, or la modale l'exige pour enregistrer.
    await page.getByTestId('mgr-chantier-email-edit').fill('contact@carrefour-republique.ci')
    await page.getByRole('button', { name: 'Sauvegarder' }).click()
    await expect(typeSelect).toHaveCount(0)

    await expect(row.getByText('Privé', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await openCatalogueChip(page, 'Chantiers')
    await expect(
      page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME }).getByText('Privé', { exact: true }),
    ).toBeVisible({ timeout: UI_READY_TIMEOUT })
  })

  test('fournisseur : raison sociale, adresse, contact, famille et note via le chip Fournisseurs', async ({ page, request }) => {
    await managerApiLogin(request)
    await loginManager(page)
    await openCatalogueChip(page, 'Fournisseurs')

    await page.getByRole('button', { name: '+ Nouveau fournisseur' }).click()
    const form = page.getByTestId('mgr-supplier-modal-form')
    await expect(form).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await form.getByLabel('Nom (raison sociale) *').fill('E2E Granulats Abidjan')
    await form.getByLabel('Contact (nom & prénom)').fill('Awa Kouassi')
    await form.getByLabel('eMail').fill('awa@granulats-e2e.ci')
    await form.getByLabel('Téléphone').fill('+2250701888111')
    await form.getByLabel('Adresse').fill('Siège Plateau, Abidjan')
    await form.getByTestId('mgr-supplier-modal-family').selectOption('services')
    await form.getByTestId('mgr-supplier-modal-notes').fill('Fournisseur créé par E2E I56')
    await form.getByRole('button', { name: 'Créer' }).click()
    await expect(form).toHaveCount(0)

    const row = page.locator('.ctg tbody tr', { hasText: 'E2E Granulats Abidjan' })
    await expect(row).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(row.getByText('Services', { exact: true })).toBeVisible()
    await expect(row.getByText('awa@granulats-e2e.ci')).toBeVisible()
    await expect(row.getByText('Actif', { exact: true })).toBeVisible()

    // ID attribué automatiquement + champs conservés côté serveur (I56).
    const list = await request.get(`${API_BASE}/api/v1/dashboard/suppliers`)
    expect(list.ok()).toBeTruthy()
    const body = (await list.json()) as {
      suppliers: Array<{ id: string; name: string; address?: string | null; family?: string | null; notes?: string | null }>
    }
    const created = body.suppliers.find((s) => s.name === 'E2E Granulats Abidjan')
    expect(created?.id).toBeTruthy()
    expect(created?.address).toBe('Siège Plateau, Abidjan')
    expect(created?.family).toBe('services')
    expect(created?.notes).toBe('Fournisseur créé par E2E I56')

    await row.getByRole('button', { name: 'Modifier' }).click()
    await expect(page.getByTestId('mgr-supplier-family-edit')).toHaveValue('services', { timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-supplier-notes-edit')).toHaveValue('Fournisseur créé par E2E I56')
    await expect(page.getByRole('heading', { name: 'Modifier le fournisseur' })).toBeVisible()
  })
})

test.describe('Catalogue — fiche détaillée du chantier au clic (I90)', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('chantier relié au suivi achats : contacts, encadrement, enveloppe et livraisons', async ({ page, request }) => {
    await resetAndSeedBtp(request)
    await loginBtpManager(page, 'sa')
    await openCatalogueChip(page, 'Chantiers')

    const row = page.locator('.ctg tbody tr', { hasText: BTP_SITE_NAME })
    await expect(row).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await row.click()

    const modal = page.getByTestId('mgr-chantier-detail')
    await expect(modal).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(modal.getByRole('heading', { name: /Détail du chantier/ })).toBeVisible()

    // Référentiel du point catalogue (supermarkets) — aucune donnée inventée côté client.
    await expect(page.getByTestId('mgr-chantier-detail-type')).toHaveText('Privé')
    await expect(page.getByTestId('mgr-chantier-detail-address')).toContainText('Boulevard Latrille')
    await expect(page.getByTestId('mgr-chantier-detail-phone')).toContainText('+2250701888001')
    await expect(page.getByTestId('mgr-chantier-detail-responsable')).toContainText('Chef chantier')

    // Chantier achats retrouvé par `sites.supermarket_id` : encadrement, enveloppe, livraisons.
    await expect(page.getByTestId('mgr-chantier-detail-no-site')).toHaveCount(0)
    await expect(page.getByTestId('mgr-chantier-detail-chef')).not.toHaveText('—')
    await expect(page.getByTestId('mgr-chantier-detail-dt')).not.toHaveText('—')
    await expect(page.getByTestId('mgr-chantier-detail-enveloppe')).toBeVisible()
    await expect(page.getByTestId('mgr-chantier-detail-bc')).toBeVisible()
    await expect(page.getByTestId('mgr-chantier-detail-bc-count')).toHaveText(/^\d+$/)

    await page.getByTestId('mgr-chantier-detail-close').click()
    await expect(modal).toHaveCount(0)
  })

  test('chantier non relié : la fiche reste consultable (référentiel seul)', async ({ page }) => {
    await loginManager(page)
    await openCatalogueChip(page, 'Chantiers')

    const row = page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME })
    await expect(row).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await row.click()

    const modal = page.getByTestId('mgr-chantier-detail')
    await expect(modal).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-chantier-detail-no-site')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-chantier-detail-address')).not.toHaveText('—')
    // Les actions de la ligne n'ouvrent pas la fiche (stopPropagation).
    await page.getByTestId('mgr-chantier-detail-close').click()
    await expect(modal).toHaveCount(0)
    await expect(page.locator('.ctg tbody tr', { hasText: DEMO_SITE_NAME }).getByText('Actif', { exact: true })).toBeVisible()
  })
})
