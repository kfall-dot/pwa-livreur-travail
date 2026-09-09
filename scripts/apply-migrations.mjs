/**
 * Applique les migrations SQL à une base cible (ex. nouvelle base Neon après
 * migration hors Netlify DB). Idempotent : chaque migration appliquée est
 * enregistrée dans la table __migration_history.
 *
 * Usage : TARGET_DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const url = (process.env.TARGET_DATABASE_URL ?? '').trim()
if (!url) {
  console.error('TARGET_DATABASE_URL manquante')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const repo = dirname(here)
const roots = [join(repo, 'server/db/migrations'), join(repo, 'netlify/database/migrations')]

const folders = []
for (const root of roots) {
  if (!existsSync(root)) continue
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sql = join(root, entry.name, 'migration.sql')
    if (existsSync(sql)) folders.push({ name: entry.name, path: sql })
  }
}
folders.sort((a, b) => a.name.localeCompare(b.name))
if (folders.length === 0) {
  console.error('Aucune migration trouvée')
  process.exit(1)
}

const c = new Client({ connectionString: url, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('create table if not exists __migration_history (name text primary key, applied_at timestamptz default now())')
const done = new Set((await c.query('select name from __migration_history')).rows.map((r) => r.name))

let applied = 0
for (const m of folders) {
  if (done.has(m.name)) {
    console.log(`skip ${m.name} (déjà appliquée)`)
    continue
  }
  const sql = readFileSync(m.path, 'utf8')
  try {
    await c.query('begin')
    await c.query(sql)
    await c.query('insert into __migration_history(name) values ($1)', [m.name])
    await c.query('commit')
    applied++
    console.log(`ok   ${m.name}`)
  } catch (e) {
    await c.query('rollback')
    console.error(`FAIL ${m.name}: ${e.message.split('\n')[0].slice(0, 160)}`)
    process.exit(1)
  }
}

const tables = await c.query("select count(*)::int n from information_schema.tables where table_schema='public'")
console.log(`\nTerminé : ${applied} migration(s) appliquée(s), ${tables.rows[0].n} tables publiques.`)
await c.end()
