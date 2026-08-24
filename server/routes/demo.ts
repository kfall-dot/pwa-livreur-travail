import { Router } from 'express'
import { randomUUID } from 'crypto'
import { signAccessToken } from '../middleware/auth.js'
import { setManagerAuthCookie, signManagerToken } from '../middleware/managerAuth.js'
import { rateLimitByIp } from '../middleware/rateLimit.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { isPublicDemoEnabled } from '../lib/publicDemo.js'
import { captureException } from '../lib/sentry.js'
import { createSession, getDriverById, getManagerById, getStopsForDriverOnDate } from '../db/queries.js'
import { DEMO, ensureDemoEnvironment } from '../db/seed.js'
import { DEMO_COMPANY_ID } from '../db/schema.js'

export const demoRouter = Router()

const DRIVER_PERSONAS = {
  abidjan: DEMO.DRIVER2_ID,
  paris: DEMO.DRIVER_ID,
} as const

type DriverPersona = keyof typeof DRIVER_PERSONAS

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

demoRouter.post('/enter', rateLimitByIp(40, 15 * 60_000, 'demo-enter'), async (req, res) => {
  if (!isPublicDemoEnabled()) {
    res.status(404).json({ message: 'Démo non disponible' })
    return
  }

  const { role, persona } = req.body as { role?: string; persona?: string }
  if (role !== 'driver' && role !== 'manager') {
    res.status(400).json({ message: 'Rôle démo invalide' })
    return
  }

  try {
    try {
      await ensureDemoEnvironment()
    } catch (seedErr) {
      captureException(seedErr, { route: 'demo-enter-seed' })
      console.error('[demo] ensureDemoEnvironment failed (vérifie si données partielles)', seedErr)
    }

    if (role === 'driver') {
      const personaKey = (persona === 'paris' ? 'paris' : 'abidjan') as DriverPersona
      const driverId = DRIVER_PERSONAS[personaKey]
      const driver = await getDriverById(driverId)
      if (!driver || driver.status !== 'active' || driver.companyId !== DEMO_COMPANY_ID) {
        res.status(503).json({ message: 'Compte démo livreur indisponible' })
        return
      }

      const { stops } = await getStopsForDriverOnDate(driverId, todayIso())
      if (stops.length === 0) {
        res.status(503).json({
          message: 'Aucune livraison démo pour aujourd’hui — réessayez ou contactez le support.',
        })
        return
      }

      const refreshToken = randomUUID()
      const accessToken = signAccessToken({
        sub: driver.id,
        phone: driver.phone,
        companyId: driver.companyId,
      })
      const expiresAt = new Date(Date.now() + 8 * 3600_000)
      await createSession(driver.id, accessToken, refreshToken, expiresAt)

      logSecurityEvent({
        action: 'demo.enter.driver',
        actorType: 'driver',
        actorId: driver.id,
        companyId: driver.companyId,
        metadata: { persona: personaKey },
        req,
      })

      res.json({
        accessToken,
        refreshToken,
        expiresIn: 8 * 3600,
        redirect: '/',
        driver: {
          id: driver.id,
          phone: driver.phone,
          name: driver.name,
          companyId: driver.companyId,
        },
        demo: { persona: personaKey, label: driver.name },
      })
      return
    }

    const manager = await getManagerById(DEMO.MANAGER_ID)
    if (!manager || manager.companyId !== DEMO_COMPANY_ID) {
      res.status(503).json({ message: 'Compte démo gestionnaire indisponible' })
      return
    }

    const accessToken = signManagerToken(
      manager.id,
      manager.email,
      manager.companyId,
      manager.role === 'admin' ? 'admin' : 'manager',
    )
    setManagerAuthCookie(res, accessToken)

    logSecurityEvent({
      action: 'demo.enter.manager',
      actorType: 'manager',
      actorId: manager.id,
      companyId: manager.companyId,
      req,
    })

    res.json({
      redirect: '/manager?tab=suivi',
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        companyId: manager.companyId,
        role: manager.role,
      },
      demo: { label: manager.name },
    })
  } catch (err) {
    captureException(err, { route: 'demo-enter' })
    console.error('[demo] enter error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})
