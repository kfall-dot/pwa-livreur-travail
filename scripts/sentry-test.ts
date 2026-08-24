#!/usr/bin/env npx tsx
/**
 * Envoie une erreur test vers Sentry (API).
 * Usage : SENTRY_DSN=https://...@....ingest.sentry.io/... npm run sentry:test
 */
import { initSentry, captureException, flushSentry, isSentryReady } from '../server/lib/sentry.js'

const dsn = process.env.SENTRY_DSN?.trim()
if (!dsn) {
  console.error('❌ SENTRY_DSN manquant.')
  console.error('   Copiez le DSN depuis Sentry → Settings → Client Keys (DSN)')
  console.error('   Puis : SENTRY_DSN="https://..." npm run sentry:test')
  process.exit(1)
}

initSentry()
if (!isSentryReady()) {
  console.error('❌ Sentry non initialisé — vérifiez le DSN.')
  process.exit(1)
}

const err = new Error('TraceO Sentry test — supprimez cet issue après vérification')
captureException(err, { route: 'sentry-test-script', ts: new Date().toISOString() })

await flushSentry(5000)
console.log('✅ Erreur test envoyée.')
console.log('   → Sentry → Issues (apparaît sous ~30 s)')
console.log('   Message attendu : "TraceO Sentry test — supprimez cet issue après vérification"')
