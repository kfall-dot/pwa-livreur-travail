import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from './index.js'
import {
  approvalSteps,
  companies,
  documentTemplates,
  deliveryPoints,
  declarations,
  ebParseRuns,
  managers,
  purchaseOrders,
  purchaseRequestDrafts,
  purchaseRequestLines,
  purchaseRequests,
  sites,
  siteBudgetAmendments,
  suppliers,
  tours,
  treasuryOrders,
  whatsappMessages,
  type ParsedEbLine,
  type ProcurementRole,
  type PurchaseRequestStatus,
} from './schema.js'
import { lineAmountFcfa } from '../services/ebPricing.js'
import { ENGAGED_BC_STATUSES, amendmentWouldUndercutEngaged, computeBudgetKpis, computeBudgetTotals, firstOverrunAt, toFcfaInt } from '../services/siteBudget.js'
import {
  buildSiteIndicators,
  eventFromDeliveredBc,
  todayIsoLocal,
  type SiteIndicatorsSnapshot,
} from '../services/siteIndicators.js'
import { linesForSupplier } from '../lib/procurementLines.js'
import { normalizeEbSpendCategory } from '../../shared/ebSpendCategory.js'
import {
  bcRegisterAttachments,
  bcRegisterDate,
  bcRegisterInvoice,
  deliveredAmountFcfa,
  formatBcRegisterAmount,
  parseDeclaredQuantities,
  paymentModeFromLines,
  quantitiesFromDelivery,
} from '../services/bcRegister.js'

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

export class SiteBudgetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SiteBudgetError'
  }
}

export type SiteBudgetAmendmentDto = {
  id: string
  reference: string
  status: 'draft' | 'approved' | 'rejected'
  signedAmountFcfa: number
  reason: string
  createdByName: string | null
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
  comment: string | null
}

export type SiteBudgetDto = {
  siteId: string
  siteName: string
  budgetInitialFcfa: number | null
  budgetFrozenAt: string | null
  budgetTotalFcfa: number | null
  engagedFcfa: number
  remainingFcfa: number | null
  overBudget: boolean
  engagementPct: number | null
  varianceFcfa: number | null
  variancePct: number | null
  trafficLight: 'none' | 'ok' | 'watch' | 'alert'
  missingAmendment: boolean
  overrunSinceAt: string | null
  overrunDays: number | null
  amendments: SiteBudgetAmendmentDto[]
}

async function sumApprovedAmendments(siteId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${siteBudgetAmendments.signedAmountFcfa}), 0)`,
    })
    .from(siteBudgetAmendments)
    .where(and(eq(siteBudgetAmendments.siteId, siteId), eq(siteBudgetAmendments.status, 'approved')))
  return toFcfaInt(row?.total)
}

async function sumEngagedBc(companyId: string, siteId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchaseOrders.amountFcfa}), 0)`,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .where(
      and(
        eq(purchaseRequests.companyId, companyId),
        eq(purchaseRequests.siteId, siteId),
        eq(purchaseOrders.docType, 'bc'),
        inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
      ),
    )
  return toFcfaInt(row?.total)
}

