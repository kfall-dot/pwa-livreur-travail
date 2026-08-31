import { Router } from 'express'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import type { Request } from 'express'
import { signAccessToken, requireAuth, type AuthPayload } from '../middleware/auth.js'
import { allowTestBypass, allowDevDuplicateDriverPhone } from '../config/production.js'
import { rateLimitByBodyField, rateLimitByIp } from '../middleware/rateLimit.js'
import {
  assertDriverLoginNotLocked,
  clearDriverLoginFailures,
  recordDriverLoginFailure,
} from '../lib/driverLoginLockout.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { captureException } from '../lib/sentry.js'
import {
  createSession,
  getDriverByPhone,
  getDriversByPhone,
  getDriverById,
  getSessionByRefreshToken,
  rotateSession,
} from '../db/queries.js'
import { normalizeDriverPhone } from '../../shared/phone.js'

export const authRouter = Router()

authRouter.post(
  '/login-driver',
  rateLimitByBodyField('phone', 10, 15 * 60_000, 'login-driver'),
  async (req, res) => {
  const { phone, pin } = req.body as { phone?: string; pin?: string }
  if (!phone || !pin) {
    res.status(400).json({ message: 'Téléphone et PIN requis' })
    return
  }
  try {
    const normalized = normalizeDriverPhone(phone)
    const lockMsg = await assertDriverLoginNotLocked(normalized)
    if (lockMsg) {
      logSecurityEvent({
        action: 'driver.login.locked',
        actorType: 'driver',
        metadata: { phone: normalized },
        req,
      })
      res.status(429).json({ message: lockMsg })
      return
    }

    const candidates = allowDevDuplicateDriverPhone()
      ? await getDriversByPhone(normalized)
      : [await getDriverByPhone(normalized)].filter((d): d is NonNullable<typeof d> => d != null)
    const active = candidates.filter((d) => d.status === 'active')
    if (active.length === 0) {
      await recordDriverLoginFailure(normalized)
      logSecurityEvent({
        action: 'driver.login.failure',
        actorType: 'driver',
        metadata: { phone: normalized, reason: 'unknown_or_inactive' },
        req,
      })
      res.status(401).json({ message: 'Téléphone ou PIN incorrect' })
      return
    }
    let driver = active[0]!
    let pinOk = false
    const pinMatches: NonNullable<(typeof active)[number]>[] = []
    for (const candidate of active) {
      const ok = candidate.pinHash
        ? await bcrypt.compare(pin, candidate.pinHash)
        : allowTestBypass() && pin === (process.env.DRIVER_PIN ?? '1234')
      if (ok) {
        pinMatches.push(candidate)
        break
      }
    }
    if (pinMatches.length === 0) {
      await recordDriverLoginFailure(normalized)
      logSecurityEvent({
        action: 'driver.login.failure',
        actorType: 'driver',
        actorId: active[0]?.id,
        companyId: active[0]?.companyId,
        metadata: { phone: normalized },
        req,
      })
      res.status(401).json({ message: 'Téléphone ou PIN incorrect' })
      return
    }
    // Doublons de fiches (même téléphone) : la fiche avec la tournée la plus
    // récente est la fiche « active » utilisée par la planification.
    let driver = pinMatches[0]!
    if (pinMatches.length > 1) {
      const latestId = await findDriverIdWithLatestTour(pinMatches.map((d) => d.id))
      if (latestId) driver = pinMatches.find((d) => d.id === latestId) ?? driver
    }
    const pinOk = true

    await clearDriverLoginFailures(normalized)
    logSecurityEvent({
      action: 'driver.login.success',
      actorType: 'driver',
      actorId: driver.id,
      companyId: driver.companyId,
      req,
    })

    const refreshToken = randomUUID()
    const accessToken = signAccessToken({
      sub: driver.id,
      phone: driver.phone,
      companyId: driver.companyId,
    })
    const expiresAt = new Date(Date.now() + 8 * 3600_000)

    await createSession(driver.id, accessToken, refreshToken, expiresAt)

    res.json({
      accessToken,
      refreshToken,
      expiresIn: 8 * 3600,
      driver: {
        id: driver.id,
        phone: driver.phone,
        name: driver.name,
        companyId: driver.companyId,
      },
    })
  } catch (err) {
    captureException(err, { route: 'login-driver' })
    console.error('[auth] login error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
  }
)

authRouter.get('/driver/me', requireAuth, async (req, res) => {
  try {
    const { sub } = (req as Request & { user: AuthPayload }).user
    const driver = await getDriverById(sub)
    if (!driver || driver.status !== 'active') {
      res.status(401).json({ message: 'Livreur introuvable' })
      return
    }
    res.json({ driver: { id: driver.id, phone: driver.phone, name: driver.name } })
  } catch (err) {
    console.error('[auth] me error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

authRouter.post('/refresh', rateLimitByIp(60, 15 * 60_000, 'refresh-token'), async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string }
  if (!refreshToken) {
    res.status(400).json({ message: 'refreshToken requis' })
    return
  }
  try {
    const session = await getSessionByRefreshToken(refreshToken)
    if (!session) {
      res.status(401).json({ message: 'Refresh token invalide' })
      return
    }
    const driver = await getDriverById(session.driverId)
    if (!driver) {
      res.status(401).json({ message: 'Livreur introuvable' })
      return
    }

    const newRefreshToken = randomUUID()
    const newAccessToken = signAccessToken({
      sub: driver.id,
      phone: driver.phone,
      companyId: driver.companyId,
    })
    const newExpiresAt = new Date(Date.now() + 3600_000)

    const updated = await rotateSession(refreshToken, newAccessToken, newRefreshToken, newExpiresAt)
    if (!updated) {
      res.status(401).json({ message: 'Refresh token invalide' })
      return
    }

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: 3600 })
  } catch (err) {
    console.error('[auth] refresh error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})
