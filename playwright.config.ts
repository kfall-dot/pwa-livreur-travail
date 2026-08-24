import { defineConfig, devices } from '@playwright/test'
import { isProtectedProductionDatabase } from './server/config/databaseProtection.js'

/**
 * E2E test setup uses `netlify dev` as the single web server.
 * This provides Netlify DB, Blobs, and Functions in one proxy on port 8888.
 *
 * Requirements:
 *   - Project linked:  netlify link   (or NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN in CI)
 *   - DB branche E2E : E2E_DATABASE_URL (pas la prod pilote — voir docs/SECURITY-OPS.md §4)
 *   - Migrations:      npm run db:migrate (avec E2E_DATABASE_URL exportée)
 *
 * Run tests:  npm run test:e2e
 */

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim()
if (!e2eDatabaseUrl && process.env.CI) {
  throw new Error(
    'E2E_DATABASE_URL manquant en CI — configurez un secret GitHub pointant vers une branche DB dev.',
  )
}
if (e2eDatabaseUrl && isProtectedProductionDatabase(e2eDatabaseUrl)) {
  throw new Error(
    'E2E_DATABASE_URL pointe vers la base pilote production — utilisez une branche DB dédiée.',
  )
}
if (!e2eDatabaseUrl && !process.env.CI) {
  console.warn(
    '[e2e] E2E_DATABASE_URL non défini — netlify dev utilisera la DB du site lié. ' +
      'Si c’est la prod pilote, resetAndSeed sera refusé (protection active).',
  )
}

/** Aligné sur e2e/helpers.ts NETLIFY_DEV_PORT */
const PORT = 8888
const BASE = `http://localhost:${PORT}`

// netlify dev + Vite cold start (Neon, port 5199) — /api/health seul peut répondre avant le front
const SERVER_TIMEOUT = process.env.CI ? 180_000 : 120_000

/** Env serveur + Vite pour netlify dev (CI et local). Voir config/validations-tests.env */
const E2E_SERVER_ENV: Record<string, string> = {
  GEOFENCE_BYPASS: 'true',
  OTP_CODE: '123456',
  ALLOW_RESET: 'true',
  ALLOW_SEED: 'true',
  ALLOW_WIPE_USERS: 'true',
  ADMIN_API_TOKEN: 'e2e-admin-token-dev-only',
  EMAIL_PROVIDER: 'mock',
  SMS_PROVIDER: 'mock',
  SMS_OTP_FAIL_OPEN: 'true',
  PUBLIC_BASE_URL: `http://localhost:${PORT}`,
  VITE_E2E: 'true',
  CHOKIDAR_USEPOLLING: '1',
  CHOKIDAR_INTERVAL: '2000',
  VITE_GEOFENCE_BYPASS: 'true',
  VITE_PHOTOS_BYPASS: 'true',
  PUBLIC_DEMO_ENABLED: 'true',
  NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN ?? '',
  NETLIFY_SITE_ID: process.env.NETLIFY_SITE_ID ?? '',
  ...(process.env.CI ? { CI: process.env.CI } : {}),
  ...(e2eDatabaseUrl ? { NETLIFY_DB_URL: e2eDatabaseUrl, E2E_DATABASE_URL: e2eDatabaseUrl } : {}),
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    geolocation: { latitude: 48.892, longitude: 2.412 },
    permissions: ['geolocation'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run netlify:dev',
    // /login passe par Vite — plus fiable que /api/health seul au cold start
    url: `${BASE}/login`,
    stdout: /framework dev server ready/i,
    reuseExistingServer: !process.env.CI,
    timeout: SERVER_TIMEOUT,
    env: E2E_SERVER_ENV,
  },
})
