import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../config/jwt.js'
import { isProduction } from '../config/production.js'
import type { ProcurementRole } from '../db/schema.js'

export const MANAGER_COOKIE = 'manager_token'
const COOKIE_MAX_AGE_MS = 8 * 3600_000

export type ManagerAccessRole = 'admin' | 'manager'

export type ManagerPayload = {
  sub: string
  email: string
  role: 'manager'
  companyId: string
  managerRole: ManagerAccessRole
  procurementRole: ProcurementRole | null
}

export type ManagerRequest = Request & { manager: ManagerPayload }

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

export function signManagerToken(
  managerId: string,
  email: string,
  companyId: string,
  managerRole: ManagerAccessRole = 'manager',
  procurementRole: ProcurementRole | null = null,
): string {
  return jwt.sign(
    { sub: managerId, email, role: 'manager', companyId, managerRole, procurementRole },
    getJwtSecret(),
    { expiresIn: '8h' },
  )
}

function extractManagerToken(req: Request): string | null {
  const fromCookie = readCookie(req, MANAGER_COOKIE)
  if (fromCookie) return fromCookie

  const auth = req.headers.authorization ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export function readManagerToken(req: Request): string | null {
  return extractManagerToken(req)
}

export function setManagerAuthCookie(res: Response, token: string): void {
  res.cookie(MANAGER_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  })
}

export function clearManagerAuthCookie(res: Response): void {
  res.clearCookie(MANAGER_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
  })
}

const TOTP_PENDING_TTL = '5m'

export function signTotpPendingToken(managerId: string): string {
  return jwt.sign({ sub: managerId, purpose: 'totp_pending' }, getJwtSecret(), {
    expiresIn: TOTP_PENDING_TTL,
  })
}

export function verifyTotpPendingToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; purpose?: string }
    if (payload.purpose !== 'totp_pending' || !payload.sub) return null
    return payload.sub
  } catch {
    return null
  }
}

export function requireManager(req: Request, res: Response, next: NextFunction): void {
  const token = extractManagerToken(req)
  if (!token) {
    res.status(401).json({ message: 'Token manquant' })
    return
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      sub?: string
      email?: string
      role?: string
      companyId?: string
      managerRole?: ManagerAccessRole
      procurementRole?: ProcurementRole | null
    }
    if (payload.role !== 'manager' || !payload.sub || !payload.email || !payload.companyId) {
      res.status(403).json({
        message: !payload.companyId
          ? 'Session obsolète — reconnectez-vous (multi-entreprise)'
          : 'Accès réservé aux gestionnaires',
      })
      return
    }
    const managerRole: ManagerAccessRole =
      payload.managerRole === 'admin' || payload.managerRole === 'manager'
        ? payload.managerRole
        : 'admin' // JWT antérieur à la migration rôles — les comptes existants étaient tous admins
    ;(req as ManagerRequest).manager = {
      sub: payload.sub,
      email: payload.email,
      role: 'manager',
      companyId: payload.companyId,
      managerRole,
      procurementRole: payload.procurementRole ?? null,
    }
    next()
  } catch {
    res.status(401).json({ message: 'Token invalide' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireManager(req, res, () => {
    const { manager } = req as ManagerRequest
    if (manager.managerRole !== 'admin') {
      res.status(403).json({ message: 'Accès réservé aux administrateurs' })
      return
    }
    next()
  })
}
