/**
 * Consultation ponctuelle — statut d'une EB par référence (lecture seule).
 * Usage : npx tsx --env-file=.env.development scripts/check-eb-status.ts [EB-2026-0031]
 */
import { desc, eq } from 'drizzle-orm'
import { db } from '../server/db/index.js'
import { approvalSteps, purchaseRequests, treasuryOrders } from '../server/db/schema.js'

const ref = process.argv[2] ?? 'EB-2026-0031'
const [request] = await db
  .select()
  .from(purchaseRequests)
  .where(eq(purchaseRequests.reference, ref))

if (!request) {
  console.log(`AUCUNE DEMANDE pour la référence ${ref}`)
  process.exit(0)
}

console.log(`Référence   : ${request.reference}`)
console.log(`Statut      : ${request.status}`)
console.log(`Total (F)   : ${request.totalAmountFcfa ?? '—'}`)
console.log(`Chantier    : ${request.siteId}`)
console.log(`Soumise le  : ${request.submittedAt instanceof Date ? request.submittedAt.toISOString() : request.submittedAt}`)
console.log(`MAJ le      : ${request.updatedAt instanceof Date ? request.updatedAt.toISOString() : request.updatedAt}`)
console.log(`Version EB  : ${String(request.ebVersion ?? 1)}`)

const steps = await db
  .select()
  .from(approvalSteps)
  .where(eq(approvalSteps.purchaseRequestId, request.id))
  .orderBy(desc(approvalSteps.createdAt))
console.log(`Étapes d'approbation (${steps.length}) :`)
for (const s of steps) {
  console.log(
    `  - ${s.role} · ${s.decision} · ${s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt}`,
  )
}

const bts = await db
  .select({ reference: treasuryOrders.reference, status: treasuryOrders.status, amountFcfa: treasuryOrders.amountFcfa })
  .from(treasuryOrders)
  .where(eq(treasuryOrders.purchaseRequestId, request.id))
console.log(`Bons de trésorerie (${bts.length}) :`)
for (const t of bts) {
  console.log(`  - ${t.reference} · ${t.status} · ${t.amountFcfa} F`)
}
process.exit(0)
