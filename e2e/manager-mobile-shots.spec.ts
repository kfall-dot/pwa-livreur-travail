import { test, expect } from '@playwright/test'
import { loginManager, loginManagerWithEmail, resetAndSeed } from './helpers'
import { BTP_ACCOUNTS, seedApprovalQueues } from './procurementApprovals'

// Viewport tactile déclaré en dur : `devices['iPhone 13']` imposerait WebKit
// (defaultBrowserType), absent de l'installation locale — le projet est chromium.
//
// Palier par défaut : 390 px (iPhone 12-14). `MOBILE_SHOTS_WIDTH=320` audite le
// palier le plus étroit encore répandu (iPhone SE, petits Android) — là où les
// barres d'onglets et les grilles cèdent en premier. La hauteur suit une
// proportion crédible pour la largeur demandée.
const SHOTS_WIDTH = Number(process.env.MOBILE_SHOTS_WIDTH ?? 390) || 390
const TIER_HEIGHTS: Record<number, number> = {
  320: 568,
  360: 740,
  375: 667,
  390: 664,
  414: 896,
  428: 926,
  768: 1024,
}

test.use({
  viewport: {
    width: SHOTS_WIDTH,
    height: TIER_HEIGHTS[SHOTS_WIDTH] ?? Math.round(SHOTS_WIDTH * 1.8),
  },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

/**
 * Banque de captures mobile — outil de revue visuelle (pas un test métier).
 *
 * Parcourt les onglets du dashboard gestionnaire à la largeur du palier choisi
 * (`MOBILE_SHOTS_WIDTH`, 390 px par défaut) et écrit une capture plein page par
 * écran dans `test-results/mobile-shots/`, pour valider d'un coup d'œil l'état
 * d'avancement du responsive. Le run échoue en listant les onglets qui font
 * encore déborder la page (le dossier est purgé au run Playwright suivant).
 *
 * Playwright crée les dossiers manquants via `path`, et `fullPage` montre le
 * rendu complet sans ouverture de navigateur.
 *
 * Onglets non exposés par le rôle du compte : silencieusement ignorés
 * (`count() === 0`) — la capture est réservée aux écrans réellement visibles.
 * D'où `MOBILE_SHOTS_ROLE`, qui choisit le compte (voir `ROLE_EMAILS`).
 *
 * @see e2e/manager-mobile.spec.ts pour les assertions fonctionnelles (tiroir).
 */
// Banque de référence à 390 px ; un palier explicite va dans son sous-dossier
// (`mobile-shots/320/…`) pour ne jamais écraser la référence.
const SHOTS_DIR = process.env.MOBILE_SHOTS_WIDTH
  ? `test-results/mobile-shots/${SHOTS_WIDTH}`
  : 'test-results/mobile-shots'

/**
 * Compte capturé. Les rôles d'approbation (CdG, DAF, PDG) n'existent que dans
 * l'entreprise BTP pilote : pour auditer les écrans d'approbation, lancer
 * `MOBILE_SHOTS_ROLE=cdg`, `daf` ou `pdg` (les comptes `@demo.fr` n'ont pas ces
 * rôles). Valeur inconnue : repli sur le compte manager standard.
 */
const SHOTS_ROLE = process.env.MOBILE_SHOTS_ROLE ?? 'manager'
// Comptes BTP pilote (e2e/procurementApprovals.ts) : chaque rôle d'approbation
// a sa file. `cmpt` (comptable) et `chef` (chef de chantier) complètent la revue.
const ROLE_EMAILS: Record<string, string | undefined> = {
  dt: BTP_ACCOUNTS.dt.email,
  sa: BTP_ACCOUNTS.sa.email,
  cdg: BTP_ACCOUNTS.cdg.email,
  daf: BTP_ACCOUNTS.daf.email,
  pdg: BTP_ACCOUNTS.pdg.email,
  cmpt: BTP_ACCOUNTS.cmpt.email,
  chef: BTP_ACCOUNTS.chef.email,
}

/** Incident de préparation de la donnée — affiché en fin de run, jamais rédhibitoire. */
const SEED_NOTES: string[] = []

// L'échantillon EB, les NIP de signature et les lignes de repli vivent dans
// `e2e/procurementApprovals.ts`, avec le circuit complet (un dossier laissé
// dans la file de chaque rôle).

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

/**
 * Écrans de détail à ouvrir depuis un onglet. Ce sont eux qui comptent : les
 * listes tiennent en 4 colonnes, alors que la fiche EB et les lignes chiffrées
 * empilent tableaux, champs et boutons d'action. `view` sélectionne l'onglet
 * interne préalable (boîte / demandes), sans quoi la ligne n'est pas affichée.
 * Faute de donnée dans le seed, la capture est sautée et signalée.
 */
const DETAIL_CAPTURES: Partial<Record<(typeof TABS)[number], { name: string; selector: string; view?: string }[]>> = {
  achats: [
    { name: 'achats-detail-brouillon', selector: '[data-testid="btp-draft-row"]', view: 'mgr-achats-inbox' },
    { name: 'achats-detail-demande', selector: '[data-testid^="mgr-achats-request-"]', view: 'mgr-achats-requests' },
  ],
}

test.describe('Manager — banque de captures mobile', () => {
  // Outil de revue : silencieux dans la suite standard (activé par
  // `MOBILE_SHOTS=1`), pour ne pas allonger chaque run ni faire échouer le
  // build le jour où un onglet déborde encore.
  test.skip(process.env.MOBILE_SHOTS !== '1', 'banque de captures : MOBILE_SHOTS=1 requis')

  // Une visite par onglet (navigation + 0,5s de stabilité) : timeout élargi.
  // Le run complet dépasse 2 min sans même parler des captures de détail.
  test.setTimeout(300_000)

  test.beforeEach(async ({ request }) => {
    await resetAndSeed(request)
    // Les files d'approbation (fiche EB du DT, dossiers à signer du CdG, du DAF
    // et du PDG) sont vides après un seed : le circuit est rejoué par l'API.
    if (ROLE_EMAILS[SHOTS_ROLE]) await seedApprovalQueues(SEED_NOTES)
  })

  test('capture de chaque onglet au palier choisi et détection des débordements', async ({ page }) => {
    const roleEmail = ROLE_EMAILS[SHOTS_ROLE]
    if (roleEmail) await loginManagerWithEmail(page, [roleEmail])
    else await loginManager(page)
    // eslint-disable-next-line no-console
    console.log(`captures mobile (${SHOTS_ROLE}, ${SHOTS_WIDTH}px) → ${SHOTS_DIR}`)

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
    const skipped: string[] = []

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
      // Les listes de l'onglet arrivent en async : mesurer (et capturer) trop
      // tôt photographierait l'état « chargement », faussement dépourvu de
      // débordement. On laisse le rendu se stabiliser et on retient la pire
      // des deux mesures.
      const overflowEarly = await horizontalOverflow()
      await page.waitForTimeout(700)
      const overflow = Math.max(overflowEarly, await horizontalOverflow())

      await page.screenshot({ path: `${SHOTS_DIR}/${String(index + 1).padStart(2, '0')}-${id}.png`, fullPage: true })
      if (overflow > 1) overflowing.push(`${id} (+${overflow}px)`)
      // Journal en direct : avec le reporter `line` et un seul test ici, le run
      // reste muet ~3 min (build Vite inclus) et on l'interrompt à tort en le
      // croyant figé. Une ligne par onglet rend la progression visible.
      // eslint-disable-next-line no-console
      console.log(`  ${id} : ${overflow > 1 ? `débordement +${overflow}px` : 'ok'}`)

      for (const detail of DETAIL_CAPTURES[id] ?? []) {
        if (detail.view) {
          const viewButton = page.getByTestId(detail.view)
          if ((await viewButton.count()) > 0) {
            await viewButton.click()
            await page.waitForTimeout(300)
          }
        }
        const row = page.locator(detail.selector).first()
        if ((await row.count()) === 0) {
          skipped.push(detail.name)
          continue
        }

        await row.click()
        await page.waitForTimeout(500)
        // Le panneau de détail (RequestDetailPanel / DraftReviewPanel) va
        // chercher ses données APRÈS le clic : même précaution que pour les
        // onglets, sinon on mesure et on capture un écran de chargement.
        const detailOverflowEarly = await horizontalOverflow()
        await page.waitForTimeout(700)
        const detailOverflow = Math.max(detailOverflowEarly, await horizontalOverflow())

        await page.screenshot({ path: `${SHOTS_DIR}/${String(index + 1).padStart(2, '0')}-${detail.name}.png`, fullPage: true })
        if (detailOverflow > 1) overflowing.push(`${detail.name} (+${detailOverflow}px)`)
        // eslint-disable-next-line no-console
        console.log(`  ${detail.name} : ${detailOverflow > 1 ? `débordement +${detailOverflow}px` : 'ok'}`)

        // Retour à la liste par rechargement : la sélection est un état local,
        // et le bouton « Retour » n'a pas de testid garanti.
        await page.goto(`/manager?tab=${id}`, { waitUntil: 'domcontentloaded' })
        await expect(toggle).toBeVisible()
      }
    }

    if (SEED_NOTES.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`préparation des écrans de détail : ${SEED_NOTES.join(' | ')}`)
    }

    if (skipped.length > 0) {
      // Pas de donnée en seed : rien à capturer, ce n'est pas un échec.
      // eslint-disable-next-line no-console
      console.log(`captures de détail ignorées (aucune donnée) : ${skipped.join(', ')}`)
    }

    expect(overflowing, `onglets qui font encore déborder la page sur mobile (${SHOTS_ROLE}, ${SHOTS_WIDTH}px)`).toEqual([])
  })
})
