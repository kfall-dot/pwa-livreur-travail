import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from './index.js'
import {
  managers,
  siteDailyReports,
  siteDailyTasks,
  siteMaterialUsages,
  siteReportPhotos,
  sites,
  type SiteDailyTask,
  type SiteReportPhoto,
} from './schema.js'

/** Fuseau métier — la date du « jour » est celle de l'exploitation (Côte d'Ivoire). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Africa/Abidjan'

/** Date du jour au format AAAA-MM-JJ dans le fuseau métier (pas l'UTC). */
export function todayDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export type SubmissionEntry = { at: string; byManagerId: string; note?: string }

// ─── Accès par rôle ───────────────────────────────────────────────────────────

/** Chantiers assignés : chef → managerId ; DT superviseur → supervisorManagerId. */
export async function listSitesForManager(
  companyId: string,
  managerId: string,
  mode: 'chef' | 'superviseur',
  allSites = false,
): Promise<{ id: string; name: string; address: string }[]> {
  const col = mode === 'chef' ? sites.managerId : sites.supervisorManagerId
  const conds = [eq(sites.companyId, companyId), eq(sites.active, true)]
  if (!allSites) conds.push(eq(col, managerId))
  const rows = await db
    .select({ id: sites.id, name: sites.name, address: sites.address })
    .from(sites)
    .where(and(...conds))
    .orderBy(asc(sites.name))
  return rows
}

/** Rôles « compagnie entière » : accès à tous les chantiers actifs (DT, DAF, CdG, PDG). */
export const COMPANY_WIDE_ROLES = ['technical_director', 'daf', 'controle_gestion', 'pdg']

export async function canAccessSite(
  companyId: string,
  siteId: string,
  managerId: string,
  mode: 'chef' | 'superviseur',
  allSites = false,
): Promise<boolean> {
  const col = mode === 'chef' ? sites.managerId : sites.supervisorManagerId
  const conds = [eq(sites.companyId, companyId), eq(sites.id, siteId)]
  if (!allSites) conds.push(eq(col, managerId))
  const rows = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(...conds))
    .limit(1)
  return rows.length > 0
}


// ─── Dossier du jour ──────────────────────────────────────────────────────────

export type ReportDetail = {
  report: typeof siteDailyReports.$inferSelect
  tasks: (SiteDailyTask & {
    usages: {
      id: string
      productLabel: string
      unit: string
      quantity: number
      sourceSiteId: string | null
      provenance: string | null
    }[]
  })[]
  photos: SiteReportPhoto[]
}

export async function getOrCreateTodayReport(
  companyId: string,
  siteId: string,
  authorManagerId: string,
  now: Date = new Date(),
): Promise<ReportDetail> {
  const reportDate = todayDateString(now)
  const existing = await db
    .select()
    .from(siteDailyReports)
    .where(and(eq(siteDailyReports.siteId, siteId), eq(siteDailyReports.reportDate, reportDate)))
    .limit(1)
  const report =
    existing[0] ??
    (
      await db
        .insert(siteDailyReports)
        .values({ id: `sdr-${randomUUID()}`, companyId, siteId, reportDate, authorManagerId })
        .returning()
    )[0]
  return loadReportDetail(report.id)
}

