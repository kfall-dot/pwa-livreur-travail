// Suivi des livraisons (liste, detail, OTP) + photos des livraisons
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { checkAndAddPhotoHash, clearOtp, createOtpManagerAssistTask, expectedDeclarationLinesFromStop, getDashboardDeliveries, getDeclaration, getDeliveryDetail, getDeliveryStopForCompany, getPhotoCount, getSupplierReceptionForManager, getTourById, listSupplierReceptions, removePhotoHash, setDeclaration } from '../../db/queries.js'
import { getDeliveryPhotosStore, isBlobsEnabled } from '../../lib/blobs.js'
import { isLocalPhotoStorageEnabled, listPhotosLocal, readPhotoLocal, savePhotoLocal } from '../../lib/deliveryPhotoLocal.js'
import { buildPhotoListItem, resolvePhotoKey } from '../../lib/deliveryPhotoResponse.js'
import { logSecurityEvent } from '../../lib/securityAudit.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { requireProcurementRole, type ProcurementManagerRequest } from '../../middleware/procurementAuth.js'
import { finalizeDeliveryConfirmation } from '../../services/deliveryConfirmation.js'
import { readOtpStatusForManager, resendOtpForManager } from '../../services/deliveryOtpAssist.js'
import { localTodayIso } from '../../utils/dates.js'
import { isValidDeclarationOutcome, parseDeclarationLines, validateDeclarationBeforeSubmit } from '../../../shared/declarationValidation.js'

const chefUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

export const deliveriesRoutes = Router()

// ── Deliveries (suivi) ────────────────────────────────────────────────────────

