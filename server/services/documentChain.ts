import { and, eq, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  certificates,
  declarations,
  deliveryPoints,
  purchaseOrders,
  purchaseRequests,
  sites,
  suppliers,
  tours,
  treasuryOrders,
} from '../db/schema.js'
import { buildCertificatePublicUrl } from '../config/public.js'
import { signCertificateAccessToken } from '../middleware/certificateAccess.js'
import { versionSuffix } from '../../shared/requestVersion.js'

/**
 * Chaîne documentaire d'une demande d'achat : EB → BT → BC → BL → facture.
 *
 * Le BL n'est pas une nouvelle pièce : c'est le **certificat `RCT-XXXXXXXX`**
 * émis à la confirmation de livraison d'un arrêt (`delivery_points.receiptId`),
 * rattaché à son BC via `delivery_points.purchase_order_id`.
 */

export type DocumentChainBl = {
  receiptId: string
  deliveryId: string
  purchaseOrderId: string
  stopName: string
  tourId: string
  tourDate: string | null
  status: string
  outcome: 'full' | 'partial' | 'rejected' | null
  declaredAt: string | null
  /** Page imprimable du BL (jeton d'accès signé) — null si non livré. */
  certificateUrl: string | null
  isDelivered: boolean
}

export type DocumentChainFile = { fileName: string }

export type DocumentChainBc = {
  id: string
  reference: string
  supplierName: string
  amountFcfa: number
  tourId: string | null
  tourDate: string | null
  invoiceReference: string
  /** Copie de facture transmise au comptable. */
  invoiceFile: DocumentChainFile | null
  /** Copie du bon de livraison fournisseur (pièce SA). */
  blFile: DocumentChainFile | null
  bls: DocumentChainBl[]
}

export type DocumentChainBt = {
  id: string
  reference: string
  amountFcfa: number
  purchaseOrderId: string | null
  bcReference: string | null
}

export type DocumentChain = {
  requestId: string
  eb: {
    reference: string
    version: number
    versionLabel: string
    status: string
    siteName: string
    totalAmountFcfa: number | null
  }
  bts: DocumentChainBt[]
  bcs: DocumentChainBc[]
  bls: DocumentChainBl[]
  /** Réfs. prêtes à imprimer / afficher. */
  references: { eb: string; bt: string; bc: string; bl: string }
}

export async function getDocumentChain(companyId: string, requestId: string): Promise<DocumentChain | null> {
  const [request] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
    .limit(1)
  if (!request) return null

  const [site] = await db
    .select({ name: sites.name })
    .from(sites)
    .where(eq(sites.id, request.siteId))
    .limit(1)

  const bcs = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      amountFcfa: purchaseOrders.amountFcfa,
      supplierName: suppliers.name,
      tourId: purchaseOrders.tourId,
      tourDate: tours.date,
      invoiceReference: purchaseOrders.saInvoice,
      invoiceFileName: purchaseOrders.saInvoiceFileName,
      invoiceBlobKey: purchaseOrders.saInvoiceBlobKey,
      blFileName: purchaseOrders.blFileName,
      blBlobKey: purchaseOrders.blBlobKey,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(tours, eq(tours.id, purchaseOrders.tourId))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.purchaseRequestId, requestId),
        eq(purchaseOrders.docType, 'bc'),
      ),
    )
    .orderBy(purchaseOrders.createdAt)

  const bts = await db
    .select({
      id: treasuryOrders.id,
      reference: treasuryOrders.reference,
      amountFcfa: treasuryOrders.amountFcfa,
      purchaseOrderId: treasuryOrders.purchaseOrderId,
    })
    .from(treasuryOrders)
    .where(and(eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.purchaseRequestId, requestId)))
    .orderBy(treasuryOrders.createdAt)

  const blRows = await db
    .select({
      purchaseOrderId: purchaseOrders.id,
      deliveryId: deliveryPoints.id,
      stopName: deliveryPoints.name,
      stopStatus: deliveryPoints.status,
      tourId: deliveryPoints.tourId,
      tourDate: tours.date,
      receiptId: certificates.receiptId,
      outcome: declarations.outcome,
      declaredAt: declarations.declaredAt,
    })
    .from(purchaseOrders)
    .innerJoin(
      deliveryPoints,
      or(eq(deliveryPoints.purchaseOrderId, purchaseOrders.id), eq(deliveryPoints.tourId, purchaseOrders.tourId)),
    )
    .leftJoin(tours, eq(tours.id, deliveryPoints.tourId))
    .leftJoin(certificates, eq(certificates.deliveryId, deliveryPoints.id))
    .leftJoin(declarations, eq(declarations.deliveryId, deliveryPoints.id))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.purchaseRequestId, requestId),
        eq(purchaseOrders.docType, 'bc'),
      ),
    )
    .orderBy(deliveryPoints.sequence)

  const bls: DocumentChainBl[] = blRows.map((r) => ({
    receiptId: r.receiptId ?? '',
    deliveryId: r.deliveryId,
    purchaseOrderId: r.purchaseOrderId,
    stopName: r.stopName,
    tourId: r.tourId,
    tourDate: r.tourDate ?? null,
    status: r.stopStatus,
    outcome: r.outcome ?? null,
    declaredAt: r.declaredAt ? r.declaredAt.toISOString() : null,
    certificateUrl: r.receiptId
      ? buildCertificatePublicUrl(r.receiptId, signCertificateAccessToken(r.receiptId))
      : null,
    isDelivered: Boolean(r.receiptId),
  }))

  const bcReferenceById = new Map(bcs.map((b) => [b.id, b.reference]))
  const ebReference = `${request.reference}${versionSuffix(request.version)}`

  return {
    requestId,
    eb: {
      reference: request.reference,
      version: request.version,
      versionLabel: ebReference,
      status: request.status,
      siteName: site?.name ?? '—',
      totalAmountFcfa: request.totalAmountFcfa != null ? Number(request.totalAmountFcfa) : null,
    },
    bts: bts.map((b) => ({
      id: b.id,
      reference: b.reference,
      amountFcfa: Number(b.amountFcfa),
      purchaseOrderId: b.purchaseOrderId ?? null,
      bcReference: b.purchaseOrderId ? (bcReferenceById.get(b.purchaseOrderId) ?? null) : null,
    })),
    bcs: bcs.map((b) => ({
      id: b.id,
      reference: b.reference,
      supplierName: b.supplierName,
      amountFcfa: Number(b.amountFcfa),
      tourId: b.tourId ?? null,
      tourDate: b.tourDate ?? null,
      invoiceReference: (b.invoiceReference ?? '').trim(),
      invoiceFile:
        b.invoiceBlobKey && (b.invoiceFileName ?? '').trim() ? { fileName: b.invoiceFileName!.trim() } : null,
      blFile: b.blBlobKey && (b.blFileName ?? '').trim() ? { fileName: b.blFileName!.trim() } : null,
      bls: bls.filter((bl) => bl.purchaseOrderId === b.id),
    })),
    bls,
    references: {
      eb: ebReference,
      bt: bts.map((b) => b.reference).join(', '),
      bc: bcs.map((b) => b.reference).join(', '),
      bl: bls
        .filter((bl) => bl.isDelivered)
        .map((bl) => bl.receiptId)
        .join(', '),
    },
  }
}

