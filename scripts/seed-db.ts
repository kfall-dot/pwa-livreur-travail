/** Seed complet (démo + chantier pilote BTP) sur la base pointée par NETLIFY_DB_URL. Usage : NETLIFY_DB_URL=... npx tsx scripts/seed-db.ts */
import { seedDemoData } from '../server/db/seed.js'

const r = await seedDemoData()
console.log(
  `SEED_OK driver=${r.driverId} tour=${r.tourId} tasks=${r.tasksSeeded} products=${r.productsSeeded} btp=${Boolean(r.btpPilot)} companyId=${r.btpPilot?.companyId ?? '—'}`,
)
process.exit(0)
