import { test, expect } from '@playwright/test'
import { UI_READY_TIMEOUT, loginManager, resetAndSeed } from './helpers'

/**
 * Manager — mobile.
 *
 * Le shell gestionnaire est un layout desktop (sidebar 260px) : sous 900px la
 * sidebar devient un tiroir off-canvas (`.manager-sidebar--open`), les tables
 * défilent dans leur propre bloc et les champs passent à 16px. Cette spec
 * garde ces acquis : aucune vue ne doit provoquer de débordement horizontal de
 * la page, et le tiroir doit s'ouvrir/fermer au doigt (bouton, overlay,
 * onglet, Échap).
 *
 * Le viewport est déclaré en dur plutôt que via `devices['iPhone 13']` : ce
 * descripteur porte `defaultBrowserType: 'webkit'`, option que Playwright
 * honore — il tenterait alors de lancer WebKit, absent de l'installation
 * locale (le projet de ce dépôt est chromium). Seules la taille d'écran et la
 * tactile comptent ici : le responsive est piloté par les media queries, pas
 * par l'user-agent.
 */
test.use({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

test.describe('Manager — mobile', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('tiroir de navigation (ouverture/fermeture) et zéro débordement', async ({ page }) => {
    await loginManager(page)

    // Le shell mobile expose le bouton ☰ et la sidebar reste hors écran.
    const toggle = page.getByTestId('mgr-nav-toggle')
    await expect(toggle).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)

    const horizontalOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(await horizontalOverflow()).toBeLessThanOrEqual(1)

    // Ouverture par le bouton.
    await toggle.click()
    await expect(page.locator('.manager-sidebar--open')).toBeVisible()

    // Fermeture par l'overlay (clic à droite du tiroir, hors de la sidebar).
    await page.locator('.manager-nav-overlay').click({ position: { x: 370, y: 400 } })
    await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)

    // Réouverture puis navigation : le tiroir se referme tout seul.
    await toggle.click()
    await expect(page.locator('.manager-sidebar--open')).toBeVisible()
    await page.getByTestId('mgr-tab-suivi').click()
    await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)

    // La page Livraisons tient dans l'écran : le tableau défile dans son bloc,
    // pas la page entière.
    await expect(page.getByTestId('mgr-suivi-deliveries-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    expect(await horizontalOverflow()).toBeLessThanOrEqual(1)

    const tableOverflowsItsBox = await page
      .getByTestId('mgr-suivi-deliveries-table')
      .evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(tableOverflowsItsBox).toBe(true)
  })

  test('Échap referme le tiroir', async ({ page }) => {
    await loginManager(page)
    const toggle = page.getByTestId('mgr-nav-toggle')
    await expect(toggle).toBeVisible({ timeout: UI_READY_TIMEOUT })

    await toggle.click()
    await expect(page.locator('.manager-sidebar--open')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)
  })
})
