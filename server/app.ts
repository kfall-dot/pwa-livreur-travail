import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDeliveryPhotosStore, isBlobsEnabled } from './lib/blobs.js'
import { isLocalPhotoStorageEnabled, readPhotoLocal } from './lib/deliveryPhotoLocal.js'
import { resolvePhotoKey } from './lib/deliveryPhotoResponse.js'
import { corsOptions } from './config/cors.js'

// import.meta.url is undefined when bundled as CommonJS (Netlify Functions).
// In that case, static file serving is handled by Netlify CDN — no __dirname needed.
import { authRouter } from './routes/auth.js'
import { demoRouter } from './routes/demo.js'
import { procurementRouter } from './routes/procurement.js'
import { whatsappWebhookRouter } from './routes/whatsappWebhook.js'
import { toursRouter } from './routes/tours.js'
import { deliveriesRouter } from './routes/deliveries.js'
import { certificatesRouter } from './routes/certificates.js'
import { dashboardRouter } from './routes/dashboard.js'
import { requireAuth, type AuthPayload } from './middleware/auth.js'
import { assertDriverOwnsDelivery } from './middleware/deliveryAccess.js'
import { DatabaseProtectionError } from './config/databaseProtection.js'
import { logSecurityEvent } from './lib/securityAudit.js'
import { resetAllData, upsertManager, getOpsSnapshot } from './db/queries.js'
import { seedDemoData, DEMO } from './db/seed.js'
import { seedBtpPilotData } from './db/seedBtpPilot.js'
import { DEMO_COMPANY_ID } from './db/schema.js'
import { isResetConfirmed, RESET_CONFIRM_PHRASE } from './config/adminConfirm.js'
import { requireAdminAction } from './middleware/adminAuth.js'
import { isSelfSignupAllowed } from './lib/tenant.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { initSentry, setupExpressSentryErrorHandler } from './lib/sentry.js'
import { securityAuditSnapshot } from './config/productionAudit.js'
import { getLastMockEmailTo } from './lib/mockEmailCapture.js'
import bcrypt from 'bcryptjs'

const __dirname = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return process.cwd()
  }
})()

