import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from './index.js'
import {
  approvalSteps,
  companies,
  documentTemplates,
  ebParseRuns,
  purchaseOrders,
  purchaseRequestDrafts,
  purchaseRequestLines,
  purchaseRequests,
  sites,
  suppliers,
  treasuryOrders,
  whatsappMessages,
  type ParsedEbLine,
  type ProcurementRole,
  type PurchaseRequestStatus,
} from './schema.js'
import { lineAmountFcfa } from '../services/ebPricing.js'

type DbExecutor = Pick<typeof db, 'insert' | 'update' | 'delete' | 'select'>

// ─── Sites ───────────────────────────────────────────────────────────────────

export async function listSites(companyId: string) {
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.companyId, companyId), eq(sites.active, true)))
    .orderBy(sites.name)
}

export async function getSiteById(companyId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function getSiteByWhatsappGroup(companyId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.companyId, companyId), eq(sites.whatsappGroupId, groupId), eq(sites.active, true)))
    .limit(1)
  return row ?? null
}

export async function createSite(input: {
  companyId: string
  name: string
  address: string
  lat?: string | null
  lng?: string | null
  managerId?: string | null
  whatsappGroupId?: string | null
}) {
  const id = `site-${randomUUID()}`
  const [row] = await db
    .insert(sites)
    .values({
      id,
      companyId: input.companyId,
      name: input.name,
      address: input.address,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      managerId: input.managerId ?? null,
      whatsappGroupId: input.whatsappGroupId ?? null,
      active: true,
    })
    .returning()
  return row!
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function listSuppliers(companyId: string) {
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.active, true)))
    .orderBy(suppliers.name)
}

export async function getSupplierById(companyId: string, supplierId: string) {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function createSupplier(input: {
  companyId: string
  name: string
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  hasAccount?: boolean
  address?: string | null
  depotAddress?: string | null
  family?: string | null
  notes?: string | null
  active?: boolean
}) {
  const id = `sup-${randomUUID()}`
  const [row] = await db
    .insert(suppliers)
    .values({
      id,
      companyId: input.companyId,
      name: input.name,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      hasAccount: input.hasAccount ?? false,
      address: input.address ?? null,
      depotAddress: input.depotAddress ?? null,
      family: input.family ?? null,
      notes: input.notes ?? null,
      active: input.active ?? true,
    })
    .returning()
  return row!
}

export async function listAllSuppliers(companyId: string) {
  return db
    .select()
    .from(suppliers)
    .where(eq(suppliers.companyId, companyId))
    .orderBy(suppliers.name)
}

export async function updateSupplier(
  companyId: string,
  supplierId: string,
  patch: {
    name?: string
    contactName?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
    address?: string | null
    depotAddress?: string | null
    family?: string | null
    notes?: string | null
    active?: boolean
    hasAccount?: boolean
  },
) {
  const [row] = await db
    .update(suppliers)
    .set(patch)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)))
    .returning()
  return row ?? null
}

// ─── WhatsApp messages ───────────────────────────────────────────────────────

export async function createWhatsappMessage(input: {
  companyId: string
  externalId?: string | null
  fromPhone: string
  fromName?: string | null
  messageType: 'text' | 'audio' | 'image' | 'document' | 'unknown'
  bodyText?: string | null
  mediaBlobKey?: string | null
  groupId?: string | null
  rawPayload?: unknown
}) {
  const id = `wam-${randomUUID()}`
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      id,
      companyId: input.companyId,
      externalId: input.externalId ?? null,
      fromPhone: input.fromPhone,
      fromName: input.fromName ?? null,
      messageType: input.messageType,
      bodyText: input.bodyText ?? null,
      mediaBlobKey: input.mediaBlobKey ?? null,
      groupId: input.groupId ?? null,
      rawPayload: input.rawPayload ?? null,
    })
    .returning()
  return row!
}