async function loadReportDetail(reportId: string): Promise<ReportDetail> {
  const report = (
    await db.select().from(siteDailyReports).where(eq(siteDailyReports.id, reportId)).limit(1)
  )[0]
  if (!report) throw new Error('Rapport introuvable')
  const tasks = await db
    .select()
    .from(siteDailyTasks)
    .where(eq(siteDailyTasks.reportId, reportId))
    .orderBy(asc(siteDailyTasks.sortOrder), asc(siteDailyTasks.createdAt))
  const usages = await db
    .select()
    .from(siteMaterialUsages)
    .where(
      and(eq(siteMaterialUsages.reportId, reportId), eq(siteMaterialUsages.usageDate, report.reportDate)),
    )
    .orderBy(desc(siteMaterialUsages.createdAt))
  const photos = await db
    .select()
    .from(siteReportPhotos)
    .where(eq(siteReportPhotos.reportId, reportId))
    .orderBy(desc(siteReportPhotos.createdAt))
  const usagesByTask = new Map<string, typeof usages>()
  for (const u of usages) {
    const list = usagesByTask.get(u.taskId) ?? []
    list.push(u)
    usagesByTask.set(u.taskId, list)
  }
  return {
    report,
    tasks: tasks.map((t) => ({
      ...t,
      usages: (usagesByTask.get(t.id) ?? []).map((u) => ({
        id: u.id,
        productLabel: u.productLabel,
        unit: u.unit,
        quantity: Number(u.quantity),
        sourceSiteId: u.sourceSiteId,
        provenance: u.provenance,
      })),
    })),
    photos,
  }
}

export async function loadReportById(reportId: string): Promise<ReportDetail | null> {
  const rows = await db.select().from(siteDailyReports).where(eq(siteDailyReports.id, reportId)).limit(1)
  if (!rows[0]) return null
  return loadReportDetail(rows[0].id)
}

// ─── Tâches ───────────────────────────────────────────────────────────────────

export async function addTask(reportId: string, label: string): Promise<SiteDailyTask> {
  const existing = await db.select().from(siteDailyTasks).where(eq(siteDailyTasks.reportId, reportId))
  const rows = await db
    .insert(siteDailyTasks)
    .values({ id: `sdt-${randomUUID()}`, reportId, label: label.trim(), sortOrder: existing.length })
    .returning()
  await touchReport(reportId)
  return rows[0]
}

export async function setTaskDone(taskId: string, done: boolean, doneNote: string | null): Promise<void> {
  await db
    .update(siteDailyTasks)
    .set({ done, doneNote: done ? doneNote : null })
    .where(eq(siteDailyTasks.id, taskId))
  await touchReportByTask(taskId)
}

export async function deleteTask(taskId: string): Promise<void> {
  await db.delete(siteDailyTasks).where(eq(siteDailyTasks.id, taskId))
  await touchReportByTask(taskId)
}

// ─── Consommations (lien forcé vers une tâche) ────────────────────────────────

export async function addMaterialUsage(
  reportId: string,
  input: {
    taskId: string
    productLabel: string
    unit: string
    quantity: number
    sourceSiteId?: string | null
    provenance?: string | null
  },
): Promise<void> {
  const report = (await db.select().from(siteDailyReports).where(eq(siteDailyReports.id, reportId)).limit(1))[0]
  if (!report) throw new Error('Rapport introuvable')
  const task = (
    await db
      .select()
      .from(siteDailyTasks)
      .where(and(eq(siteDailyTasks.id, input.taskId), eq(siteDailyTasks.reportId, reportId)))
      .limit(1)
  )[0]
  if (!task) throw new Error('La consommation doit être liée à une tâche du dossier du jour')
  await db.insert(siteMaterialUsages).values({
    id: `smu-${randomUUID()}`,
    companyId: report.companyId,
    siteId: report.siteId,
    reportId,
    taskId: input.taskId,
    usageDate: report.reportDate,
    productLabel: input.productLabel.trim(),
    unit: input.unit.trim(),
    quantity: String(input.quantity),
    sourceSiteId: input.sourceSiteId ?? null,
    provenance: input.provenance ?? null,
  })
  await touchReport(reportId)
}

export async function deleteMaterialUsage(usageId: string): Promise<void> {
  await db.delete(siteMaterialUsages).where(eq(siteMaterialUsages.id, usageId))
  await touchReportByUsage(usageId)
}

// ─── Avancement + soumission / ré-ouverture ───────────────────────────────────

export async function updateProgress(
  reportId: string,
  globalProgressPct: number,
  comment: string | null,
): Promise<void> {
  await db
    .update(siteDailyReports)
    .set({ globalProgressPct: String(globalProgressPct), comment, updatedAt: new Date() })
    .where(eq(siteDailyReports.id, reportId))
}

