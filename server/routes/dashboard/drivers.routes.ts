// Livreurs — CRUD + deverrouillage login
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { isValidDriverPhone, normalizeDriverPhone } from '../../../shared/phone.js'
import { allowDevDuplicateDriverPhone } from '../../config/production.js'
import { createDriver, createReassignTourTask, findFutureToursForDriver, getAllDrivers, getDriverById, getDriverByPhone, relaxDriversPhoneUniqueForDev, updateDriver } from '../../db/queries.js'
import { clearDriverLoginFailures } from '../../lib/driverLoginLockout.js'
import { isPgUniqueViolation } from '../../lib/pgErrors.js'
import { logSecurityEvent } from '../../lib/securityAudit.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { clearRateLimitKey } from '../../middleware/rateLimit.js'
import { randomUUID } from 'crypto'

export const driversRoutes = Router()

// ── Drivers ───────────────────────────────────────────────────────────────────

driversRoutes.get('/dashboard/drivers', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const driverList = await getAllDrivers(manager.companyId)
    res.json({ drivers: driverList.map((d) => ({ id: d.id, name: d.name, phone: d.phone, status: d.status })) })
  } catch (err) {
    console.error('[dashboard] drivers error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

driversRoutes.post('/dashboard/drivers', requireManager, async (req, res) => {
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

driversRoutes.patch('/dashboard/drivers/:id', requireManager, async (req, res) => {
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
driversRoutes.post('/dashboard/drivers/:id/clear-login-lock', requireManager, async (req, res) => {
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