export async function markWhatsappMessageProcessed(messageId: string) {
  await db
    .update(whatsappMessages)
    .set({ processedAt: new Date() })
    .where(eq(whatsappMessages.id, messageId))
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export async function listDrafts(companyId: string) {
  return db
    .select()
    .from(purchaseRequestDrafts)
    .where(eq(purchaseRequestDrafts.companyId, companyId))
    .orderBy(desc(purchaseRequestDrafts.createdAt))
}

export async function getDraftById(companyId: string, draftId: string) {
  const [row] = await db
    .select()
    .from(purchaseRequestDrafts)
    .where(and(eq(purchaseRequestDrafts.id, draftId), eq(purchaseRequestDrafts.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function createDraftFromParse(input: {
  companyId: string
  siteId?: string | null
  sourceMessageIds: string[]
  parsedLines: ParsedEbLine[]
  parsedUrgency?: string | null
  confidenceScore: number
  needsReview?: boolean
}) {
  const id = `draft-${randomUUID()}`
  const [row] = await db
    .insert(purchaseRequestDrafts)
    .values({
      id,
      companyId: input.companyId,
      siteId: input.siteId ?? null,
      status: 'draft_parsed',
      sourceMessageIds: input.sourceMessageIds,
      parsedLines: input.parsedLines,
      parsedUrgency: input.parsedUrgency ?? null,
      confidenceScore: String(input.confidenceScore),
      needsReview: input.needsReview ?? input.confidenceScore < 0.7,
    })
    .returning()
  return row!
}

export async function updateDraft(
  companyId: string,
  draftId: string,
  patch: {
    parsedLines?: ParsedEbLine[]
    parsedUrgency?: string | null
    needsReview?: boolean
    siteId?: string | null
    status?: PurchaseRequestStatus
  },
) {
  const [row] = await db
    .update(purchaseRequestDrafts)
    .set({
      ...patch,
      updatedAt: new Date(),
      status: patch.status ?? 'draft_review',
    })
    .where(and(eq(purchaseRequestDrafts.id, draftId), eq(purchaseRequestDrafts.companyId, companyId)))
    .returning()
  return row ?? null
}

export async function linkDraftToRequest(draftId: string, purchaseRequestId: string) {
  await db
    .update(purchaseRequestDrafts)
    .set({ purchaseRequestId, needsReview: false, updatedAt: new Date() })
    .where(eq(purchaseRequestDrafts.id, draftId))
}

export async function getDraftDetail(companyId: string, draftId: string) {
  const draft = await getDraftById(companyId, draftId)
  if (!draft) return null

  const siteList = await listSites(companyId)
  const site = draft.siteId ? siteList.find((s) => s.id === draft.siteId) ?? null : null

  const msgIds = (draft.sourceMessageIds as string[]) ?? []
  const messages =
    msgIds.length > 0
      ? await db.select().from(whatsappMessages).where(inArray(whatsappMessages.id, msgIds))
      : []

  const [parseRun] = await db
    .select()
    .from(ebParseRuns)
    .where(eq(ebParseRuns.draftId, draftId))
    .orderBy(desc(ebParseRuns.createdAt))
    .limit(1)

  const extracted = (parseRun?.extractedJson ?? null) as {
    projetChantier?: string
    dateBesoin?: string
    objet?: string
    demandeur?: string
    infosManquantes?: string[]
    actionsDt?: string[]
    source?: string
    signature?: {
      etape?: string
      approbateur?: string
      role?: string
      timestamp?: string
      ipAddress?: string
      codePinVerifie?: boolean
      commentaire?: string
      contenuHash?: string
    }
  } | null

  const parseHints = extracted
    ? {
        destination: extracted.projetChantier ?? null,
        neededBy: extracted.dateBesoin ?? null,
        objet: extracted.objet ?? null,
        requesterName: extracted.demandeur ?? null,
        missingInfo: extracted.infosManquantes ?? [],
        dtActions: extracted.actionsDt ?? [],
        source: extracted.source ?? null,
        signature: extracted.signature ?? null,
      }
    : null

  const supplierList = await listSuppliers(companyId)

  return {
    draft: { ...draft, siteName: site?.name ?? null },
    messages,
    sites: siteList,
    site,
    parseHints,
    suppliers: supplierList,
  }
}

export async function mergeDraftParseHints(draftId: string, patch: Record<string, unknown>) {
  const [run] = await db
    .select()
    .from(ebParseRuns)
    .where(eq(ebParseRuns.draftId, draftId))
    .orderBy(desc(ebParseRuns.createdAt))
    .limit(1)
  const current = (run?.extractedJson ?? {}) as Record<string, unknown>
  const extractedJson = { ...current, ...patch }
  if (run) {
    await db.update(ebParseRuns).set({ extractedJson }).where(eq(ebParseRuns.id, run.id))
    return
  }
  await createEbParseRun({
    draftId,
    promptVersion: 'manual-dt',
    extractedJson,
  })
}

export async function createEbParseRun(input: {
  draftId: string
  promptVersion: string
  inputSummary?: string
  extractedJson?: unknown
  confidenceScore?: number
  error?: string | null
}) {
  const id = `epr-${randomUUID()}`
  await db.insert(ebParseRuns).values({
    id,
    draftId: input.draftId,
    promptVersion: input.promptVersion,
    inputSummary: input.inputSummary ?? null,
    extractedJson: input.extractedJson ?? null,
    confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
    error: input.error ?? null,
  })
}

// ─── Purchase requests ───────────────────────────────────────────────────────

async function nextReference(companyId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.companyId, companyId))
  const seq = (row?.count ?? 0) + 1
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

export async function listPurchaseRequests(companyId: string) {
  return db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.companyId, companyId))
    .orderBy(desc(purchaseRequests.createdAt))
}

export async function getPurchaseRequestById(companyId: string, requestId: string) {
  const [row] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function getPurchaseRequestLines(requestId: string) {
  return db
    .select()
    .from(purchaseRequestLines)
    .where(eq(purchaseRequestLines.purchaseRequestId, requestId))
    .orderBy(purchaseRequestLines.displayOrder)
}

export async function updateRequestLinePrices(
  companyId: string,
  requestId: string,
  prices: Array<{
    id: string
    unitPriceFcfa: number
    supplierName?: string
    paymentMode?: string
    observation?: string
  }>,
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  const lines = await getPurchaseRequestLines(requestId)
  const byId = new Map(prices.map((p) => [p.id, p]))
  let total = 0
  for (const line of lines) {
    const patch = byId.get(line.id)
    const nextPu = patch ? patch.unitPriceFcfa : Number(line.unitPriceFcfa ?? 0)
    const qty = Number(line.quantity)
    const amount = lineAmountFcfa(nextPu, qty)
    total += amount
    if (patch) {
      await db
        .update(purchaseRequestLines)
        .set({
          unitPriceFcfa: String(Math.round(Math.max(0, nextPu))),
          amountFcfa: String(amount),
          ...(patch.supplierName !== undefined
            ? { supplierName: patch.supplierName.trim() || null }
            : {}),
          ...(patch.paymentMode !== undefined
            ? { paymentMode: patch.paymentMode.trim() || null }
            : {}),
          ...(patch.observation !== undefined
            ? { observation: patch.observation.trim() || null }
            : {}),
        })
        .where(eq(purchaseRequestLines.id, line.id))
    }
  }
  await updatePurchaseRequestStatus(companyId, requestId, request.status, { totalAmountFcfa: total })
  return getRequestDetail(companyId, requestId)
}

export async function setRequestLineAttachment(
  companyId: string,
  requestId: string,
  lineId: string,
  attachment: {
    blobKey: string | null
    fileName: string | null
    contentType: string | null
  } | null,
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  const [line] = await db
    .select()
    .from(purchaseRequestLines)
    .where(
      and(eq(purchaseRequestLines.id, lineId), eq(purchaseRequestLines.purchaseRequestId, requestId)),
    )
    .limit(1)
  if (!line) return null
  await db
    .update(purchaseRequestLines)
    .set({
      attachmentBlobKey: attachment?.blobKey ?? null,
      attachmentFileName: attachment?.fileName ?? null,
      attachmentContentType: attachment?.contentType ?? null,
    })
    .where(eq(purchaseRequestLines.id, lineId))
  return getRequestDetail(companyId, requestId)
}

export async function getApprovalSteps(requestId: string) {
  return db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.purchaseRequestId, requestId))
    .orderBy(approvalSteps.createdAt)
}

export async function createPurchaseRequestFromDraft(input: {
  companyId: string
  siteId: string
  draftId: string
  lines: ParsedEbLine[]
  urgency?: string | null
  requestedByPhone?: string | null
  requestedByName?: string | null
  supplierId?: string | null
  totalAmountFcfa?: number | null
  notes?: string | null
  createdByManagerId: string
}) {
  const id = `pr-${randomUUID()}`
  const reference = await nextReference(input.companyId, 'EB')

  return db.transaction(async (tx: DbExecutor) => {
    const [request] = await tx
      .insert(purchaseRequests)
      .values({
        id,
        companyId: input.companyId,
        siteId: input.siteId,
        reference,
        status: 'submitted',
        urgency: input.urgency ?? null,
        requestedByPhone: input.requestedByPhone ?? null,
        requestedByName: input.requestedByName ?? null,
        sourceDraftId: input.draftId,
        supplierId: input.supplierId ?? null,
        totalAmountFcfa: input.totalAmountFcfa != null ? String(input.totalAmountFcfa) : null,
        notes: input.notes ?? null,
        createdByManagerId: input.createdByManagerId,
        submittedAt: new Date(),
      })
      .returning()

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!
      await tx.insert(purchaseRequestLines).values({
        id: `prl-${randomUUID()}`,
        purchaseRequestId: id,
        label: line.label,
        unit: line.unit,
        quantity: String(line.quantity),
        unitPriceFcfa: line.unitPrice != null ? String(Math.round(line.unitPrice)) : null,
        amountFcfa:
          line.unitPrice != null
            ? String(Math.round(Math.max(0, line.unitPrice) * Number(line.quantity)))
            : line.amount != null
              ? String(Math.round(line.amount))
              : null,
        observation: line.observation ?? null,
        supplierName: line.supplierName ?? null,
        paymentMode: line.paymentMode ?? null,
        displayOrder: i,
      })
    }

    return request!
  })
}