async function listEngagedBcChrono(
  companyId: string,
  siteId: string,
): Promise<Array<{ amountFcfa: number; createdAt: Date }>> {
  const rows = await db
    .select({
      amountFcfa: purchaseOrders.amountFcfa,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .where(
      and(
        eq(purchaseRequests.companyId, companyId),
        eq(purchaseRequests.siteId, siteId),
        eq(purchaseOrders.docType, 'bc'),
        inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
      ),
    )
    .orderBy(asc(purchaseOrders.createdAt))
  return rows.map((row) => ({ amountFcfa: toFcfaInt(row.amountFcfa), createdAt: row.createdAt }))
}

async function nextAmendmentReference(companyId: string): Promise<string> {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const prefix = `AV-${y}${m}${d}-`
  const existing = await db
    .select({ reference: siteBudgetAmendments.reference })
    .from(siteBudgetAmendments)
    .where(eq(siteBudgetAmendments.companyId, companyId))
  const seq =
    existing.reduce((max: number, row: { reference: string }) => {
      if (!row.reference.startsWith(prefix)) return max
      const n = Number.parseInt(row.reference.slice(prefix.length), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0) + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export async function getSiteBudget(companyId: string, siteId: string): Promise<SiteBudgetDto | null> {
  const site = await getSiteById(companyId, siteId)
  if (!site) return null

  const [approvedSum, engagedFcfa, amendmentRows] = await Promise.all([
    sumApprovedAmendments(siteId),
    sumEngagedBc(companyId, siteId),
    db
      .select({
        id: siteBudgetAmendments.id,
        reference: siteBudgetAmendments.reference,
        status: siteBudgetAmendments.status,
        signedAmountFcfa: siteBudgetAmendments.signedAmountFcfa,
        reason: siteBudgetAmendments.reason,
        createdAt: siteBudgetAmendments.createdAt,
        decidedAt: siteBudgetAmendments.decidedAt,
        comment: siteBudgetAmendments.comment,
        createdByName: managers.name,
        decidedById: siteBudgetAmendments.decidedByManagerId,
      })
      .from(siteBudgetAmendments)
      .leftJoin(managers, eq(siteBudgetAmendments.createdByManagerId, managers.id))
      .where(and(eq(siteBudgetAmendments.companyId, companyId), eq(siteBudgetAmendments.siteId, siteId)))
      .orderBy(desc(siteBudgetAmendments.createdAt)),
  ])

  const decidedIds = [...new Set(amendmentRows.map((r) => r.decidedById).filter(Boolean))] as string[]
  const decidedManagers =
    decidedIds.length === 0
      ? []
      : await db
          .select({ id: managers.id, name: managers.name })
          .from(managers)
          .where(inArray(managers.id, decidedIds))
  const decidedName = new Map(decidedManagers.map((m) => [m.id, m.name]))

  const totals = computeBudgetTotals({
    budgetInitialFcfa: site.budgetInitialFcfa,
    budgetFrozenAt: site.budgetFrozenAt,
    approvedAmendmentSumFcfa: approvedSum,
    engagedFcfa,
  })

  const approvedAmendmentCount = amendmentRows.filter((row) => row.status === 'approved').length
  const overrunAt =
    totals.overBudget && totals.budgetTotalFcfa != null
      ? firstOverrunAt(totals.budgetTotalFcfa, await listEngagedBcChrono(companyId, siteId))
      : null
  const kpis = computeBudgetKpis({
    totals,
    approvedAmendmentCount,
    overrunSinceAt: overrunAt,
  })

  return {
    siteId: site.id,
    siteName: site.name,
    budgetInitialFcfa: totals.budgetInitialFcfa,
    budgetFrozenAt: site.budgetFrozenAt ? site.budgetFrozenAt.toISOString() : null,
    budgetTotalFcfa: totals.budgetTotalFcfa,
    engagedFcfa: totals.engagedFcfa,
    remainingFcfa: totals.remainingFcfa,
    overBudget: totals.overBudget,
    engagementPct: kpis.engagementPct,
    varianceFcfa: kpis.varianceFcfa,
    variancePct: kpis.variancePct,
    trafficLight: kpis.trafficLight,
    missingAmendment: kpis.missingAmendment,
    overrunSinceAt: kpis.overrunSinceAt,
    overrunDays: kpis.overrunDays,
    amendments: amendmentRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      signedAmountFcfa: toFcfaInt(row.signedAmountFcfa),
      reason: row.reason,
      createdByName: row.createdByName ?? null,
      decidedByName: row.decidedById ? decidedName.get(row.decidedById) ?? null : null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      comment: row.comment ?? null,
    })),
  }
}

export type SiteIndicatorsDto = SiteIndicatorsSnapshot & {
  siteId: string
  siteName: string
}

async function listSiteDeliveryExpenseEvents(companyId: string, siteId: string) {
  const rows = await db
    .select({
      poId: purchaseOrders.id,
      poAmount: purchaseOrders.amountFcfa,
      requestId: purchaseOrders.purchaseRequestId,
      supplierName: suppliers.name,
      tourDate: tours.date,
      declaredAt: declarations.declaredAt,
      declarationOutcome: declarations.outcome,
      declarationLines: declarations.lines,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(deliveryPoints, eq(deliveryPoints.tourId, purchaseOrders.tourId))
    .leftJoin(tours, eq(tours.id, purchaseOrders.tourId))
    .leftJoin(declarations, eq(declarations.deliveryId, deliveryPoints.id))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseRequests.siteId, siteId),
        eq(purchaseOrders.docType, 'bc'),
        eq(deliveryPoints.status, 'delivered'),
      ),
    )

  const byPo = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const prev = byPo.get(row.poId)
    if (!prev || row.declaredAt) byPo.set(row.poId, row)
  }
  if (byPo.size === 0) return []

  const requestIds = [...new Set([...byPo.values()].map((r) => r.requestId))]
  const allLines = await db
    .select()
    .from(purchaseRequestLines)
    .where(inArray(purchaseRequestLines.purchaseRequestId, requestIds))
  const linesByRequest = new Map<string, typeof allLines>()
  for (const line of allLines) {
    const list = linesByRequest.get(line.purchaseRequestId) ?? []
    list.push(line)
    linesByRequest.set(line.purchaseRequestId, list)
  }

  return [...byPo.values()].flatMap((row) => {
    const requestLines = linesByRequest.get(row.requestId) ?? []
    const supplierLines = linesForSupplier(requestLines, row.supplierName).map((l) => ({
      label: l.label,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPriceFcfa: Number(l.unitPriceFcfa ?? 0),
      paymentMode: l.paymentMode,
      spendCategory: l.spendCategory,
    }))
    const event = eventFromDeliveredBc({
      tourDate: row.tourDate,
      declaredAt: row.declaredAt,
      poAmountFcfa: Number(row.poAmount ?? 0),
      lines: supplierLines,
      declaration: {
        outcome: row.declarationOutcome,
        lines: row.declarationLines,
        declaredAt: row.declaredAt,
      },
    })
    return event ? [event] : []
  })
}

