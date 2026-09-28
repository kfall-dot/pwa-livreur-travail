// Suivi des livraisons (liste, detail, OTP) + photos des livraisons
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { clearOtp, createOtpManagerAssistTask, getDashboardDeliveries, getDeclaration, getDeliveryDetail, getDeliveryStopForCompany, getPhotoCount, getTourById } from '../../db/queries.js'
import { getDeliveryPhotosStore, isBlobsEnabled } from '../../lib/blobs.js'
import { isLocalPhotoStorageEnabled, listPhotosLocal, readPhotoLocal } from '../../lib/deliveryPhotoLocal.js'
import { buildPhotoListItem, resolvePhotoKey } from '../../lib/deliveryPhotoResponse.js'
import { logSecurityEvent } from '../../lib/securityAudit.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { finalizeDeliveryConfirmation } from '../../services/deliveryConfirmation.js'
import { readOtpStatusForManager, resendOtpForManager } from '../../services/deliveryOtpAssist.js'
import { localTodayIso } from '../../utils/dates.js'

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
