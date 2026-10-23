import { and, eq, or, type SQL } from 'drizzle-orm'
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
import { parseDocumentRef } from '../../shared/documentRef.js'
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
  invoicePaid: boolean
  invoiceTransmitted: boolean
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

/** Maillon par lequel on est entré dans la chaîne (résolveur d'identifiants). */
export type DocumentChainMatch = {
  kind: 'eb' | 'bt' | 'bc' | 'bl'
  /** Id de la pièce : EB, BT/AV, BC ou arrêt livré (BL). */
  id: string
  /** Référence affichée : `EB-2026-0007 — v2`, `BC-2026-0012`, `RCT-…`. */
  reference: string
}

export type ResolvedDocumentChain = {
  requestId: string
  matched: DocumentChainMatch
  chain: DocumentChain
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
      invoicePaid: purchaseOrders.saInvoicePaid,
      invoiceTransmitted: purchaseOrders.saInvoiceTransmitted,
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
    .where(and(eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.purchaseRequestId, requestId), eq(treasuryOrders.purpose, 'advance')))
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
      invoicePaid: b.invoicePaid,
      invoiceTransmitted: b.invoiceTransmitted,
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

// ─── Résolveur d'identifiants (n'importe quelle pièce → sa chaîne) ───────────

/**
 * Le BC qui porte un arrêt : lien direct `delivery_points.purchase_order_id`,
 * sinon repli sur la tournée (`purchase_orders.tour_id`) — même règle que la
 * chaîne et le registre Suivi BC.
 */
async function findBcForStop(
  companyId: string,
  stop: { tourId: string | null; purchaseOrderId: string | null },
): Promise<{ reference: string; purchaseRequestId: string } | null> {
  // Un arrêt sans lien direct ni tournée ne peut pas être rattaché (on évite
  // `col = null` qui ne matche jamais et ferait échouer le typage Drizzle).
  const links: SQL[] = []
  if (stop.purchaseOrderId) links.push(eq(purchaseOrders.id, stop.purchaseOrderId))
  if (stop.tourId) links.push(eq(purchaseOrders.tourId, stop.tourId))
  if (links.length === 0) return null
  const [bc] = await db
    .select({ reference: purchaseOrders.reference, purchaseRequestId: purchaseOrders.purchaseRequestId })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.docType, 'bc'),
        links.length === 1 ? links[0] : or(...links),
      ),
    )
    .limit(1)
  return bc ?? null
}

/** Arrêt portant ce certificat `RCT-…` (repli `delivery_points.receipt_id`). */
async function findStopByReceiptId(receiptId: string) {
  const [cert] = await db
    .select({ deliveryId: certificates.deliveryId })
    .from(certificates)
    .where(eq(certificates.receiptId, receiptId))
    .limit(1)
  const condition = cert
    ? or(eq(deliveryPoints.id, cert.deliveryId), eq(deliveryPoints.receiptId, receiptId))
    : eq(deliveryPoints.receiptId, receiptId)
  const [stop] = await db
    .select({
      id: deliveryPoints.id,
      tourId: deliveryPoints.tourId,
      purchaseOrderId: deliveryPoints.purchaseOrderId,
      receiptId: deliveryPoints.receiptId,
    })
    .from(deliveryPoints)
    .where(condition)
    .limit(1)
  return stop ?? null
}

