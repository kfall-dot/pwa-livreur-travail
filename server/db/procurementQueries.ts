import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from './index.js'
import { sitesWithEbCreatedBy } from './siteEbScope.js'
import {
  approvalSteps,
  certificates,
  companies,
  documentTemplates,
  deliveryPoints,
  declarations,
  ebParseRuns,
  historicalExpenseLines,
  managers,
  purchaseOrders,
  purchaseRequestDrafts,
  purchaseRequestLines,
  purchaseRequests,
  purchaseRequestVersions,
  sites,
  siteBudgetAmendments,
  siteBudgetFamilyAllocations,
  suppliers,
  tours,
  treasuryOrders,
  treasuryDisbursements,
  whatsappMessages,
  type ParsedEbLine,
  type ProcurementRole,
  type PurchaseRequestStatus,
  type TreasuryOrderStatus,
  type DisbursementMethod,
} from './schema.js'
import { lineAmountFcfa } from '../services/ebPricing.js'
import { buildDirectBudgetEntries, ENGAGED_BC_STATUSES, amendmentWouldUndercutEngaged, computeBudgetKpis, computeBudgetTotals, firstOverrunAt, toFcfaInt } from '../services/siteBudget.js'
import {
  buildSiteIndicators,
  eventFromDeliveredBc,
  todayIsoLocal,
  type DeliveryExpenseEvent,
  type SiteIndicatorsSnapshot,
} from '../services/siteIndicators.js'
import { linesForSupplier } from '../lib/procurementLines.js'
import { normalizeEbSpendCategory } from '../../shared/ebSpendCategory.js'
import { CHARGE_FAMILIES, chargeNatureFamily } from '../../shared/chargeNatures.js'
import { resolveJournalSiteId } from '../../shared/cdgJournal.js'
import type { FamilyAllocation } from '../../shared/budgetAllocation.js'
import { versionSuffix } from '../../shared/requestVersion.js'
import {
  bcRegisterAttachments,
  bcRegisterDate,
  deliveredAmountFcfa,
  formatBcRegisterAmount,
  parseDeclaredQuantities,
  paymentModeFromLines,
  quantitiesFromDelivery,
} from '../services/bcRegister.js'

type DbExecutor = Pick<typeof db, 'insert' | 'update' | 'delete' | 'select'>

/**
 * Normalise une valeur de colonne `date` en `YYYY-MM-DD`.
 * Le pilote peut renvoyer une chaîne (`mode: 'string'`) ou un `Date` (minuit
 * local) selon le contexte : les deux doivent produire la **même** journée.
 */
function isoDateValue(value: unknown): string {
  if (value instanceof Date) return todayIsoLocal(value)
  return String(value ?? '').slice(0, 10)
}

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

/**
 * Chantier achats relié à un point du catalogue (`sites.supermarket_id`).
 * Pas de filtre `active` : la fiche chantier du catalogue doit rester consultable
 * même quand le suivi achats a été désactivé.
 */
export async function getSiteBySupermarketId(companyId: string, supermarketId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.companyId, companyId), eq(sites.supermarketId, supermarketId)))
    .limit(1)
  return row ?? null
}

export interface ChantierWithBc {
  id: string
  name: string
  /** Point du catalogue relié — sert à rattacher les arrêts de tournée (`delivery_points.supermarket_id`). */
  supermarketId: string | null
  /** Nombre de BC émis pour ce chantier. */
  bcCount: number
}

/**
 * Chantiers pour lesquels des BC ont été émis — alimente le menu « Chantier »
 * de la page Livraisons (vue mois, rôle CdG).
 *
 * Le rattachement livraison ↔ chantier se fait par `supermarket_id` : le nom du
 * point de livraison peut différer du nom du chantier achats, l'identifiant non.
 */
export async function listChantiersWithBc(companyId: string): Promise<ChantierWithBc[]> {
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      supermarketId: sites.supermarketId,
      bcCount: sql<number>`count(${purchaseOrders.id})`,
    })
    .from(sites)
    .innerJoin(purchaseRequests, eq(purchaseRequests.siteId, sites.id))
    .innerJoin(purchaseOrders, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .where(eq(sites.companyId, companyId))
    .groupBy(sites.id, sites.name, sites.supermarketId)
    .orderBy(asc(sites.name))
  return rows.map((row) => ({ ...row, bcCount: Number(row.bcCount) }))
}

/** Affecte chef de chantier et/ou DT superviseur sur un chantier. */
export async function updateSiteAssignments(
  companyId: string,
  siteId: string,
  data: { managerId?: string | null; supervisorManagerId?: string | null },
) {
  const set: { managerId?: string | null; supervisorManagerId?: string | null } = {}
  if ('managerId' in data) set.managerId = data.managerId
  if ('supervisorManagerId' in data) set.supervisorManagerId = data.supervisorManagerId
  if (Object.keys(set).length === 0) return getSiteById(companyId, siteId)
  const [row] = await db
    .update(sites)
    .set(set)
    .where(and(eq(sites.id, siteId), eq(sites.companyId, companyId)))
    .returning()
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
  realizedFcfa: number
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

/** Dépenses hors SA : engagement au BT approuvé, réalisation au déboursé.
 * Les lignes matériaux restent exclusivement comptées par leurs BC. */
async function directBudgetEntries(companyId: string, siteIds: string[]) {
  const payments = db.select({ orderId: treasuryDisbursements.treasuryOrderId,
    total: sql<string>`sum(${treasuryDisbursements.amountFcfa})`.as('paid_total') })
    .from(treasuryDisbursements).where(eq(treasuryDisbursements.companyId, companyId))
    .groupBy(treasuryDisbursements.treasuryOrderId).as('budget_payments')
  const [orders, history] = await Promise.all([
    db.select({ requestId: treasuryOrders.purchaseRequestId, siteId: purchaseRequests.siteId,
      amount: treasuryOrders.amountFcfa, createdAt: treasuryOrders.createdAt,
      paidAmount: payments.total })
      .from(treasuryOrders)
      .innerJoin(purchaseRequests, eq(purchaseRequests.id, treasuryOrders.purchaseRequestId))
      .leftJoin(payments, eq(payments.orderId, treasuryOrders.id))
      .where(and(eq(treasuryOrders.companyId, companyId), inArray(purchaseRequests.siteId, siteIds),
        inArray(purchaseRequests.status, ['bt_pending', 'bt_ready', 'deboursed', 'paid']))),
    db.select({ siteId: historicalExpenseLines.siteId, amount: historicalExpenseLines.amountFcfa,
      date: historicalExpenseLines.occurredOn }).from(historicalExpenseLines)
      .where(and(eq(historicalExpenseLines.companyId, companyId), inArray(historicalExpenseLines.siteId, siteIds))),
  ])
  const ids = [...new Set(orders.map(r => r.requestId))]
  const lines = ids.length ? await db.select({ requestId: purchaseRequestLines.purchaseRequestId,
    label: purchaseRequestLines.label, spendCategory: purchaseRequestLines.spendCategory })
    .from(purchaseRequestLines).where(inArray(purchaseRequestLines.purchaseRequestId, ids)) : []
  return buildDirectBudgetEntries(orders, lines, history.map(r => ({ ...r, date: isoDateValue(r.date) })))
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
        eq(purchaseOrders.correctionPending, false),
        inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
      ),
    )
  return toFcfaInt(row?.total)
}

