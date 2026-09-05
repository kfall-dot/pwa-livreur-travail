// One-off : applique toutes les migrations (socle + BTP) sur une base vide.
import fs from 'node:fs'
import path from 'node:path'
import { Pool } from '@neondatabase/serverless'

const url = process.env.E2E_DATABASE_URL
if (!url) throw new Error('E2E_DATABASE_URL manquant')
const pool = new Pool({ connectionString: url })
const client = await pool.connect(); void pool

const dir = 'server/db/migrations'
const files = fs
  .readdirSync(dir)
  .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
  .sort()
  .map((d) => path.join(d, 'migration.sql'))
console.log(`Migrations trouvées : ${files.length}`)

await client.query('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())')
const doneRes = await client.query('SELECT name FROM _migrations')
const done = new Set((Array.isArray(doneRes) ? doneRes : doneRes.rows).map((r) => r.name))

for (const f of files) {
  if (done.has(f)) {
    console.log(`= déjà appliquée : ${f}`)
    continue
  }
  const content = fs.readFileSync(path.join(dir, f), 'utf8')
  try {
    await client.query(content)
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [f])
    console.log(`✓ ${f}`)
  } catch (err) {
    console.error(`✗ ${f} : ${err.message}`)
    process.exit(1)
  }
}
console.log('MIGRATIONS_OK')
