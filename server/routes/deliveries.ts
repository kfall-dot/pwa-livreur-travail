import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/auth.js'
import { loadStopForDriver } from '../middleware/deliveryAccess.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { rateLimitByIp } from '../middleware/rateLimit.js'
import { resolveOtpCode, allowTestBypass } from '../config/production.js'
import { haversineDistanceM } from '../utils/geo.js'
import { testBypass } from '../testBypass.js'
import { getDeliveryPhotosStore, isBlobsEnabled } from '../lib/blobs.js'
import { buildPhotoListItem } from '../lib/deliveryPhotoResponse.js'
import {
  checkAndAddPhotoHash,
  clearDeclaration,
  clearOtp,
  clearPhotoHashes,
  createDeliveryCancelledTask,
  expectedDeclarationLinesFromStop,
  getDeclaration,
  getPhotoCount,
  removePhotoHash,
  getStopWithDriverContext,
  setDeclaration,
  setOtp,
  updateDeliveryPointContactPhone,
  linkDeliveryPointToSupermarket,
  updateDeliveryStatus,
  verifyOtp,
} from '../db/queries.js'
import { resolveOtpContactPhone } from '../lib/resolveOtpContactPhone.js'
import { finalizeDeliveryConfirmation } from '../services/deliveryConfirmation.js'
import { sendOtpSms } from '../services/sms.js'
import { formatOrderDetailForOtpSms } from '../services/smsMessages.js'
import { isSmsOtpFailOpen, smsConfig } from '../config/sms.js'
import type { Declaration } from '../db/schema.js'
import {
  isValidDeclarationOutcome,
  parseDeclarationLines,
  validateDeclarationBeforeSubmit,
} from '../../shared/declarationValidation.js'

export const deliveriesRouter = Router()
deliveriesRouter.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

const GEOFENCE_BYPASS = testBypass.geofence

