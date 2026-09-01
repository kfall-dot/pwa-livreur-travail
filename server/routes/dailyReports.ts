import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { requireManager, type ManagerRequest } from '../middleware/managerAuth.js'
import { canAccessSite, getOrCreateTodayReport, loadReportById, listSitesForManager, APP_TIMEZONE, todayDateString } from '../db/dailyReportQueries.js'
import {
  addTask,
  setTaskDone,
  deleteTask,
  addMaterialUsage,
  deleteMaterialUsage,
  updateProgress,
  submitReport,
  reopenReport,
  addReportPhoto,
  listReportPhotos,
} from '../db/dailyReportQueries.js'
import { getDeliveryPhotosStore, isBlobsEnabled } from '../lib/blobs.js'
import { isLocalPhotoStorageEnabled, savePhotoLocal, readPhotoLocal } from '../lib/deliveryPhotoLocal.js'

export const dailyReportsRouter = Router()
dailyReportsRouter.use(requireManager)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

type Proc = { procurementRole?: string | null }

function manager(req: import('express').Request) {
  const m = (req as ManagerRequest).manager
  return { id: m.sub, companyId: m.companyId, role: (m as unknown as Proc).procurementRole ?? null }
}

function isChef(role: string | null): boolean {
  return role === 'site_manager'
}

/** Chef = accès à ses chantiers (managerId) ; DT/superviseur = ses chantiers supervisés. */
function chefMode(req: import('express').Request): 'chef' | 'superviseur' | null {
  const { role } = manager(req)
  if (isChef(role)) return 'chef'
  if (
    role === 'technical_director' ||
    role === 'controle_gestion' ||
    role === 'daf' ||
    role === 'pdg'
  ) {
    return 'superviseur'
  }
  return null
}

/** DT/DAF/CdG/PDG : rôles compagnie → accès à tous les chantiers actifs. */
function isCompanyWide(role: string | null): boolean {
  return (
    role === 'technical_director' || role === 'daf' || role === 'controle_gestion' || role === 'pdg'
  )
}

function unauthorized(res: import('express').Response): void {
  res.status(403).json({ message: 'Accès non autorisé' })
}

// ─── Chantiers de la personne connectée ───────────────────────────────────────

dailyReportsRouter.get('/my-sites', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId, role } = manager(req)
  // scope=mine → uniquement les chantiers dont la personne est responsable
  // (sélecteur « Chantier » du DT), sinon rôles compagnie = tous les actifs.
  const allSites =
    isCompanyWide(role) && mode === 'superviseur' && String(req.query.scope ?? '') !== 'mine'
  const sites = await listSitesForManager(companyId, id, mode, allSites)
  res.json({ sites, mode })
})

// ─── Calendrier : rapports journaliers du mois (chef + superviseur) ───────────
dailyReportsRouter.get('/my-reports', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId } = manager(req)
  const sites = await listSitesForManager(companyId, id, mode, isCompanyWide(manager(req).role) && mode === 'superviseur')
  const siteIds = sites.map((s) => s.id)
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month ?? '')) ? String(req.query.month) : null
  const since = month ? `${month}-01` : undefined
  const reports = await listReportsForSites(companyId, siteIds, since)
  const filtered = month ? reports.filter((r) => r.reportDate.startsWith(month)) : reports
  res.json({ reports: filtered, sites, mode })
})

// ─── Dossier du jour (chef) ───────────────────────────────────────────────────

dailyReportsRouter.post('/today', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId } = manager(req)
  const siteId = String(req.body?.siteId ?? '')
  if (!siteId) return void res.status(400).json({ message: 'siteId requis' })
  if (!(await canAccessSite(companyId, siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  const detail = await getOrCreateTodayReport(companyId, siteId, id)
  res.json(detail)
})

dailyReportsRouter.get('/reports/:id', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId } = manager(req)
  const detail = await loadReportById(req.params.id)
  if (!detail) return void res.status(404).json({ message: 'Dossier introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  res.json(detail)
})

// ─── Tâches ───────────────────────────────────────────────────────────────────

dailyReportsRouter.post('/reports/:id/tasks', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  const { id, companyId } = manager(req)
  const label = String(req.body?.label ?? '').trim()
  if (!label) return void res.status(400).json({ message: 'Libellé de tâche requis' })
  const detail = await loadReportById(req.params.id)
  if (!detail) return void res.status(404).json({ message: 'Dossier introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  const task = await addTask(req.params.id, label)
  res.json({ ok: true, task })
})

dailyReportsRouter.patch('/tasks/:taskId', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  await setTaskDone(req.params.taskId, Boolean(req.body?.done), req.body?.note ?? null)
  res.json({ ok: true })
})

dailyReportsRouter.delete('/tasks/:taskId', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  await deleteTask(req.params.taskId)
  res.json({ ok: true })
})

