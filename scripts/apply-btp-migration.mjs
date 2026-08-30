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

// Depuis la bascule « tout sur Railway », les migrations vivent dans le repo
// (server/db/migrations) et sont appliquées au démarrage du conteneur —
// plus de dépendance au runner Netlify.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../server/db/migrations')
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /btp_procurement|eb_fiche|eb_line_price|catalog_chantiers|site_budget|cdg_review|eb_line_spend|bc_register|draft_soft_delete|daily_reports/.test(d.name))
  .map((d) => d.name)
  .sort()

const pool = new Pool({ connectionString: url })
try {
  let applied = 0
  let skipped = 0
  for (const name of dirs) {
    const sqlPath = join(migrationsDir, name, 'migration.sql')
    try {
      await pool.query(readFileSync(sqlPath, 'utf8'))
      applied += 1
      console.log(`Appliquée : ${name}`)
    } catch (err) {
      // Migration déjà appliquée (objet existant) ou non applicable ici :
      // on log et on continue — chaque migration est indépendante.
      skipped += 1
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.warn(`Ignorée (${msg}) : ${name}`)
    }
  }
  console.log(`Migrations BTP terminées : ${applied} appliquée(s), ${skipped} ignorée(s).`)
} finally {
  await pool.end()
}
