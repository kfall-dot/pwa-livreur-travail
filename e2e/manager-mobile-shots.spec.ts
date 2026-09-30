import { test, expect, request as newApiRequest, type APIRequestContext } from '@playwright/test'
import { API_BASE, DEMO_DT_MANAGER, DEMO_SA_MANAGER, loginManager, loginManagerWithEmail, resetAndSeed } from './helpers'

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
 * Onglets non exposés par le rôle du compte : silencieusement ignorés
 * (`count() === 0`) — la capture est réservée aux écrans réellement visibles.
 * D'où `MOBILE_SHOTS_ROLE`, qui choisit le compte (voir `ROLE_EMAILS`).
 *
 * @see e2e/manager-mobile.spec.ts pour les assertions fonctionnelles (tiroir).
 */
const SHOTS_DIR = 'test-results/mobile-shots'

/**
 * Compte capturé. Un manager logistique ne voit aucun onglet achats : pour
 * auditer ces écrans, lancer `MOBILE_SHOTS_ROLE=sa` (Service achats) ou `dt`
 * (Direction technique) — comptes du seed démo. Valeur inconnue : repli sur le
 * compte manager standard.
 */
const SHOTS_ROLE = process.env.MOBILE_SHOTS_ROLE ?? 'manager'
const ROLE_EMAILS: Record<string, string | undefined> = {
  sa: DEMO_SA_MANAGER.email,
  dt: DEMO_DT_MANAGER.email,
}

/** Incident de préparation de la donnée — affiché en fin de run, jamais rédhibitoire. */
const SEED_NOTES: string[] = []

const EB_SAMPLE = `Besoins chantier :
50 sacs ciment CPA 50kg
20 barres fer a beton HA12 12m
10 lites de parpaings 15`

/**
 * NIP acceptés par `verifySignaturePin` (server/services/ebSignature.ts) : soit
 * le NIP de démo du compte (`mgr-btp-dt` → 1234), soit son mot de passe comparé
 * en bcrypt. On tente les deux plutôt que d'en coder un seul en dur.
 */
const SUBMIT_PINS = ['admin1234', '1234']

/**
 * Lignes de repli quand le parseur local ne reconnaît rien dans l'échantillon :
 * la soumission est refusée en 400 sur `lines.length === 0` (route submit).
 */
const EB_FALLBACK_LINES = [
  { label: 'Ciment CPA 50 kg', quantity: 50, unit: 'sac' },
  { label: 'Fer à béton HA12 (12 m)', quantity: 20, unit: 'barre' },
]

/**
 * Le seed ne crée ni brouillon EB ni demande : sans donnée, la fiche EB et la
 * demande chiffrée — les deux écrans les plus denses, là où le responsive
 * casse — restent invisibles. On les fabrique par l'API, dans le circuit réel :
 * un DT colle une EB, en conserve un brouillon (fiche du DT) et en soumet un
 * autre (demande vue par le Service achats). Meilleure effort : un refus
 * serveur (NIP, garde-fou de validation) est noté sans faire échouer le run.
 */
async function seedEbScreens(): Promise<void> {
  const ctx = await newApiRequest.newContext({ baseURL: API_BASE })
  try {
    const login = await ctx.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_DT_MANAGER.email, password: DEMO_DT_MANAGER.password },
    })
    if (!login.ok()) {
      SEED_NOTES.push(`connexion DT refusée (${login.status()}) — écrans de détail non préparés`)
      return
    }

    // Le seed démo ne crée AUCUN chantier, et la soumission exige un brouillon
    // rattaché (400 « Chantier requis »). La route POST /sites est ouverte au DT
    // (siteSchema : name + address) : on en crée un plutôt que d'abandonner.
    const sitesRes = await ctx.get(`${API_BASE}/api/v1/procurement/sites`)
    let siteId = sitesRes.ok()
      ? ((await sitesRes.json()) as { sites?: { id: string }[] }).sites?.[0]?.id
      : undefined
    if (!siteId) {
      const created = await ctx.post(`${API_BASE}/api/v1/procurement/sites`, {
        data: { name: 'Chantier revue responsive', address: 'Abidjan — Yopougon' },
      })
      siteId = created.ok()
        ? ((await created.json()) as { site?: { id: string } }).site?.id
        : undefined
      if (!siteId) {
        SEED_NOTES.push(
          `création de chantier impossible (${created.status()}) — demande chiffrée non capturable`,
        )
      }
    }

    for (const shouldSubmit of [false, true]) {
      const paste = await ctx.post(`${API_BASE}/api/v1/procurement/drafts/from-paste`, {
        data: { bodyText: EB_SAMPLE, siteId },
      })
      if (!paste.ok()) {
        SEED_NOTES.push(`collage refusé (${paste.status()}) — fiche EB non capturable`)
        return
      }
      const { draftId, lines } = (await paste.json()) as { draftId?: string; lines?: unknown[] }
      if (!draftId) continue

      // Parseur local muet sur un texte d'essai : sans ligne, la fiche est vide
      // et la soumission part en 400 « Aucune ligne à soumettre ».
      if (!Array.isArray(lines) || lines.length === 0) {
        const patch = await ctx.patch(
          `${API_BASE}/api/v1/procurement/drafts/${encodeURIComponent(draftId)}`,
          { data: { parsedLines: EB_FALLBACK_LINES, siteId } },
        )
        if (!patch.ok()) SEED_NOTES.push(`ajout de lignes refusé (${patch.status()})`)
      }

      if (!shouldSubmit) continue
      // Sans chantier, pas de soumission possible — mais le brouillon reste
      // créé : la capture de la fiche EB ne doit jamais dépendre du chantier.
      if (siteId) await submitDraftWithPin(ctx, draftId)
    }
  } catch (err) {
    SEED_NOTES.push(`préparation EB impossible : ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await ctx.dispose()
  }
}

/**
 * Soumission de l'EB par le DT — produit la demande que voit le Service achats.
 * `verifySignaturePin` accepte le NIP de démo du compte OU son mot de passe
 * (comparaison bcrypt) : on essaie les deux. Un 401 signifie « NIP refusé », on
 * passe au suivant ; tout autre code révèle un manque réel (chantier, lignes),
 * où insister ne servirait à rien.
 */
async function submitDraftWithPin(ctx: APIRequestContext, draftId: string): Promise<void> {
  let status = 0
  for (const pin of SUBMIT_PINS) {
    const res = await ctx.post(
      `${API_BASE}/api/v1/procurement/drafts/${encodeURIComponent(draftId)}/submit`,
      {
        data: {
          requesterName: 'Conducteur de travaux',
          objet: 'EB de revue responsive',
          pin,
        },
      },
    )
    status = res.status()
    if (res.ok()) return
    if (status !== 401) break
  }
  SEED_NOTES.push(`soumission refusée (${status}) — demande chiffrée non capturable`)
}

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
    // Les écrans achats du rôle capturé réclament de la donnée (fiche EB,
    // demande) que le seed ne produit pas.
    if (ROLE_EMAILS[SHOTS_ROLE]) await seedEbScreens()
  })

  test('capture de chaque onglet à 390px et détection des débordements', async ({ page }) => {
    const roleEmail = ROLE_EMAILS[SHOTS_ROLE]
    if (roleEmail) await loginManagerWithEmail(page, [roleEmail])
    else await loginManager(page)
    // eslint-disable-next-line no-console
    console.log(`captures mobile (${SHOTS_ROLE}) → ${SHOTS_DIR}`)

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

    expect(overflowing, `onglets qui font encore déborder la page sur mobile (${SHOTS_ROLE})`).toEqual([])
  })
})
