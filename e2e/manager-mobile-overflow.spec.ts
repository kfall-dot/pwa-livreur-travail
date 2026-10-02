import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test'
import { API_BASE, loginManagerWithEmail, resetAndSeed } from './helpers'
import { BTP_ACCOUNTS, seedApprovalQueues } from './procurementApprovals'

/**
 * Garde de non-régression responsive — onglet Achats et écrans d'approbation.
 *
 * Contrairement à `manager-mobile-shots.spec.ts` (banque de captures, activée à
 * la demande par `MOBILE_SHOTS=1`), cette spec tourne avec la suite standard :
 * elle échoue dès qu'un écran dépasse la largeur du viewport. C'est le seul
 * dispositif qui empêche une nouvelle fonctionnalité de casser le mobile sans
 * qu'on le sache — d'autant que le shell gestionnaire est écrit en styles
 * inline, donc surchargeable uniquement par media query + `!important`.
 *
 * Le seed ne produit aucune EB : la préparation rejoue le circuit
 * d'approbation par l'API (`procurementApprovals`). Une préparation incomplète
 * fait ÉCHOUER le test : une garde qui passe sur des données absentes ne
 * protège rien.
 *
 * Hypothèse : `workers: 1` (playwright.config) — cette spec remet la base e2e à
 * zéro, elle ne peut pas coexister avec une autre qui la lit.
 *
 * Coût : remise à zéro et circuits d'approbation une seule fois (`beforeAll`),
 * puis une navigation par couple (rôle, palier) — ~4 à 5 min pour la matrice
 * ci-dessous. Pour alléger, réduire `AUDITED_ROLES` ou `AUDITED_WIDTHS`.
 */
const AUDITED_WIDTHS = [320, 390] as const

const TIER_HEIGHTS: Record<number, number> = { 320: 568, 390: 664 }

/**
 * Pires cas par famille d'écran, et non tous les rôles : la fiche EB (dt), le
 * chiffrage (sa), les cartes de pilotage propres au CdG (`mgr-cdg-file`, avec
 * leurs montants en gros corps) et le dossier d'approbation le plus dense (pdg,
 * seul à porter la colonne de signature PDG). DAF reste écarté : son écran est
 * un sous-ensemble de celui du PDG.
 */
const AUDITED_ROLES = ['dt', 'sa', 'cdg', 'pdg'] as const

type AuditedRole = (typeof AUDITED_ROLES)[number]

/** Écran de détail à ouvrir, et sous-onglet interne à sélectionner d'abord. */
const DETAILS: Record<AuditedRole, { name: string; view: string; selector: string }> = {
  dt: { name: 'fiche EB', view: 'mgr-achats-inbox', selector: '[data-testid="btp-draft-row"]' },
  sa: {
    name: 'demande chiffrée',
    view: 'mgr-achats-requests',
    selector: '[data-testid^="mgr-achats-request-"]',
  },
  cdg: {
    name: 'dossier d’approbation CdG',
    view: 'mgr-achats-requests',
    selector: '[data-testid^="mgr-achats-request-"]',
  },
  pdg: {
    name: 'dossier d’approbation PDG',
    view: 'mgr-achats-requests',
    selector: '[data-testid^="mgr-achats-request-"]',
  },
}

/** Débordement horizontal de la page, en pixels (0 attendu). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/**
 * Mesure après stabilisation : listes et panneau de détail chargent leurs
 * données en asynchrone, et une mesure trop précoce porterait sur un écran vide
 * — donc faussement dépourvu de débordement. On retient la pire des deux.
 */
async function stableOverflow(page: Page): Promise<number> {
  const early = await horizontalOverflow(page)
  await page.waitForTimeout(700)
  return Math.max(early, await horizontalOverflow(page))
}

/** Ouvre l'onglet Achats depuis le tiroir mobile. */
async function openAchatsTab(page: Page): Promise<void> {
  const toggle = page.getByTestId('mgr-nav-toggle')
  await expect(toggle).toBeVisible()
  await toggle.click()
  const tab = page.getByTestId('mgr-tab-achats')
  await expect(tab).toBeVisible()
  await tab.click()
  // Le tiroir se referme à la navigation (transition 0.22s).
  await expect(page.locator('.manager-sidebar--open')).toHaveCount(0)
  await page.waitForTimeout(500)
}

