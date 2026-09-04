import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Port du serveur e2e (scripts/e2e-server.sh) — unique point d'entrée. */
export const NETLIFY_DEV_PORT = 8888
export const API_BASE = `http://localhost:${NETLIFY_DEV_PORT}`

const API = API_BASE

/** Phrase alignée sur server/config/adminConfirm.ts */
export const RESET_CONFIRM_PHRASE = 'SUPPRIMER TOUTES LES DONNÉES'

/**
 * Jeton admin pour reset/seed (aligné sur playwright.config E2E_SERVER_ENV).
 * Header X-Admin-Token — évite le problème poule/œuf après wipe DB.
 */
export const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN ?? 'e2e-admin-token-dev-only'

function adminHeaders(): Record<string, string> {
  return { 'X-Admin-Token': ADMIN_API_TOKEN }
}

/** Attente UI après cold start netlify dev + Vite (plus long que le timeout Playwright par défaut). */
export const UI_READY_TIMEOUT = 30_000

/**
 * Wipe all DB data then insert a clean demo driver + tour for today.
 * Call this in beforeAll / beforeEach to ensure test isolation.
 */
export async function resetAndSeed(request: APIRequestContext): Promise<void> {
  const reset = await request.post(`${API}/api/admin/reset`, {
    headers: adminHeaders(),
    data: { confirm: RESET_CONFIRM_PHRASE },
  })
  if (!reset.ok()) {
    throw new Error(`Reset failed: ${reset.status()} — ${await reset.text()}`)
  }
  const seed = await request.post(`${API}/api/admin/seed`, {
    headers: adminHeaders(),
  })
  if (!seed.ok()) {
    throw new Error(`Seed failed: ${seed.status()} — ${await seed.text()}`)
  }
}

/** @deprecated use resetAndSeed */
export async function resetMockTour(request: APIRequestContext): Promise<void> {
  return resetAndSeed(request)
}

/**
 * Seeded driver credentials — keep in sync with server/db/seed.ts DEMO constants.
 */
export const DEMO_DRIVER = {
  phone: '+2250701234567',
  pin: '1234',
} as const

export const DEMO_MANAGER = {
  email: 'manager@demo.fr',
  password: 'admin1234',
} as const

/**
 * En dev local, `scripts/netlify-dev.sh` définit par défaut SEED_MANAGER_EMAIL
 * (pilote) et le seed réaligne l'e-mail du manager démo dessus. `manager@demo.fr`
 * n'existe alors plus : on tente cet e-mail en repli. En CI, SEED_MANAGER_EMAIL
 * n'est pas défini → `manager@demo.fr` réussit au premier essai.
 */
const PILOT_MANAGER_EMAIL = 'kfallet@gmail.com'

/** Stable tour id from server/db/seed.ts — keep in sync with DEMO.TOUR_ID */
export const DEMO_TOUR_ID = 'tour-demo-today'

/** Page login livreur prête (cookies effacés, IndexedDB reset, formulaire visible). */
export async function prepareDriverLogin(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    localStorage.clear()
    sessionStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('livreur-pwa')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error ?? new Error('indexedDB delete failed'))
      req.onblocked = () => resolve()
    })
  })
  await page.goto('/login', { waitUntil: 'load' })
  await expect(page.getByTestId('phone-input')).toBeVisible({ timeout: UI_READY_TIMEOUT })
  await expect(page.getByTestId('pin-input')).toBeVisible()
  await expect(page.getByTestId('login-submit')).toBeVisible()
}

export async function loginDriver(page: Page): Promise<void> {
  await page.getByTestId('phone-input').fill(DEMO_DRIVER.phone)
  await page.getByTestId('pin-input').fill(DEMO_DRIVER.pin)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/', { timeout: UI_READY_TIMEOUT })
}

/**
 * Connexion manager côté API (mêmes replis d'e-mail que `loginManager`).
 * Le contexte de requête conserve le cookie de session pour les appels suivants.
 */
export async function managerApiLogin(request: APIRequestContext): Promise<void> {
  for (const email of [DEMO_MANAGER.email, PILOT_MANAGER_EMAIL]) {
    const res = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email, password: DEMO_MANAGER.password },
    })
    if (res.ok()) return
  }
  throw new Error('Connexion manager impossible (e-mail démo et pilote refusés)')
}

/** Compte SA (Service Achats) du seed démo (co-demo) — peut modifier les tournées. */
export const DEMO_SA_MANAGER = {
  email: 'sa@demo.fr',
  password: 'admin1234',
} as const

/** Compte DT (Directeur technique) créé par seedBtpPilot — consultation seule. */
export const DEMO_DT_MANAGER = {
  email: 'dt@btp-pilote.ci',
  password: 'admin1234',
} as const

export async function loginManager(page: Page): Promise<void> {
  await loginManagerWithEmail(page, [DEMO_MANAGER.email, PILOT_MANAGER_EMAIL])
}

/** Connexion manager avec une liste d'e-mails candidats (repli pilote inclus). */
export async function loginManagerWithEmail(page: Page, candidates: string[]): Promise<void> {
  await page.goto('/manager/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mgr-login-email')).toBeVisible({ timeout: UI_READY_TIMEOUT })
  for (let i = 0; i < candidates.length; i++) {
    const isLast = i === candidates.length - 1
    await page.getByTestId('mgr-login-email').fill(candidates[i])
    await page.getByTestId('mgr-login-password').fill(DEMO_MANAGER.password)
    await page.getByTestId('mgr-login-submit').click()
    try {
      // La page de login peut rediriger vers /manager?tab=achats selon le rôle
      // (deep-link onglet Achats pour les rôles procurement) → match par regex.
      await page.waitForURL(/\/manager/, { timeout: isLast ? UI_READY_TIMEOUT : 8_000 })
      return
    } catch (err) {
      if (isLast) throw err
      // e-mail démo réaligné sur l'e-mail pilote en local — on tente le repli
    }
  }
}

/** Parcours livreur minimal : livraison complète de del-1 (3 palettes). */
export async function completeDeliveryDel1(page: Page): Promise<void> {
  await page.getByTestId('delivery-card-del-1').click()
  await page.getByTestId('start-delivery').click()
  await page.getByTestId('simulate-photo').click()
  await page.getByTestId('go-declare').click()
  await page.getByTestId('declare-outcome-full').check()
  await page.getByTestId('save-declaration').click()
  await page.getByTestId('send-otp').click()
  await page.getByLabel('Code à 6 chiffres').fill('123456')
  await page.getByTestId('otp-continue').click()
  await page.getByTestId('confirm-delivery').click()
  await expect(page.getByTestId('confirm-receipt')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL('/')
}

/** Livreur : del-1 démarrée, photos + déclaration, OTP envoyé (attente code). */
export async function bringDeliveryDel1ToOtpSent(page: Page): Promise<void> {
  await page.getByTestId('delivery-card-del-1').click()
  await page.getByTestId('start-delivery').click()
  await page.getByTestId('simulate-photo').click()
  await page.getByTestId('go-declare').click()
  await page.getByTestId('declare-outcome-full').check()
  await page.getByTestId('save-declaration').click()
  await page.getByTestId('send-otp').click()
  await expect(page.getByLabel('Code à 6 chiffres')).toBeVisible({ timeout: 15_000 })
}