/** Id technique → pièce : EB, puis BT/AV, BC, arrêt livré (ordre de la chaîne). */
async function resolveById(
  companyId: string,
  id: string,
): Promise<{ requestId: string; matched: DocumentChainMatch } | null> {
  const [request] = await db
    .select({ id: purchaseRequests.id, reference: purchaseRequests.reference })
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.companyId, companyId), eq(purchaseRequests.id, id)))
    .limit(1)
  if (request) {
    return { requestId: request.id, matched: { kind: 'eb', id: request.id, reference: request.reference } }
  }

  const [bt] = await db
    .select({
      id: treasuryOrders.id,
      reference: treasuryOrders.reference,
      requestId: treasuryOrders.purchaseRequestId,
    })
    .from(treasuryOrders)
    .where(and(eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.id, id)))
    .limit(1)
  if (bt) return { requestId: bt.requestId, matched: { kind: 'bt', id: bt.id, reference: bt.reference } }

  const [bc] = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      requestId: purchaseOrders.purchaseRequestId,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.docType, 'bc'), eq(purchaseOrders.id, id)))
    .limit(1)
  if (bc) return { requestId: bc.requestId, matched: { kind: 'bc', id: bc.id, reference: bc.reference } }

  const [stop] = await db
    .select({
      id: deliveryPoints.id,
      tourId: deliveryPoints.tourId,
      purchaseOrderId: deliveryPoints.purchaseOrderId,
      receiptId: deliveryPoints.receiptId,
    })
    .from(deliveryPoints)
    .where(eq(deliveryPoints.id, id))
    .limit(1)
  if (stop) {
    const bcForStop = await findBcForStop(companyId, stop)
    // Le rattachement au BC est filtré par société : un arrêt d'une autre
    // société ne remonte jamais (aucun BC trouvé) — pas de fuite inter-tenant.
    if (bcForStop) {
      return {
        requestId: bcForStop.purchaseRequestId,
        matched: {
          kind: 'bl',
          id: stop.id,
          reference: (stop.receiptId ?? '').trim() || bcForStop.reference,
        },
      }
    }
  }
  return null
}

/**
 * Résout **n'importe quel identifiant** de la chaîne (référence imprimée ou id
 * technique) vers sa pièce **et** sa chaîne documentaire complète.
 *
 * `'invalid'` = format non reconnu (→ 422) ; `null` = identifiant bien formé
 * mais aucune pièce de la société (→ 404).
 */
export async function resolveDocumentChain(
  companyId: string,
  input: string,
): Promise<ResolvedDocumentChain | 'invalid' | null> {
  const parsed = parseDocumentRef(input)
  if (parsed.kind === 'unknown') return 'invalid'
  const ref = parsed.value

  let requestId: string | null = null
  let matched: DocumentChainMatch | null = null

  if (parsed.kind === 'eb') {
    const [row] = await db
      .select({ id: purchaseRequests.id, reference: purchaseRequests.reference })
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.companyId, companyId), eq(purchaseRequests.reference, ref)))
      .limit(1)
    if (row) {
      requestId = row.id
      matched = { kind: 'eb', id: row.id, reference: row.reference }
    }
  } else if (parsed.kind === 'bt') {
    const [row] = await db
      .select({
        id: treasuryOrders.id,
        reference: treasuryOrders.reference,
        requestId: treasuryOrders.purchaseRequestId,
      })
      .from(treasuryOrders)
      .where(and(eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.reference, ref)))
      .limit(1)
    if (row) {
      requestId = row.requestId
      matched = { kind: 'bt', id: row.id, reference: row.reference }
    }
  } else if (parsed.kind === 'bc') {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        reference: purchaseOrders.reference,
        requestId: purchaseOrders.purchaseRequestId,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.companyId, companyId),
          eq(purchaseOrders.docType, 'bc'),
          eq(purchaseOrders.reference, ref),
        ),
      )
      .limit(1)
    if (row) {
      requestId = row.requestId
      matched = { kind: 'bc', id: row.id, reference: row.reference }
    }
  } else if (parsed.kind === 'bl') {
    const stop = await findStopByReceiptId(ref)
    if (stop) {
      const bc = await findBcForStop(companyId, stop)
      if (bc) {
        requestId = bc.purchaseRequestId
        matched = { kind: 'bl', id: stop.id, reference: ref }
      }
    }
  } else {
    const byId = await resolveById(companyId, ref)
    if (byId) {
      requestId = byId.requestId
      matched = byId.matched
    }
  }

  if (!requestId || !matched) return null
  const chain = await getDocumentChain(companyId, requestId)
  if (!chain) return null
  return { requestId, matched, chain }
}

