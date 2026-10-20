/**
 * Diagnostic ponctuel — réplique la requête exacte de
 * `listTreasuryOrdersToDisburse` étape par étape.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../server/db/index.js'
import { purchaseRequests, treasuryOrders } from '../server/db/schema.js'

const step1 = await db
  .select({ id: treasuryOrders.id, reference: treasuryOrders.reference, status: treasuryOrders.status })
  .from(treasuryOrders)
  .where(and(eq(treasuryOrders.companyId, 'co-btp-pilote'), inArray(treasuryOrders.status, ['pending', 'issued'])))
console.log(`Étape 1 — BT pilot (pending/issued) : ${step1.length}`)
for (const t of step1) console.log(`  - ${t.reference} · ${t.status}`)

const step2 = await db
  .select({ reference: treasuryOrders.reference, btStatus: treasuryOrders.status, reqStatus: purchaseRequests.status })
  .from(treasuryOrders)
  .innerJoin(purchaseRequests, eq(treasuryOrders.purchaseRequestId, purchaseRequests.id))
  .where(
    and(
      eq(treasuryOrders.companyId, 'co-btp-pilote'),
      inArray(treasuryOrders.status, ['pending', 'issued']),
      inArray(purchaseRequests.status, ['bt_pending', 'bt_ready', 'deboursed']),
    ),
  )
console.log(`Étape 2 — avec jointure + statuts EB : ${step2.length}`)
for (const t of step2) console.log(`  - ${t.reference} · BT=${t.btStatus} · EB=${t.reqStatus}`)
process.exit(0)