export async function updatePurchaseRequestStatus(
  companyId: string,
  requestId: string,
  status: PurchaseRequestStatus,
  patch: Partial<{
    supplierId: string | null
    totalAmountFcfa: number | null
    notes: string | null
  }> = {},
) {
  const [row] = await db
    .update(purchaseRequests)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.supplierId !== undefined ? { supplierId: patch.supplierId } : {}),
      ...(patch.totalAmountFcfa !== undefined
        ? { totalAmountFcfa: patch.totalAmountFcfa != null ? String(patch.totalAmountFcfa) : null }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
    .returning()
  return row ?? null
}

export async function recordApprovalStep(input: {
  purchaseRequestId: string
  role: ProcurementRole
  managerId: string
  decision: 'approved' | 'rejected'
  comment?: string | null
  ip?: string | null
  etape?: string | null
  pinVerified?: boolean
}) {
  const id = `ap-${randomUUID()}`
  const [row] = await db
    .insert(approvalSteps)
    .values({
      id,
      purchaseRequestId: input.purchaseRequestId,
      role: input.role,
      managerId: input.managerId,
      decision: input.decision,
      comment: input.comment ?? null,
      ip: input.ip ?? null,
      etape: input.etape ?? null,
      pinVerified: input.pinVerified ?? false,
    })
    .returning()
  return row!
}