async function sumRealizedBc(companyId: string, siteId: string): Promise<number> {
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
        eq(purchaseOrders.correctionPending, false),
        eq(purchaseRequests.status, 'delivered'),
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
        eq(purchaseOrders.correctionPending, false),
        inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
      ),
    )
    .orderBy(asc(purchaseOrders.createdAt))
  const direct = await directBudgetEntries(companyId, [siteId])
  return [...rows.map((row) => ({ amountFcfa: toFcfaInt(row.amountFcfa), createdAt: row.createdAt })),
    ...direct.map(row => ({ amountFcfa: row.engaged, createdAt: row.createdAt }))]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
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

/** Dépenses (BC engagés) d'un mois donné, ventilées par chantier — suivi mensuel. */
export async function listSiteMonthlyExpenses(
  companyId: string,
  month: string,
  opts?: { supervisedSiteIds?: string[] },
): Promise<{ siteId: string; amountFcfa: number }[]> {
  const startDate = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(startDate.getTime())) return []
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + 1)

  // Deux sources de dépense par chantier :
  //  1. BC matériaux (purchase_orders docType='bc' créés dans le mois) ;
  //  2. déboursés de trésorerie — main d'œuvre / charges payées via un BT
  //     (treasury_disbursements, datés par paidAt). Sans la source 2, un
  //     chantier 100 % main d'œuvre (Anader plateau) apparaissait « sans
  //     dépense » alors que le déboursé avait été enregistré.
  const [bcRows, disbRows] = await Promise.all([
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
        eq(purchaseOrders.correctionPending, false),
          inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
          gte(purchaseOrders.createdAt, startDate),
          lt(purchaseOrders.createdAt, endDate),
        ),
      )
      .groupBy(purchaseRequests.siteId),
    db
      .select({
        siteId: purchaseRequests.siteId,
        total: sql<string>`coalesce(sum(${treasuryDisbursements.amountFcfa}), 0)`,
      })
      .from(treasuryDisbursements)
      .innerJoin(treasuryOrders, eq(treasuryDisbursements.treasuryOrderId, treasuryOrders.id))
      .innerJoin(purchaseRequests, eq(treasuryOrders.purchaseRequestId, purchaseRequests.id))
      .where(
        and(
          eq(treasuryDisbursements.companyId, companyId),
          eq(treasuryOrders.purpose, 'advance'),
          gte(treasuryDisbursements.paidAt, startDate),
          lt(treasuryDisbursements.paidAt, endDate),
        ),
      )
      .groupBy(purchaseRequests.siteId),
  ])

  // Fusion des deux sources par chantier (somme BC + déboursés).
  const totals = new Map<string, number>()
  for (const r of [...bcRows, ...disbRows]) {
    if (typeof r.siteId !== 'string') continue
    totals.set(r.siteId, (totals.get(r.siteId) ?? 0) + toFcfaInt(r.total))
  }
  // DT : ne compter que les dépenses de ses chantiers assignés.
  const scoped = opts?.supervisedSiteIds
    ? [...totals.entries()].filter(([siteId]) => opts.supervisedSiteIds!.includes(siteId))
    : [...totals.entries()]
  return scoped.map(([siteId, amountFcfa]) => ({ siteId, amountFcfa }))
}

export async function getSiteBudget(companyId: string, siteId: string): Promise<SiteBudgetDto | null> {
  const site = await getSiteById(companyId, siteId)
  if (!site) return null

  const [approvedSum, engagedBc, realizedBc, amendmentRows, directEntries] = await Promise.all([
    sumApprovedAmendments(siteId),
    sumEngagedBc(companyId, siteId),
    sumRealizedBc(companyId, siteId),
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
    directBudgetEntries(companyId, [siteId]),
  ])
  const engagedFcfa = engagedBc + directEntries.reduce((sum, r) => sum + r.engaged, 0)
  const realizedFcfa = realizedBc + directEntries.reduce((sum, r) => sum + r.realized, 0)

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
    realizedFcfa,
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
    realizedFcfa: totals.realizedFcfa,
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
        eq(purchaseOrders.correctionPending, false),
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
  // Réalisé = BC **livrés** + EB **hors SA payées** (F02 lot B, invariant I100).
  // Les deux sources ne se recouvrent jamais : une EB hors SA n'a pas de BC.
  const [deliveryEvents, directEvents, familyAllocations] = await Promise.all([
    listSiteDeliveryExpenseEvents(companyId, siteId),
    listSiteDirectExpenseEvents(companyId, siteId),
    getFamilyAllocations(companyId, siteId),
  ])
  return {
    siteId: budget.siteId,
    siteName: budget.siteName,
    ...buildSiteIndicators({
      asOf: todayIsoLocal(),
      budgetInitialFcfa: budget.budgetInitialFcfa,
      budgetTotalFcfa: budget.budgetTotalFcfa,
      events: [...deliveryEvents, ...directEvents],
      familyAllocations,
    }),
  }
}

/**
 * Ventilation de l'enveloppe d'un chantier par **famille de charge** (F03).
 *
 * Les familles retirées du référentiel (impossible aujourd'hui, mais le
 * référentiel vit en code) sont **ignorées** : elles ne sont jamais comptées
 * dans un total.
 */
export async function getFamilyAllocations(
  companyId: string,
  siteId: string,
): Promise<FamilyAllocation[]> {
  const rows = await db
    .select({
      family: siteBudgetFamilyAllocations.family,
      amountFcfa: siteBudgetFamilyAllocations.amountFcfa,
    })
    .from(siteBudgetFamilyAllocations)
    .where(
      and(
        eq(siteBudgetFamilyAllocations.companyId, companyId),
        eq(siteBudgetFamilyAllocations.siteId, siteId),
      ),
    )
  const out: FamilyAllocation[] = []
  for (const row of rows) {
    const family = CHARGE_FAMILIES.find((f) => f.value === row.family)?.value
    if (!family) continue
    out.push({ family, amountFcfa: Number(row.amountFcfa ?? 0) })
  }
  return out
}

/**
 * Remplace la ventilation d'un chantier (F03).
 *
 * Écriture **complète** et non patch : les familles absentes de `allocations`
 * sont supprimées, sinon une famille retirée de l'écran resterait allouée en
 * base et fausserait les totaux. Les allocations à 0 ne sont pas stockées.
 */
export async function setFamilyAllocations(input: {
  companyId: string
  siteId: string
  allocations: FamilyAllocation[]
  managerId: string
}): Promise<FamilyAllocation[]> {
  const site = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, input.siteId), eq(sites.companyId, input.companyId)))
    .limit(1)
  if (site.length === 0) throw new SiteBudgetError('Chantier introuvable', 404)

  await db
    .delete(siteBudgetFamilyAllocations)
    .where(
      and(
        eq(siteBudgetFamilyAllocations.companyId, input.companyId),
        eq(siteBudgetFamilyAllocations.siteId, input.siteId),
      ),
    )

  for (const allocation of input.allocations) {
    if (allocation.amountFcfa <= 0) continue
    await db.insert(siteBudgetFamilyAllocations).values({
      id: `sbfa-${randomUUID()}`,
      companyId: input.companyId,
      siteId: input.siteId,
      family: allocation.family,
      amountFcfa: String(Math.trunc(allocation.amountFcfa)),
      updatedByManagerId: input.managerId,
    })
  }

  return getFamilyAllocations(input.companyId, input.siteId)
}

