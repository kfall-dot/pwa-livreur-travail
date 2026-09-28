// Gestionnaires & invitations (admin) — CRUD, invites, forgot/reset
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { isValidContactEmail } from '../../../shared/email.js'
import { publicBaseUrl } from '../../config/public.js'
import { countAdmins, countManagers, createManager, createManagerInvite, createManagerPasswordReset, deleteManager, deleteManagerInvite, getAllManagers, getCompanyById, getManagerByEmail, getManagerById, getManagerInviteById, getManagerInviteByTokenHash, getManagerPasswordResetByTokenHash, getPendingManagerInvites, markManagerInviteAccepted, markManagerPasswordResetUsed, updateManager } from '../../db/queries.js'
import { type ProcurementRole } from '../../db/schema.js'
import { isPgUniqueViolation } from '../../lib/pgErrors.js'
import { generateSecureToken, hashSecureToken } from '../../lib/secureToken.js'
import { logSecurityEvent } from '../../lib/securityAudit.js'
import { requireAdmin, requireManager, setManagerAuthCookie, signManagerToken, type ManagerRequest } from '../../middleware/managerAuth.js'
import { rateLimitByBodyField } from '../../middleware/rateLimit.js'
import { sendManagerInviteEmail, sendManagerPasswordResetEmail } from '../../services/managerEmails.js'
import { randomUUID } from 'crypto'

export const managersRoutes = Router()

function isValidManagerEmail(email: string): boolean {
  return isValidContactEmail(email)
}

// ── Managers (collègues gestionnaires) — admin uniquement ─────────────────────

// Liste des gestionnaires : visible par toute l'équipe (lecture seule) —
// l'invitation et la modification restent réservées aux administrateurs.
managersRoutes.get('/dashboard/managers', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const rows = await getAllManagers(manager.companyId)
    res.json({ managers: rows })
  } catch (err) {
    console.error('[dashboard] managers list error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

managersRoutes.get('/dashboard/managers/invites', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const invites = await getPendingManagerInvites(manager.companyId)
    res.json({ invites })
  } catch (err) {
    console.error('[dashboard] manager invites list error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

managersRoutes.post(
  '/dashboard/managers/invite',
  requireAdmin,
  rateLimitByBodyField('email', 10, 60 * 60_000, 'invite-manager'),
  async (req, res) => {
    const { manager } = req as ManagerRequest
    const { name, email } = req.body as { name?: string; email?: string }
    const procurementRoleRaw = typeof (req.body as { procurementRole?: string })?.procurementRole === 'string'
      ? (req.body as { procurementRole: string }).procurementRole.trim()
      : ''
    const validRoles = ['site_controller', 'technical_director', 'daf', 'purchasing', 'pdg', 'controle_gestion', 'site_manager', 'accountant']
    const procurementRole = validRoles.includes(procurementRoleRaw) ? procurementRoleRaw : null
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ message: 'Nom et e-mail sont requis' })
      return
    }
    if (!procurementRole) {
      res.status(400).json({ message: "L'espace de travail (rôle) est obligatoire" })
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
        procurementRole,
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

managersRoutes.post(
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
        // I93 — le renvoi conserve l'espace de travail choisi à l'invitation :
        // avant, l'invitation recréée perdait procurement_role (la ligne en
        // attente retombait sur « Invitation en attente » et le compte créé à
        // l'acceptation n'avait plus de rôle achats).
        procurementRole: invite.procurementRole ?? null,
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

managersRoutes.delete('/dashboard/managers/invites/:id', requireAdmin, async (req, res) => {
  const { manager } = req as ManagerRequest
  const ok = await deleteManagerInvite(String(req.params.id), manager.companyId)
  if (!ok) {
    res.status(404).json({ message: 'Invitation introuvable' })
    return
  }
  res.json({ ok: true })
})

managersRoutes.post(
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
        (invite.procurementRole as import('../../db/schema.js').ProcurementRole | null) ?? null,
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
      const accessToken = signManagerToken(
        created.id,
        created.email,
        created.companyId,
        created.role,
        created.procurementRole,
      )
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

managersRoutes.post(
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

managersRoutes.post(
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

managersRoutes.patch('/dashboard/managers/:id', requireAdmin, async (req, res) => {
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
        'accountant',
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

managersRoutes.delete('/dashboard/managers/:id', requireAdmin, async (req, res) => {
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