export async function getRequestDetail(companyId: string, requestId: string) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  const [lines, steps, site, supplier, suppliersList, pos] = await Promise.all([
    getPurchaseRequestLines(requestId),
    getApprovalSteps(requestId),
    getSiteById(companyId, request.siteId),
    request.supplierId ? getSupplierById(companyId, request.supplierId) : Promise.resolve(null),
    listSuppliers(companyId),
    db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseRequestId, requestId))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(1),
  ])
  return {
    request: {
      ...request,
      totalAmountFcfa: request.totalAmountFcfa != null ? Number(request.totalAmountFcfa) : null,
      siteName: site?.name ?? null,
      supplierName: supplier?.name ?? null,
    },
    lines,
    approvalSteps: steps,
    site,
    supplier,
    suppliers: suppliersList,
    purchaseOrder: pos[0] ?? null,
  }
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function getActiveDocumentTemplate(companyId: string, docType: 'bc' | 'bt') {
  const [row] = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.companyId, companyId),
        eq(documentTemplates.docType, docType),
        eq(documentTemplates.active, true),
      ),
    )
    .orderBy(desc(documentTemplates.createdAt))
    .limit(1)
  return row ?? null
}

export async function createPurchaseOrder(input: {
  companyId: string
  purchaseRequestId: string
  supplierId: string
  amountFcfa: number
  docType?: 'bc' | 'bt'
  templateId?: string | null
  pdfHtml: string
  tourId?: string | null
}) {
  const id = `po-${randomUUID()}`
  const reference = await nextPoReference(input.companyId, input.docType ?? 'bc')
  const [row] = await db
    .insert(purchaseOrders)
    .values({
      id,
      companyId: input.companyId,
      purchaseRequestId: input.purchaseRequestId,
      supplierId: input.supplierId,
      reference,
      docType: input.docType ?? 'bc',
      templateId: input.templateId ?? null,
      amountFcfa: String(input.amountFcfa),
      pdfHtml: input.pdfHtml,
      tourId: input.tourId ?? null,
    })
    .returning()
  return row!
}

