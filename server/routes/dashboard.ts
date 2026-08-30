import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { validateStopProducts } from '../../shared/expectedProducts.js'
import { getDeliveryPhotosStore, isBlobsEnabled } from '../lib/blobs.js'
import {
  isLocalPhotoStorageEnabled,
  listPhotosLocal,
  readPhotoLocal,
} from '../lib/deliveryPhotoLocal.js'
import { buildPhotoListItem, resolvePhotoKey } from '../lib/deliveryPhotoResponse.js'
import {
  createDriver,
  createReassignTourTask,
  createTourWithStops,
  createCompanyWithManager,
  deleteDeliveryPoints,
  deleteTourIfNoDeliveries,
  findFutureToursForDriver,
  getAllDrivers,
  getAllManagers,
  createManager,
  updateManager,
  deleteManager,
  countManagers,
  countAdmins,
  createManagerInvite,
  getPendingManagerInvites,
  getManagerInviteByTokenHash,
  getManagerInviteById,
  markManagerInviteAccepted,
  deleteManagerInvite,
  createManagerPasswordReset,
  getManagerPasswordResetByTokenHash,
  markManagerPasswordResetUsed,
  getCompanyById,
  getAllProducts,
  getAllSupermarkets,
  getAllCompanyUnits,
  getCompanyUnitById,
  isActiveCompanyUnit,
  seedDefaultCompanyUnits,
  upsertCompanyUnit,
  getCompanyBySlug,
  getDashboardDeliveries,
  getDashboardTours,
  getDeliveryDetail,
  getDeliveryStopForCompany,
  getDeclaration,
  getDriverById,
  getDriverByPhone,
  relaxDriversPhoneUniqueForDev,
  getPhotoCount,
  getManagerByEmail,
  getManagerById,
  getPendingManagerTasks,
  getManagerTasks,
  canReplanManagerTask,
  getStopsForTour,
  getTourById,
  getTourWithStops,
  getTourReplanTemplate,
  getPartialDeliveryReplanTemplate,
  parseExpectedProducts,
  getProductById,
  resolveManagerTask,
  resolvePendingReassignForTour,
  stopPayloadDiffersFromExisting,
  supersedeNonDeliveredStopsFromTour,
  syncOverdueDeliveryTasks,
  updateDeliveryPointSequence,
  updateDriver,
  updateTourMeta,
  upsertDeliveryPoint,
  upsertProduct,
  upsertSupermarket,
  updateSupermarketDetails,
  setSupermarketActive,
  setSupermarketSiteType,
  syncSupermarketContactToOpenStops,
  getSupermarketById,
  reconcileOpenStopsWithCatalog,
  upsertManager,
  setManagerTotp,
  clearOtp,
  createOtpManagerAssistTask,
} from '../db/queries.js'
import { DEMO, seedDemoProducts, seedDemoStopCatalog, seedLivraisonSupermarkets } from '../db/seed.js'
import { isBtpPilotLoginEmail, seedBtpPilotData } from '../db/seedBtpPilot.js'
import {
  createSupplier,
  getSupplierById,
  listAllSuppliers,
  updateSupplier,
} from '../db/procurementQueries.js'
import { isSiteType, isSupplierFamily } from '../../shared/catalogEnums.js'
import { isProduction, allowDevDuplicateDriverPhone } from '../config/production.js'
import { DEMO_COMPANY_ID, type ProcurementRole } from '../db/schema.js'
import { isPgUniqueViolation } from '../lib/pgErrors.js'
import { isSelfSignupAllowed, newCompanyId, slugifyCompanyName } from '../lib/tenant.js'
import { rateLimitByBodyField, rateLimitByIp } from '../middleware/rateLimit.js'
import {
  clearManagerAuthCookie,
  requireAdmin,
  requireManager,
  setManagerAuthCookie,
  signManagerToken,
  signTotpPendingToken,
  verifyTotpPendingToken,
  type ManagerRequest,
} from '../middleware/managerAuth.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { generateTotpSecret, totpOtpAuthUri, verifyTotpCode } from '../lib/totp.js'
import { generateSecureToken, hashSecureToken } from '../lib/secureToken.js'
import { sendManagerInviteEmail, sendManagerPasswordResetEmail } from '../services/managerEmails.js'
import { localTodayIso } from '../utils/dates.js'
import { isValidDriverPhone, normalizeDriverPhone } from '../../shared/phone.js'
import { isValidContactEmail, normalizeContactEmail } from '../../shared/email.js'
import { generateOrderRef } from '../../shared/orderRef.js'
import { resolveStopFromCatalog } from '../lib/resolveTourStop.js'
import { sendSmsMessage } from '../services/sms.js'
import { buildTourAssignedSmsBody } from '../services/smsMessages.js'
import { resendOtpForManager, readOtpStatusForManager } from '../services/deliveryOtpAssist.js'
import { finalizeDeliveryConfirmation } from '../services/deliveryConfirmation.js'
import { markDeliveryScheduled, ProcurementWorkflowError } from '../services/procurementWorkflow.js'
import { clearDriverLoginFailures } from '../lib/driverLoginLockout.js'
import { clearRateLimitKey } from '../middleware/rateLimit.js'
import { z } from 'zod'
import { parseBody } from '../lib/validation.js'
import { publicBaseUrl } from '../config/public.js'

export const dashboardRouter = Router()

const registerCompanySchema = z.object({
  companyName: z.string().trim().min(1, 'Nom d’entreprise requis'),
  managerName: z.string().trim().min(1, 'Nom du gestionnaire requis'),
  email: z.string().trim().email('E-mail invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
})

const productCreateSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  unit: z.string().trim().min(1, 'Unité requise'),
  displayOrder: z.number().int().optional(),
})

