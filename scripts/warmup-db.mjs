#!/usr/bin/env node
/**
 * Warm-up bloquant de la branche DB e2e (Neon) avant le build en CI.
 *
 * Pourquoi : `scripts/e2e-keepalive.mjs` fait un `SELECT 1` une fois au lancement
 * sans retry. En CI, la branche Neon peut être endormie (5 min d'inactivité,
 * build Vite ~4 min) → le webServer boot sur un pool WebSocket mort → reset/seed
 * → 500 intermittent → tous les tests d'auth échouent en cascade.
 *
 * Ce script bloque jusqu'à ce que la DB réponde (5 essais × 10s = 50s max),
 * puis sort proprement. Lancé par scripts/regression.sh avant `build:server`.
 *
 * Aligné sur e2e-keepalive.mjs : même Pool, même SELECT 1.
 */
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const url = process.env.E2E_DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim()
if (!url) {
  console.error('[warmup] E2E_DATABASE_URL requis')
  process.exit(1)
}

const pool = new Pool({ connectionString: url })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const maxAttempts = 5
const delayMs = 10_000
let lastErr = null

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await pool.query('SELECT 1')
    console.log(`[warmup] branche e2e réveillée (essai ${attempt}/${maxAttempts})`)
    await pool.end()
    process.exit(0)
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
    if (attempt < maxAttempts) {
      console.error(`[warmup] connexion impossible (essai ${attempt}/${maxAttempts}) — retry dans ${delayMs / 1000}s…`)
      await sleep(delayMs)
    }
  }
}

console.error(`[warmup] échec après ${maxAttempts} essais — dernière erreur : ${lastErr}`)
await pool.end().catch(() => undefined)
process.exit(1)
