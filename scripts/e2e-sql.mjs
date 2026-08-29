#!/usr/bin/env node
/**
 * Exécute une requête SQL sur la branche DB e2e (E2E_DATABASE_URL).
 * Remplace `npx netlify database connect --query` dans e2e/00-dev-setup.spec.ts —
 * le CLI Netlify n'est plus requis depuis que les e2e tournent sur Express seul.
 * Usage : node scripts/e2e-sql.mjs "UPDATE …"
 */
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const url = process.env.E2E_DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim()
if (!url) {
  console.error('E2E_DATABASE_URL (ou NETLIFY_DB_URL) requis')
  process.exit(1)
}

const sql = process.argv[2]
if (!sql) {
  console.error('Usage: node scripts/e2e-sql.mjs "<sql>"')
  process.exit(1)
}

const pool = new Pool({ connectionString: url })
try {
  const res = await pool.query(sql)
  if (res.rowCount != null && res.rowCount > 0) console.log(`e2e-sql: ${res.rowCount} ligne(s)`)
  else console.log('e2e-sql: ok')
} finally {
  await pool.end()
}