export async function getSiteIndicators(companyId: string, siteId: string): Promise<SiteIndicatorsDto | null> {
  const budget = await getSiteBudget(companyId, siteId)
  if (!budget) return null
  const events = await listSiteDeliveryExpenseEvents(companyId, siteId)
  return {
    siteId: budget.siteId,
    siteName: budget.siteName,
    ...buildSiteIndicators({
      asOf: todayIsoLocal(),
      budgetInitialFcfa: budget.budgetInitialFcfa,
      budgetTotalFcfa: budget.budgetTotalFcfa,
      events,
    }),
  }
}

export async function listSiteBudgets(companyId: string): Promise<SiteBudgetDto[]> {
  const siteRows = await listSites(companyId)
  if (siteRows.length === 0) return []
  const siteIds = siteRows.map((s) => s.id)

  const [approvedRows, engagedRows, amendmentRows] = await Promise.all([
    db
      .select({
        siteId: siteBudgetAmendments.siteId,
        total: sql<string>`coalesce(sum(${siteBudgetAmendments.signedAmountFcfa}), 0)`,
      })
      .from(siteBudgetAmendments)
      .where(
        and(
          eq(siteBudgetAmendments.companyId, companyId),
          eq(siteBudgetAmendments.status, 'approved'),
          inArray(siteBudgetAmendments.siteId, siteIds),
        ),
      )
      .groupBy(siteBudgetAmendments.siteId),
    db
      .select({
        siteId: purchaseRequests.siteId,
        total: sql<string>`coalesce(sum(${purchaseOrders.amountFcfa}), 0)`,
      })
      .from(purchaseOrders)
      .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
      .where(
        and(
          eq(purchaseRequests.companyId, companyId),
          eq(purchaseOrders.docType, 'bc'),
          inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
          inArray(purchaseRequests.siteId, siteIds),
        ),
      )
      .groupBy(purchaseRequests.siteId),
    db
      .select({
        id: siteBudgetAmendments.id,
        siteId: siteBudgetAmendments.siteId,
        reference: siteBudgetAmendments.reference,
        status: siteBudgetAmendments.status,
        signedAmountFcfa: siteBudgetAmendments.signedAmountFcfa,
        reason: siteBudgetAmendments.reason,
        createdAt: siteBudgetAmendments.createdAt,
        decidedAt: siteBudgetAmendments.decidedAt,
        comment: siteBudgetAmendments.comment,
        createdByName: managers.name,
        decidedById: siteBudgetAmendments.decidedByManagerId,
      })
      .from(siteBudgetAmendments)
      .leftJoin(managers, eq(siteBudgetAmendments.createdByManagerId, managers.id))
      .where(and(eq(siteBudgetAmendments.companyId, companyId), inArray(siteBudgetAmendments.siteId, siteIds)))
      .orderBy(desc(siteBudgetAmendments.createdAt)),
  ])

  const approvedBySite = new Map(approvedRows.map((r) => [r.siteId, toFcfaInt(r.total)]))
  const engagedBySite = new Map(
    engagedRows
      .filter((r): r is { siteId: string; total: string } => typeof r.siteId === 'string')
      .map((r) => [r.siteId, toFcfaInt(r.total)]),
  )
  const amendmentsBySite = new Map<string, typeof amendmentRows>()
  for (const row of amendmentRows) {
    const list = amendmentsBySite.get(row.siteId) ?? []
    list.push(row)
    amendmentsBySite.set(row.siteId, list)
  }

  const decidedIds = [...new Set(amendmentRows.map((r) => r.decidedById).filter(Boolean))] as string[]
  const decidedManagers =
    decidedIds.length === 0
      ? []
      : await db
          .select({ id: managers.id, name: managers.name })
          .from(managers)
          .where(inArray(managers.id, decidedIds))
  const decidedName = new Map(decidedManagers.map((m) => [m.id, m.name]))

  const assembled = siteRows.map((site) => {
    const approvedSum = approvedBySite.get(site.id) ?? 0
    const engagedFcfa = engagedBySite.get(site.id) ?? 0
    const siteAmendments = amendmentsBySite.get(site.id) ?? []
    const totals = computeBudgetTotals({
      budgetInitialFcfa: site.budgetInitialFcfa,
      budgetFrozenAt: site.budgetFrozenAt,
      approvedAmendmentSumFcfa: approvedSum,
      engagedFcfa,
    })
    return { site, totals, siteAmendments }
  })

  const overrunBySite = new Map<string, Date | null>()
  for (const item of assembled) {
    if (!item.totals.overBudget || item.totals.budgetTotalFcfa == null) continue
    overrunBySite.set(
      item.site.id,
      firstOverrunAt(item.totals.budgetTotalFcfa, await listEngagedBcChrono(companyId, item.site.id)),
    )
  }

  return assembled.map(({ site, totals, siteAmendments }) => {
    const approvedAmendmentCount = siteAmendments.filter((row) => row.status === 'approved').length
    const kpis = computeBudgetKpis({
      totals,
      approvedAmendmentCount,
      overrunSinceAt: overrunBySite.get(site.id) ?? null,
    })
    return {
      siteId: site.id,
      siteName: site.name,
      budgetInitialFcfa: totals.budgetInitialFcfa,
      budgetFrozenAt: site.budgetFrozenAt ? site.budgetFrozenAt.toISOString() : null,
      budgetTotalFcfa: totals.budgetTotalFcfa,
      engagedFcfa: totals.engagedFcfa,
      remainingFcfa: totals.remainingFcfa,
      overBudget: totals.overBudget,
      engagementPct: kpis.engagementPct,
      varianceFcfa: kpis.varianceFcfa,
      variancePct: kpis.variancePct,
      trafficLight: kpis.trafficLight,
      missingAmendment: kpis.missingAmendment,
      overrunSinceAt: kpis.overrunSinceAt,
      overrunDays: kpis.overrunDays,
      amendments: siteAmendments.map((row) => ({
        id: row.id,
        reference: row.reference,
        status: row.status,
        signedAmountFcfa: toFcfaInt(row.signedAmountFcfa),
        reason: row.reason,
        createdByName: row.createdByName ?? null,
        decidedByName: row.decidedById ? decidedName.get(row.decidedById) ?? null : null,
        decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        comment: row.comment ?? null,
      })),
    }
  })
}