/**
 * Dépenses **directes** d'un chantier — circuit hors SA (F02 lot B).
 *
 * Pendant de `listSiteDeliveryExpenseEvents` : chaque **déboursé** d'un BT du
 * chantier produit un événement daté du paiement, ventilé sur les lignes de
 * l'EB au prorata du montant déboursé (un paiement peut être partiel).
 *
 * C'est ce qui rend le réalisé vrai : sans cette source, un chantier dont la
 * main-d'œuvre est payée hors SA n'afficherait que ses achats matériaux.
 */
export async function listSiteDirectExpenseEvents(
  companyId: string,
  siteId: string,
): Promise<DeliveryExpenseEvent[]> {
  const rows = await db
    .select({
      requestId: treasuryOrders.purchaseRequestId,
      paidAt: treasuryDisbursements.paidAt,
      amountFcfa: treasuryDisbursements.amountFcfa,
    })
    .from(treasuryDisbursements)
    .innerJoin(treasuryOrders, eq(treasuryDisbursements.treasuryOrderId, treasuryOrders.id))
    .innerJoin(purchaseRequests, eq(treasuryOrders.purchaseRequestId, purchaseRequests.id))
    .where(and(eq(treasuryDisbursements.companyId, companyId), eq(purchaseRequests.siteId, siteId), eq(treasuryOrders.purpose, 'advance')))
    .orderBy(treasuryDisbursements.paidAt)

  // T08 — les dépenses **historiques** rejouées depuis le journal du CdG
  // alimentent le **même** réalisé (invariant I108 : un seul réalisé). Ce sont
  // des faits datés, pas des documents du circuit : ni EB, ni BT, ni déboursé.
  const historicalRows = await db
    .select({
      occurredOn: historicalExpenseLines.occurredOn,
      label: historicalExpenseLines.label,
      nature: historicalExpenseLines.nature,
      amountFcfa: historicalExpenseLines.amountFcfa,
    })
    .from(historicalExpenseLines)
    .where(
      and(
        eq(historicalExpenseLines.companyId, companyId),
        eq(historicalExpenseLines.siteId, siteId),
      ),
    )
    .orderBy(asc(historicalExpenseLines.occurredOn))

  const historicalEvents: DeliveryExpenseEvent[] = historicalRows.map((row) => {
    const amount = Number(row.amountFcfa ?? 0)
    return {
      date: isoDateValue(row.occurredOn),
      amountFcfa: amount,
      products: [{ label: row.label, amountFcfa: amount, category: row.nature }],
    }
  })

  if (rows.length === 0) return historicalEvents

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

  const disbursementEvents: DeliveryExpenseEvent[] = rows.map((row) => {
    const lines = linesByRequest.get(row.requestId) ?? []
    const amountFcfa = Number(row.amountFcfa ?? 0)
    const total = lines.reduce((sum, l) => sum + Number(l.amountFcfa ?? 0), 0)
    const paidAt = row.paidAt instanceof Date ? row.paidAt : new Date(String(row.paidAt))
    return {
      date: todayIsoLocal(paidAt),
      amountFcfa,
      products: lines.map((l) => ({
        label: l.label,
        amountFcfa:
          total > 0 ? Math.round((Number(l.amountFcfa ?? 0) / total) * amountFcfa) : 0,
        category: l.spendCategory,
      })),
    }
  })

  return [...disbursementEvents, ...historicalEvents]
}

// ─── T08 — Rejeu de l'historique du CdG ─────────────────────────────────────

/** Ligne du journal, déjà normalisée par `shared/cdgJournal.ts`. */
export type HistoricalExpenseInput = {
  occurredOn: string
  label: string
  nature: string
  natureLabel: string | null
  supplierName: string | null
  amountFcfa: number
  siteName: string | null
  sourceRef: string
}

export type HistoricalImportResult = {
  batchId: string
  /** Lignes réellement créées. */
  imported: number
  /** Lignes déjà rejouées par un import précédent — ignorées (I99). */
  skipped: number
  importedFcfa: number
  /** Libellés de chantier non reconnus : lignes laissées **non imputées**. */
  unassignedSites: string[]
}

/**
 * Enregistre un **lot** de lignes historiques (T08).
 *
 * **Idempotent** (I99) : l'unicité `(company, source, source_ref)` est appliquée
 * par la base. Une ligne déjà rejouée est **ignorée**, jamais mise à jour — un
 * fait ne se réécrit pas ; seul un nouveau lot peut la remplacer.
 *
 * Le chantier est résolu par `resolveJournalSiteId` (rapprochement de libellés).
 * Un libellé inconnu laisse `site_id` à NULL et est **remonté** à l'appelant :
 * la ligne est conservée, visible, **non imputée** — jamais rattachée au hasard.
 */
export async function importHistoricalExpenseLines(input: {
  companyId: string
  managerId: string | null
  lines: HistoricalExpenseInput[]
  /** Chantiers de l'entreprise, pour résoudre les libellés du journal. */
  sites: Array<{ id: string; name: string }>
  /**
   * Chantier désigné par le CdG, appliqué aux lignes dont le libellé du journal
   * n'est pas reconnu.
   *
   * Le journal réel nomme `DG CI ENERGIE` sur 503 de ses 508 lignes — libellé qui
   * correspond **déjà** au chantier `site-xlsx-dg-ci-energie`. Ce repli sert aux
   * lignes orphelines (ex. `CI ENERGIE DG`, ordre inversé) : sans lui, elles
   * seraient importées **non imputées** et n'alimenteraient le réalisé d'**aucun**
   * chantier. Le libellé d'origine reste stocké (`site_name`) pour la traçabilité.
   */
  fallbackSiteId?: string | null
  source?: string
  batchId?: string
}): Promise<HistoricalImportResult> {
  const source = input.source ?? 'journal_cdg'
  const batchId =
    input.batchId ?? `hist-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`

  const unassigned = new Set<string>()
  const values = input.lines.map((line) => {
    const siteId =
      (line.siteName ? resolveJournalSiteId(line.siteName, input.sites) : null) ??
      input.fallbackSiteId ??
      null
    if (!siteId && line.siteName) unassigned.add(line.siteName)
    return {
      id: `hel-${randomUUID()}`,
      companyId: input.companyId,
      siteId,
      siteName: line.siteName,
      occurredOn: line.occurredOn,
      label: line.label,
      nature: line.nature,
      natureLabel: line.natureLabel,
      supplierName: line.supplierName,
      amountFcfa: String(Math.trunc(line.amountFcfa)),
      source,
      sourceRef: line.sourceRef,
      batchId,
      importedByManagerId: input.managerId,
    }
  })

  let imported = 0
  let importedFcfa = 0
  // Insertion par paquets : un rejeu réel fait ~315 lignes, une seule requête
  // monolithique dépasserait la limite de paramètres du pilote.
  const chunkSize = 100
  for (let i = 0; i < values.length; i += chunkSize) {
    const inserted = await db
      .insert(historicalExpenseLines)
      .values(values.slice(i, i + chunkSize))
      .onConflictDoNothing()
      .returning({ amountFcfa: historicalExpenseLines.amountFcfa })
    imported += inserted.length
    importedFcfa += inserted.reduce((sum, row) => sum + Number(row.amountFcfa ?? 0), 0)
  }

  return {
    batchId,
    imported,
    skipped: values.length - imported,
    importedFcfa,
    unassignedSites: [...unassigned].sort(),
  }
}