// ─── Consommations (liées obligatoirement à une tâche) ────────────────────────

dailyReportsRouter.post('/reports/:id/usages', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  const { id, companyId } = manager(req)
  const { taskId, productLabel, unit, quantity, sourceSiteId, provenance } = req.body ?? {}
  const qty = Number(quantity)
  if (!taskId || !String(productLabel ?? '').trim() || !String(unit ?? '').trim() || !Number.isFinite(qty) || qty <= 0) {
    return void res.status(400).json({ message: 'Tâche, produit, unité et quantité (> 0) requis' })
  }
  const detail = await loadReportById(req.params.id)
  if (!detail) return void res.status(404).json({ message: 'Dossier introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  try {
    await addMaterialUsage(req.params.id, {
      taskId: String(taskId),
      productLabel: String(productLabel),
      unit: String(unit),
      quantity: qty,
      sourceSiteId: sourceSiteId ? String(sourceSiteId) : null,
      provenance: provenance ? String(provenance) : null,
    })
    const refreshed = await loadReportById(req.params.id)
    res.json({ ok: true, detail: refreshed })
  } catch (err) {
    res.status(400).json({ message: (err as Error).message })
  }
})

dailyReportsRouter.delete('/usages/:usageId', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  await deleteMaterialUsage(req.params.usageId)
  res.json({ ok: true })
})

// ─── Avancement + soumission / ré-ouverture ───────────────────────────────────

dailyReportsRouter.post('/reports/:id/progress', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  const pct = Number(req.body?.globalProgressPct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return void res.status(400).json({ message: "L'avancement doit être entre 0 et 100" })
  }
  await updateProgress(req.params.id, pct, req.body?.comment ?? null)
  res.json({ ok: true })
})

dailyReportsRouter.post('/reports/:id/submit', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  const { id } = manager(req)
  await submitReport(req.params.id, id, req.body?.note ?? undefined)
  res.json({ ok: true })
})

dailyReportsRouter.post('/reports/:id/reopen', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  await reopenReport(req.params.id)
  res.json({ ok: true })
})

// ─── Photos ───────────────────────────────────────────────────────────────────

dailyReportsRouter.post('/reports/:id/photos', upload.single('photo'), async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'chef') return unauthorized(res)
  if (!req.file) return void res.status(400).json({ message: 'Photo requise' })
  const { companyId, id } = manager(req)
  const reportIdParam = String(req.params.id)
  const detail = await loadReportById(reportIdParam)
  if (!detail) return void res.status(404).json({ message: 'Dossier introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)

  const photoId = `${reportIdParam}/${randomUUID()}`
  const arrayBuffer = req.file.buffer.buffer.slice(
    req.file.buffer.byteOffset,
    req.file.buffer.byteOffset + req.file.buffer.byteLength,
  ) as ArrayBuffer
  if (isBlobsEnabled()) {
    await getDeliveryPhotosStore().set(photoId, arrayBuffer, {
      metadata: { reportId: reportIdParam, uploadedAt: new Date().toISOString() },
    })
  } else if (isLocalPhotoStorageEnabled()) {
    savePhotoLocal(photoId, Buffer.from(arrayBuffer), { reportId: reportIdParam, uploadedAt: new Date().toISOString() })
  } else {
    return void res.status(503).json({ message: 'Stockage photo indisponible, réessayez.' })
  }
  const photo = await addReportPhoto(reportIdParam, photoId, req.file.size, typeof req.body?.taskId === 'string' ? req.body.taskId : null)
  res.json({ ok: true, photo, photoId })
})

dailyReportsRouter.get('/photos/:photoId', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { companyId, id } = manager(req)
  const photoId = String(req.params.photoId)
  const reportId = photoId.split('/')[0]
  const detail = await loadReportById(reportId)
  if (!detail) return void res.status(404).json({ message: 'Photo introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  if (isBlobsEnabled()) {
    const result = await getDeliveryPhotosStore().get(photoId, { type: 'arrayBuffer' })
    if (!result) return void res.status(404).json({ message: 'Photo introuvable' })
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'private, max-age=3600')
    return void res.send(Buffer.from(result))
  }
  const local = readPhotoLocal(photoId)
  if (!local) return void res.status(404).json({ message: 'Photo introuvable' })
  res.set('Content-Type', 'image/jpeg')
  res.set('Cache-Control', 'private, max-age=3600')
  res.send(local.buffer)
})