export function createApp() {
  initSentry()
  const app = express()

  app.use(securityHeaders)

  app.use(cors(corsOptions()))

  // serverless-http pre-sets req.body as a Buffer with socket.readable=false,
  // which causes body-parser (express.json) to skip parsing via onFinished check.
  // We pre-parse JSON bodies here so all route handlers receive plain objects.
  app.use((req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      const ct = String(req.headers['content-type'] ?? '')
      if (ct.includes('application/json')) {
        try {
          req.body = JSON.parse((req.body as Buffer).toString())
        } catch {
          req.body = {}
        }
      }
    }
    next()
  })

  app.use(express.json({ limit: '10mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() })
  })
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      multiTenant: true,
      selfSignup: isSelfSignupAllowed(),
      blobs: isBlobsEnabled(),
      security: securityAuditSnapshot(),
    })
  })

  // ─── Photo retrieval (driver) ───────────────────────────────────────────────
  const serveDriverPhoto = async (req: express.Request, res: express.Response) => {
    if (!isBlobsEnabled() && !isLocalPhotoStorageEnabled()) {
      res.status(503).json({ message: 'Stockage photo non disponible en mode dev local.' })
      return
    }
    try {
      const rawKey =
        typeof req.query.key === 'string'
          ? req.query.key
          : String((req.params as Record<string, string>).photoId ?? '')
      const photoId = resolvePhotoKey(rawKey)
      const deliveryId = photoId.split('/')[0]
      if (!deliveryId) {
        res.status(400).json({ message: 'Identifiant photo invalide' })
        return
      }
      const user = (req as typeof req & { user: AuthPayload }).user
      const owned = await assertDriverOwnsDelivery(user.sub, deliveryId, res)
      if (!owned) return

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

      if (isLocalPhotoStorageEnabled()) {
        const local = readPhotoLocal(photoId)
        if (!local) {
          res.status(404).json({ message: 'Photo introuvable' })
          return
        }
        res.set('Content-Type', 'image/jpeg')
        res.set('Cache-Control', 'private, max-age=86400')
        res.send(local.buffer)
        return
      }

      res.status(503).json({ message: 'Stockage photo non disponible.' })
    } catch (err) {
      console.error('[photos] get error', err)
      res.status(500).json({ message: 'Erreur lecture photo' })
    }
  }

  app.get('/api/photos', requireAuth, serveDriverPhoto)
  app.get('/api/photos/{*photoId}', requireAuth, serveDriverPhoto)

  const mountApi = (prefix: string) => {
    // Admin — reset / seed : requireAdminAction (ADMIN_API_TOKEN ou JWT manager)
    app.post(`${prefix}/admin/reset`, requireAdminAction, async (req, res) => {
      // Exige un opt-in explicite (E2E / scripts). Plus sûr que de se fier à CONTEXT
      // Netlify, parfois absent au runtime des Functions.
      if (process.env.ALLOW_RESET !== 'true') {
        res.status(403).json({ message: 'Reset désactivé (ALLOW_RESET requis)' })
        return
      }
      if (!isResetConfirmed(req.body)) {
        res.status(400).json({
          message: 'Confirmation requise pour effacer toutes les données.',
          requiredConfirm: RESET_CONFIRM_PHRASE,
        })
        return
      }
      const wipeUsers =
        process.env.ALLOW_WIPE_USERS === 'true' || process.env.ALLOW_WIPE_USERS === '1'
      try {
        await resetAllData()
        logSecurityEvent({
          action: 'admin.reset',
          actorType: 'system',
          metadata: { wipeUsers, context: process.env.CONTEXT ?? null },
          req,
        })
        res.json({ ok: true })
      } catch (err) {
        if (err instanceof DatabaseProtectionError) {
          logSecurityEvent({
            action: 'admin.reset.refused',
            actorType: 'system',
            metadata: { reason: err.message, wipeUsers },
            req,
          })
          res.status(403).json({ message: err.message })
          return
        }
        console.error('[admin] reset error', err)
        res.status(500).json({ message: 'Erreur reset' })
      }
    })

    app.post(`${prefix}/admin/seed`, requireAdminAction, async (req, res) => {
      if (process.env.ALLOW_SEED !== 'true') {
        res.status(403).json({ message: 'Seed désactivé (ALLOW_SEED requis)' })
        return
      }
      try {
        const result = await seedDemoData()
        const btp =
          process.env.BTP_SEED === 'true' || process.env.BTP_SEED === '1'
            ? await seedBtpPilotData()
            : null
        logSecurityEvent({
          action: 'admin.seed',
          actorType: 'system',
          metadata: { context: process.env.CONTEXT ?? null, btpSeeded: Boolean(btp) },
          req,
        })
        res.json({ ok: true, ...result, btp })
      } catch (err) {
        console.error('[admin] seed error', err)
        res.status(500).json({ message: 'Erreur seed' })
      }
    })

    app.post(`${prefix}/admin/seed-btp`, requireAdminAction, async (req, res) => {
      if (process.env.ALLOW_SEED !== 'true') {
        res.status(403).json({ message: 'Seed désactivé (ALLOW_SEED requis)' })
        return
      }
      try {
        const result = await seedBtpPilotData()
        logSecurityEvent({
          action: 'admin.seed-btp',
          actorType: 'system',
          metadata: { companyId: result.companyId },
          req,
        })
        res.json({ ok: true, ...result })
      } catch (err) {
        console.error('[admin] seed-btp error', err)
        res.status(500).json({ message: 'Erreur seed BTP' })
      }
    })

    /** Réaligne l’e-mail manager pilote depuis SEED_MANAGER_EMAIL (sans toucher aux tournées). */
    app.post(`${prefix}/admin/sync-pilot-identity`, requireAdminAction, async (_req, res) => {
      const email = process.env.SEED_MANAGER_EMAIL?.trim().toLowerCase()
      if (!email) {
        res.status(400).json({ message: 'SEED_MANAGER_EMAIL non défini sur le serveur' })
        return
      }
      try {
        const password = process.env.MANAGER_PASSWORD?.trim() || 'admin1234'
        const passwordHash = await bcrypt.hash(password, 10)
        await upsertManager(DEMO.MANAGER_ID, email, passwordHash, 'Admin Pilote', DEMO_COMPANY_ID)
        res.json({ ok: true, email, companyId: DEMO_COMPANY_ID })
      } catch (err) {
        console.error('[admin] sync-pilot-identity error', err)
        res.status(500).json({ message: 'Erreur synchronisation identité pilote' })
      }
    })

    /** Ops prod : compteurs + flags (auth admin / manager). */
    app.get(`${prefix}/admin/ops-status`, requireAdminAction, async (_req, res) => {
      try {
        const snap = await getOpsSnapshot()
        res.json({ ok: true, ...snap, selfSignupRuntime: isSelfSignupAllowed(), security: securityAuditSnapshot() })
      } catch (err) {
        console.error('[admin] ops-status error', err)
        res.status(500).json({ message: 'Erreur ops status' })
      }
    })

    /** E2E / dev : dernier e-mail mock envoyé à une adresse (ALLOW_SEED requis). */
    app.get(`${prefix}/admin/mock-email/:to`, requireAdminAction, async (req, res) => {
      if (process.env.ALLOW_SEED !== 'true') {
        res.status(403).json({ message: 'Mock e-mail désactivé' })
        return
      }
      const email = getLastMockEmailTo(String(req.params.to))
      if (!email) {
        res.status(404).json({ message: 'Aucun e-mail mock pour cette adresse' })
        return
      }
      res.json({ ok: true, ...email })
    })

    app.use(`${prefix}/auth`, authRouter)
    app.use(`${prefix}/demo`, demoRouter)
    app.use(`${prefix}/webhooks/whatsapp`, whatsappWebhookRouter)
    app.use(`${prefix}/whatsapp`, whatsappWebhookRouter)
    app.use(`${prefix}/procurement`, procurementRouter)
    app.use(`${prefix}/tours`, toursRouter)
    app.use(`${prefix}/deliveries`, deliveriesRouter)
    app.use(`${prefix}/certificates`, certificatesRouter)
    app.use(`${prefix}`, dashboardRouter)
  }

  mountApi('/api')
  mountApi('/api/v1')

  setupExpressSentryErrorHandler(app)

  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) res.status(404).json({ message: 'Build frontend manquant (npm run build)' })
    })
  })

  return app
}
