import pg from 'pg'
import fs from 'node:fs'

function findUrl() {
  for (const f of ['.env.development', '.env.e2e.local', '.env.railway.local']) {
    if (!fs.existsSync(f)) continue
    const txt = fs.readFileSync(f, 'utf8')
    for (const v of ['NETLIFY_DB_URL', 'E2E_DATABASE_URL', 'DATABASE_URL']) {
      const m = txt.match(new RegExp('^' + v + '=(.*)$', 'm'))
      if (m && m[1].trim()) return m[1].trim().replace(/^"|"$/g, '')
    }
  }
  throw new Error('no db url found')
}

const c = new pg.Client({ connectionString: findUrl() })
await c.connect()

// 1) Tous les delivery_points (arrêts) liés à un site ANADER
const stops = await c.query(`
  select dp.id, dp.status, dp.site_id, s.name as site_name, t.date as tour_date, t.id as tour_id,
         d.outcome, d.declared_at
  from delivery_points dp
  join sites s on s.id = dp.site_id
  join tours t on t.id = dp.tour_id
  left join declarations d on d.delivery_id = dp.id
  where s.name ilike '%anader%'
  order by t.date desc
`)
console.log('STOPS_ANADER:', JSON.stringify(stops.rows, null, 1))

// 2) Schéma réel de delivery_points (colonnes)
const cols = await c.query("select column_name from information_schema.columns where table_name = 'delivery_points' order by ordinal_position")
console.log('DP_COLUMNS:', cols.rows.map(r => r.column_name).join(', '))

await c.end()
