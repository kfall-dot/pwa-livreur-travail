import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { purchaseOrders, purchaseRequests, treasuryOrders, treasuryDisbursements, type DisbursementMethod } from '../db/schema.js'
import { randomUUID } from 'node:crypto'

export class MaterialInvoiceError extends Error {
  constructor(message: string, public statusCode = 400) { super(message) }
}

/** Une transmission crée un seul dossier de règlement par BC, sans reprendre l'historique. */
export async function transmitMaterialInvoice(companyId: string, poId: string, invoiceAmountFcfa?: number) {
  return db.transaction(async tx => {
    const [po] = await tx.select().from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId))).for('update')
    if (!po || po.docType !== 'bc') throw new MaterialInvoiceError('BC introuvable', 404)
    if (!po.saInvoice?.trim() || !po.saInvoiceBlobKey) throw new MaterialInvoiceError('Numéro et copie de facture obligatoires avant transmission')
    if (po.saInvoicePaid) throw new MaterialInvoiceError('Cette facture est déjà payée', 409)
    if (po.saApprovalRequired && !po.saHeadSignature) throw new MaterialInvoiceError('Le BC doit être signé par le chef SA avant transmission', 409)
    const amount = invoiceAmountFcfa ?? Number(po.amountFcfa)
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(po.amountFcfa)) throw new MaterialInvoiceError('Montant du dossier invalide')
    await tx.insert(treasuryOrders).values({
      id: `invoice-${po.id}`, companyId, purchaseRequestId: po.purchaseRequestId,
      purchaseOrderId: po.id, purpose: 'material_invoice', reference: `Règlement ${po.reference}`,
      amountFcfa: String(amount), status: 'issued', pdfHtml: po.pdfHtml,
    }).onConflictDoNothing()
    await tx.update(treasuryOrders).set({ amountFcfa: String(amount), pdfHtml: po.pdfHtml }).where(and(
      eq(treasuryOrders.purchaseOrderId, po.id), eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.purpose, 'material_invoice'), eq(treasuryOrders.status, 'issued'),
    ))
    await tx.update(purchaseOrders).set({ saInvoiceTransmitted: true }).where(eq(purchaseOrders.id, po.id))
    return po
  })
}

/** Paiement atomique : le règlement et le statut partagé de la facture sont enregistrés ensemble. */
export async function payMaterialInvoice(input: {
  companyId: string; treasuryOrderId: string; managerId: string; amountFcfa?: number;
  method: DisbursementMethod; transactionReference?: string | null; paidAt: Date;
  invoice: { blobKey: string; fileName: string; contentType: string } | null;
}) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(treasuryOrders).where(and(
      eq(treasuryOrders.id, input.treasuryOrderId), eq(treasuryOrders.companyId, input.companyId),
    ))
    if (!order || order.purpose !== 'material_invoice' || !order.purchaseOrderId) throw new MaterialInvoiceError('Dossier de paiement introuvable', 404)
    const [po] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, order.purchaseOrderId), eq(purchaseOrders.companyId, input.companyId))).for('update')
    if (!po || !po.saInvoiceTransmitted || !po.saInvoiceBlobKey) throw new MaterialInvoiceError('La facture doit être transmise par le SA avant paiement', 409)
    if (order.status === 'paid' || po.saInvoicePaid) throw new MaterialInvoiceError('Cette facture est déjà payée', 409)
    if (order.status !== 'issued') throw new MaterialInvoiceError('Ce dossier n’est pas en attente de paiement', 409)
    const due = Number(order.amountFcfa)
    if (!Number.isFinite(due) || due <= 0 || (input.amountFcfa !== undefined && input.amountFcfa !== due)) throw new MaterialInvoiceError('Le montant doit correspondre au dossier transmis')
    if (!input.invoice?.blobKey) throw new MaterialInvoiceError('Justificatif du paiement obligatoire')
    const [disbursement] = await tx.insert(treasuryDisbursements).values({
      id: `disb-${randomUUID()}`, companyId: input.companyId, treasuryOrderId: order.id,
      amountFcfa: String(due), method: input.method, transactionReference: input.transactionReference,
      paidAt: input.paidAt, recordedByManagerId: input.managerId, invoiceBlobKey: input.invoice.blobKey,
      invoiceFileName: input.invoice.fileName, invoiceContentType: input.invoice.contentType,
    }).returning()
    await tx.update(treasuryOrders).set({ status: 'paid' }).where(eq(treasuryOrders.id, order.id))
    await tx.update(purchaseOrders).set({ saInvoicePaid: true }).where(eq(purchaseOrders.id, po.id))
    // Le paiement ne remplace pas l'état de livraison : les budgets/stock dépendent de celui-ci.
    await tx.update(purchaseRequests).set({ updatedAt: new Date() }).where(eq(purchaseRequests.id, po.purchaseRequestId))
    const [request] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, po.purchaseRequestId))
    const [totals] = await tx.select({ remaining: sql<number>`count(*) filter (where not ${purchaseOrders.saInvoicePaid})::int` }).from(purchaseOrders).where(and(eq(purchaseOrders.purchaseRequestId, po.purchaseRequestId), eq(purchaseOrders.docType, 'bc')))
    const allPaid = totals.remaining === 0
    return { disbursement, request: request ? { ...request, paymentStatus: allPaid ? 'paid' as const : 'partial' as const } : request, allPaid }
  })
}

/** Statut financier commun à toutes les vues, distinct du statut de livraison. */
export async function materialPaymentStatuses(companyId: string) {
  const rows = await db.select({ requestId: purchaseOrders.purchaseRequestId,
    count: sql<number>`count(*)::int`, paid: sql<number>`count(*) filter (where ${purchaseOrders.saInvoicePaid})::int`,
    transmitted: sql<number>`count(*) filter (where ${purchaseOrders.saInvoiceTransmitted})::int`,
  }).from(purchaseOrders).where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.docType, 'bc')))
    .groupBy(purchaseOrders.purchaseRequestId)
  return new Map(rows.map(row => [row.requestId, row.paid === row.count ? 'paid' : row.paid > 0 ? 'partial' : row.transmitted > 0 ? 'pending' : null] as const))
}