export async function freezeSiteBudget(input: {
  companyId: string
  siteId: string
  amountFcfa: number
  managerId: string
}): Promise<SiteBudgetDto> {
  const site = await getSiteById(input.companyId, input.siteId)
  if (!site) throw new SiteBudgetError('Chantier introuvable', 404)
  if (site.budgetFrozenAt) throw new SiteBudgetError('Enveloppe déjà gelée', 409)
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 1) {
    throw new SiteBudgetError('Le budget initial doit être un entier ≥ 1 FCFA', 400)
  }

  const [updated] = await db
    .update(sites)
    .set({
      budgetInitialFcfa: String(input.amountFcfa),
      budgetFrozenAt: new Date(),
      budgetFrozenByManagerId: input.managerId,
    })
    .where(and(eq(sites.id, input.siteId), eq(sites.companyId, input.companyId), sql`${sites.budgetFrozenAt} is null`))
    .returning({ id: sites.id })
  if (!updated) throw new SiteBudgetError('Enveloppe déjà gelée', 409)

  const dto = await getSiteBudget(input.companyId, input.siteId)
  if (!dto) throw new SiteBudgetError('Chantier introuvable', 404)
  return dto
}

export async function createSiteBudgetAmendment(input: {
  companyId: string
  siteId: string
  signedAmountFcfa: number
  reason: string
  managerId: string
}): Promise<SiteBudgetDto> {
  const site = await getSiteById(input.companyId, input.siteId)
  if (!site) throw new SiteBudgetError('Chantier introuvable', 404)
  if (!site.budgetFrozenAt) throw new SiteBudgetError('Gelez d’abord le budget initial', 400)
  if (!Number.isInteger(input.signedAmountFcfa) || input.signedAmountFcfa === 0) {
    throw new SiteBudgetError('Le montant de l’avenant ne peut pas être zéro', 400)
  }
  const reason = input.reason.trim()
  if (reason.length < 10) throw new SiteBudgetError('Le motif de l’avenant est obligatoire (10 caractères min.)', 400)

  const [openDraft] = await db
    .select({ id: siteBudgetAmendments.id })
    .from(siteBudgetAmendments)
    .where(
      and(
        eq(siteBudgetAmendments.siteId, input.siteId),
        eq(siteBudgetAmendments.companyId, input.companyId),
        eq(siteBudgetAmendments.status, 'draft'),
      ),
    )
    .limit(1)
  if (openDraft) throw new SiteBudgetError('Un avenant brouillon est déjà ouvert pour ce chantier', 409)

  const id = `amd-${randomUUID()}`
  await db.insert(siteBudgetAmendments).values({
    id,
    companyId: input.companyId,
    siteId: input.siteId,
    reference: await nextAmendmentReference(input.companyId),
    status: 'draft',
    signedAmountFcfa: String(input.signedAmountFcfa),
    reason,
    createdByManagerId: input.managerId,
  })

  const dto = await getSiteBudget(input.companyId, input.siteId)
  if (!dto) throw new SiteBudgetError('Chantier introuvable', 404)
  return dto
}