async function nextPoReference(companyId: string, docType: 'bc' | 'bt'): Promise<string> {
  const prefix = docType === 'bt' ? 'BT' : 'BC'
  const year = new Date().getFullYear()
  const table = docType === 'bt' ? treasuryOrders : purchaseOrders
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.companyId, companyId))
  const seq = (row?.count ?? 0) + 1
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

export async function getPurchaseOrderById(companyId: string, poId: string) {
  const [row] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function getCompanyName(companyId: string): Promise<string> {
  const [row] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1)
  return row?.name?.trim() || 'TraceO'
}

export async function updatePurchaseOrderHtml(poId: string, pdfHtml: string) {
  await db.update(purchaseOrders).set({ pdfHtml }).where(eq(purchaseOrders.id, poId))
}

export async function setPurchaseOrderTour(poId: string, tourId: string | null) {
  await db.update(purchaseOrders).set({ tourId }).where(eq(purchaseOrders.id, poId))
}

export async function createTreasuryOrder(input: {
  companyId: string
  purchaseRequestId: string
  amountFcfa: number
  quotationUrls?: string[] | null
  pdfHtml: string
}) {
  const id = `to-${randomUUID()}`
  const reference = await nextPoReference(input.companyId, 'bt')
  const [row] = await db
    .insert(treasuryOrders)
    .values({
      id,
      companyId: input.companyId,
      purchaseRequestId: input.purchaseRequestId,
      reference,
      amountFcfa: String(input.amountFcfa),
      quotationUrls: input.quotationUrls ?? null,
      pdfHtml: input.pdfHtml,
    })
    .returning()
  return row!
}

export async function getTreasuryOrderByRequest(companyId: string, requestId: string) {
  const [row] = await db
    .select()
    .from(treasuryOrders)
    .where(
      and(eq(treasuryOrders.purchaseRequestId, requestId), eq(treasuryOrders.companyId, companyId)),
    )
    .orderBy(desc(treasuryOrders.createdAt))
    .limit(1)
  return row ?? null
}

export async function upsertDocumentTemplate(input: {
  id: string
  companyId: string
  docType: 'bc' | 'bt'
  name: string
  htmlTemplate: string
  fields?: unknown
}) {
  await db
    .insert(documentTemplates)
    .values({
      id: input.id,
      companyId: input.companyId,
      docType: input.docType,
      name: input.name,
      htmlTemplate: input.htmlTemplate,
      fields: input.fields ?? null,
      active: true,
    })
    .onConflictDoUpdate({
      target: documentTemplates.id,
      set: {
        name: input.name,
        htmlTemplate: input.htmlTemplate,
        fields: input.fields ?? null,
        active: true,
      },
    })
}
