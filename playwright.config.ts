import { defineConfig, devices } from '@playwright/test'
import { isProtectedProductionDatabase } from './server/config/databaseProtection.js'

/**
 * E2E : serveur autonome `scripts/e2e-server.sh` — un seul process Express
 * qui sert le frontend compilé (dist/) et l'API sur la même origine :8888,
 * comme en production Railway. Plus de netlify dev (CLI instable, photos
 * Blobs ≠ Railway, timeout functions 30s).
 *
 * Requirements:
 *   - DB branche E2E : E2E_DATABASE_URL (pas la prod pilote — voir docs/SECURITY-OPS.md §4)
 *   - Migrations:      appliquées automatiquement par scripts/e2e-server.sh
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
    '[e2e] E2E_DATABASE_URL non défini — créez .env.e2e.local (scripts/e2e-server.sh la requiert).',
  )
}

/** Aligné sur e2e/helpers.ts NETLIFY_DEV_PORT */
const PORT = 8888
const BASE = `http://localhost:${PORT}`

// Build Vite (~1-2 min machine lente) + boot Express — le /api/health
// ne répond qu'une fois le serveur réellement prêt (build inclus).
const SERVER_TIMEOUT = 420_000

/** Env serveur + build Vite pour scripts/e2e-server.sh (CI et local). Voir config/validations-tests.env */
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
  // Pas de Netlify Blobs en e2e : photos sur disque local, comme en prod Railway.
  PHOTO_STORAGE: 'local',
  PUBLIC_BASE_URL: `http://localhost:${PORT}`,
  VITE_E2E: 'true',
  VITE_GEOFENCE_BYPASS: 'true',
  VITE_PHOTOS_BYPASS: 'true',
  PUBLIC_DEMO_ENABLED: 'true',
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
    // Express + dist — même origine que la prod Railway (plus de netlify dev).
    command: 'bash scripts/e2e-server.sh',
    // Le serveur ne répond qu'après le build Vite : /api/health suffit.
    url: `${BASE}/api/health`,
    stdout: /API Livreur/,
    reuseExistingServer: !process.env.CI,
    timeout: SERVER_TIMEOUT,
    env: E2E_SERVER_ENV,
  },
})
