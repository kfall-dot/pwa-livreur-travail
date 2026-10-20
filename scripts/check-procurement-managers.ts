/**
 * Diagnostic ponctuel — liste tous les managers avec un rôle procurement
 * et leur entreprise, pour repérer les comptes mal rattachés.
 */
import { isNotNull } from 'drizzle-orm'
import { db } from '../server/db/index.js'
import { managers } from '../server/db/schema.js'

const rows = await db
  .select({ id: managers.id, email: managers.email, companyId: managers.companyId, role: managers.procurementRole })
  .from(managers)
  .where(isNotNull(managers.procurementRole))
console.log(`${rows.length} manager(s) avec rôle procurement :`)
for (const m of rows) console.log(`  - ${m.email} · company=${m.companyId} · role=${m.role}`)
process.exit(0)
