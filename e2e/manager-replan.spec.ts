import { test, expect } from '@playwright/test'
import { resetAndSeed, loginManager, DEMO_TOUR_ID } from './helpers'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

test.describe('Replanification gestionnaire', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetAndSeed(request)
    await page.context().clearCookies()
    await loginManager(page)
  })

  test('annuler le brouillon planifier vide le formulaire', async ({ page }) => {
    await page.getByTestId('mgr-tab-planifier').click()
    await page.getByPlaceholder('Ex: Entrepôt Nord').fill('Entrepôt test')
    await page.getByTestId('mgr-replan-cancel').click()
    await expect(page.getByPlaceholder('Ex: Entrepôt Nord')).toHaveValue('')
    await expect(page.getByTestId('mgr-replan-banner')).toHaveCount(0)
  })

  test('créer tournée → SMS livreur + redirection Suivi + réf. auto', async ({ page }) => {
    await page.getByTestId('mgr-tab-planifier').click()

    const orderRef = page.getByTestId('mgr-stop-order-ref-0')
    await expect(orderRef).toHaveValue(/^CMD-\d{8}-[A-F0-9]{4}$/i)

    await page.getByTestId('mgr-create-driver').selectOption({ index: 1 })
    await page.getByTestId('mgr-create-depot').fill('Entrepôt E2E')
    await page.getByTestId('mgr-create-depot-address').fill('1 rue E2E, Abidjan')
    await page.getByTestId('mgr-stop-supermarket-0').selectOption({ label: 'Carrefour City République' })
    await page.getByTestId('mgr-add-product-line').click()
    await page.getByTestId('mgr-product-select-0').selectOption({ index: 1 })

    await page.getByTestId('mgr-create-tour').click()
    await expect(page.getByTestId('mgr-suivi-date')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-suivi-date')).toHaveValue(todayIso())
  })

  test('annuler replan depuis Planifier réinitialise le formulaire sans quitter l’onglet', async ({ page }) => {
    await page.getByTestId('mgr-tab-planifier').click()
    await page.getByTestId(`mgr-planifier-replan-${DEMO_TOUR_ID}`).click()

    await expect(page.getByTestId('mgr-replan-banner')).toBeVisible()
    await page.getByTestId('mgr-replan-cancel').click()

    await expect(page.getByTestId('mgr-tab-planifier')).toBeVisible()
    await expect(page.getByTestId('mgr-suivi-date')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Créer la tournée replanifiée' })).toHaveCount(0)
    await expect(page.getByTestId('mgr-replan-banner')).toHaveCount(0)
  })

  test('annuler replan depuis Suivi retourne au suivi avec la date source', async ({ page }) => {
    await page.getByTestId(`mgr-suivi-replan-${DEMO_TOUR_ID}`).click()
    await expect(page.getByTestId('mgr-replan-banner')).toBeVisible()
    await page.getByTestId('mgr-replan-cancel').click()

    await expect(page.getByTestId('mgr-suivi-date')).toHaveValue(todayIso(), { timeout: 10_000 })
    await expect(page.getByText('Livraisons', { exact: true })).toBeVisible()
  })

  test('annuler pendant le chargement replan ignore la réponse API', async ({ page }) => {
    await page.getByTestId('mgr-tab-planifier').click()
    await page.getByTestId(`mgr-planifier-replan-${DEMO_TOUR_ID}`).click()

    await expect(page.getByTestId('mgr-replan-banner')).toBeVisible()
    await page.getByTestId('mgr-replan-cancel').click({ force: true })

    await page.getByTestId('mgr-tab-planifier').click()
    await expect(page.getByRole('button', { name: 'Créer la tournée replanifiée' })).toHaveCount(0)
    await expect(page.getByTestId('mgr-replan-banner')).toHaveCount(0)
  })

  test('replanifier depuis Suivi ouvre le formulaire replanifié', async ({ page }) => {
    await expect(page.getByTestId(`mgr-suivi-replan-${DEMO_TOUR_ID}`)).toBeVisible()
    await page.getByTestId(`mgr-suivi-replan-${DEMO_TOUR_ID}`).click()

    await expect(page.getByTestId('mgr-replan-banner')).toBeVisible()
    await expect(page.getByTestId('mgr-replan-loading')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Créer la tournée replanifiée' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('mgr-replan-cancel')).toBeVisible()
  })

  test('tâche partielle sans reliquat n’affiche pas Replanifier', async ({ page }) => {
    await page.getByTestId('mgr-tab-taches').click()
    const partialTask = page.getByTestId('mgr-task-task-demo-partial')
    await expect(partialTask).toBeVisible()
    await expect(partialTask.getByRole('button', { name: 'Replanifier' })).toHaveCount(0)
  })

  test('modifier une tournée met à jour Planifier et Suivi après enregistrement', async ({ page }) => {
    const newDepot = `Entrepôt E2E ${Date.now()}`
    await page.getByTestId('mgr-tab-planifier').click()
    await page.getByRole('button', { name: 'Modifier' }).first().click()
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toBeVisible()

    await page.getByTestId('mgr-edit-tour-depot').fill(newDepot)
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toHaveCount(0, {
      timeout: 10_000,
    })

    await expect(page.getByText(newDepot)).toBeVisible()

    await page.getByTestId('mgr-tab-suivi').click()
    await expect(page.getByTestId('mgr-suivi-date')).toHaveValue(todayIso(), { timeout: 10_000 })
    await expect(page.getByText(newDepot)).toBeVisible({ timeout: 10_000 })
  })

  test('modifier depuis Suivi recharge Suivi sans changer la date', async ({ page }) => {
    const newDepot = `Entrepôt Suivi E2E ${Date.now()}`
    await expect(page.getByTestId('mgr-suivi-date')).toHaveValue(todayIso(), { timeout: 10_000 })
    await expect(page.getByText('Entrepôt Nord')).toBeVisible()

    await page.getByTestId(`mgr-suivi-edit-${DEMO_TOUR_ID}`).click()
    await expect(page.getByTestId('mgr-tab-planifier')).toBeVisible()
    await expect(page.getByTestId('mgr-planifier-date')).toHaveValue(todayIso(), { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toBeVisible()

    await page.getByTestId('mgr-edit-tour-depot').fill(newDepot)
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dashboard/tours/') && r.request().method() === 'PATCH' && r.ok(),
      ),
      page.getByRole('button', { name: 'Enregistrer les modifications' }).click(),
    ])
    await expect(page.getByRole('heading', { name: 'Modifier la tournée' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(page.getByText(newDepot)).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('mgr-tab-suivi').click()
    await expect(page.getByTestId('mgr-suivi-date')).toHaveValue(todayIso(), { timeout: 10_000 })
    await expect(page.getByText(newDepot)).toBeVisible({ timeout: 10_000 })
  })

  test('supprimer une tournée sans arrêt livré la fait disparaître (I22)', async ({ page }) => {
    await page.getByTestId('mgr-tab-planifier').click()
    await page.getByTestId('mgr-create-driver').selectOption({ index: 1 })
    await page.getByTestId('mgr-create-depot').fill('Dépôt à supprimer')
    await page.getByTestId('mgr-create-depot-address').fill('9 rue Suppression')
    await page.getByTestId('mgr-stop-supermarket-0').selectOption({ label: 'Carrefour City République' })
    await page.getByTestId('mgr-add-product-line').click()
    await page.getByTestId('mgr-product-select-0').selectOption({ index: 1 })

    await page.getByTestId('mgr-create-tour').click()
    await expect(page.getByTestId('mgr-suivi-date')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Dépôt à supprimer')).toBeVisible()

        // Le sélecteur ci-dessous matche plusieurs "Supprimer" (strict mode violation)
    // dans le seed complet : on .first().first() pour cibler uniquement celui
    // attaché au depot "Dépôt à supprimer" créé juste au-dessus.
    const tourCard = page.locator('div').filter({ hasText: 'Dépôt à supprimer' }).filter({ has: page.getByRole('button', { name: 'Supprimer' }) }).first()
    page.once('dialog', (d) => void d.accept())
    await tourCard.getByRole('button', { name: 'Supprimer' }).first().click()

    await expect(page.getByText('Dépôt à supprimer')).toHaveCount(0, { timeout: 10_000 })

    await page.getByTestId('mgr-tab-planifier').click()
    await expect(page.getByText('Dépôt à supprimer')).toHaveCount(0)
  })
})
