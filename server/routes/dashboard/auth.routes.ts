// Auth gestionnaire — login, TOTP, mise en service (register-company), logout, /auth/me
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { isProduction } from '../../config/production.js'
import { createCompanyWithManager, getCompanyBySlug, getManagerByEmail, getManagerById, seedDefaultCompanyUnits, setManagerTotp, upsertManager } from '../../db/queries.js'
import { DEMO } from '../../db/seed.js'
import { isBtpPilotLoginEmail, seedBtpPilotData } from '../../db/seedBtpPilot.js'
import { logSecurityEvent } from '../../lib/securityAudit.js'
import { isSelfSignupAllowed, newCompanyId, slugifyCompanyName } from '../../lib/tenant.js'
import { generateTotpSecret, totpOtpAuthUri, verifyTotpCode } from '../../lib/totp.js'
import { parseBody } from '../../lib/validation.js'
import { clearManagerAuthCookie, requireAdmin, requireManager, setManagerAuthCookie, signManagerToken, signTotpPendingToken, type ManagerRequest, verifyTotpPendingToken } from '../../middleware/managerAuth.js'
import { rateLimitByBodyField, rateLimitByIp } from '../../middleware/rateLimit.js'
import { randomUUID } from 'crypto'
import { z } from 'zod'

export const authRoutes = Router()

const registerCompanySchema = z.object({
  companyName: z.string().trim().min(1, 'Nom d’entreprise requis'),
  managerName: z.string().trim().min(1, 'Nom du gestionnaire requis'),
  email: z.string().trim().email('E-mail invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
})

function canAutoProvisionBtpPilot(): boolean {
  if (isProduction()) return false
  return (
    process.env.ALLOW_SEED === 'true' ||
    process.env.NETLIFY_DEV === 'true' ||
    process.env.NETLIFY_DEV === '1'
  )
}

// ── Auth ──────────────────────────────────────────────────────────────────────

authRoutes.post(
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

authRoutes.post('/auth/totp-verify-login', rateLimitByIp(20, 15 * 60_000, 'totp-verify-login'), async (req, res) => {
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

authRoutes.post('/auth/totp/setup', requireManager, requireAdmin, async (req, res) => {
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

authRoutes.post('/auth/totp/enable', requireManager, requireAdmin, async (req, res) => {
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

authRoutes.post('/auth/totp/disable', requireManager, requireAdmin, async (req, res) => {
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
authRoutes.post(
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

authRoutes.post('/auth/logout-dashboard', (_req, res) => {
  clearManagerAuthCookie(res)
  res.json({ ok: true })
})

authRoutes.get('/auth/me', requireManager, async (req, res) => {
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