deliveriesRoutes.get('/dashboard/deliveries', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const today = localTodayIso()
  // Page Livraisons : vue mois par défaut (`month=YYYY-MM`, mois passés inclus),
  // ou jour précis (`date=YYYY-MM-DD`) ; `siteId` restreint à un chantier.
  const month = req.query.month ? String(req.query.month) : undefined
  const date = month ? undefined : String(req.query.date ?? today)
  const status = req.query.status ? String(req.query.status) : undefined
  const siteId = req.query.siteId ? String(req.query.siteId) : undefined
  try {
    const deliveries = await getDashboardDeliveries({ date, month, status, siteId }, manager.companyId)
    const total = deliveries.length
    const validated = deliveries.filter((d) => d.status === 'delivered').length
    res.json({ date: date ?? null, month: month ?? null, total, validated, deliveries })
  } catch (err) {
    console.error('[dashboard] deliveries error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/deliveries/:id
deliveriesRoutes.get('/dashboard/deliveries/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const detail = await getDeliveryDetail(String(req.params.id), manager.companyId)
    if (!detail) { res.status(404).json({ message: 'Livraison introuvable' }); return }
    res.json(detail)
  } catch (err) {
    console.error('[dashboard] delivery detail error', err)
    res.status(500).json({ message: 'Erreur serveur — base de données indisponible. Réessayez dans quelques secondes.' })
  }
})

// GET /dashboard/deliveries/:id/otp-status
deliveriesRoutes.get('/dashboard/deliveries/:id/otp-status', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  try {
    const stop = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!stop) {
      res.status(404).json({ message: 'Livraison introuvable' })
      return
    }
    const status = await readOtpStatusForManager(stop)
    res.json({ ok: true, deliveryId, ...status })
  } catch (err) {
    console.error('[dashboard] otp-status error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// POST /dashboard/deliveries/:id/resend-otp — renvoi SMS + code pour relai vocal magasin
deliveriesRoutes.post('/dashboard/deliveries/:id/resend-otp', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  try {
    const stop = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!stop) {
      res.status(404).json({ message: 'Livraison introuvable' })
      return
    }
    const result = await resendOtpForManager(stop)
    logSecurityEvent({
      action: 'delivery.otp.manager_resend',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      metadata: {
        deliveryId,
        sent: result.sent,
        smsTo: result.smsTo,
        managerEmail: manager.email,
      },
      req,
    })
    const tour = await getTourById(stop.tourId)
    if (tour) {
      await createOtpManagerAssistTask({
        companyId: manager.companyId,
        deliveryId,
        tourId: stop.tourId,
        driverId: tour.driverId,
        supermarketName: stop.name,
        tourDate: stop.tourDate,
        managerEmail: manager.email,
        kind: 'resend',
        smsTo: result.smsTo,
      })
    }
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur'
    if (message.includes('manquante') || message.includes('insuffisantes') || message.includes('déjà')) {
      res.status(422).json({ message })
      return
    }
    console.error('[dashboard] resend-otp error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// POST /dashboard/deliveries/:id/confirm-manual — validation manager si SMS impossible
deliveriesRoutes.post('/dashboard/deliveries/:id/confirm-manual', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  const { reason } = req.body as { reason?: string }
  const note = typeof reason === 'string' ? reason.trim() : ''
  if (note.length < 15) {
    res.status(400).json({
      message: 'Motif obligatoire (15 caractères min.) — ex. validation téléphonique magasin, SMS indisponible.',
    })
    return
  }
  try {
    const stop = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!stop) {
      res.status(404).json({ message: 'Livraison introuvable' })
      return
    }
    if (stop.status === 'delivered' || stop.status === 'failed') {
      res.status(422).json({ message: 'Livraison déjà terminée.' })
      return
    }
    const decl = await getDeclaration(stop.id)
    if (!decl) {
      res.status(422).json({ message: 'Déclaration produit manquante.' })
      return
    }
    const photoCount = await getPhotoCount(stop.id)
    if (photoCount < stop.requiredPhotos) {
      res.status(422).json({
        message: `Photos insuffisantes (${photoCount}/${stop.requiredPhotos}).`,
      })
      return
    }

    const result = await finalizeDeliveryConfirmation(stop, {
      confirmationNote: `[Validation manager sans SMS OTP — ${manager.email}] ${note}`,
    })
    await clearOtp(stop.id)

    logSecurityEvent({
      action: 'delivery.otp.manager_bypass',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      metadata: {
        deliveryId,
        reason: note,
        receiptId: result.receiptId,
        managerEmail: manager.email,
      },
      req,
    })
    const tour = await getTourById(stop.tourId)
    if (tour) {
      await createOtpManagerAssistTask({
        companyId: manager.companyId,
        deliveryId,
        tourId: stop.tourId,
        driverId: tour.driverId,
        supermarketName: stop.name,
        tourDate: stop.tourDate,
        managerEmail: manager.email,
        kind: 'bypass',
        reason: note,
        receiptId: result.receiptId,
      })
    }

    res.json({ ok: true, ...result, message: 'Livraison validée par le gestionnaire (SMS contourné).' })
  } catch (err) {
    console.error('[dashboard] confirm-manual error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})


// ── Delivery photos (manager) ─────────────────────────────────────────────────

/**
 * Une clé de blob photo a la forme `${deliveryId}/photo-...`. On vérifie que la
 * livraison correspondante appartient bien à l'entreprise du gestionnaire pour
 * éviter tout accès inter-entreprises (IDOR) via clé devinée.
 */
async function managerOwnsPhotoKey(key: string, companyId: string): Promise<boolean> {
  const deliveryId = key.split('/')[0]?.trim()
  if (!deliveryId) return false
  const stop = await getDeliveryStopForCompany(deliveryId, companyId)
  return stop !== null
}

deliveriesRoutes.get('/dashboard/deliveries/:id/photos', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  try {
    const stop = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!stop) {
      res.status(404).json({ message: 'Livraison introuvable' })
      return
    }

    if (!isBlobsEnabled()) {
      if (isLocalPhotoStorageEnabled()) {
        const photos = listPhotosLocal(deliveryId).map((p) => {
          const data = p.buffer.buffer.slice(
            p.buffer.byteOffset,
            p.buffer.byteOffset + p.buffer.byteLength
          ) as ArrayBuffer
          return buildPhotoListItem(p.photoId, p.meta, data, '/dashboard/photos')
        })
        res.json({ deliveryId, blobsEnabled: false, photoStorage: 'local', photos })
        return
      }
      const count = await getPhotoCount(deliveryId)
      res.json({
        deliveryId,
        blobsEnabled: false,
        photos: Array.from({ length: count }, (_, i) => ({
          photoId: `${deliveryId}/photo-${i}`,
          url: '',
          paletteNumber: `PRODUIT-${i + 1}`,
        })),
        message: 'Stockage photo indisponible en dev local (lancez netlify dev).',
      })
      return
    }

    const store = getDeliveryPhotosStore()
    const { blobs } = await store.list({ prefix: `${deliveryId}/` })
    const photos = await Promise.all(
      blobs.map(async (b) => {
        const result = await store.getWithMetadata(b.key, { type: 'arrayBuffer' })
        const m = (result?.metadata ?? {}) as Record<string, string>
        const data = result?.data instanceof ArrayBuffer ? result.data : undefined
        return buildPhotoListItem(b.key, m, data, '/dashboard/photos')
      })
    )
    res.json({ deliveryId, blobsEnabled: true, photos })
  } catch (err) {
    console.error('[dashboard] delivery photos error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

deliveriesRoutes.get('/dashboard/photos', requireManager, async (req, res) => {
  if (!isBlobsEnabled() && !isLocalPhotoStorageEnabled()) {
    res.status(503).json({ message: 'Stockage photo non disponible.' })
    return
  }
  const { manager } = req as ManagerRequest
  const key = typeof req.query.key === 'string' ? resolvePhotoKey(req.query.key) : ''
  if (!key) {
    res.status(400).json({ message: 'Paramètre key requis' })
    return
  }
  if (!(await managerOwnsPhotoKey(key, manager.companyId))) {
    res.status(404).json({ message: 'Photo introuvable' })
    return
  }
  try {
    if (isBlobsEnabled()) {
      const store = getDeliveryPhotosStore()
      const result = await store.get(key, { type: 'arrayBuffer' })
      if (!result) {
        res.status(404).json({ message: 'Photo introuvable' })
        return
      }
      res.set('Content-Type', 'image/jpeg')
      res.set('Cache-Control', 'private, max-age=86400')
      res.send(Buffer.from(result))
      return
    }
    const local = readPhotoLocal(key)
    if (!local) {
      res.status(404).json({ message: 'Photo introuvable' })
      return
    }
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'private, max-age=86400')
    res.send(local.buffer)
  } catch (err) {
    console.error('[dashboard] photo get error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

deliveriesRoutes.get('/dashboard/photos/{*photoId}', requireManager, async (req, res) => {
  if (!isBlobsEnabled() && !isLocalPhotoStorageEnabled()) {
    res.status(503).json({ message: 'Stockage photo non disponible.' })
    return
  }
  const { manager } = req as ManagerRequest
  try {
    const photoId = resolvePhotoKey(String((req.params as Record<string, string>).photoId ?? ''))
    if (!(await managerOwnsPhotoKey(photoId, manager.companyId))) {
      res.status(404).json({ message: 'Photo introuvable' })
      return
    }
    if (isBlobsEnabled()) {
      const store = getDeliveryPhotosStore()
      const result = await store.get(photoId, { type: 'arrayBuffer' })
      if (!result) {
        res.status(404).json({ message: 'Photo introuvable' })
        return
      }
      res.set('Content-Type', 'image/jpeg')
      res.set('Cache-Control', 'private, max-age=86400')
      res.send(Buffer.from(result))
      return
    }
    const local = readPhotoLocal(photoId)
    if (!local) {
      res.status(404).json({ message: 'Photo introuvable' })
      return
    }
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'private, max-age=86400')
    res.send(local.buffer)
  } catch (err) {
    console.error('[dashboard] photo get error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── Livraison fournisseur directe — réception par le chef de chantier ───────

/** Périmètre de réception : le chef ne voit que ses chantiers ; DT/admin voient tout. */
function supplierReceptionScope(req: import('express').Request): string | null {
  const { manager } = req as ManagerRequest
  const role = (req as ProcurementManagerRequest).procurementRole
  return role === 'site_manager' ? manager.sub : null
}

// GET /dashboard/supplier-receptions
deliveriesRoutes.get('/dashboard/supplier-receptions', requireProcurementRole('site_manager', 'technical_director'), async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const receptions = await listSupplierReceptions(manager.companyId, supplierReceptionScope(req))
    res.json({ receptions })
  } catch (err) {
    console.error('[dashboard] supplier-receptions error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// POST /dashboard/deliveries/:id/chef-photo — photo matériel / bon de livraison
deliveriesRoutes.post('/dashboard/deliveries/:id/chef-photo', requireProcurementRole('site_manager', 'technical_director'), chefUpload.single('photo'), async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  if (!req.file) {
    res.status(400).json({ message: 'Photo requise' })
    return
  }
  try {
    const reception = await getSupplierReceptionForManager(deliveryId, manager.companyId, supplierReceptionScope(req))
    if (!reception) {
      res.status(404).json({ message: 'Réception fournisseur introuvable' })
      return
    }
    const hash = typeof req.body.hash === 'string' ? req.body.hash : ''
    if (hash) {
      const added = await checkAndAddPhotoHash(deliveryId, hash)
      if (!added) {
        res.status(409).json({ message: 'Photo en doublon détectée' })
        return
      }
    }
    const photoId = `${deliveryId}/${randomUUID()}`
    const arrayBuffer = req.file.buffer.buffer.slice(
      req.file.buffer.byteOffset,
      req.file.buffer.byteOffset + req.file.buffer.byteLength,
    ) as ArrayBuffer
    const meta = {
      deliveryId,
      paletteNumber: typeof req.body.paletteNumber === 'string' ? req.body.paletteNumber : '',
      uploadedAt: new Date().toISOString(),
    }
    if (isBlobsEnabled()) {
      await getDeliveryPhotosStore().set(photoId, arrayBuffer, { metadata: meta })
    } else if (isLocalPhotoStorageEnabled()) {
      savePhotoLocal(photoId, req.file.buffer, meta)
    } else {
      if (hash) await removePhotoHash(deliveryId, hash)
      res.status(503).json({ message: 'Stockage photo indisponible, réessayez.' })
      return
    }
    const photosCount = await getPhotoCount(deliveryId)
    res.json({ ok: true, photoId, size: req.file.size, photosCount })
  } catch (err) {
    console.error('[dashboard] chef-photo error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// POST /dashboard/deliveries/:id/chef-confirm — confirme la réception fournisseur
deliveriesRoutes.post('/dashboard/deliveries/:id/chef-confirm', requireProcurementRole('site_manager', 'technical_director'), async (req, res) => {
  const { manager } = req as ManagerRequest
  const deliveryId = String(req.params.id)
  const body = req.body as { outcome?: unknown; lines?: unknown; reason?: unknown }
  try {
    const reception = await getSupplierReceptionForManager(deliveryId, manager.companyId, supplierReceptionScope(req))
    if (!reception) {
      res.status(404).json({ message: 'Réception fournisseur introuvable' })
      return
    }
    if (reception.status === 'delivered' || reception.status === 'failed') {
      res.status(422).json({ message: 'Réception déjà terminée.' })
      return
    }
    if (!isValidDeclarationOutcome(body.outcome)) {
      res.status(400).json({ message: 'outcome invalide (full | partial | rejected)' })
      return
    }
    const lines = parseDeclarationLines(body.lines)
    if (!lines) {
      res.status(400).json({ message: 'lines invalide : tableau de lignes produit requis' })
      return
    }
    const planned = expectedDeclarationLinesFromStop(reception).map((p) => ({
      productLabel: p.productLabel,
      unit: p.unit,
      quantityExpected: p.quantityExpected,
    }))
    const validationError = validateDeclarationBeforeSubmit(lines, reception.units, body.outcome, planned)
    if (validationError) {
      res.status(400).json({ message: validationError })
      return
    }
    const photoCount = await getPhotoCount(deliveryId)
    if (photoCount < reception.requiredPhotos) {
      res.status(422).json({
        message: `Photos insuffisantes (${photoCount}/${reception.requiredPhotos}) — photo(s) matériel + bon de livraison requises.`,
      })
      return
    }
    const note = `[Réception chef de chantier — ${manager.email}]${typeof body.reason === 'string' && body.reason.trim() ? ` ${body.reason.trim()}` : ''}`
    await setDeclaration(deliveryId, body.outcome, lines)
    const result = await finalizeDeliveryConfirmation(reception, { confirmationNote: note })
    await clearOtp(deliveryId)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[dashboard] chef-confirm error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