// Dernières photos d'un chantier — bloc « Photos » (chef sur son chantier, superviseur sur les siens)
dailyReportsRouter.get('/site-photos', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { companyId, id } = manager(req)
  const siteId = String(req.query.siteId ?? '')
  if (!siteId) return void res.status(400).json({ message: 'siteId requis' })
  if (!(await canAccessSite(companyId, siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  const limit = Number(req.query.limit ?? 12)
  const photos = await listSiteRecentPhotos(companyId, siteId, Number.isFinite(limit) ? limit : 12)
  res.json({ photos })
})

dailyReportsRouter.get('/reports/:id/photos', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { companyId, id } = manager(req)
  const detail = await loadReportById(req.params.id)
  if (!detail) return void res.status(404).json({ message: 'Dossier introuvable' })
  if (!(await canAccessSite(companyId, detail.report.siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  const photos = await listReportPhotos(req.params.id)
  res.json({ photos: photos.map((p) => ({ ...p, url: `/api/v1/daily-reports/photos/${encodeURIComponent(p.photoId)}` })) })
})

// ─── Affectation chantiers (DT/DAF) ──────────────────────────────────────────

import { db } from '../db/index.js'
import { managers } from '../db/schema.js'
import { eq } from 'drizzle-orm'

dailyReportsRouter.get('/assignable-managers', async (req, res) => {
  const mode = chefMode(req)
  if (mode !== 'superviseur') return unauthorized(res)
  const { companyId } = manager(req)
  const rows = await db
    .select({ id: managers.id, name: managers.name, email: managers.email, procurementRole: managers.procurementRole })
    .from(managers)
    .where(eq(managers.companyId, companyId))
  res.json({
    managers: rows.map((r) => ({ ...r, procurementRole: r.procurementRole ?? null })),
  })
})

// ─── Vue DT / superviseur ─────────────────────────────────────────────────────

import { listReportsForSites, listSiteConsumption, listSiteRecentPhotos } from '../db/dailyReportQueries.js'
import { listSiteStock } from '../db/procurementQueries.js'

export type StockRowApi = {
  productLabel: string
  unit: string
  onHand: number
  consumed: number
  available: number
  onOrder: number
  /** Alerte : négatif = incohérence à investiguer ; low = rupture imminente. */
  alert: 'negative' | 'low' | 'ok'
}

dailyReportsRouter.get('/dt/reports', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId } = manager(req)
  const sites = await listSitesForManager(companyId, id, mode, isCompanyWide(manager(req).role) && mode === 'superviseur')
  const since = typeof req.query.since === 'string' ? req.query.since : undefined
  const reports = await listReportsForSites(companyId, sites.map((s) => s.id), since)
  res.json({ sites, reports })
})

dailyReportsRouter.get('/dt/stock', async (req, res) => {
  const mode = chefMode(req)
  if (!mode) return unauthorized(res)
  const { id, companyId } = manager(req)
  const siteId = String(req.query.siteId ?? '')
  if (!siteId) return void res.status(400).json({ message: 'siteId requis' })
  if (!(await canAccessSite(companyId, siteId, id, mode, isCompanyWide(manager(req).role)))) return unauthorized(res)
  const stock = await listSiteStock(companyId)
  const consumption = await listSiteConsumption(companyId, siteId)
  const rows: StockRowApi[] = stock
    .filter((r) => r.siteId === siteId)
    .map((r) => {
      const consumed = consumption.get(`${siteId}|${r.productLabel}|${r.unit}`)?.consumed ?? 0
      const available = r.onHand - consumed
      const alert: StockRowApi['alert'] = available < 0 ? 'negative' : available <= 2 ? 'low' : 'ok'
      return {
        productLabel: r.productLabel,
        unit: r.unit,
        onHand: r.onHand,
        consumed,
        available,
        onOrder: r.onOrder,
        alert,
      }
    })
    .sort((a, b) => a.alert.localeCompare(b.alert) || a.productLabel.localeCompare(b.productLabel))
  // Alerte 18h : dossier du jour non soumis — date et heure du fuseau métier.
  const today = todayDateString()
  const reportsToday = await listReportsForSites(companyId, [siteId], today)
  const todays = reportsToday.filter((r) => r.reportDate === today)
  const hourInTz = Number(
    new Intl.DateTimeFormat('fr-FR', { timeZone: APP_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date()),
  )
  res.json({
    stock: rows,
    todayReport:
      todays.find((r) => r.status === 'draft') ??
      todays.find((r) => r.status === 'submitted') ??
      null,
    alert18h: Number.isFinite(hourInTz) && hourInTz >= 18 && !todays.some((r) => r.status === 'submitted'),
    negativeCount: rows.filter((r) => r.alert === 'negative').length,
  })
})
