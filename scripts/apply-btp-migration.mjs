#!/usr/bin/env node
/**
 * Applique les migrations BTP procurement sur NETLIFY_DB_URL / E2E_DATABASE_URL.
 * Usage : node scripts/apply-btp-migration.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const url = process.env.NETLIFY_DB_URL?.trim() || process.env.E2E_DATABASE_URL?.trim()
if (!url) {
  console.error('NETLIFY_DB_URL ou E2E_DATABASE_URL requis')
  process.exit(1)
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../netlify/database/migrations')
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /btp_procurement|eb_fiche|eb_line_price|catalog_chantiers|site_budget|cdg_review|eb_line_spend|bc_register|draft_soft_delete/.test(d.name))
  .map((d) => d.name)
  .sort()

const pool = new Pool({ connectionString: url })
try {
  for (const name of dirs) {
    const sqlPath = join(migrationsDir, name, 'migration.sql')
    console.log(`Applying ${name}...`)
    await pool.query(readFileSync(sqlPath, 'utf8'))
  }
  console.log('BTP migrations applied.')
} finally {
  await pool.end()
}
