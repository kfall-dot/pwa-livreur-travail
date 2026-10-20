/**
 * Réparation ponctuelle — rattache à l'entreprise pilote (`co-btp-pilote`) les
 * comptes de rôles BTP créés hors seed (invitation admin, autre entreprise).
 * Idempotent : ne touche que les comptes dont l'entreprise diffère.
 * Usage : npx tsx --env-file=.env.development scripts/fix-pilot-managers.ts
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../server/db/index.js'
import { managers } from '../server/db/schema.js'
import { BTP_DEMO, btpPilotLoginEmails } from '../server/db/seedBtpPilot.js'

const emails = btpPilotLoginEmails()
const rows = await db
  .select({ id: managers.id, email: managers.email, companyId: managers.companyId, role: managers.procurementRole })
  .from(managers)
  .where(inArray(managers.email, emails))

console.log(`${rows.length} compte(s) de rôles BTP trouvés :`)
for (const m of rows) {
  if (m.companyId === BTP_DEMO.COMPANY_ID) {
    console.log(`  OK        · ${m.email} · déjà dans ${m.companyId}`)
    continue
  }
  await db.update(managers).set({ companyId: BTP_DEMO.COMPANY_ID }).where(eq(managers.id, m.id))
  console.log(`  RATTACHÉ  · ${m.email} · ${m.companyId} → ${BTP_DEMO.COMPANY_ID}`)
}
process.exit(0)