test.describe('Manager — garde responsive (Achats et approbations)', () => {
  // Remise à zéro + circuits + navigation : marge large.
  test.setTimeout(300_000)

  /**
   * Préparation faite UNE fois pour toute la matrice : sinon chaque test
   * remettait la base à zéro et rejouait un circuit — 6 × 1 min pour des tests
   * qui ne font que lire. Ils sont en lecture seule (navigation + mesure), et
   * `workers: 1` garantit qu'aucune autre spec ne touche la base en parallèle.
   */
  let api: APIRequestContext
  const PREP_NOTES: string[] = []

  test.beforeAll(async () => {
    // Un run de plusieurs minutes sans message est un run qu'on interrompt à
    // tort : la progression est donc annoncée dès la première seconde.
    console.log('préparation (une fois) : remise à zéro de la base e2e…')
    api = await pwRequest.newContext({ baseURL: API_BASE })
    await resetAndSeed(api)
    // Trois circuits pour quatre rôles : `dt` et `sa` lisent la même file
    // (`submitted`), le CdG la sienne (`cdg_review` — seule étape où son bloc
    // d'approbation s'affiche) et le PDG la sienne (`pdg_review`).
    await seedApprovalQueues(PREP_NOTES, 'dt')
    await seedApprovalQueues(PREP_NOTES, 'cdg')
    await seedApprovalQueues(PREP_NOTES, 'pdg')
    console.log(
      PREP_NOTES.length === 0
        ? 'préparation : terminée'
        : `préparation : incidents — ${PREP_NOTES.join(' | ')}`,
    )
  })

  test.afterAll(async () => {
    await api?.dispose()
  })

  for (const width of AUDITED_WIDTHS) {
    test.describe(`palier ${width}px`, () => {
      test.use({
        viewport: { width, height: TIER_HEIGHTS[width] ?? 700 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      })

      for (const role of AUDITED_ROLES) {
        test(`Achats — ${role}`, async ({ page }) => {
          const detail = DETAILS[role]

          // Sans dossier dans la file du rôle, l'écran de détail n'existe pas —
          // et une garde qui valide un écran absent ne protège rien. Un circuit
          // incomplet (préparé en beforeAll) est donc un ÉCHEC.
          expect(PREP_NOTES, 'préparation du circuit d’approbation').toEqual([])

          // Connexion : `loginManagerWithEmail` utilise le mot de passe démo
          // partagé (admin1234), identique au défaut du seed BTP
          // (`MANAGER_PASSWORD ?? 'admin1234'`). Un MANAGER_PASSWORD personnalisé
          // dans .env.e2e.local obligerait à adapter aussi ce helper.
          await loginManagerWithEmail(page, [BTP_ACCOUNTS[role].email])
          await openAchatsTab(page)

          const listOverflow = await stableOverflow(page)
          console.log(
            `  ${role} @ ${width}px — onglet Achats : ${listOverflow > 1 ? `débordement +${listOverflow}px` : 'ok'}`,
          )
          expect(
            listOverflow,
            `onglet Achats déborde de ${listOverflow}px à ${width}px (${role})`,
          ).toBeLessThanOrEqual(1)

          await page.getByTestId(detail.view).click()
          await page.waitForTimeout(300)

          const row = page.locator(detail.selector).first()
          await expect(row, `${detail.name} : donnée absente pour ${role}`).toBeVisible()
          await row.click()
          await page.waitForTimeout(500)

          const detailOverflow = await stableOverflow(page)
          console.log(
            `  ${role} @ ${width}px — ${detail.name} : ${detailOverflow > 1 ? `débordement +${detailOverflow}px` : 'ok'}`,
          )
          expect(
            detailOverflow,
            `${detail.name} déborde de ${detailOverflow}px à ${width}px (${role})`,
          ).toBeLessThanOrEqual(1)
        })
      }
    })
  }
})
