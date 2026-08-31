import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.development' })
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.NETLIFY_DB_URL, ssl: { rejectUnauthorized: false } })
const { rows: tours } = await pool.query(
  `SELECT t.driver_id, d.name AS driver_name, t.date, count(dp.id) AS stops
   FROM tours t LEFT JOIN drivers d ON d.id = t.driver_id LEFT JOIN delivery_points dp ON dp.tour_id = t.id
   GROUP BY t.driver_id, d.name, t.date
   ORDER BY t.date DESC LIMIT 4`,
)
console.table(tours)
const { rows: drivers } = await pool.query('SELECT id, name, phone FROM drivers ORDER BY name')
console.table(drivers)
await pool.end()