export interface PhotoMeta {
  photoId: string
  url: string
  dataUrl?: string
  paletteNumber: string
  lat: string
  lng: string
  hash: string
  uploadedAt: string
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isTourDatePast(tourDate: string): boolean {
  return tourDate < todayIso()
}

function geofenceCheck(
  position: { lat: number; lng: number },
  target: { lat: number; lng: number },
  maxM: number
): { ok: true } | { ok: false; distanceM: number } {
  if (GEOFENCE_BYPASS) return { ok: true }
  const distanceM = Math.round(haversineDistanceM(position, target))
  if (distanceM <= maxM) return { ok: true }
  return { ok: false, distanceM }
}

// ─── GET /:id ─────────────────────────────────────────────────────────────────

deliveriesRouter.get('/:id', async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
    const [photoCount, declaration] = await Promise.all([
      getPhotoCount(stop.id),
      getDeclaration(stop.id),
    ])

    const adjustmentLines = declaration
      ? (declaration.lines as unknown[])
      : expectedDeclarationLinesFromStop(stop)

    res.json({
      delivery: {
        id: stop.id,
        status: stop.status,
        expected_palettes: stop.units,
        supermarket_name: stop.name,
        supermarket_address: stop.address,
      },
      photos: Array.from({ length: photoCount }, (_, i) => ({
        id: String(i),
        palette_number: `PRODUIT-${i + 1}`,
      })),
      declared: !!declaration,
      declarationOutcome: declaration?.outcome ?? null,
      adjustmentLines,
      plannedUnit: stop.unitType,
      products: stop.products ?? null,
      requiredPhotos: stop.requiredPhotos,
      ...(testBypass.fixedOtp ? { devOtpCode: testBypass.fixedOtp } : {}),
    })
  } catch (err) {
    console.error('[deliveries] GET /:id error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── POST /:id/start ──────────────────────────────────────────────────────────

deliveriesRouter.post('/:id/start', async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
    if (isTourDatePast(stop.tourDate)) {
      res.status(422).json({ message: "Impossible de démarrer une livraison d'une date passée." })
    return
  }
  const { lat, lng } = req.body as { lat?: number; lng?: number }
  if (lat == null || lng == null) {
    res.status(400).json({ message: 'Position GPS requise' })
    return
  }
    const geo = geofenceCheck({ lat, lng }, { lat: Number(stop.lat), lng: Number(stop.lng) }, 200)
  if (!geo.ok) {
    res.status(403).json({
      message: `Hors zone de livraison (${geo.distanceM} m, max 200 m)`,
      distanceM: geo.distanceM,
      maxM: 200,
    })
    return
  }
    await updateDeliveryStatus(stop.id, { status: 'in_progress' })
  res.json({ ok: true })
  } catch (err) {
    console.error('[deliveries] start error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── POST /:id/photo ──────────────────────────────────────────────────────────

deliveriesRouter.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
  if (!req.file) {
    res.status(400).json({ message: 'Photo requise' })
    return
  }
  const hash = (req.body.hash as string) ?? ''
    if (hash) {
      const added = await checkAndAddPhotoHash(stop.id, hash)
      if (!added) {
    res.status(409).json({ message: 'Photo en doublon détectée' })
    return
  }
    }

    const photoId = `${stop.id}/${randomUUID()}`
    const hashRecorded = Boolean(hash)

    if (isBlobsEnabled()) {
      try {
        const store = getDeliveryPhotosStore()
        const buffer = req.file.buffer.buffer.slice(
          req.file.buffer.byteOffset,
          req.file.buffer.byteOffset + req.file.buffer.byteLength
        ) as ArrayBuffer
        await store.set(photoId, buffer, {
          metadata: {
            deliveryId: stop.id,
            paletteNumber: (req.body.paletteNumber as string) ?? '',
            lat: String(req.body.lat ?? ''),
            lng: String(req.body.lng ?? ''),
            hash,
            uploadedAt: new Date().toISOString(),
          },
        })
      } catch (blobErr) {
        if (hashRecorded) {
          await removePhotoHash(stop.id, hash)
        }
        console.error('[deliveries] blob storage failed:', (blobErr as Error).message)
        res.status(503).json({ message: 'Stockage photo indisponible, réessayez.' })
        return
      }
    }

    const photosCount = await getPhotoCount(stop.id)
    res.json({ ok: true, photoId, size: req.file.size, photosCount })
  } catch (err) {
    console.error('[deliveries] photo error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── GET /:id/photos ──────────────────────────────────────────────────────────

deliveriesRouter.get('/:id/photos', async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return

    if (!isBlobsEnabled()) {
      const count = await getPhotoCount(stop.id)
      const photos: PhotoMeta[] = Array.from({ length: count }, (_, i) => ({
        photoId: `${stop.id}/photo-${i}`,
        url: '',
        paletteNumber: `PRODUIT-${i + 1}`,
        lat: '',
        lng: '',
        hash: '',
        uploadedAt: '',
      }))
      res.json({ deliveryId: stop.id, photos, blobsEnabled: false })
    return
    }

    try {
      const store = getDeliveryPhotosStore()
      const { blobs } = await store.list({ prefix: `${stop.id}/` })

      const photos: PhotoMeta[] = await Promise.all(
        blobs.map(async (b) => {
          const result = await store.getWithMetadata(b.key, { type: 'arrayBuffer' })
          const m = (result?.metadata ?? {}) as Record<string, string>
          const data = result?.data instanceof ArrayBuffer ? result.data : undefined
          return buildPhotoListItem(b.key, m, data, '/api/photos')
        })
      )

      res.json({ deliveryId: stop.id, photos, blobsEnabled: true })
    } catch (blobErr) {
      console.warn('[deliveries] blob storage unavailable, falling back to count:', (blobErr as Error).message)
      const count = await getPhotoCount(stop.id)
      const photos: PhotoMeta[] = Array.from({ length: count }, (_, i) => ({
        photoId: `${stop.id}/photo-${i}`,
        url: '',
        paletteNumber: `PRODUIT-${i + 1}`,
        lat: '',
        lng: '',
        hash: '',
        uploadedAt: '',
      }))
      res.json({ deliveryId: stop.id, photos, blobsEnabled: false })
    }
  } catch (err) {
    console.error('[deliveries] photos list error', err)
    res.status(500).json({ message: 'Erreur lecture photos' })
  }
})

// ─── POST /:id/declare ────────────────────────────────────────────────────────

deliveriesRouter.post('/:id/declare', async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return

    if (stop.status !== 'in_progress' && stop.status !== 'otp_sent') {
      res.status(422).json({
        message:
          stop.status === 'pending'
            ? 'Déclaration impossible : démarrez d’abord la livraison.'
            : 'Déclaration impossible pour cette livraison.',
      })
      return
    }

    const existingDeclaration = await getDeclaration(stop.id)
    if (existingDeclaration) {
      res.status(422).json({ message: 'Déclaration déjà enregistrée pour cette livraison.' })
      return
    }

    const body = req.body as { outcome?: unknown; lines?: unknown }
    if (!isValidDeclarationOutcome(body.outcome)) {
      res.status(400).json({ message: 'outcome invalide (full | partial | rejected)' })
      return
    }
    const lines = parseDeclarationLines(body.lines)
    if (!lines) {
      res.status(400).json({ message: 'lines invalide : tableau de lignes produit requis' })
      return
    }

    const planned = expectedDeclarationLinesFromStop(stop).map((p) => ({
      productLabel: p.productLabel,
      unit: p.unit,
      quantityExpected: p.quantityExpected,
    }))
    const validationError = validateDeclarationBeforeSubmit(
      lines,
      stop.units,
      body.outcome,
      planned,
    )
    if (validationError) {
      res.status(400).json({ message: validationError })
      return
    }

    await setDeclaration(stop.id, body.outcome, lines)
    res.json({ success: true, requiredPhotos: stop.requiredPhotos, lines })
  } catch (err) {
    console.error('[deliveries] declare error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── POST /:id/cancel ─────────────────────────────────────────────────────────

deliveriesRouter.post('/:id/cancel', async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
    if (isTourDatePast(stop.tourDate)) {
      res.status(422).json({ message: "Réouverture impossible : la date de la tournée est passée." })
    return
  }
  if (stop.status !== 'in_progress') {
    res.status(422).json({
      message:
        stop.status === 'pending'
            ? "La livraison n'a pas encore été démarrée."
            : "Annulation impossible : seule une livraison en cours peut être annulée.",
    })
    return
  }
    await Promise.all([
      clearOtp(stop.id),
      clearDeclaration(stop.id),
      clearPhotoHashes(stop.id),
      updateDeliveryStatus(stop.id, { status: 'pending' }),
    ])
    const ctx = await getStopWithDriverContext(stop.id)
    if (ctx) await createDeliveryCancelledTask(ctx)
  res.json({ success: true, status: 'pending' })
  } catch (err) {
    console.error('[deliveries] cancel error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ─── POST /:id/send-otp ───────────────────────────────────────────────────────

deliveriesRouter.post(
  '/:id/send-otp',
  rateLimitByIp(20, 15 * 60_000, 'send-otp'),
  async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
    if (isTourDatePast(stop.tourDate)) {
      res.status(422).json({ message: "Envoi OTP impossible : la date de la tournée est passée." })
      return
    }

    const { recipient, catalog } = await resolveOtpContactPhone(stop)
    if (!recipient) {
      res.status(422).json({
        message:
          `Téléphone responsable manquant pour « ${stop.name} » — créez ou éditez ce point dans Points de livraison (catalogue) avec un numéro +225.`,
      })
    return
  }
    // Aligner l’arrêt sur le catalogue (téléphone + lien si trouvé par nom)
    if (catalog && !stop.supermarketId) {
      await linkDeliveryPointToSupermarket(stop.id, catalog.id, recipient)
    } else if (recipient !== String(stop.contactPhone ?? '').trim()) {
      await updateDeliveryPointContactPhone(stop.id, recipient)
    }

    const decl = await getDeclaration(stop.id)
    const outcome = (decl?.outcome ?? 'full') as Declaration['outcome']
    const code = resolveOtpCode()
    await setOtp(stop.id, code)

    const smsResult = await sendOtpSms(recipient, code, {
      pointName: stop.name,
      orderRef: stop.orderRef,
      orderDetail: formatOrderDetailForOtpSms(
        stop.products as Array<{ label: string; qty: number; unit: string }> | null,
        stop.units,
        stop.unitType,
      ),
      outcome,
    })

    const failOpen = isSmsOtpFailOpen() || smsConfig.provider === 'mock' || allowTestBypass()
    let smsWarning: string | undefined

    if (!smsResult.success) {
      if (!failOpen) {
        await clearOtp(stop.id)
        res.status(503).json({
          message:
            "Impossible d'envoyer le SMS OTP. Vérifiez Textbee (app Android ouverte) ou la configuration SMS.",
          details: smsResult.details,
        })
    return
      }
      smsWarning = smsResult.details ?? smsResult.error ?? 'SMS_SEND_FAILED'
      console.warn(`[OTP] SMS non envoyé (${smsWarning}) — OTP conservé (mode tolérant).`)
    } else if (smsConfig.provider === 'mock') {
      console.log(`[OTP] ${stop.name} → ${allowTestBypass() ? code : '******'} (${recipient})`)
    } else {
      console.log(`[OTP] SMS ${smsConfig.provider} → ${recipient} (${stop.name})`)
    }

    await updateDeliveryStatus(stop.id, { status: 'otp_sent' })

    const exposeDevOtp = allowTestBypass()

    res.json({
      ok: true,
      sent: smsResult.success,
      smsProvider: smsConfig.provider,
      smsTo: recipient,
      ...(smsWarning ? { smsWarning: `SMS non envoyé : ${smsWarning}` } : {}),
      ...(smsConfig.provider === 'textbee' && smsResult.success
        ? {
            smsNotice:
              'SMS transmis à Textbee. Si le responsable ne le reçoit pas, ouvrez l’app sur le téléphone Android.',
          }
        : {}),
      ...(exposeDevOtp ? { devOtpCode: code } : {}),
    })
  } catch (err) {
    console.error('[deliveries] send-otp error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
  }
)

// ─── POST /:id/confirm ────────────────────────────────────────────────────────

deliveriesRouter.post(
  '/:id/confirm',
  rateLimitByIp(30, 15 * 60_000, 'confirm-otp'),
  async (req, res) => {
  try {
    const stop = await loadStopForDriver(req, res)
    if (!stop) return
  const { otp, lat, lng } = req.body as { otp?: string; lat?: number; lng?: number }
  if (!otp || lat == null || lng == null) {
    res.status(400).json({ message: 'OTP et position GPS requis' })
    return
  }
    const otpResult = await verifyOtp(stop.id, otp)
    if (!otpResult.ok) {
      logSecurityEvent({
        action: 'delivery.otp.failure',
        actorType: 'driver',
        actorId: (req as { user?: { sub?: string; companyId?: string } }).user?.sub,
        companyId: (req as { user?: { companyId?: string } }).user?.companyId,
        metadata: { stopId: stop.id, reason: otpResult.reason },
        req,
      })
      if (otpResult.reason === 'locked') {
        res.status(429).json({ message: 'Trop de tentatives OTP. Demandez un nouveau code.' })
        return
      }
      res.status(400).json({
        message: otpResult.reason === 'expired' ? 'Code OTP expiré' : 'Code OTP invalide',
        attemptsLeft: otpResult.attemptsLeft,
      })
    return
  }
    const geo = geofenceCheck({ lat, lng }, { lat: Number(stop.lat), lng: Number(stop.lng) }, 100)
  if (!geo.ok) {
    res.status(403).json({
      message: `Vérification GPS finale échouée (${geo.distanceM} m)`,
      distanceM: geo.distanceM,
      maxM: 100,
    })
    return
  }

    const result = await finalizeDeliveryConfirmation(stop)

    res.json({
      receiptId: result.receiptId,
      certificateUrl: result.certificateUrl,
    fraudScore: 12,
      fraudLevel: 'low',
      declarationOutcome: result.declarationOutcome,
      isPartial: result.isPartial,
      isRejected: result.isRejected,
    })
  } catch (err) {
    console.error('[deliveries] confirm error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})