export async function decideSiteBudgetAmendment(input: {
  companyId: string
  siteId: string
  amendmentId: string
  decision: 'approved' | 'rejected'
  managerId: string
  comment?: string | null
}): Promise<SiteBudgetDto> {
  const site = await getSiteById(input.companyId, input.siteId)
  if (!site) throw new SiteBudgetError('Chantier introuvable', 404)

  const [row] = await db
    .select()
    .from(siteBudgetAmendments)
    .where(
      and(
        eq(siteBudgetAmendments.id, input.amendmentId),
        eq(siteBudgetAmendments.siteId, input.siteId),
        eq(siteBudgetAmendments.companyId, input.companyId),
      ),
    )
    .limit(1)
  if (!row) throw new SiteBudgetError('Avenant introuvable', 404)
  if (row.status !== 'draft') throw new SiteBudgetError('Cet avenant n’est plus un brouillon', 409)

  if (input.decision === 'approved') {
    const budget = await getSiteBudget(input.companyId, input.siteId)
    if (!budget || budget.budgetTotalFcfa == null) {
      throw new SiteBudgetError('Gelez d’abord le budget initial', 400)
    }
    const signed = toFcfaInt(row.signedAmountFcfa)
    if (amendmentWouldUndercutEngaged(budget.budgetTotalFcfa, signed, budget.engagedFcfa)) {
      throw new SiteBudgetError('L’avenant ferait passer le budget sous le montant déjà engagé', 400)
    }
  }

  const [updated] = await db
    .update(siteBudgetAmendments)
    .set({
      status: input.decision,
      decidedByManagerId: input.managerId,
      decidedAt: new Date(),
      comment: input.comment?.trim() || null,
    })
    .where(and(eq(siteBudgetAmendments.id, input.amendmentId), eq(siteBudgetAmendments.status, 'draft')))
    .returning({ id: siteBudgetAmendments.id })
  if (!updated) throw new SiteBudgetError('Cet avenant n’est plus un brouillon', 409)

  const dto = await getSiteBudget(input.companyId, input.siteId)
  if (!dto) throw new SiteBudgetError('Chantier introuvable', 404)
  return dto
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

/**
 * Supprime un brouillon d'EB (rôle DT) et ses artefacts de parsing associés.
 * Retourne true si un brouillon a bien été supprimé.
 */
export async function deleteDraft(companyId: string, draftId: string): Promise<boolean> {
  const [draft] = await db
    .select({ id: purchaseRequestDrafts.id })
    .from(purchaseRequestDrafts)
    .where(and(eq(purchaseRequestDrafts.id, draftId), eq(purchaseRequestDrafts.companyId, companyId)))
    .limit(1)
  if (!draft) return false

  await db
    .delete(ebParseRuns)
    .where(eq(ebParseRuns.draftId, draftId))

  await db
    .delete(purchaseRequestDrafts)
    .where(and(eq(purchaseRequestDrafts.id, draftId), eq(purchaseRequestDrafts.companyId, companyId)))

  return true
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
    .select({
      id: approvalSteps.id,
      purchaseRequestId: approvalSteps.purchaseRequestId,
      role: approvalSteps.role,
      managerId: approvalSteps.managerId,
      managerName: managers.name,
      decision: approvalSteps.decision,
      comment: approvalSteps.comment,
      ip: approvalSteps.ip,
      etape: approvalSteps.etape,
      pinVerified: approvalSteps.pinVerified,
      createdAt: approvalSteps.createdAt,
    })
    .from(approvalSteps)
    .leftJoin(managers, eq(approvalSteps.managerId, managers.id))
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
        spendCategory: normalizeEbSpendCategory(line.spendCategory),
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
  const [lines, steps, site, supplier, suppliersList, pos, treasury] = await Promise.all([
    getPurchaseRequestLines(requestId),
    getApprovalSteps(requestId),
    getSiteById(companyId, request.siteId),
    request.supplierId ? getSupplierById(companyId, request.supplierId) : Promise.resolve(null),
    listSuppliers(companyId),
    db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseRequestId, requestId))
      .orderBy(purchaseOrders.createdAt),
    getTreasuryOrderByRequest(companyId, requestId),
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
    purchaseOrder: pos[pos.length - 1] ?? null,
    purchaseOrders: pos,
    treasuryOrder: treasury,
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

export async function updateTreasuryOrderHtml(id: string, pdfHtml: string) {
  await db.update(treasuryOrders).set({ pdfHtml }).where(eq(treasuryOrders.id, id))
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

export async function getTreasuryOrderById(companyId: string, treasuryId: string) {
  const [row] = await db
    .select()
    .from(treasuryOrders)
    .where(and(eq(treasuryOrders.id, treasuryId), eq(treasuryOrders.companyId, companyId)))
    .limit(1)
  return row ?? null
}

export async function listPurchaseOrdersForRequest(companyId: string, requestId: string) {
  return db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.purchaseRequestId, requestId), eq(purchaseOrders.companyId, companyId)))
    .orderBy(purchaseOrders.createdAt)
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

export type BcRegisterRow = {
  purchaseOrderId: string
  purchaseRequestId: string
  siteName: string
  supplierName: string
  date: string
  bon: string
  paymentMode: string
  quantities: string
  amountFcfa: number
  amountLabel: string
  invoice: string
  justifs: string
  observation: string
  verification: string
  attachment: string
  attachments: Array<{ lineId: string; fileName: string }>
}

/** Registre POINTS FOURNISSEURS — une ligne par BC dont la livraison est confirmée. */
export async function listDeliveredBcRegister(companyId: string): Promise<BcRegisterRow[]> {
  const rows = await db
    .select({
      poId: purchaseOrders.id,
      poReference: purchaseOrders.reference,
      poAmount: purchaseOrders.amountFcfa,
      requestId: purchaseOrders.purchaseRequestId,
      siteName: sites.name,
      supplierName: suppliers.name,
      tourDate: tours.date,
      declaredAt: declarations.declaredAt,
      declarationOutcome: declarations.outcome,
      declarationLines: declarations.lines,
      saInvoice: purchaseOrders.saInvoice,
      saJustifs: purchaseOrders.saJustifs,
      saObservation: purchaseOrders.saObservation,
      saVerification: purchaseOrders.saVerification,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .innerJoin(sites, eq(purchaseRequests.siteId, sites.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(deliveryPoints, eq(deliveryPoints.tourId, purchaseOrders.tourId))
    .leftJoin(tours, eq(tours.id, purchaseOrders.tourId))
    .leftJoin(declarations, eq(declarations.deliveryId, deliveryPoints.id))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.docType, 'bc'),
        eq(deliveryPoints.status, 'delivered'),
      ),
    )
    .orderBy(desc(declarations.declaredAt), desc(purchaseOrders.createdAt))

  if (rows.length === 0) return []

  const requestIds = [...new Set(rows.map((r) => r.requestId))]
  const allLines = await db
    .select()
    .from(purchaseRequestLines)
    .where(inArray(purchaseRequestLines.purchaseRequestId, requestIds))

  const linesByRequest = new Map<string, typeof allLines>()
  for (const line of allLines) {
    const list = linesByRequest.get(line.purchaseRequestId) ?? []
    list.push(line)
    linesByRequest.set(line.purchaseRequestId, list)
  }

  return rows.map((row) => {
    const requestLines = linesByRequest.get(row.requestId) ?? []
    const supplierLines = linesForSupplier(requestLines, row.supplierName).map((l) => ({
      id: l.id,
      label: l.label,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPriceFcfa: Number(l.unitPriceFcfa ?? 0),
      paymentMode: l.paymentMode,
      attachmentFileName: l.attachmentFileName,
    }))
    const declaration = {
      outcome: row.declarationOutcome,
      lines: row.declarationLines,
      declaredAt: row.declaredAt,
    }
    const paymentMode = paymentModeFromLines(supplierLines)
    const amountFcfa = deliveredAmountFcfa(Number(row.poAmount ?? 0), supplierLines, declaration)
    const attachments = supplierLines
      .filter((l) => (l.attachmentFileName ?? '').trim())
      .map((l) => ({ lineId: l.id, fileName: l.attachmentFileName!.trim() }))
    return {
      purchaseOrderId: row.poId,
      purchaseRequestId: row.requestId,
      siteName: row.siteName,
      supplierName: row.supplierName,
      date: bcRegisterDate(declaration, row.tourDate),
      bon: row.poReference,
      paymentMode,
      quantities: quantitiesFromDelivery(supplierLines, declaration),
      amountFcfa,
      amountLabel: formatBcRegisterAmount(amountFcfa),
      invoice: (row.saInvoice ?? '').trim() || bcRegisterInvoice(paymentMode),
      justifs: (row.saJustifs ?? '').trim() || 'RAS',
      observation: (row.saObservation ?? '').trim() || 'RAS',
      verification: (row.saVerification ?? '').trim() || '—',
      attachment: bcRegisterAttachments(supplierLines),
      attachments,
    }
  })
}

export async function updateBcRegisterFollowup(
  companyId: string,
  purchaseOrderId: string,
  patch: {
    invoice?: string
    justifs?: string
    observation?: string
    verification?: string
  },
): Promise<BcRegisterRow | null> {
  const set: Partial<{
    saInvoice: string
    saJustifs: string
    saObservation: string
    saVerification: string
  }> = {}
  if (patch.invoice !== undefined) set.saInvoice = patch.invoice
  if (patch.justifs !== undefined) set.saJustifs = patch.justifs
  if (patch.observation !== undefined) set.saObservation = patch.observation
  if (patch.verification !== undefined) set.saVerification = patch.verification
  if (Object.keys(set).length === 0) {
    const rows = await listDeliveredBcRegister(companyId)
    return rows.find((r) => r.purchaseOrderId === purchaseOrderId) ?? null
  }
  const [updated] = await db
    .update(purchaseOrders)
    .set(set)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .returning({ id: purchaseOrders.id })
  if (!updated) return null
  const rows = await listDeliveredBcRegister(companyId)
  return rows.find((r) => r.purchaseOrderId === purchaseOrderId) ?? null
}

export type SiteStockRow = {
  siteId: string
  siteName: string
  productLabel: string
  unit: string
  onHand: number
  onOrder: number
}

function bumpSiteStock(
  map: Map<string, SiteStockRow>,
  siteId: string,
  siteName: string,
  productLabel: string,
  unit: string,
  field: 'onHand' | 'onOrder',
  qty: number,
) {
  const label = productLabel.trim()
  if (!label || !Number.isFinite(qty) || qty <= 0) return
  const unitNorm = unit.trim() || 'unité'
  const key = `${siteId}|${label.toLowerCase()}|${unitNorm.toLowerCase()}`
  const row = map.get(key) ?? {
    siteId,
    siteName,
    productLabel: label,
    unit: unitNorm,
    onHand: 0,
    onOrder: 0,
  }
  row[field] += qty
  map.set(key, row)
}

/** Stock chantier S0 : disponible = livré accepté ; en commande = BC non encore livré. */
export async function listSiteStock(companyId: string): Promise<SiteStockRow[]> {
  const pos = await db
    .select({
      poId: purchaseOrders.id,
      requestId: purchaseOrders.purchaseRequestId,
      siteId: sites.id,
      siteName: sites.name,
      supplierName: suppliers.name,
      tourId: purchaseOrders.tourId,
      deliveryStatus: deliveryPoints.status,
      declarationOutcome: declarations.outcome,
      declarationLines: declarations.lines,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .innerJoin(sites, eq(purchaseRequests.siteId, sites.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(deliveryPoints, eq(deliveryPoints.tourId, purchaseOrders.tourId))
    .leftJoin(declarations, eq(declarations.deliveryId, deliveryPoints.id))
    .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.docType, 'bc')))
    .orderBy(sites.name)

  if (pos.length === 0) return []

  const requestIds = [...new Set(pos.map((r) => r.requestId))]
  const allLines = await db
    .select()
    .from(purchaseRequestLines)
    .where(inArray(purchaseRequestLines.purchaseRequestId, requestIds))

  const linesByRequest = new Map<string, typeof allLines>()
  for (const line of allLines) {
    const list = linesByRequest.get(line.purchaseRequestId) ?? []
    list.push(line)
    linesByRequest.set(line.purchaseRequestId, list)
  }

  const deliveredPoIds = new Set(
    pos.filter((r) => r.deliveryStatus === 'delivered').map((r) => r.poId),
  )
  const byPo = new Map<string, (typeof pos)[number]>()
  for (const row of pos) {
    const prev = byPo.get(row.poId)
    if (!prev || row.deliveryStatus === 'delivered') byPo.set(row.poId, row)
  }
  const map = new Map<string, SiteStockRow>()

  for (const row of byPo.values()) {
    const requestLines = linesByRequest.get(row.requestId) ?? []
    const supplierLines = linesForSupplier(requestLines, row.supplierName)
    if (deliveredPoIds.has(row.poId)) {
      const declared = parseDeclaredQuantities({
        outcome: row.declarationOutcome,
        lines: row.declarationLines,
      })
      if (declared.length > 0) {
        for (const d of declared) {
          bumpSiteStock(map, row.siteId, row.siteName, d.productLabel, d.unit, 'onHand', d.quantityAccepted)
        }
      } else {
        for (const l of supplierLines) {
          bumpSiteStock(map, row.siteId, row.siteName, l.label, l.unit, 'onHand', Number(l.quantity))
        }
      }
    } else {
      for (const l of supplierLines) {
        bumpSiteStock(map, row.siteId, row.siteName, l.label, l.unit, 'onOrder', Number(l.quantity))
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const site = a.siteName.localeCompare(b.siteName, 'fr')
    if (site !== 0) return site
    return a.productLabel.localeCompare(b.productLabel, 'fr')
  })
}

/** Passe l’EB en `delivered` quand tous les arrêts des tournées liées sont livrés. */
export async function syncPurchaseRequestsAfterTourDelivery(tourId: string): Promise<void> {
  const linked: Array<{ requestId: string; companyId: string }> = await db
    .select({
      requestId: purchaseOrders.purchaseRequestId,
      companyId: purchaseOrders.companyId,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tourId, tourId))

  const [tour] = await db
    .select({ purchaseOrderId: tours.purchaseOrderId, companyId: tours.companyId })
    .from(tours)
    .where(eq(tours.id, tourId))
    .limit(1)
  if (tour?.purchaseOrderId) {
    const [po] = await db
      .select({
        requestId: purchaseOrders.purchaseRequestId,
        companyId: purchaseOrders.companyId,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, tour.purchaseOrderId))
      .limit(1)
    if (po) linked.push(po)
  }

  const seen = new Set<string>()
  for (const row of linked) {
    if (seen.has(row.requestId)) continue
    seen.add(row.requestId)
    await maybeMarkPurchaseRequestDelivered(row.companyId, row.requestId)
  }
}

async function maybeMarkPurchaseRequestDelivered(companyId: string, requestId: string): Promise<void> {
  const [request] = await db
    .select({ status: purchaseRequests.status })
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
    .limit(1)
  if (!request || request.status !== 'delivery_scheduled') return

  const pos = await listPurchaseOrdersForRequest(companyId, requestId)
  if (pos.length === 0) return
  for (const po of pos) {
    if (!po.tourId) return
    const stops = await db
      .select({ status: deliveryPoints.status })
      .from(deliveryPoints)
      .where(eq(deliveryPoints.tourId, po.tourId))
    if (stops.length === 0 || stops.some((s) => s.status !== 'delivered')) return
  }
  await updatePurchaseRequestStatus(companyId, requestId, 'delivered')
}