export async function submitReport(
  reportId: string,
  byManagerId: string,
  note?: string,
  now: Date = new Date(),
): Promise<void> {
  const report = (await db.select().from(siteDailyReports).where(eq(siteDailyReports.id, reportId)).limit(1))[0]
  if (!report) throw new Error('Rapport introuvable')
  const entries = [
    ...((report.submissions as SubmissionEntry[] | null) ?? []),
    { at: now.toISOString(), byManagerId, ...(note ? { note } : {}) },
  ]
  await db
    .update(siteDailyReports)
    .set({ status: 'submitted', submittedAt: now, submissions: entries, updatedAt: now })
    .where(eq(siteDailyReports.id, reportId))
}

/** Ré-ouverture (complément) : retour en draft, l'historique des soumissions est conservé. */
export async function reopenReport(reportId: string): Promise<void> {
  await db
    .update(siteDailyReports)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(eq(siteDailyReports.id, reportId))
}

async function touchReport(reportId: string): Promise<void> {
  await db
    .update(siteDailyReports)
    .set({ updatedAt: new Date() })
    .where(eq(siteDailyReports.id, reportId))
}

async function touchReportByTask(taskId: string): Promise<void> {
  const rows = await db
    .select({ reportId: siteDailyTasks.reportId })
    .from(siteDailyTasks)
    .where(eq(siteDailyTasks.id, taskId))
    .limit(1)
  if (rows[0]) await touchReport(rows[0].reportId)
}

