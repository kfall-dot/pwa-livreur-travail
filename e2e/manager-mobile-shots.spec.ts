import { test, expect } from '@playwright/test'
import { loginManager, resetAndSeed } from './helpers'

// Viewport tactile déclaré en dur : `devices['iPhone 13']` imposerait WebKit
// (defaultBrowserType), absent de l'installation locale — le projet est chromium.
test.use({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

/**
 * Banque de captures mobile — outil de revue visuelle (pas un test métier).
 *
 * Parcourt les onglets du dashboard gestionnaire à 390px et écrit une capture
 * plein page par écran dans `test-results/mobile-shots/`, pour valider d'un
 * coup d'œil l'état d'avancement du responsive. Le run échoue en listant les
 * onglets qui font encore déborder la page (le dossier est purgé au run
 * Playwright suivant).
 *
 * Playwright crée les dossiers manquants via `path`, et `fullPage` montre le
 * rendu complet sans ouverture de navigateur.
 *
 * Onglets non exposés par le rôle du compte de démo : silencieusement ignorés
 * (`count() === 0`) — la capture est réservée aux écrans réellement visibles.
 *
 * @see e2e/manager-mobile.spec.ts pour les assertions fonctionnelles (tiroir).
 */
const SHOTS_DIR = 'test-results/mobile-shots'

/** Ordre de la sidebar ; seuls les onglets présents dans le DOM sont capturés. */
const TABS = [
  'maJournee',
  'achats',
  'comptabilite',
  'suiviChantier',
  'suiviBc',
  'suivi',
  'planifier',
  'produits',
  'unites',
  'points',
  'fournisseurs',
  'livreurs',
  'gestionnaires',
  'taches',
] as const

test.describe('Manager — banque de captures mobile', () => {
  // Outil de revue : silencieux dans la suite standard (activé par
  // `MOBILE_SHOTS=1`), pour ne pas allonger chaque run ni faire échouer le
  // build le jour où un onglet déborde encore.
  test.skip(process.env.MOBILE_SHOTS !== '1', 'banque de captures : MOBILE_SHOTS=1 requis')

  // Une visite par onglet (navigation + 0,5s de stabilité) : timeout élargi.
  test.setTimeout(180_000)

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
  })

  test('capture de chaque onglet à 390px et détection des débordements', async ({ page }) => {
    await loginManager(page)

    const horizontalOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

    // 00 : le tiroir ouvert, élément le plus sensible du shell mobile.
    const toggle = page.getByTestId('mgr-nav-toggle')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('.manager-sidebar--open')).toBeVisible()
    await page.screenshot({ path: `${SHOTS_DIR}/00-tiroir-ouvert.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)

    const overflowing: string[] = []

    for (let index = 0; index < TABS.length; index += 1) {
      const id = TABS[index]
      const button = page.getByTestId(`mgr-tab-${id}`)
      if ((await button.count()) === 0) continue

      // Le bouton vit dans le tiroir (hors écran tant qu'il est fermé).
      await toggle.click()
      await expect(page.locator('.manager-sidebar--open')).toBeVisible()
      await button.click()
      // Le tiroir se referme à la navigation (transition 0.22s) : on attend
      // cet état déterministe plutôt que `networkidle`, qui peut ne jamais se
      // produire avec le HMR / les WebSockets du serveur de dev.
      await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)
      await page.waitForTimeout(500)

      await page.screenshot({ path: `${SHOTS_DIR}/${String(index + 1).padStart(2, '0')}-${id}.png`, fullPage: true })

      const overflow = await horizontalOverflow()
      if (overflow > 1) overflowing.push(`${id} (+${overflow}px)`)
    }

    expect(overflowing, 'onglets qui font encore déborder la page sur mobile').toEqual([])
  })
})