/** Lignes historiques rejouées (T08) — **lecture seule**. */
export async function listHistoricalExpenseLines(
  companyId: string,
  options: { siteId?: string; limit?: number } = {},
): Promise<
  Array<{
    id: string
    siteId: string | null
    siteName: string | null
    occurredOn: string
    label: string
    nature: string
    natureLabel: string | null
    supplierName: string | null
    amountFcfa: number
    batchId: string
  }>
> {
  const conditions = [eq(historicalExpenseLines.companyId, companyId)]
  if (options.siteId) conditions.push(eq(historicalExpenseLines.siteId, options.siteId))
  const rows = await db
    .select({
      id: historicalExpenseLines.id,
      siteId: historicalExpenseLines.siteId,
      siteName: historicalExpenseLines.siteName,
      occurredOn: historicalExpenseLines.occurredOn,
      label: historicalExpenseLines.label,
      nature: historicalExpenseLines.nature,
      natureLabel: historicalExpenseLines.natureLabel,
      supplierName: historicalExpenseLines.supplierName,
      amountFcfa: historicalExpenseLines.amountFcfa,
      batchId: historicalExpenseLines.batchId,
    })
    .from(historicalExpenseLines)
    .where(and(...conditions))
    .orderBy(desc(historicalExpenseLines.occurredOn))
    .limit(Math.min(options.limit ?? 500, 2000))

  return rows.map((row) => ({
    ...row,
    occurredOn: isoDateValue(row.occurredOn),
    amountFcfa: Number(row.amountFcfa ?? 0),
  }))
}

/** Lots d'import déjà rejoués (T08) — un rejeu se constate et s'annule. */
export async function listHistoricalImportBatches(companyId: string): Promise<
  Array<{ batchId: string; source: string; lines: number; amountFcfa: number; importedAt: string }>
> {
  const rows = await db
    .select({
      batchId: historicalExpenseLines.batchId,
      source: historicalExpenseLines.source,
      lines: sql<number>`count(*)::int`,
      amountFcfa: sql<string>`coalesce(sum(${historicalExpenseLines.amountFcfa}), 0)`,
      importedAt: sql<string>`max(${historicalExpenseLines.createdAt})`,
    })
    .from(historicalExpenseLines)
    .where(eq(historicalExpenseLines.companyId, companyId))
    .groupBy(historicalExpenseLines.batchId, historicalExpenseLines.source)
    .orderBy(sql`max(${historicalExpenseLines.createdAt}) desc`)

  return rows.map((row) => ({
    batchId: row.batchId,
    source: row.source,
    lines: Number(row.lines ?? 0),
    amountFcfa: Number(row.amountFcfa ?? 0),
    importedAt: String(row.importedAt ?? ''),
  }))
}

/** Annule un lot d'import (T08) — le rejeu est **réversible**. */
export async function deleteHistoricalImportBatch(input: {
  companyId: string
  batchId: string
}): Promise<number> {
  const deleted = await db
    .delete(historicalExpenseLines)
    .where(
      and(
        eq(historicalExpenseLines.companyId, input.companyId),
        eq(historicalExpenseLines.batchId, input.batchId),
      ),
    )
    .returning({ id: historicalExpenseLines.id })
  return deleted.length
}

/**
 * Références de BC connues de TraceO (T08).
 *
 * Alimente le **rapprochement** affiché avant tout import (I106) : une ligne du
 * journal qui cite un BC inconnu est signalée. Elle n'est pas pour autant
 * importée — le CdG a tranché que **toute** ligne avec n° de BC est déjà un
 * achat de TraceO (I100).
 */
export async function listKnownPurchaseOrderReferences(companyId: string): Promise<string[]> {
  const rows = await db
    .select({ reference: purchaseOrders.reference })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.companyId, companyId))
  return rows.map((row) => row.reference).filter((ref): ref is string => Boolean(ref))
}

/** Ids des chantiers actifs supervisés par un manager (DT) — restriction « mes chantiers »,
 *  UNION chantiers ayant une EB émise par lui (option A — I95, même règle que le
 *  sélecteur Chantier : budgets, stock et dépenses mensuelles suivent le périmètre). */
export async function listSupervisedSiteIds(companyId: string, managerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(
        eq(sites.companyId, companyId),
        eq(sites.active, true),
        or(eq(sites.supervisorManagerId, managerId), sitesWithEbCreatedBy(companyId, managerId))!,
      ),
    )
  return rows.map((r) => r.id)
}