function optionalNumericField(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeUnitCode(value: string): string {
  return slugifyCompanyName(value).replace(/-/g, '_') || 'unite'
}

async function resolveTourUnitType(
  companyId: string,
  requested: unknown,
  existing?: string | null,
): Promise<string | null> {
  const code = String(requested ?? '').trim().toLowerCase()
  if (code && await isActiveCompanyUnit(companyId, code)) return code
  const fallback = String(existing ?? '').trim().toLowerCase()
  if (fallback) return fallback
  return null
}

function canAutoProvisionBtpPilot(): boolean {
  if (isProduction()) return false
  return (
    process.env.ALLOW_SEED === 'true' ||
    process.env.NETLIFY_DEV === 'true' ||
    process.env.NETLIFY_DEV === '1'
  )
}

// ── Auth ──────────────────────────────────────────────────────────────────────

dashboardRouter.post(
  '/auth/login-dashboard',
  rateLimitByBodyField('email', 10, 15 * 60_000, 'login-manager'),
  async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ message: 'Email et mot de passe requis' })
    return
  }
  try {
    const requested = email.trim().toLowerCase()
    let manager = await getManagerByEmail(requested)

    // DT / SA / DAF / PDG : créer les comptes pilote au premier login (dev / seed).
    if (!manager && isBtpPilotLoginEmail(requested) && canAutoProvisionBtpPilot()) {
      try {
        await seedBtpPilotData()
        manager = await getManagerByEmail(requested)
      } catch (seedErr) {
        console.error('[dashboard] auto seed-btp on login failed', seedErr)
      }
    }

    // Pilote : si SEED_MANAGER_EMAIL est défini mais la base est encore à manager@demo.fr,
    // accepter le login perso et réaligner l’e-mail (évite « Identifiants invalides »).
    if (!manager) {
      const pilotEmail = process.env.SEED_MANAGER_EMAIL?.trim().toLowerCase()
      if (pilotEmail && requested === pilotEmail) {
        const demo = await getManagerById(DEMO.MANAGER_ID)
        if (demo && (await bcrypt.compare(password, demo.passwordHash))) {
          await upsertManager(
            demo.id,
            pilotEmail,
            demo.passwordHash,
            demo.name || 'Admin Pilote',
            demo.companyId,
          )
          manager = {
            ...demo,
            email: pilotEmail,
            name: demo.name || 'Admin Pilote',
          }
        }
      }
    }

    // Inverse : le hint UI dit manager@demo.fr alors que le seed local a renommé la ligne.
    if (!manager && requested === DEMO.MANAGER_EMAIL) {
      const demo = await getManagerById(DEMO.MANAGER_ID)
      if (demo && (await bcrypt.compare(password, demo.passwordHash))) {
        manager = demo
      }
    }

    if (!manager) {
      logSecurityEvent({
        action: 'manager.login.failure',
        actorType: 'manager',
        metadata: { email: requested },
        req,
      })
      const btpHint = isBtpPilotLoginEmail(requested)
        ? ' Compte DT/SA absent — ouvrez http://localhost:8888/manager/login après `npm run netlify:dev` (les comptes se créent à la connexion).'
        : ''
      res.status(401).json({ message: `Identifiants invalides.${btpHint}` })
      return
    }
    const ok = await bcrypt.compare(password, manager.passwordHash)
    if (!ok) {
      logSecurityEvent({
        action: 'manager.login.failure',
        actorType: 'manager',
        actorId: manager.id,
        companyId: manager.companyId,
        metadata: { email: requested },
        req,
      })
      res.status(401).json({ message: 'Identifiants invalides' })
      return
    }

    if (manager.role === 'admin' && manager.totpEnabled && manager.totpSecret) {
      res.json({
        requiresTotp: true,
        totpToken: signTotpPendingToken(manager.id),
        manager: {
          id: manager.id,
          email: manager.email,
          name: manager.name,
          companyId: manager.companyId,
          role: manager.role,
        },
      })
      return
    }

    const accessToken = signManagerToken(
      manager.id,
      manager.email,
      manager.companyId,
      manager.role,
      manager.procurementRole,
    )
    setManagerAuthCookie(res, accessToken)
    logSecurityEvent({
      action: 'manager.login.success',
      actorType: 'manager',
      actorId: manager.id,
      companyId: manager.companyId,
      req,
    })
    res.json({
      expiresIn: 8 * 3600,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        companyId: manager.companyId,
        role: manager.role,
        procurementRole: manager.procurementRole ?? null,
      },
    })
  } catch (err) {
    console.error('[dashboard] login error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
  }
)

