import { Client } from 'pg'

// usage: node scripts/db-count.mjs <connection-url>
const url = (process.argv[2] ?? '').trim()
if (!url) {
  console.log('usage: node scripts/db-count.mjs postgresql://...')
  process.exit(1)
}
const host = new URL(url.replace(/^postgresql:/i, 'http:')).host
console.log('HOST=' + host)
const c = new Client({ connectionString: url, connectionTimeoutMillis: 20000, ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
  const t = await c.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name",
  )
  let total = 0
  for (const { table_name } of t.rows) {
    const r = await c.query(`select count(*)::int n from "${table_name}"`)
    total += r.rows[0].n
    if (r.rows[0].n > 0) console.log(`${table_name}=${r.rows[0].n}`)
  }
  console.log(`TABLES=${t.rows.length} TOTAL_ROWS=${total}`)
} catch (e) {
  console.log('FAIL ' + e.message.split('\n')[0].slice(0, 150))
} finally {
  try { await c.end() } catch {}
}
