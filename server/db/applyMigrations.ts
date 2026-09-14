import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from './index.js'

/**
 * Applique les migrations SQL au démarrage du serveur Node (Railway).
 *
 * - Idempotent : chaque migration appliquée est enregistrée dans la table
 *   `__migration_history` (même table que scripts/apply-migrations.mjs).
 * - Transactionnel : une migration en échec est rollback et stoppe le boot.
 * - Les dossiers sont triés par nom (convention YYYYMMDDHHMMSS_description).
 *
 * Désactivation ponctuelle : SKIP_MIGRATIONS=1.
 */
export async function applyMigrations(): Promise<void> {
  // Racine du dépôt : cwd (Railway = racine du repo) ou déduite de ce fichier
  // compilé (dist-server/server/db/applyMigrations.js → 3 niveaux au-dessus).
  const here = dirname(fileURLToPath(import.meta.url))
  const roots = [
    join(process.cwd(), 'server/db/migrations'),
    join(here, '../../../server/db/migrations'),
  ]

  const folders: { name: string; path: string }[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sql = join(root, entry.name, 'migration.sql')
      if (existsSync(sql)) folders.push({ name: entry.name, path: sql })
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name))
  // Dédoublonnage par nom (les deux racines peuvent pointer vers le même dossier)
  const seen = new Set<string>()
  const unique = folders.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)))

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('create table if not exists __migration_history (name text primary key, applied_at timestamptz default now())')
    const doneRes = await client.query('select name from __migration_history')
    const done = new Set(doneRes.rows.map((r: { name: string }) => r.name))

    let applied = 0
    for (const m of unique) {
      if (done.has(m.name)) continue
      const sql = readFileSync(m.path, 'utf8')
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into __migration_history(name) values ($1)', [m.name])
        await client.query('commit')
        applied++
        console.log(`[migrations] ok   ${m.name}`)
      } catch (err) {
        await client.query('rollback')
        const msg = err instanceof Error ? err.message.split('\n')[0].slice(0, 160) : String(err)
        throw new Error(`[migrations] FAIL ${m.name} : ${msg}`)
      }
    }
    console.log(`[migrations] ${applied} appliquée(s), ${unique.length - applied} déjà en place`)
  } finally {
    client.release()
  }
}