dashboardRouter.post('/auth/totp-verify-login', rateLimitByIp(20, 15 * 60_000, 'totp-verify-login'), async (req, res) => {
  const { totpToken, code } = req.body as { totpToken?: string; code?: string }
  if (!totpToken || !code) {
    res.status(400).json({ message: 'totpToken et code requis' })
    return
  }
  const managerId = verifyTotpPendingToken(totpToken)
  if (!managerId) {
    res.status(401).json({ message: 'Session 2FA expirée — reconnectez-vous.' })
    return
  }
  try {
    const manager = await getManagerById(managerId)
    if (!manager || manager.role !== 'admin' || !manager.totpEnabled || !manager.totpSecret) {
      res.status(401).json({ message: '2FA non configurée pour ce compte.' })
      return
    }
    if (!verifyTotpCode(manager.totpSecret, code)) {
      logSecurityEvent({
        action: 'manager.totp.failure',
        actorType: 'manager',
        actorId: manager.id,
        companyId: manager.companyId,
        req,
      })
      res.status(401).json({ message: 'Code 2FA invalide' })
      return
    }
    const accessToken = signManagerToken(
      manager.id,
      manager.email,
      manager.companyId,
      manager.role,
      manager.procurementRole,
    )
    setManagerAuthCookie(res, accessToken)
    logSecurityEvent({
      action: 'manager.login.success',
      actorType: 'manager',
      actorId: manager.id,
      companyId: manager.companyId,
      metadata: { totp: true },
      req,
    })
    res.json({
      expiresIn: 8 * 3600,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        companyId: manager.companyId,
        role: manager.role,
        procurementRole: manager.procurementRole ?? null,
      },
    })
  } catch (err) {
    console.error('[dashboard] totp-verify-login error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/auth/totp/setup', requireManager, requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const secret = generateTotpSecret()
    await setManagerTotp(manager.sub, secret, false)
    res.json({
      secret,
      uri: totpOtpAuthUri(secret, manager.email),
    })
  } catch (err) {
    console.error('[dashboard] totp setup error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/auth/totp/enable', requireManager, requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { code } = req.body as { code?: string }
  if (!code) {
    res.status(400).json({ message: 'code requis' })
    return
  }
  try {
    const row = await getManagerById(manager.sub)
    if (!row?.totpSecret) {
      res.status(400).json({ message: 'Lancez d’abord la configuration 2FA.' })
      return
    }
    if (!verifyTotpCode(row.totpSecret, code)) {
      res.status(400).json({ message: 'Code 2FA invalide' })
      return
    }
    await setManagerTotp(manager.sub, row.totpSecret, true)
    logSecurityEvent({
      action: 'manager.totp.enabled',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      req,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[dashboard] totp enable error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/auth/totp/disable', requireManager, requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { code } = req.body as { code?: string }
  if (!code) {
    res.status(400).json({ message: 'code requis' })
    return
  }
  try {
    const row = await getManagerById(manager.sub)
    if (!row?.totpSecret || !row.totpEnabled) {
      res.json({ ok: true })
      return
    }
    if (!verifyTotpCode(row.totpSecret, code)) {
      res.status(400).json({ message: 'Code 2FA invalide' })
      return
    }
    await setManagerTotp(manager.sub, null, false)
    logSecurityEvent({
      action: 'manager.totp.disabled',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      req,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[dashboard] totp disable error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

/** Mise en service autonome : crée une entreprise + le premier manager. */
dashboardRouter.post(
  '/auth/register-company',
  rateLimitByBodyField('email', 5, 60 * 60_000, 'register-company'),
  async (req, res) => {
    if (!isSelfSignupAllowed()) {
      res.status(403).json({
        message: 'Inscription désactivée. Contactez le support ou définissez ALLOW_SELF_SIGNUP=true.',
      })
      return
    }
    const parsed = parseBody(registerCompanySchema, req.body, res)
    if (!parsed) return
    const companyName = parsed.companyName.trim()
    const managerName = parsed.managerName.trim()
    const email = parsed.email.trim().toLowerCase()
    const password = parsed.password
    try {
      let slug = slugifyCompanyName(companyName)
      if (await getCompanyBySlug(slug)) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`
      }
      const existing = await getManagerByEmail(email)
      if (existing) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const companyId = newCompanyId()
      const managerId = `mgr-${randomUUID()}`
      const { company, manager } = await createCompanyWithManager({
        companyId,
        companyName,
        slug,
        managerId,
        managerName,
        email,
        passwordHash,
      })
      await seedDefaultCompanyUnits(company.id)
      const accessToken = signManagerToken(manager.id, manager.email, company.id, manager.role)
      setManagerAuthCookie(res, accessToken)
      res.status(201).json({
        ok: true,
        company: { id: company.id, name: company.name, slug: company.slug },
        manager: {
          id: manager.id,
          email: manager.email,
          name: manager.name,
          companyId: company.id,
          role: manager.role,
        },
      })
    } catch (err) {
      console.error('[dashboard] register-company error', err)
      res.status(500).json({ message: 'Erreur création entreprise' })
    }
  },
)

dashboardRouter.post('/auth/logout-dashboard', (_req, res) => {
  clearManagerAuthCookie(res)
  res.json({ ok: true })
})

dashboardRouter.get('/auth/me', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const row = await getManagerById(manager.sub)
  res.json({
    manager: {
      id: manager.sub,
      email: manager.email,
      name: row?.name ?? '',
      companyId: manager.companyId,
      role: row?.role ?? manager.managerRole,
      procurementRole: row?.procurementRole ?? null,
      totpEnabled: Boolean(row?.totpEnabled),
    },
  })
})

// ── Tours ─────────────────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/tours', requireManager, async (req, res) => {
  const today = localTodayIso()
  const date = String(req.query.date ?? today)
  const { manager } = req as ManagerRequest
  try {
    const tours = await getDashboardTours(date, manager.companyId)
    res.json({ date, tours })
  } catch (err) {
    console.error('[dashboard] tours error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/tours', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const body = req.body as Record<string, unknown>
  const { driverId, date, depotName, depotAddress, depotLat, depotLng, stops, replannedFromTourId } = body

  if (!driverId || !date || !depotName || !depotAddress || !Array.isArray(stops) || stops.length === 0) {
    res.status(400).json({ message: 'Champs obligatoires manquants (driverId, date, depot, stops)' })
    return
  }

  const driverCheck = await getDriverById(String(driverId))
  if (!driverCheck || driverCheck.companyId !== manager.companyId) {
    res.status(403).json({ message: 'Livreur introuvable pour votre entreprise' })
    return
  }

  const resolvedStops = []
  for (const [i, s] of (stops as Record<string, unknown>[]).entries()) {
    if (!s.unitType) {
      res.status(400).json({ message: `Arrêt ${i + 1} : champs obligatoires manquants (unitType)` })
      return
    }
    const unitType = await resolveTourUnitType(manager.companyId, s.unitType)
    if (!unitType) {
      res.status(400).json({ message: `Arrêt ${i + 1} : unité « ${String(s.unitType)} » inconnue ou inactive — configurez-la dans Catalogue → Unités.` })
      return
    }
    const resolved = await resolveStopFromCatalog(s.supermarketId, i, manager.companyId)
    if (!resolved.ok) {
      res.status(400).json({ message: resolved.message })
      return
    }
    const orderRef = String(s.orderRef ?? '').trim() || generateOrderRef()
    const products = parseExpectedProducts(s.products)
    const duplicateError = validateStopProducts(products ?? [], resolved.stop.name)
    if (duplicateError) {
      res.status(400).json({ message: duplicateError })
      return
    }
    resolvedStops.push({
      supermarketId: resolved.stop.supermarketId,
      name: resolved.stop.name,
      address: resolved.stop.address,
      instructions: s.instructions ? String(s.instructions) : undefined,
      units: Number(s.units ?? 1),
      unitType,
      weightKg: String(s.weightKg ?? '0'),
      orderRef,
      contactPhone: resolved.stop.contactPhone,
      timeWindowStart: s.timeWindowStart ? String(s.timeWindowStart) : undefined,
      timeWindowEnd: s.timeWindowEnd ? String(s.timeWindowEnd) : undefined,
      requiredPhotos: Number(s.requiredPhotos ?? 1),
      lat: resolved.stop.lat,
      lng: resolved.stop.lng,
      products,
    })
  }

  try {
    const result = await createTourWithStops({
      companyId: manager.companyId,
      driverId: String(driverId),
      date: String(date),
      depotName: String(depotName),
      depotAddress: String(depotAddress),
      depotLat: String(depotLat ?? '0'),
      depotLng: String(depotLng ?? '0'),
      stops: resolvedStops,
    })
    if (replannedFromTourId) {
      const superseded = await supersedeNonDeliveredStopsFromTour(String(replannedFromTourId))
      if (superseded > 0) {
        console.log(`[dashboard] replan: ${superseded} arrêt(s) obsolète(s) clôturé(s) sur ${String(replannedFromTourId)}`)
      }
    }

    const purchaseRequestId =
      typeof body.purchaseRequestId === 'string' ? body.purchaseRequestId.trim() : ''
    const purchaseOrderId =
      typeof body.purchaseOrderId === 'string' ? body.purchaseOrderId.trim() : ''
    if (purchaseRequestId) {
      try {
        await markDeliveryScheduled(
          manager.companyId,
          purchaseRequestId,
          result.tourId,
          purchaseOrderId || undefined,
        )
      } catch (linkErr) {
        console.error('[dashboard] lien BC → tournée', linkErr)
        if (linkErr instanceof ProcurementWorkflowError) {
          res.status(linkErr.statusCode).json({ message: linkErr.message, tourId: result.tourId })
          return
        }
        throw linkErr
      }
    }

    let driverNotify: { sent: boolean; error?: string } = { sent: false }
    const driver = await getDriverById(String(driverId))
    if (driver?.phone) {
      const smsBody = buildTourAssignedSmsBody({
        tourDate: String(date),
        stopCount: resolvedStops.length,
        depotName: String(depotName),
      })
      try {
        const sms = await sendSmsMessage(driver.phone, smsBody)
        driverNotify = sms.success
          ? { sent: true }
          : { sent: false, error: sms.details ?? sms.error ?? 'échec SMS' }
      } catch (smsErr) {
        driverNotify = {
          sent: false,
          error: smsErr instanceof Error ? smsErr.message : String(smsErr),
        }
        console.error('[dashboard] notification livreur échouée', smsErr)
      }
    }

    res.status(201).json({ ok: true, tourId: result.tourId, driverNotify })
  } catch (err) {
    console.error('[dashboard] create tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/tours/:id/replan-template — pré-remplir une replanification
dashboardRouter.get('/dashboard/tours/:id/replan-template', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const tourId = String(req.params.id)
    const tour = await getTourById(tourId)
    if (!tour || tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    const template = await getTourReplanTemplate(tourId)
    if (!template) { res.status(404).json({ message: 'Tournée introuvable' }); return }
    if (template.stops.length === 0) {
      res.status(400).json({ message: 'Aucun arrêt à replanifier (tous les arrêts sont déjà livrés).' })
      return
    }
    res.json(template)
  } catch (err) {
    console.error('[dashboard] replan template error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/deliveries/:deliveryId/partial-replan-template — reliquat livraison partielle
dashboardRouter.get('/dashboard/deliveries/:deliveryId/partial-replan-template', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const deliveryId = String(req.params.deliveryId)
    const owned = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!owned) {
      res.status(404).json({ message: 'Livraison introuvable ou sans reliquat à replanifier' })
      return
    }
    const template = await getPartialDeliveryReplanTemplate(deliveryId)
    if (!template) {
      res.status(404).json({ message: 'Livraison introuvable ou sans reliquat à replanifier' })
      return
    }
    res.json(template)
  } catch (err) {
    console.error('[dashboard] partial replan template error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/tours/:id — détail tournée + arrêts
dashboardRouter.get('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const result = await getTourWithStops(String(req.params.id))
    if (!result || result.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    res.json(result)
  } catch (err) {
    console.error('[dashboard] get tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// PATCH /dashboard/tours/:id — modifier tournée + arrêts
dashboardRouter.patch('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const tourId = String(req.params.id)
  const body = req.body as Record<string, unknown>
  const { driverId, date, depotName, depotAddress, depotLat, depotLng, stops } = body

  if (!Array.isArray(stops) || stops.length === 0) {
    res.status(400).json({ message: 'Au moins un arrêt est requis' })
    return
  }

  try {
    const existingTour = await getTourWithStops(tourId)
    if (!existingTour || existingTour.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    // Update tour metadata
    const meta: Record<string, unknown> = {}
    if (driverId) meta.driverId = String(driverId)
    if (date) meta.date = String(date)
    if (depotName) meta.depotName = String(depotName)
    if (depotAddress) meta.depotAddress = String(depotAddress)
    if (depotLat) meta.depotLat = String(depotLat)
    if (depotLng) meta.depotLng = String(depotLng)
    if (Object.keys(meta).length) await updateTourMeta(tourId, meta)

    const existingStops = await getStopsForTour(tourId)
    const existingById = new Map(existingStops.map((s) => [s.id, s]))

    // Upsert stops
    const keptIds: string[] = []
    for (let i = 0; i < (stops as Record<string, unknown>[]).length; i++) {
      const s = (stops as Record<string, unknown>[])[i]!
      const existing = s.id ? existingById.get(String(s.id)) : undefined

      if (existing?.status === 'delivered') {
        if (stopPayloadDiffersFromExisting(existing, s)) {
          res.status(403).json({ message: `L'arrêt « ${existing.name} » est livré et ne peut pas être modifié.` })
          return
        }
        keptIds.push(existing.id)
        if (existing.sequence !== i + 1) {
          await updateDeliveryPointSequence(existing.id, i + 1)
        }
        continue
      }

      const stopId = s.id ? String(s.id) : `dp-${randomUUID()}`
      keptIds.push(stopId)

      const resolved = await resolveStopFromCatalog(s.supermarketId ?? existing?.supermarketId, i, manager.companyId)
      if (!resolved.ok) {
        res.status(400).json({ message: resolved.message })
        return
      }
      const unitType = await resolveTourUnitType(manager.companyId, s.unitType, existing?.unitType)
      if (!unitType) {
        res.status(400).json({ message: `Arrêt ${i + 1} : unité invalide ou inactive` })
        return
      }

      const products = parseExpectedProducts(s.products)
      const duplicateError = validateStopProducts(products ?? [], resolved.stop.name)
      if (duplicateError) {
        res.status(400).json({ message: duplicateError })
        return
      }

      await upsertDeliveryPoint({
        id: stopId,
        tourId,
        sequence: i + 1,
        supermarketId: resolved.stop.supermarketId,
        name: resolved.stop.name,
        address: resolved.stop.address,
        instructions: s.instructions ? String(s.instructions) : undefined,
        units: Number(s.units ?? existing?.units ?? 1),
        unitType,
        weightKg: String(s.weightKg ?? existing?.weightKg ?? '0'),
        orderRef: String(s.orderRef ?? '').trim() || existing?.orderRef || generateOrderRef(),
        contactPhone: resolved.stop.contactPhone,
        timeWindowStart: s.timeWindowStart ? String(s.timeWindowStart) : undefined,
        timeWindowEnd: s.timeWindowEnd ? String(s.timeWindowEnd) : undefined,
        requiredPhotos: Number(s.requiredPhotos ?? existing?.requiredPhotos ?? 1),
        lat: resolved.stop.lat,
        lng: resolved.stop.lng,
        products,
      })
    }

    // Ensure delivered stops from tour are not dropped silently
    for (const existing of existingStops) {
      if (existing.status === 'delivered' && !keptIds.includes(existing.id)) {
        res.status(403).json({ message: `L'arrêt « ${existing.name} » est livré et ne peut pas être supprimé.` })
        return
      }
    }

    // Delete removed stops (delivered stops are protected inside deleteDeliveryPoints)
    await deleteDeliveryPoints(tourId, keptIds)

    const result = await getTourWithStops(tourId)
    if (driverId) await resolvePendingReassignForTour(tourId)
    res.json({ ok: true, tour: result })
  } catch (err) {
    console.error('[dashboard] patch tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// DELETE /dashboard/tours/:id — supprimer une tournée (aucun arrêt livré)
dashboardRouter.delete('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const tourId = String(req.params.id)
  try {
    const existing = await getTourWithStops(tourId)
    if (!existing || existing.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    const result = await deleteTourIfNoDeliveries(tourId)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ message: 'Tournée introuvable' })
        return
      }
      res.status(403).json({
        message: 'Impossible de supprimer : au moins un arrêt est déjà livré.',
      })
      return
    }
    res.json({ ok: true, tourId })
  } catch (err) {
    console.error('[dashboard] delete tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Deliveries (suivi) ────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/deliveries', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const today = localTodayIso()
  const date = String(req.query.date ?? today)
  const status = req.query.status ? String(req.query.status) : undefined
  try {
    const deliveries = await getDashboardDeliveries(date, status, manager.companyId)
    const total = deliveries.length
    const validated = deliveries.filter((d) => d.status === 'delivered').length
    res.json({ date, total, validated, deliveries })
  } catch (err) {
    console.error('[dashboard] deliveries error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/deliveries/:id
dashboardRouter.get('/dashboard/deliveries/:id', requireManager, async (req, res) => {
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
dashboardRouter.get('/dashboard/deliveries/:id/otp-status', requireManager, async (req, res) => {
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
dashboardRouter.post('/dashboard/deliveries/:id/resend-otp', requireManager, async (req, res) => {
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
dashboardRouter.post('/dashboard/deliveries/:id/confirm-manual', requireManager, async (req, res) => {
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

// ── Drivers ───────────────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/drivers', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const driverList = await getAllDrivers(manager.companyId)
    res.json({ drivers: driverList.map((d) => ({ id: d.id, name: d.name, phone: d.phone, status: d.status })) })
  } catch (err) {
    console.error('[dashboard] drivers error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/drivers', requireManager, async (req, res) => {
  const { name, phone, pin } = req.body as { name?: string; phone?: string; pin?: string }
  if (!name || !phone || !pin) {
    res.status(400).json({ message: 'Nom, téléphone et PIN sont requis' })
    return
  }
  const normalizedPhone = normalizeDriverPhone(phone)
  if (!isValidDriverPhone(normalizedPhone)) {
    res.status(400).json({ message: 'Numéro de téléphone invalide (+225 + 10 chiffres)' })
    return
  }
  try {
    if (!allowDevDuplicateDriverPhone() && (await getDriverByPhone(normalizedPhone))) {
      res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' })
      return
    }
    if (allowDevDuplicateDriverPhone()) await relaxDriversPhoneUniqueForDev()
    const pinHash = await bcrypt.hash(pin, 10)
    const { manager } = req as ManagerRequest
    const driver = await createDriver(`drv-${randomUUID()}`, name.trim(), normalizedPhone, pinHash, manager.companyId)
    res.status(201).json({ ok: true, driver: { id: driver.id, name: driver.name, phone: driver.phone, status: driver.status } })
  } catch (err: unknown) {
    if (allowDevDuplicateDriverPhone() && isPgUniqueViolation(err)) {
      await relaxDriversPhoneUniqueForDev()
      try {
        const pinHash = await bcrypt.hash(pin, 10)
        const { manager } = req as ManagerRequest
        const driver = await createDriver(`drv-${randomUUID()}`, name.trim(), normalizedPhone, pinHash, manager.companyId)
        res.status(201).json({ ok: true, driver: { id: driver.id, name: driver.name, phone: driver.phone, status: driver.status } })
        return
      } catch (retryErr: unknown) {
        if (isPgUniqueViolation(retryErr)) {
          res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' })
          return
        }
        console.error('[dashboard] create driver retry error', retryErr)
        res.status(500).json({ message: 'Erreur serveur' })
        return
      }
    }
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' })
      return
    }
    console.error('[dashboard] create driver error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.patch('/dashboard/drivers/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const { name, phone, pin, status } = req.body as { name?: string; phone?: string; pin?: string; status?: string }
  try {
    const current = await getDriverById(String(id))
    if (!current || current.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Livreur introuvable' })
      return
    }

    const update: Record<string, unknown> = {}
    if (name) update.name = name.trim()
    if (phone) {
      const normalizedPhone = normalizeDriverPhone(phone)
      if (!isValidDriverPhone(normalizedPhone)) {
        res.status(400).json({ message: 'Numéro de téléphone invalide (+225 + 10 chiffres)' })
        return
      }
      const phoneOwner = await getDriverByPhone(normalizedPhone)
      if (phoneOwner && phoneOwner.id !== current.id && !allowDevDuplicateDriverPhone()) {
        res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' })
        return
      }
      if (allowDevDuplicateDriverPhone()) await relaxDriversPhoneUniqueForDev()
      update.phone = normalizedPhone
    }
    if (pin) update.pinHash = await bcrypt.hash(pin, 10)
    if (status) update.status = status
    const driver = await updateDriver(String(id), update)
    if (!driver) { res.status(404).json({ message: 'Livreur introuvable' }); return }

    let reassignmentTasksCreated = 0
    if (status === 'suspended' && current.status !== 'suspended') {
      const futureTours = await findFutureToursForDriver(String(id))
      for (const tour of futureTours) {
        await createReassignTourTask(tour, String(id), current.name)
        reassignmentTasksCreated += 1
      }
    }

    res.json({
      ok: true,
      driver: { id: driver.id, name: driver.name, phone: driver.phone, status: driver.status },
      reassignmentTasksCreated,
    })
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' })
      return
    }
    console.error('[dashboard] update driver error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// POST /dashboard/drivers/:id/clear-login-lock — déverrouille PIN / rate-limit login
dashboardRouter.post('/dashboard/drivers/:id/clear-login-lock', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  try {
    const driver = await getDriverById(String(id))
    if (!driver || driver.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Livreur introuvable' })
      return
    }
    await clearDriverLoginFailures(driver.phone)
    // Purge aussi le compteur rate-limit login (sinon le livreur reste en 429
    // pendant 15 min même après déverrouillage du verrouillage PIN).
    await clearRateLimitKey(`login-driver:${driver.phone.trim().toLowerCase()}`)
    logSecurityEvent({
      action: 'manager.driver.unlock',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      metadata: { driverId: driver.id, phone: driver.phone },
      req,
    })
    res.json({ ok: true, message: 'Verrouillage login réinitialisé.' })
  } catch (err) {
    console.error('[dashboard] clear-login-lock error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

function parseSupermarketActiveFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return undefined
}

async function setSupermarketActiveForManager(
  req: Request,
  res: Response,
  active: boolean,
): Promise<void> {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const existing = await getSupermarketById(String(id))
  if (!existing || existing.companyId !== manager.companyId) {
    res.status(404).json({ message: 'Point de livraison introuvable' })
    return
  }
  const sm = await setSupermarketActive(String(id), active)
  if (!sm) {
    res.status(404).json({ message: 'Point de livraison introuvable' })
    return
  }
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, supermarket: sm })
}

function contactEmailValidationError(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'E-mail responsable obligatoire.'
  }
  const normalized = normalizeContactEmail(raw)
  if (!isValidContactEmail(normalized)) {
    return 'E-mail responsable invalide.'
  }
  return null
}

function isValidManagerEmail(email: string): boolean {
  return isValidContactEmail(email)
}

// ── Managers (collègues gestionnaires) — admin uniquement ─────────────────────

dashboardRouter.get('/dashboard/managers', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const rows = await getAllManagers(manager.companyId)
    res.json({ managers: rows })
  } catch (err) {
    console.error('[dashboard] managers list error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.get('/dashboard/managers/invites', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const invites = await getPendingManagerInvites(manager.companyId)
    res.json({ invites })
  } catch (err) {
    console.error('[dashboard] manager invites list error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post(
  '/dashboard/managers/invite',
  requireAdmin,
  rateLimitByBodyField('email', 10, 60 * 60_000, 'invite-manager'),
  async (req, res) => {
    const { manager } = req as ManagerRequest
    const { name, email } = req.body as { name?: string; email?: string }
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ message: 'Nom et e-mail sont requis' })
      return
    }
    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidManagerEmail(normalizedEmail)) {
      res.status(400).json({ message: 'Adresse e-mail invalide' })
      return
    }
    try {
      if (await getManagerByEmail(normalizedEmail)) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      const { token, tokenHash } = generateSecureToken()
      const expiresAt = new Date(Date.now() + 72 * 3600_000)
      const invite = await createManagerInvite({
        id: `minv-${randomUUID()}`,
        companyId: manager.companyId,
        email: normalizedEmail,
        name: name.trim(),
        tokenHash,
        expiresAt,
        invitedBy: manager.sub,
      })
      const inviter = await getManagerById(manager.sub)
      const company = await getCompanyById(manager.companyId)
      await sendManagerInviteEmail({
        to: normalizedEmail,
        name: name.trim(),
        inviterName: inviter?.name ?? 'Un administrateur',
        companyName: company?.name ?? 'votre entreprise',
        token,
      })
      res.status(201).json({
        ok: true,
        invite: { id: invite.id, email: invite.email, name: invite.name, expiresAt: invite.expiresAt },
        // Lien renvoyé à l'admin : permet l'onboarding manuel (WhatsApp/SMS) si l'e-mail n'est pas configuré.
        inviteUrl: `${publicBaseUrl()}/manager/invite?token=${encodeURIComponent(token)}`,
      })
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      console.error('[dashboard] invite manager error', err)
      res.status(500).json({ message: 'Erreur serveur' })
    }
  },
)

dashboardRouter.post(
  '/dashboard/managers/invites/:id/resend',
  requireAdmin,
  async (req, res) => {
    const { manager } = req as ManagerRequest
    const inviteId = String(req.params.id)
    try {
      const invite = await getManagerInviteById(inviteId)
      if (!invite || invite.companyId !== manager.companyId || invite.acceptedAt) {
        res.status(404).json({ message: 'Invitation introuvable' })
        return
      }
      const { token, tokenHash } = generateSecureToken()
      const expiresAt = new Date(Date.now() + 72 * 3600_000)
      await deleteManagerInvite(inviteId, manager.companyId)
      const newInvite = await createManagerInvite({
        id: `minv-${randomUUID()}`,
        companyId: manager.companyId,
        email: invite.email,
        name: invite.name,
        tokenHash,
        expiresAt,
        invitedBy: manager.sub,
      })
      const inviter = await getManagerById(manager.sub)
      const company = await getCompanyById(manager.companyId)
      await sendManagerInviteEmail({
        to: invite.email,
        name: invite.name,
        inviterName: inviter?.name ?? 'Un administrateur',
        companyName: company?.name ?? 'votre entreprise',
        token,
      })
      res.json({
        ok: true,
        invite: { id: newInvite.id, email: newInvite.email, name: newInvite.name, expiresAt: newInvite.expiresAt },
        inviteUrl: `${publicBaseUrl()}/manager/invite?token=${encodeURIComponent(token)}`,
      })
    } catch (err) {
      console.error('[dashboard] resend invite error', err)
      res.status(500).json({ message: 'Erreur serveur' })
    }
  },
)

dashboardRouter.delete('/dashboard/managers/invites/:id', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const ok = await deleteManagerInvite(String(req.params.id), manager.companyId)
  if (!ok) {
    res.status(404).json({ message: 'Invitation introuvable' })
    return
  }
  res.json({ ok: true })
})

dashboardRouter.post(
  '/auth/accept-manager-invite',
  rateLimitByBodyField('token', 10, 15 * 60_000, 'accept-manager-invite'),
  async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token?.trim() || !password) {
      res.status(400).json({ message: 'Token et mot de passe requis' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' })
      return
    }
    try {
      const tokenHash = hashSecureToken(token.trim())
      const invite = await getManagerInviteByTokenHash(tokenHash)
      if (!invite) {
        res.status(400).json({ message: 'Invitation invalide ou expirée' })
        return
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        res.status(400).json({ message: 'Invitation expirée' })
        return
      }
      if (await getManagerByEmail(invite.email)) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const created = await createManager(
        `mgr-${randomUUID()}`,
        invite.email,
        passwordHash,
        invite.name,
        invite.companyId,
        'manager',
      )
      await markManagerInviteAccepted(invite.id)
      logSecurityEvent({
        action: 'manager.invite.accepted',
        actorType: 'manager',
        actorId: created.id,
        companyId: created.companyId,
        metadata: { email: created.email },
        req,
      })
      const accessToken = signManagerToken(created.id, created.email, created.companyId, created.role)
      setManagerAuthCookie(res, accessToken)
      res.status(201).json({
        ok: true,
        manager: {
          id: created.id,
          email: created.email,
          name: created.name,
          companyId: created.companyId,
          role: created.role,
        },
      })
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      console.error('[dashboard] accept invite error', err)
      res.status(500).json({ message: 'Erreur serveur' })
    }
  },
)

dashboardRouter.post(
  '/auth/manager-forgot-password',
  rateLimitByBodyField('email', 5, 60 * 60_000, 'manager-forgot-password'),
  async (req, res) => {
    const email = String((req.body as { email?: string }).email ?? '').trim().toLowerCase()
    if (!email || !isValidManagerEmail(email)) {
      res.status(400).json({ message: 'Adresse e-mail invalide' })
      return
    }
    try {
      const row = await getManagerByEmail(email)
      // Réponse uniforme pour éviter l'énumération d'e-mails
      if (row) {
        const { token, tokenHash } = generateSecureToken()
        await createManagerPasswordReset({
          id: `mreset-${randomUUID()}`,
          managerId: row.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600_000),
        })
        await sendManagerPasswordResetEmail({ to: row.email, name: row.name, token })
      }
      res.json({ ok: true, message: 'Si un compte existe, un e-mail de réinitialisation a été envoyé.' })
    } catch (err) {
      console.error('[dashboard] forgot password error', err)
      res.status(500).json({ message: 'Erreur serveur' })
    }
  },
)

dashboardRouter.post(
  '/auth/manager-reset-password',
  rateLimitByBodyField('token', 10, 15 * 60_000, 'manager-reset-password'),
  async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token?.trim() || !password) {
      res.status(400).json({ message: 'Token et mot de passe requis' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' })
      return
    }
    try {
      const tokenHash = hashSecureToken(token.trim())
      const reset = await getManagerPasswordResetByTokenHash(tokenHash)
      if (!reset || reset.expiresAt.getTime() < Date.now()) {
        res.status(400).json({ message: 'Lien de réinitialisation invalide ou expiré' })
        return
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const updated = await updateManager(reset.managerId, { passwordHash })
      if (!updated) {
        res.status(404).json({ message: 'Compte introuvable' })
        return
      }
      await markManagerPasswordResetUsed(reset.id)
      logSecurityEvent({
        action: 'manager.password.reset',
        actorType: 'manager',
        actorId: updated.id,
        companyId: updated.companyId,
        req,
      })
      res.json({ ok: true })
    } catch (err) {
      console.error('[dashboard] reset password error', err)
      res.status(500).json({ message: 'Erreur serveur' })
    }
  },
)

dashboardRouter.patch('/dashboard/managers/:id', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const { name, email, password, role } = req.body as {
    name?: string
    email?: string
    password?: string
    role?: 'admin' | 'manager'
  }
  try {
    const current = await getManagerById(String(id))
    if (!current || current.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Gestionnaire introuvable' })
      return
    }

    if (role === 'manager' && current.role === 'admin') {
      const admins = await countAdmins(manager.companyId)
      if (admins <= 1) {
        res.status(400).json({ message: 'Impossible de retirer le dernier administrateur.' })
        return
      }
    }

    const update: Partial<{ name: string; email: string; passwordHash: string; role: 'admin' | 'manager'; procurementRole: ProcurementRole | null }> = {}
    if (name?.trim()) update.name = name.trim()
    if (email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase()
      if (!isValidManagerEmail(normalizedEmail)) {
        res.status(400).json({ message: 'Adresse e-mail invalide' })
        return
      }
      const owner = await getManagerByEmail(normalizedEmail)
      if (owner && owner.id !== current.id) {
        res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
        return
      }
      update.email = normalizedEmail
    }
    if (password) {
      if (password.length < 8) {
        res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' })
        return
      }
      update.passwordHash = await bcrypt.hash(password, 10)
    }
    if (role === 'admin' || role === 'manager') update.role = role

    // Profil chantiers (rôle achats/terrain) — null = aucun profil
    if ('procurementRole' in req.body) {
      const validProcurementRoles = [
        'site_controller',
        'technical_director',
        'daf',
        'purchasing',
        'pdg',
        'controle_gestion',
        'site_manager',
      ]
      const pr = (req.body as { procurementRole?: unknown }).procurementRole
      update.procurementRole =
        typeof pr === 'string' && validProcurementRoles.includes(pr) ? (pr as ProcurementRole) : null
    }

    const row = await updateManager(String(id), update)
    if (!row) {
      res.status(404).json({ message: 'Gestionnaire introuvable' })
      return
    }
    if (update.role && update.role !== current.role) {
      logSecurityEvent({
        action: 'manager.role.changed',
        actorType: 'manager',
        actorId: manager.sub,
        companyId: manager.companyId,
        metadata: { targetId: row.id, from: current.role, to: row.role },
        req,
      })
    }
    res.json({
      ok: true,
      manager: { id: row.id, name: row.name, email: row.email, role: row.role },
    })
  } catch (err: unknown) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ message: 'Cet e-mail est déjà utilisé' })
      return
    }
    console.error('[dashboard] update manager error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.delete('/dashboard/managers/:id', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const targetId = String(req.params.id)
  if (targetId === manager.sub) {
    res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' })
    return
  }
  try {
    const current = await getManagerById(targetId)
    if (!current || current.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Gestionnaire introuvable' })
      return
    }
    if (current.role === 'admin') {
      const admins = await countAdmins(manager.companyId)
      if (admins <= 1) {
        res.status(400).json({ message: 'Impossible de supprimer le dernier administrateur.' })
        return
      }
    }
    const total = await countManagers(manager.companyId)
    if (total <= 1) {
      res.status(400).json({ message: 'Impossible de supprimer le dernier gestionnaire de l’entreprise.' })
      return
    }
    const ok = await deleteManager(targetId)
    if (!ok) {
      res.status(404).json({ message: 'Gestionnaire introuvable' })
      return
    }
    logSecurityEvent({
      action: 'manager.deleted',
      actorType: 'manager',
      actorId: manager.sub,
      companyId: manager.companyId,
      metadata: { targetId, email: current.email },
      req,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[dashboard] delete manager error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Supermarkets ──────────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/supermarkets', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    const list = await getAllSupermarkets(manager.companyId)
    res.set('Cache-Control', 'no-store')
    res.json({ supermarkets: list })
  } catch (err) {
    console.error('[dashboard] supermarkets error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

/** Aligne téléphones des arrêts ouverts ; seed démo seulement si le catalogue est vide. */
dashboardRouter.post('/dashboard/catalog/reconcile', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let catalogUpserted = 0
    if (manager.companyId === DEMO_COMPANY_ID) {
      const existing = await getAllSupermarkets(manager.companyId)
      if (existing.length === 0) {
        const demoCatalog = await seedDemoStopCatalog()
        const livraisonCatalog = await seedLivraisonSupermarkets()
        catalogUpserted = demoCatalog + livraisonCatalog
      }
    }
    const sync = await reconcileOpenStopsWithCatalog(manager.companyId)
    res.json({
      ok: true,
      catalogUpserted,
      ...sync,
    })
  } catch (err) {
    console.error('[dashboard] catalog reconcile error', err)
    res.status(500).json({ message: 'Erreur synchronisation catalogue' })
  }
})

dashboardRouter.post('/dashboard/supermarkets', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { name, address, contactPhone, contactName, contactEmail, lat, lng } =
    req.body as Record<string, string | undefined>
  if (!name || !address || !contactPhone) {
    res.status(400).json({ message: 'Nom, adresse et téléphone contact sont requis' })
    return
  }
  const emailErr = contactEmailValidationError(contactEmail)
  if (emailErr) {
    res.status(400).json({ message: emailErr })
    return
  }
  try {
    const normalizedContact = normalizeDriverPhone(contactPhone)
    if (!isValidDriverPhone(normalizedContact)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    const sm = await upsertSupermarket(`sm-${randomUUID()}`, {
      companyId: manager.companyId,
      name: name.trim(),
      address: address.trim(),
      contactPhone: normalizedContact,
      contactName: contactName?.trim() || undefined,
      contactEmail: normalizeContactEmail(contactEmail!),
      lat: optionalNumericField(lat),
      lng: optionalNumericField(lng),
      active: true,
      siteType: isSiteType(req.body?.siteType) ? req.body.siteType : 'prive',
    })
    res.status(201).json({ ok: true, supermarket: sm })
  } catch (err) {
    console.error('[dashboard] create supermarket error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/supermarkets/:id/deactivate', requireManager, async (req, res) => {
  await setSupermarketActiveForManager(req, res, false)
})

dashboardRouter.post('/dashboard/supermarkets/:id/activate', requireManager, async (req, res) => {
  await setSupermarketActiveForManager(req, res, true)
})

dashboardRouter.patch('/dashboard/supermarkets/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as Record<string, unknown>
  try {
    const existing = await getSupermarketById(String(id))
    if (!existing || existing.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Point de livraison introuvable' })
      return
    }

    const keys = Object.keys(data)
    const activeFlag = keys.length === 1 && keys[0] === 'active' ? parseSupermarketActiveFlag(data.active) : undefined
    if (activeFlag !== undefined) {
      const sm = await setSupermarketActive(String(id), activeFlag)
      if (!sm) {
        res.status(404).json({ message: 'Point de livraison introuvable' })
        return
      }
      res.set('Cache-Control', 'no-store')
      res.json({ ok: true, supermarket: sm })
      return
    }

    if (keys.length === 1 && keys[0] === 'siteType') {
      if (!isSiteType(data.siteType)) {
        res.status(400).json({ message: 'Type de chantier invalide (Privé ou Public)' })
        return
      }
      const sm = await setSupermarketSiteType(String(id), data.siteType)
      if (!sm) {
        res.status(404).json({ message: 'Chantier introuvable' })
        return
      }
      res.set('Cache-Control', 'no-store')
      res.json({ ok: true, supermarket: sm })
      return
    }

    const name = typeof data.name === 'string' ? data.name.trim() : existing.name
    const address = typeof data.address === 'string' ? data.address.trim() : existing.address
    const contactPhoneRaw = typeof data.contactPhone === 'string' ? data.contactPhone : existing.contactPhone
    const contactName = 'contactName' in data
      ? (typeof data.contactName === 'string' ? data.contactName.trim() || null : null)
      : existing.contactName
    let contactEmail = existing.contactEmail
    if ('contactEmail' in data) {
      const mergedEmail = typeof data.contactEmail === 'string' ? data.contactEmail : existing.contactEmail
      const emailErr = contactEmailValidationError(mergedEmail)
      if (emailErr) {
        res.status(400).json({ message: emailErr })
        return
      }
      contactEmail = normalizeContactEmail(String(mergedEmail))
    }
    const normalizedContact = normalizeDriverPhone(contactPhoneRaw)
    if (!isValidDriverPhone(normalizedContact)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    const lat = typeof data.lat === 'string' ? optionalNumericField(data.lat) : existing.lat
    const lng = typeof data.lng === 'string' ? optionalNumericField(data.lng) : existing.lng
    const siteType = isSiteType(data.siteType) ? data.siteType : existing.siteType
    const sm = await updateSupermarketDetails(String(id), {
      companyId: existing.companyId,
      name,
      address,
      contactPhone: normalizedContact,
      contactName,
      contactEmail,
      lat,
      lng,
      siteType,
    })
    if (!sm) {
      res.status(404).json({ message: 'Point de livraison introuvable' })
      return
    }
    if (typeof data.contactPhone === 'string') {
      await syncSupermarketContactToOpenStops(String(id), normalizedContact)
    }
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, supermarket: sm })
  } catch (err) {
    console.error('[dashboard] update supermarket error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Suppliers (catalogue) ─────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/suppliers', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    const rows = await listAllSuppliers(manager.companyId)
    res.set('Cache-Control', 'no-store')
    res.json({ suppliers: rows })
  } catch (err) {
    console.error('[dashboard] suppliers error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/suppliers', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const body = req.body as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ message: 'Raison sociale obligatoire' })
    return
  }
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
  if (contactEmail && !isValidContactEmail(contactEmail)) {
    res.status(400).json({ message: 'E-mail contact invalide' })
    return
  }
  let contactPhone: string | null = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : ''
  if (contactPhone) {
    const normalized = normalizeDriverPhone(contactPhone)
    if (!isValidDriverPhone(normalized)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    contactPhone = normalized
  } else {
    contactPhone = null
  }
  try {
    const supplier = await createSupplier({
      companyId: manager.companyId,
      name,
      contactName: typeof body.contactName === 'string' ? body.contactName.trim() || null : null,
      contactPhone,
      contactEmail: contactEmail ? normalizeContactEmail(contactEmail) : null,
      address: typeof body.address === 'string' ? body.address.trim() || null : null,
      depotAddress: typeof body.depotAddress === 'string' ? body.depotAddress.trim() || null : null,
      family: isSupplierFamily(body.family) ? body.family : 'materiaux',
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      active: body.active === false ? false : true,
    })
    res.status(201).json({ ok: true, supplier })
  } catch (err) {
    console.error('[dashboard] create supplier error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.patch('/dashboard/suppliers/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const supplierId = String(req.params.id)
  const existing = await getSupplierById(manager.companyId, supplierId)
  if (!existing) {
    res.status(404).json({ message: 'Fournisseur introuvable' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateSupplier>[2] = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if ('contactName' in body) patch.contactName = typeof body.contactName === 'string' ? body.contactName.trim() || null : null
  if ('contactEmail' in body) {
    const email = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
    if (email && !isValidContactEmail(email)) {
      res.status(400).json({ message: 'E-mail contact invalide' })
      return
    }
    patch.contactEmail = email ? normalizeContactEmail(email) : null
  }
  if ('contactPhone' in body) {
    const raw = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : ''
    if (raw) {
      const normalized = normalizeDriverPhone(raw)
      if (!isValidDriverPhone(normalized)) {
        res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
        return
      }
      patch.contactPhone = normalized
    } else {
      patch.contactPhone = null
    }
  }
  if ('address' in body) patch.address = typeof body.address === 'string' ? body.address.trim() || null : null
  if ('depotAddress' in body) patch.depotAddress = typeof body.depotAddress === 'string' ? body.depotAddress.trim() || null : null
  if ('family' in body) {
    if (body.family != null && !isSupplierFamily(body.family)) {
      res.status(400).json({ message: 'Famille invalide' })
      return
    }
    patch.family = isSupplierFamily(body.family) ? body.family : null
  }
  if ('notes' in body) patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  if (typeof body.active === 'boolean') patch.active = body.active
  try {
    const supplier = await updateSupplier(manager.companyId, supplierId, patch)
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, supplier })
  } catch (err) {
    console.error('[dashboard] update supplier error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Products ──────────────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/products', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let list = await getAllProducts(manager.companyId)
    // Filet pilote : si le catalogue démo a été vidé (reset), le recharger.
    if (list.length === 0 && manager.companyId === DEMO_COMPANY_ID) {
      await seedDemoProducts()
      list = await getAllProducts(manager.companyId)
    }
    res.json({ products: list })
  } catch (err) {
    console.error('[dashboard] products error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/products', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const parsed = parseBody(productCreateSchema, req.body, res)
  if (!parsed) return
  const { label, displayOrder } = parsed
  const unitCode = parsed.unit.toLowerCase()
  if (!(await isActiveCompanyUnit(manager.companyId, unitCode))) {
    res.status(400).json({
      message: 'Unité inconnue ou inactive — ajoutez-la dans Catalogue → Unités de mesure.',
    })
    return
  }
  try {
    const p = await upsertProduct(`prod-${randomUUID()}`, {
      companyId: manager.companyId,
      label: label.trim(),
      unit: unitCode,
      displayOrder: displayOrder ?? 0,
      active: true,
    })
    res.status(201).json({ ok: true, product: p })
  } catch (err) {
    console.error('[dashboard] create product error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.patch('/dashboard/products/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as { label?: string; unit?: string; displayOrder?: number; active?: boolean }
  const existing = await getProductById(String(id))
  if (!existing || existing.companyId !== manager.companyId) {
    res.status(404).json({ message: 'Produit introuvable' })
    return
  }
  if (data.unit != null) {
    const unitCode = String(data.unit).trim().toLowerCase()
    if (!(await isActiveCompanyUnit(manager.companyId, unitCode))) {
      res.status(400).json({
        message: 'Unité inconnue ou inactive — ajoutez-la dans Catalogue → Unités de mesure.',
      })
      return
    }
    data.unit = unitCode
  }
  try {
    const p = await upsertProduct(String(id), { ...data, companyId: manager.companyId })
    res.json({ ok: true, product: p })
  } catch (err) {
    console.error('[dashboard] update product error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Company units ─────────────────────────────────────────────────────────────

dashboardRouter.get('/dashboard/units', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let list = await getAllCompanyUnits(manager.companyId)
    if (list.length === 0) {
      await seedDefaultCompanyUnits(manager.companyId)
      list = await getAllCompanyUnits(manager.companyId)
    }
    res.json({ units: list })
  } catch (err) {
    console.error('[dashboard] units error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/units', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { code, label, displayOrder } = req.body as { code?: string; label?: string; displayOrder?: number }
  const trimmedLabel = String(label ?? '').trim()
  if (!trimmedLabel) {
    res.status(400).json({ message: 'Libellé requis' })
    return
  }
  const unitCode = normalizeUnitCode(String(code ?? '').trim() || trimmedLabel)
  try {
    const row = await upsertCompanyUnit(`unit-${randomUUID()}`, {
      companyId: manager.companyId,
      code: unitCode,
      label: trimmedLabel,
      displayOrder: displayOrder ?? 0,
      active: true,
    })
    res.status(201).json({ ok: true, unit: row })
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ message: `L’unité « ${unitCode} » existe déjà` })
      return
    }
    console.error('[dashboard] create unit error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.patch('/dashboard/units/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as { label?: string; displayOrder?: number; active?: boolean }
  try {
    const existing = await getCompanyUnitById(String(id))
    if (!existing || existing.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Unité introuvable' })
      return
    }
    const row = await upsertCompanyUnit(existing.id, {
      companyId: existing.companyId,
      code: existing.code,
      label: data.label != null ? String(data.label).trim() : existing.label,
      displayOrder: data.displayOrder ?? existing.displayOrder,
      active: data.active ?? existing.active,
    })
    res.json({ ok: true, unit: row })
  } catch (err) {
    console.error('[dashboard] update unit error', err)
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

dashboardRouter.get('/dashboard/deliveries/:id/photos', requireManager, async (req, res) => {
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

dashboardRouter.get('/dashboard/photos', requireManager, async (req, res) => {
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

dashboardRouter.get('/dashboard/photos/{*photoId}', requireManager, async (req, res) => {
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

// ── Manager tasks ─────────────────────────────────────────────────────────────

// Le tableau de bord interroge fréquemment cette route ; on limite le scan global
// des livraisons en retard (qui écrit aussi) à une fois par minute par process,
// et on ne laisse jamais son échec casser la liste des tâches.
let lastOverdueSyncAt = 0
const OVERDUE_SYNC_THROTTLE_MS = 60_000

dashboardRouter.get('/dashboard/manager-tasks', requireManager, async (req, res) => {
  try {
    const now = Date.now()
    if (now - lastOverdueSyncAt >= OVERDUE_SYNC_THROTTLE_MS) {
      lastOverdueSyncAt = now
      try {
        await syncOverdueDeliveryTasks()
      } catch (syncErr) {
        console.error('[dashboard] sync livraisons en retard échoué', syncErr)
      }
    }
    const { manager } = req as ManagerRequest
    const status = String(req.query.status ?? 'pending')
    const resolved = status === 'resolved'
    const tasks = resolved
      ? await getManagerTasks(manager.companyId, { resolved: true, limit: 100 })
      : await getPendingManagerTasks(manager.companyId)
    const enriched = await Promise.all(
      tasks.map(async (task) => ({
        ...task,
        canReplan: task.resolved ? false : await canReplanManagerTask(task),
      })),
    )
    res.json({ tasks: enriched, count: enriched.length, status: resolved ? 'resolved' : 'pending' })
  } catch (err) {
    console.error('[dashboard] tasks error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

dashboardRouter.post('/dashboard/manager-tasks/:id/resolve', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const resolved = await resolveManagerTask(String(req.params.id), manager.companyId)
    if (!resolved) {
      res.status(404).json({ message: 'Tâche introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[dashboard] resolve task error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})
