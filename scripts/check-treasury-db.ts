/**
 * Diagnostic ponctuel — pourquoi la file trésorerie est-elle vide ?
 * Compare le BT en base aux filtres exacts de `listTreasuryOrdersToDisburse`.
 */
import { eq } from 'drizzle-orm'
import { db } from '../server/db/index.js'
import { managers, purchaseRequests, treasuryOrders } from '../server/db/schema.js'

const [bt] = await db.select().from(treasuryOrders).where(eq(treasuryOrders.reference, 'BT-2026-0005'))
console.log(
  'BT        :',
  JSON.stringify({ id: bt?.id, status: bt?.status, companyId: bt?.companyId, requestId: bt?.purchaseRequestId }),
)
if (bt?.purchaseRequestId) {
  const [req] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, bt.purchaseRequestId))
  console.log(
    'EB liée   :',
    JSON.stringify({ ref: req?.reference, status: req?.status, companyId: req?.companyId }),
  )
}
const mgrs = await db.select().from(managers).where(eq(managers.email, 'tresorerie@btp-pilote.ci'))
for (const m of mgrs) {
  console.log(
    'Manager   :',
    JSON.stringify({ id: m.id, email: m.email, companyId: m.companyId, procurementRole: m.procurementRole }),
  )
}
const allBts = await db
  .select({ id: treasuryOrders.id, reference: treasuryOrders.reference, companyId: treasuryOrders.companyId, status: treasuryOrders.status })
  .from(treasuryOrders)
console.log(`Tous les BT (${allBts.length}) :`)
for (const t of allBts) console.log(`  - ${t.reference} · company=${t.companyId} · status=${t.status}`)
process.exit(0)