export async function listSiteBudgets(
  companyId: string,
  opts?: { supervisedSiteIds?: string[] },
): Promise<SiteBudgetDto[]> {
  const allSites = await listSites(companyId)
  // DT : uniquement les chantiers qui lui sont assignés (supervisor_manager_id).
  const siteRows = opts?.supervisedSiteIds
    ? allSites.filter((s) => opts.supervisedSiteIds!.includes(s.id))
    : allSites
  if (siteRows.length === 0) return []
  const siteIds = siteRows.map((s) => s.id)

  const [approvedRows, engagedRows, realizedRows, amendmentRows, directEntries] = await Promise.all([
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
        eq(purchaseOrders.correctionPending, false),
          inArray(purchaseRequests.status, [...ENGAGED_BC_STATUSES]),
          inArray(purchaseRequests.siteId, siteIds),
        ),
      )
      .groupBy(purchaseRequests.siteId),
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
        eq(purchaseOrders.correctionPending, false),
          eq(purchaseRequests.status, 'delivered'),
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
    directBudgetEntries(companyId, siteIds),
  ])

  const approvedBySite = new Map(approvedRows.map((r) => [r.siteId, toFcfaInt(r.total)]))
  const engagedBySite = new Map(
    engagedRows
      .filter((r): r is { siteId: string; total: string } => typeof r.siteId === 'string')
      .map((r) => [r.siteId, toFcfaInt(r.total)]),
  )
  const realizedBySite = new Map(
    realizedRows
      .filter((r): r is { siteId: string; total: string } => typeof r.siteId === 'string')
      .map((r) => [r.siteId, toFcfaInt(r.total)]),
  )
  for (const entry of directEntries) {
    if (!entry.siteId) continue
    engagedBySite.set(entry.siteId, (engagedBySite.get(entry.siteId) ?? 0) + entry.engaged)
    realizedBySite.set(entry.siteId, (realizedBySite.get(entry.siteId) ?? 0) + entry.realized)
  }
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
    const realizedFcfa = realizedBySite.get(site.id) ?? 0
    const siteAmendments = amendmentsBySite.get(site.id) ?? []
    const totals = computeBudgetTotals({
      budgetInitialFcfa: site.budgetInitialFcfa,
      budgetFrozenAt: site.budgetFrozenAt,
      approvedAmendmentSumFcfa: approvedSum,
      engagedFcfa,
      realizedFcfa,
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
      realizedFcfa: totals.realizedFcfa,
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

export async function listDrafts(companyId: string, siteIds?: string[], createdByManagerId?: string) {
  if (siteIds && siteIds.length === 0) return []
  return db
    .select()
    .from(purchaseRequestDrafts)
    .where(and(
      eq(purchaseRequestDrafts.companyId, companyId),
      ne(purchaseRequestDrafts.status, 'deleted'),
      ...(createdByManagerId ? [eq(purchaseRequestDrafts.createdByManagerId, createdByManagerId)] : []),
      ...(siteIds ? [inArray(purchaseRequestDrafts.siteId, siteIds)] : []),
    ))
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
  createdByManagerId?: string | null
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
      createdByManagerId: input.createdByManagerId ?? null,
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
 * Supprime LOGIQUEMENT un brouillon d'EB (statut "deleted") — traçabilité conservée.
 * Retourne true si un brouillon a bien été mis à jour.
 */
export async function softDeleteDraft(
  companyId: string,
  draftId: string,
  deletedById?: string,
): Promise<boolean> {
  const [draft] = await db
    .select({ id: purchaseRequestDrafts.id })
    .from(purchaseRequestDrafts)
    .where(and(eq(purchaseRequestDrafts.id, draftId), eq(purchaseRequestDrafts.companyId, companyId)))
    .limit(1)
  if (!draft) return false

  await db
    .update(purchaseRequestDrafts)
    .set({
      status: 'deleted',
      deletedAt: new Date(),
      deletedById: deletedById ?? null,
    })
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
  try {
    await db.insert(ebParseRuns).values({
      id,
      draftId: input.draftId,
      promptVersion: input.promptVersion,
      inputSummary: input.inputSummary ?? null,
      extractedJson: input.extractedJson ?? null,
      confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
      error: input.error ?? null,
    })
  } catch (err) {
    // 23503 (FK draft_id) : le brouillon a été supprimé pendant l'écriture
    // (soft-delete concurrent, reset e2e entre deux tests). Une trace de parse
    // pour un brouillon inexistant n'a pas de sens — on ignore silencieusement
    // au lieu de renvoyer un 500 au client (DrizzleQueryError /auto-save DT).
    const pgCode = (err as { cause?: { code?: string } } | null)?.cause?.code
    if (pgCode === '23503') return
    throw err
  }
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

export async function listPurchaseRequests(companyId: string, initiatedByManagerId?: string) {
  // La colonne « Chantier » de l’UI lit `siteName` : sans jointure, le champ est
  // absent de la réponse et l’écran SA affiche un repli générique « Chantier ».
  return db
    .select({
      request: purchaseRequests,
      siteName: sites.name,
    })
    .from(purchaseRequests)
    .leftJoin(sites, eq(purchaseRequests.siteId, sites.id))
    .leftJoin(purchaseRequestDrafts, eq(purchaseRequests.sourceDraftId, purchaseRequestDrafts.id))
    .where(and(
      eq(purchaseRequests.companyId, companyId),
      ...(initiatedByManagerId ? [or(
        eq(purchaseRequestDrafts.createdByManagerId, initiatedByManagerId),
        and(isNull(purchaseRequests.sourceDraftId), eq(purchaseRequests.createdByManagerId, initiatedByManagerId)),
      )] : []),
    ))
    .orderBy(desc(purchaseRequests.createdAt))
    .then((rows) =>
      rows.map((row) => ({
        ...row.request,
        siteName: row.siteName ?? null,
      })),
    )
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

/**
 * Met à jour les quantités des lignes (révision PDG) et recalcule montants + total.
 * Ne touche que les lignes listées ; les autres gardent leur quantité.
 */
export async function updateRequestLineQuantities(
  companyId: string,
  requestId: string,
  quantities: Array<{ id: string; quantity: number }>,
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  const lines = await getPurchaseRequestLines(requestId)
  const byId = new Map(quantities.map((q) => [q.id, q.quantity]))
  let total = 0
  for (const line of lines) {
    const patchQty = byId.get(line.id)
    const qty = patchQty != null ? Math.max(0, patchQty) : Number(line.quantity)
    const pu = Number(line.unitPriceFcfa ?? 0)
    const amount = lineAmountFcfa(pu, qty)
    total += amount
    if (patchQty != null) {
      await db
        .update(purchaseRequestLines)
        .set({
          quantity: String(qty),
          amountFcfa: String(amount),
        })
        .where(eq(purchaseRequestLines.id, line.id))
    }
  }
  await updatePurchaseRequestStatus(companyId, requestId, request.status, { totalAmountFcfa: total })
  return getRequestDetail(companyId, requestId)
}

/** Snapshot des lignes à une version donnée de la demande (historique de révision). */
export async function recordPurchaseRequestVersion(input: {
  purchaseRequestId: string
  version: number
  lines: unknown
  comment?: string | null
  createdByManagerId?: string | null
}) {
  const id = `prv-${randomUUID()}`
  const [row] = await db
    .insert(purchaseRequestVersions)
    .values({
      id,
      purchaseRequestId: input.purchaseRequestId,
      version: input.version,
      lines: input.lines,
      comment: input.comment ?? null,
      createdByManagerId: input.createdByManagerId ?? null,
    })
    .returning()
  return row!
}

export async function listPurchaseRequestVersions(requestId: string) {
  return db
    .select()
    .from(purchaseRequestVersions)
    .where(eq(purchaseRequestVersions.purchaseRequestId, requestId))
    .orderBy(asc(purchaseRequestVersions.version))
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

/**
 * Nombre de lignes de l'entreprise qui référencent encore une clé de blob.
 * Une facture peut être partagée par plusieurs lignes : le fichier n'est
 * supprimé du stockage que lorsque plus aucune ligne ne le référence
 * (déréférencement compté, cf. routes/procurement.ts).
 */
export async function countRequestLinesByBlobKey(companyId: string, blobKey: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseRequestLines)
    .innerJoin(purchaseRequests, eq(purchaseRequestLines.purchaseRequestId, purchaseRequests.id))
    .where(
      and(eq(purchaseRequests.companyId, companyId), eq(purchaseRequestLines.attachmentBlobKey, blobKey)),
    )
  return row?.count ?? 0
}

/**
 * Affecte une même pièce jointe à plusieurs lignes d'une demande : une seule
 * clé de blob, référencée par toutes les lignes visées (facture partagée).
 * `lineIds` est borné aux lignes réellement rattachées à la demande.
 */
export async function setRequestLinesAttachment(
  companyId: string,
  requestId: string,
  lineIds: string[],
  attachment: {
    blobKey: string
    fileName: string
    contentType: string
  },
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  if (lineIds.length > 0) {
    await db
      .update(purchaseRequestLines)
      .set({
        attachmentBlobKey: attachment.blobKey,
        attachmentFileName: attachment.fileName,
        attachmentContentType: attachment.contentType,
      })
      .where(
        and(eq(purchaseRequestLines.purchaseRequestId, requestId), inArray(purchaseRequestLines.id, lineIds)),
      )
  }
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
      invalidatedAt: approvalSteps.invalidatedAt,
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
  /** Statut initial — `cdg_review` pour une EB 100 % hors SA (décision CdG, I110). */
  initialStatus?: PurchaseRequestStatus
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
        status: input.initialStatus ?? 'submitted',
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
        // Concept : la main d'œuvre se paie toujours comptant — normalisé côté
        // serveur pour garantir l'invariant quel que soit le client.
        paymentMode:
          chargeNatureFamily(normalizeEbSpendCategory(line.spendCategory)) === 'main_oeuvre'
            ? 'COMPTANT'
            : line.paymentMode ?? null,
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
    saReviewerId: string | null
    supplierId: string | null
    totalAmountFcfa: number | null
    notes: string | null
    version: number
    ebVersion: number
    revisionComment: string | null
    revisedAt: Date | null
  }> = {},
) {
  const [row] = await db
    .update(purchaseRequests)
    .set({
      status,
      updatedAt: new Date(),
      ...(patch.saReviewerId !== undefined ? { saReviewerId: patch.saReviewerId } : {}),
      ...(patch.supplierId !== undefined ? { supplierId: patch.supplierId } : {}),
      ...(patch.totalAmountFcfa !== undefined
        ? { totalAmountFcfa: patch.totalAmountFcfa != null ? String(patch.totalAmountFcfa) : null }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.version !== undefined ? { version: patch.version } : {}),
      ...(patch.ebVersion !== undefined ? { ebVersion: patch.ebVersion } : {}),
      ...(patch.revisionComment !== undefined ? { revisionComment: patch.revisionComment } : {}),
      ...(patch.revisedAt !== undefined ? { revisedAt: patch.revisedAt } : {}),
    })
    .where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
    .returning()
  return row ?? null
}

export async function recordApprovalStep(input: {
  purchaseRequestId: string
  role: ProcurementRole
  managerId: string
  decision: 'approved' | 'rejected' | 'revised'
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
  const [lines, steps, site, supplier, suppliersList, pos, treasuries] = await Promise.all([
    getPurchaseRequestLines(requestId),
    getApprovalSteps(requestId),
    getSiteById(companyId, request.siteId),
    request.supplierId ? getSupplierById(companyId, request.supplierId) : Promise.resolve(null),
    listSuppliers(companyId),
    db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.purchaseRequestId, requestId), eq(purchaseOrders.correctionPending, false)))
      .orderBy(purchaseOrders.createdAt),
    listTreasuryOrdersForRequest(companyId, requestId),
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
    treasuryOrders: treasuries,
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
  saApprovalRequired?: boolean
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
      saApprovalRequired: input.saApprovalRequired ?? false,
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

/** Écrit le lien inverse tournée → BC (tours.purchase_order_id).
 *  Indispensable : getTourReplanTemplate lit cette colonne pour conserver
 *  le verrou produits BC lors d'une replanification. */
export async function setTourPurchaseOrder(tourId: string, purchaseOrderId: string | null) {
  await db.update(tours).set({ purchaseOrderId }).where(eq(tours.id, tourId))
}

export async function createTreasuryOrder(input: {
  companyId: string
  purchaseRequestId: string
  purchaseRequestLineId?: string | null
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
      purchaseRequestLineId: input.purchaseRequestLineId ?? null,
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

/**
 * Aligne le montant du BT sur le total recalculé de l'EB — nécessaire après une
 * révision PDG des quantités, sinon la fiche de trésorerie garde l'ancien total.
 */
export async function updateTreasuryOrderAmount(id: string, amountFcfa: number) {
  await db
    .update(treasuryOrders)
    .set({ amountFcfa: String(amountFcfa) })
    .where(eq(treasuryOrders.id, id))
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

export async function getTreasuryOrderByLine(companyId: string, lineId: string) {
  const [row] = await db
    .select()
    .from(treasuryOrders)
    .where(
      and(eq(treasuryOrders.purchaseRequestLineId, lineId), eq(treasuryOrders.companyId, companyId)),
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

/** Statut du BT : pending → issued → deboursed → paid (F02 lot B). */
export async function updateTreasuryOrderStatus(id: string, status: TreasuryOrderStatus) {
  await db.update(treasuryOrders).set({ status }).where(eq(treasuryOrders.id, id))
}

/**
 * Enregistre le déboursé d'un BT — **un seul par BT** (index unique en base).
 * La facture est **exigée au déboursé** (invariant I103) : l'appelant doit
 * fournir une pièce jointe, ou la rattacher dans la foulée.
 */
export async function createTreasuryDisbursement(input: {
  companyId: string
  treasuryOrderId: string
  amountFcfa: number
  method: DisbursementMethod
  transactionReference?: string | null
  paidAt: Date
  recordedByManagerId?: string | null
  invoiceBlobKey?: string | null
  invoiceFileName?: string | null
  invoiceContentType?: string | null
}) {
  const id = `td-${randomUUID()}`
  const [row] = await db
    .insert(treasuryDisbursements)
    .values({
      id,
      companyId: input.companyId,
      treasuryOrderId: input.treasuryOrderId,
      amountFcfa: String(input.amountFcfa),
      method: input.method,
      transactionReference: input.transactionReference ?? null,
      paidAt: input.paidAt,
      recordedByManagerId: input.recordedByManagerId ?? null,
      invoiceBlobKey: input.invoiceBlobKey ?? null,
      invoiceFileName: input.invoiceFileName ?? null,
      invoiceContentType: input.invoiceContentType ?? null,
    })
    .returning()
  return row!
}

export async function getDisbursementByTreasuryOrder(companyId: string, treasuryOrderId: string) {
  const [row] = await db
    .select()
    .from(treasuryDisbursements)
    .where(
      and(
        eq(treasuryDisbursements.treasuryOrderId, treasuryOrderId),
        eq(treasuryDisbursements.companyId, companyId),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Tous les déboursés d'une EB — la facture reste consultable depuis l'EB. */
export async function listDisbursementsForRequest(companyId: string, requestId: string) {
  return db
    .select({ disbursement: treasuryDisbursements, treasury: treasuryOrders })
    .from(treasuryDisbursements)
    .innerJoin(treasuryOrders, eq(treasuryDisbursements.treasuryOrderId, treasuryOrders.id))
    .where(
      and(
        eq(treasuryDisbursements.companyId, companyId),
        eq(treasuryOrders.purchaseRequestId, requestId),
      ),
    )
    .orderBy(treasuryDisbursements.createdAt)
}

/**
 * Rattache (ou détache) la facture du paiement au déboursé.
 * Renvoie `null` si aucun déboursé n'existe pour ce BT.
 */
export async function setDisbursementInvoice(
  companyId: string,
  treasuryOrderId: string,
  invoice: { blobKey: string; fileName: string; contentType: string } | null,
) {
  const existing = await getDisbursementByTreasuryOrder(companyId, treasuryOrderId)
  if (!existing) return null
  const [row] = await db
    .update(treasuryDisbursements)
    .set({
      invoiceBlobKey: invoice?.blobKey ?? null,
      invoiceFileName: invoice?.fileName ?? null,
      invoiceContentType: invoice?.contentType ?? null,
    })
    .where(eq(treasuryDisbursements.id, existing.id))
    .returning()
  return row ?? null
}

/** Trace l'impression physique de la facture (Q56 — pas de double archivage). */
export async function markDisbursementInvoicePrinted(
  companyId: string,
  treasuryOrderId: string,
  printedAt: Date,
) {
  const existing = await getDisbursementByTreasuryOrder(companyId, treasuryOrderId)
  if (!existing) return null
  const [row] = await db
    .update(treasuryDisbursements)
    .set({ invoicePrintedAt: printedAt })
    .where(eq(treasuryDisbursements.id, existing.id))
    .returning()
  return row ?? null
}

/**
 * File du **poste Trésorerie** : BT émis (ou en préparation) restant à débourser,
 * avec leur EB. C'est la seule vue où le rôle `treasury` a besoin d'agir.
 */
export async function listTreasuryOrdersToDisburse(companyId: string) {
  return db
    .select({ treasury: treasuryOrders, request: purchaseRequests })
    .from(treasuryOrders)
    .innerJoin(purchaseRequests, eq(treasuryOrders.purchaseRequestId, purchaseRequests.id))
    .where(
      and(
        eq(treasuryOrders.companyId, companyId),
        inArray(treasuryOrders.status, ['pending', 'issued']),
        isNull(purchaseRequests.correctionTargetId),
        // Seuls les BT du circuit hors SA sont à débourser : les BT agrégés
        // historiques du circuit matériaux restent pilotés par le BC.
        or(and(eq(treasuryOrders.purpose, 'advance'), inArray(purchaseRequests.status, ['bt_pending', 'bt_ready', 'deboursed'])),
          and(eq(treasuryOrders.purpose, 'material_invoice'), sql`exists (select 1 from purchase_orders po where po.id = ${treasuryOrders.purchaseOrderId} and po.sa_invoice_transmitted = true and po.sa_invoice_paid = false)`)),
      ),
    )
    .orderBy(treasuryOrders.createdAt)
}

/**
 * Historique des paiements (déboursés) de l'entreprise — vu **par chantier**.
 *
 * Pendant entreprise-wide de `listDisbursementsForRequest` (par EB) : chaque
 * ligne = un déboursé enregistré avec sa pièce jointe (I103), son mode, son
 * n° de transaction et sa date. C'est la source de l'onglet Trésorerie
 * « Historique des paiements par chantier » — le rôle `treasury` relit ce qui
 * a été payé sans repasser EB par EB (à la manière du tableau de bord
 * Comptabilité pour les BC).
 */
export async function listTreasuryPaymentHistory(companyId: string) {
  return db
    .select({
      treasuryId: treasuryOrders.id,
      treasuryReference: treasuryOrders.reference,
      treasuryStatus: treasuryOrders.status,
      requestId: purchaseRequests.id,
      requestReference: purchaseRequests.reference,
      requestStatus: purchaseRequests.status,
      siteId: purchaseRequests.siteId,
      siteName: sites.name,
      amountFcfa: treasuryDisbursements.amountFcfa,
      method: treasuryDisbursements.method,
      transactionReference: treasuryDisbursements.transactionReference,
      paidAt: treasuryDisbursements.paidAt,
      invoiceFileName: treasuryDisbursements.invoiceFileName,
      invoiceBlobKey: treasuryDisbursements.invoiceBlobKey,
      invoicePrintedAt: treasuryDisbursements.invoicePrintedAt,
    })
    .from(treasuryDisbursements)
    .innerJoin(treasuryOrders, eq(treasuryDisbursements.treasuryOrderId, treasuryOrders.id))
    .innerJoin(purchaseRequests, eq(treasuryOrders.purchaseRequestId, purchaseRequests.id))
    .leftJoin(sites, eq(purchaseRequests.siteId, sites.id))
    .where(eq(treasuryDisbursements.companyId, companyId))
    .orderBy(desc(treasuryDisbursements.paidAt), desc(treasuryDisbursements.createdAt))
}

export async function listPurchaseOrdersForRequest(companyId: string, requestId: string) {
  return db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.purchaseRequestId, requestId), eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.correctionPending, false)))
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
  status: PurchaseRequestStatus
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
  invoicePaid: boolean
  invoiceFile: { fileName: string } | null
  invoiceTransmitted: boolean
  attachment: string
  attachments: Array<{ lineId: string; fileName: string }>
  /** Chaîne documentaire : EB d'origine (réf. + version) et BT rattachés au BC. */
  ebReference: string
  ebVersion: number
  btReferences: string[]
  /** Copie du bon de livraison fournisseur (pièce jointe SA). */
  blFile: { fileName: string } | null
  /** N° du BL interne (certificat RCT-…) émis à la confirmation de livraison. */
  blReceiptId: string | null
}

/** Registre POINTS FOURNISSEURS — une ligne par BC dont la livraison est confirmée. */
export async function listDeliveredBcRegister(companyId: string): Promise<BcRegisterRow[]> {
  const rows = await db
    .select({
      poId: purchaseOrders.id,
      poReference: purchaseOrders.reference,
      requestStatus: purchaseRequests.status,
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
      saInvoicePaid: purchaseOrders.saInvoicePaid,
      saInvoiceFileName: purchaseOrders.saInvoiceFileName,
      saInvoiceTransmitted: purchaseOrders.saInvoiceTransmitted,
      requestReference: purchaseRequests.reference,
      requestVersion: purchaseRequests.version,
      blFileName: purchaseOrders.blFileName,
      blBlobKey: purchaseOrders.blBlobKey,
      receiptId: certificates.receiptId,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseOrders.purchaseRequestId, purchaseRequests.id))
    .innerJoin(sites, eq(purchaseRequests.siteId, sites.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(deliveryPoints, eq(deliveryPoints.tourId, purchaseOrders.tourId))
    .leftJoin(tours, eq(tours.id, purchaseOrders.tourId))
    .leftJoin(declarations, eq(declarations.deliveryId, deliveryPoints.id))
    .leftJoin(certificates, eq(certificates.deliveryId, deliveryPoints.id))
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.docType, 'bc'),
        eq(purchaseOrders.correctionPending, false),
        // Livraison confirmée = déclaration « full » ou « partial » (cf. dashboard livraison).
        // Les partielles sont incluses avec le libellé « livraison partielle » en Observation.
        inArray(declarations.outcome, ['full', 'partial']),
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

  // Chaîne documentaire : les BT rattachés à chaque EB (un BT par ligne comptant).
  const allTreasury = await db
    .select({ requestId: treasuryOrders.purchaseRequestId, reference: treasuryOrders.reference })
    .from(treasuryOrders)
    .where(and(inArray(treasuryOrders.purchaseRequestId, requestIds), eq(treasuryOrders.purpose, 'advance')))
  const treasuryByRequest = new Map<string, string[]>()
  for (const t of allTreasury) {
    const list = treasuryByRequest.get(t.requestId) ?? []
    list.push(t.reference)
    treasuryByRequest.set(t.requestId, list)
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
    const baseObservation = (row.saObservation ?? '').trim()
    // Livraison partielle : le libellé est préfixé (idempotent si déjà saisi par le SA).
    const observation =
      row.declarationOutcome === 'partial' && !/^livraison partielle\b/i.test(baseObservation)
        ? baseObservation
          ? `livraison partielle — ${baseObservation}`
          : 'livraison partielle'
        : baseObservation || 'RAS'
    const attachments = supplierLines
      .filter((l) => (l.attachmentFileName ?? '').trim())
      .map((l) => ({ lineId: l.id, fileName: l.attachmentFileName!.trim() }))
    return {
      purchaseOrderId: row.poId,
      status: row.requestStatus,
      purchaseRequestId: row.requestId,
      siteName: row.siteName,
      supplierName: row.supplierName,
      date: bcRegisterDate(declaration, row.tourDate),
      bon: row.poReference,
      paymentMode,
      quantities: quantitiesFromDelivery(supplierLines, declaration),
      amountFcfa,
      amountLabel: formatBcRegisterAmount(amountFcfa),
      invoice: (row.saInvoice ?? '').trim(),
      justifs: (row.saJustifs ?? '').trim() || 'RAS',
      observation,
      verification: (row.saVerification ?? '').trim() || '—',
      invoicePaid: row.saInvoicePaid,
      invoiceFile: (row.saInvoiceFileName ?? '').trim() ? { fileName: row.saInvoiceFileName!.trim() } : null,
      invoiceTransmitted: row.saInvoiceTransmitted,
      attachment: bcRegisterAttachments(supplierLines),
      attachments,
      ebReference: row.requestReference,
      ebVersion: row.requestVersion ?? 1,
      btReferences: treasuryByRequest.get(row.requestId) ?? [],
      blFile: row.blBlobKey && (row.blFileName ?? '').trim() ? { fileName: row.blFileName!.trim() } : null,
      blReceiptId: row.receiptId ?? null,
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
    invoicePaid?: boolean
    invoiceTransmitted?: boolean
  },
): Promise<BcRegisterRow | null> {
  const set: Partial<{
    saInvoice: string
    saJustifs: string
    saObservation: string
    saVerification: string
    saInvoicePaid: boolean
    saInvoiceTransmitted: boolean
  }> = {}
  if (patch.invoice !== undefined) set.saInvoice = patch.invoice
  if (patch.justifs !== undefined) set.saJustifs = patch.justifs
  if (patch.observation !== undefined) set.saObservation = patch.observation
  if (patch.verification !== undefined) set.saVerification = patch.verification
  if (patch.invoicePaid !== undefined) set.saInvoicePaid = patch.invoicePaid
  if (patch.invoiceTransmitted !== undefined) set.saInvoiceTransmitted = patch.invoiceTransmitted
  if (Object.keys(set).length === 0) {
    const rows = await listDeliveredBcRegister(companyId)
    return rows.find((r) => r.purchaseOrderId === purchaseOrderId) ?? null
  }
  const [updated] = await db
    .update(purchaseOrders)
    .set(set)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId), ...(patch.invoice !== undefined ? [eq(purchaseOrders.saInvoicePaid, false)] : [])))
    .returning({ id: purchaseOrders.id })
  if (!updated) return null
  const rows = await listDeliveredBcRegister(companyId)
  return rows.find((r) => r.purchaseOrderId === purchaseOrderId) ?? null
}

/** Enregistre (ou retire, avec null) la copie de facture transmise au comptable. */
export async function setBcInvoiceFile(
  companyId: string,
  purchaseOrderId: string,
  file: { blobKey: string; fileName: string; contentType: string } | null,
): Promise<boolean> {
  const set = file
    ? {
        saInvoiceBlobKey: file.blobKey,
        saInvoiceFileName: file.fileName,
        saInvoiceContentType: file.contentType,
        saInvoiceUploadedAt: new Date(),
        saInvoiceTransmitted: false,
      }
    : {
        saInvoiceBlobKey: null,
        saInvoiceFileName: null,
        saInvoiceContentType: null,
        saInvoiceUploadedAt: null,
        saInvoiceTransmitted: false,
      }
  const [updated] = await db
    .update(purchaseOrders)
    .set(set)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.saInvoicePaid, false)))
    .returning({ id: purchaseOrders.id })
  return Boolean(updated)
}

/** Lit les métadonnées de la facture transmise (clé blob + nom + type). */
export async function getBcInvoiceFile(
  companyId: string,
  purchaseOrderId: string,
): Promise<{ blobKey: string; fileName: string | null; contentType: string | null } | null> {
  const rows = await db
    .select({
      blobKey: purchaseOrders.saInvoiceBlobKey,
      fileName: purchaseOrders.saInvoiceFileName,
      contentType: purchaseOrders.saInvoiceContentType,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .limit(1)
  const row = rows[0]
  const blobKey = row?.blobKey?.trim()
  if (!row || !blobKey) return null
  return { blobKey, fileName: row.fileName, contentType: row.contentType }
}

// ─── Chaîne documentaire EB ↔ BC ↔ BT ↔ BL ───────────────────────────────────

/** Enregistre (ou retire, avec null) la copie du bon de livraison fournisseur. */
export async function setBcBlFile(
  companyId: string,
  purchaseOrderId: string,
  file: { blobKey: string; fileName: string; contentType: string } | null,
): Promise<boolean> {
  const set = file
    ? {
        blBlobKey: file.blobKey,
        blFileName: file.fileName,
        blContentType: file.contentType,
        blUploadedAt: new Date(),
      }
    : { blBlobKey: null, blFileName: null, blContentType: null, blUploadedAt: null }
  const [updated] = await db
    .update(purchaseOrders)
    .set(set)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .returning({ id: purchaseOrders.id })
  return Boolean(updated)
}

/** Lit les métadonnées du bon de livraison fournisseur (clé blob + nom + type). */
export async function getBcBlFile(
  companyId: string,
  purchaseOrderId: string,
): Promise<{ blobKey: string; fileName: string | null; contentType: string | null } | null> {
  const rows = await db
    .select({
      blobKey: purchaseOrders.blBlobKey,
      fileName: purchaseOrders.blFileName,
      contentType: purchaseOrders.blContentType,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .limit(1)
  const row = rows[0]
  const blobKey = row?.blobKey?.trim()
  if (!row || !blobKey) return null
  return { blobKey, fileName: row.fileName, contentType: row.contentType }
}

/** Tous les bons de trésorerie d'une EB (un BT par ligne comptant). */
export async function listTreasuryOrdersForRequest(companyId: string, requestId: string) {
  return db
    .select()
    .from(treasuryOrders)
    .where(and(eq(treasuryOrders.purchaseRequestId, requestId), eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.purpose, 'advance'), ne(treasuryOrders.status, 'cancelled')))
    .orderBy(treasuryOrders.createdAt)
}

/** Rattache le BT au BC qu'il finance (chaîne EB → BT → BC). */
export async function setTreasuryOrderPurchaseOrder(id: string, purchaseOrderId: string | null) {
  await db.update(treasuryOrders).set({ purchaseOrderId }).where(eq(treasuryOrders.id, id))
}

/**
 * Rattache les arrêts d'une tournée à leur BC (chaîne EB → BC → BL).
 * Ne remplace jamais un rattachement existant : le premier BC qui planifie la
 * tournée gagne — le modèle ne connaît qu'un BC par tournée
 * (`tours.purchase_order_id`), les arrêts héritent donc de ce BC.
 */
export async function linkDeliveryPointsToPurchaseOrder(tourId: string, purchaseOrderId: string) {
  await db
    .update(deliveryPoints)
    .set({ purchaseOrderId })
    .where(and(eq(deliveryPoints.tourId, tourId), isNull(deliveryPoints.purchaseOrderId)))
}

/**
 * Réfs. croisées d'un arrêt livré, imprimées sur le BL (certificat) :
 * « EB-2026-0007 — v2 » et « BC-2026-0012 ». Best-effort : null si l'arrêt
 * n'est pas rattaché à un BC (tournée hors achats).
 */
export async function getDeliveryDocumentRefs(
  deliveryId: string,
): Promise<{ ebReference: string | null; bcReference: string | null }> {
  const [row] = await db
    .select({
      ebReference: purchaseRequests.reference,
      ebVersion: purchaseRequests.version,
      bcReference: purchaseOrders.reference,
    })
    .from(deliveryPoints)
    .leftJoin(
      purchaseOrders,
      and(
        eq(purchaseOrders.docType, 'bc'),
        eq(purchaseOrders.correctionPending, false),
        or(eq(deliveryPoints.purchaseOrderId, purchaseOrders.id), eq(purchaseOrders.tourId, deliveryPoints.tourId)),
      ),
    )
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseOrders.purchaseRequestId))
    .where(eq(deliveryPoints.id, deliveryId))
    .limit(1)
  if (!row) return { ebReference: null, bcReference: null }
  return {
    ebReference: row.ebReference ? `${row.ebReference}${versionSuffix(row.ebVersion ?? 1)}` : null,
    bcReference: row.bcReference ?? null,
  }
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
