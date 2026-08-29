#!/usr/bin/env node
/**
 * Keep-alive de la branche DB e2e (E2E_DATABASE_URL) : SELECT 1 toutes les 45s.
 * Les branches Neon s'auto-suspendent après ~5 min d'inactivité — pendant le
 * build Vite de scripts/e2e-server.sh, la branche s'endort et les premières
 * queries du serveur tapent un WebSocket mort (hang silencieux).
 * Lancé en arrière-plan par scripts/e2e-server.sh, tué à la sortie (trap).
 */
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const url = process.env.E2E_DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim()
if (!url) {
  console.error('[keepalive] E2E_DATABASE_URL requis')
  process.exit(1)
}

const pool = new Pool({ connectionString: url })

try {
  await pool.query('SELECT 1')
  console.log('[keepalive] branche e2e réveillée')
} catch (err) {
  console.error('[keepalive] warmup échoué:', String(err && err.message ? err.message : err))
}

setInterval(() => {
  pool.query('SELECT 1').catch((err) => {
    console.error('[keepalive] ping échoué:', String(err && err.message ? err.message : err))
  })
}, 45_000)