async function touchReportByUsage(usageId: string): Promise<void> {
  const rows = await db
    .select({ reportId: siteMaterialUsages.reportId })
    .from(siteMaterialUsages)
    .where(eq(siteMaterialUsages.id, usageId))
    .limit(1)
  if (rows[0]?.reportId) await touchReport(rows[0].reportId)
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export async function addReportPhoto(
  reportId: string,
  photoId: string,
  size: number,
  taskId: string | null,
): Promise<SiteReportPhoto> {
  const rows = await db
    .insert(siteReportPhotos)
    .values({ id: `srp-${randomUUID()}`, reportId, photoId, size, taskId: taskId || null, takenAt: new Date() })
    .returning()
  return rows[0]
}

export async function listReportPhotos(reportId: string): Promise<SiteReportPhoto[]> {
  return db
    .select()
    .from(siteReportPhotos)
    .where(eq(siteReportPhotos.reportId, reportId))
    .orderBy(desc(siteReportPhotos.createdAt))
}

/** Dernières photos d'un chantier (tous rapports confondus) — bloc « Photos » du suivi. */
export async function listSiteRecentPhotos(
  companyId: string,
  siteId: string,
  limit = 12,
): Promise<{ photoId: string; reportDate: string; takenAt: string | null }[]> {
  const rows = await db
    .select({
      photoId: siteReportPhotos.photoId,
      reportDate: siteDailyReports.reportDate,
      takenAt: siteReportPhotos.takenAt,
    })
    .from(siteReportPhotos)
    .innerJoin(siteDailyReports, eq(siteReportPhotos.reportId, siteDailyReports.id))
    .where(and(eq(siteDailyReports.companyId, companyId), eq(siteDailyReports.siteId, siteId)))
    .orderBy(desc(siteReportPhotos.createdAt))
    .limit(Math.max(1, Math.min(48, limit)))
  return rows.map((r) => ({
    photoId: r.photoId,
    reportDate: r.reportDate,
    takenAt: r.takenAt ? r.takenAt.toISOString() : null,
  }))
}

// ─── Stock réel = livré accepté − consommé ───────────────────────────────────

export type ConsumedRow = { productLabel: string; unit: string; consumed: number }

/** Consommations cumulées par chantier (toutes dates — le stock se déduit en continu). */
export async function listSiteConsumption(companyId: string, siteId?: string): Promise<Map<string, ConsumedRow>> {
  const conds = [eq(siteMaterialUsages.companyId, companyId)]
  if (siteId) conds.push(eq(siteMaterialUsages.siteId, siteId))
  const rows = await db
    .select({
      siteId: siteMaterialUsages.siteId,
      productLabel: siteMaterialUsages.productLabel,
      unit: siteMaterialUsages.unit,
      consumed: sql<string>`sum(${siteMaterialUsages.quantity})`,
    })
    .from(siteMaterialUsages)
    .where(and(...conds))
    .groupBy(siteMaterialUsages.siteId, siteMaterialUsages.productLabel, siteMaterialUsages.unit)
  const map = new Map<string, ConsumedRow>()
  for (const r of rows) {
    map.set(`${r.siteId}|${r.productLabel}|${r.unit}`, {
      productLabel: r.productLabel,
      unit: r.unit,
      consumed: Number(r.consumed) || 0,
    })
  }
  return map
}

// ─── Vue DT : dossiers ────────────────────────────────────────────────────────

export type ReportSummary = {
  id: string
  siteId: string
  siteName: string
  reportDate: string
  status: 'draft' | 'submitted'
  submittedAt: string | null
  submissionsCount: number
  authorName: string | null
  progressPct: number | null
  tasksDone: number
  tasksTotal: number
  comment: string | null
}

export async function listReportsForSites(
  companyId: string,
  siteIds: string[],
  since?: string,
): Promise<ReportSummary[]> {
  if (siteIds.length === 0) return []
  const conds = [eq(siteDailyReports.companyId, companyId), inArray(siteDailyReports.siteId, siteIds)]
  if (since) conds.push(gte(siteDailyReports.reportDate, since))
  const rows = await db
    .select({ report: siteDailyReports, siteName: sites.name, authorName: managers.name })
    .from(siteDailyReports)
    .innerJoin(sites, eq(siteDailyReports.siteId, sites.id))
    .leftJoin(managers, eq(siteDailyReports.authorManagerId, managers.id))
    .where(and(...conds))
    .orderBy(desc(siteDailyReports.reportDate), asc(sites.name))
    .limit(200)
  const reportIds = rows.map((r) => r.report.id)
  const taskCounts = reportIds.length
    ? await db
        .select({
          reportId: siteDailyTasks.reportId,
          total: sql<string>`count(*)`,
          done: sql<string>`count(*) filter (where ${siteDailyTasks.done})`,
        })
        .from(siteDailyTasks)
        .where(inArray(siteDailyTasks.reportId, reportIds))
        .groupBy(siteDailyTasks.reportId)
    : []
  const countsById = new Map(taskCounts.map((t) => [t.reportId, t]))
  const usageCounts = reportIds.length
    ? await db
        .select({ reportId: siteMaterialUsages.reportId, total: sql<string>`count(*)` })
        .from(siteMaterialUsages)
        .where(inArray(siteMaterialUsages.reportId, reportIds))
        .groupBy(siteMaterialUsages.reportId)
    : []
  const usagesById = new Map(usageCounts.map((u) => [u.reportId, Number(u.total)]))
  return rows.map((r) => ({
    id: r.report.id,
    siteId: r.report.siteId,
    siteName: r.siteName,
    reportDate: r.report.reportDate,
    status: r.report.status,
    submittedAt: r.report.submittedAt ? r.report.submittedAt.toISOString() : null,
    submissionsCount: ((r.report.submissions as SubmissionEntry[] | null) ?? []).length,
    authorName: r.authorName,
    progressPct: r.report.globalProgressPct != null ? Number(r.report.globalProgressPct) : null,
    tasksDone: Number(countsById.get(r.report.id)?.done ?? 0),
    tasksTotal: Number(countsById.get(r.report.id)?.total ?? 0),
    usagesCount: usagesById.get(r.report.id) ?? 0,
    comment: r.report.comment,
  }))
}
