import { timingSafeEqual } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { requireManager } from './managerAuth.js'

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Jeton d’automation (E2E, scripts) — header X-Admin-Token ou Bearer égal à ADMIN_API_TOKEN. */
function adminApiTokenAccepted(req: Request): boolean {
  const configured = process.env.ADMIN_API_TOKEN?.trim()
  if (!configured) return false

  const headerRaw = req.headers['x-admin-token']
  const fromHeader = typeof headerRaw === 'string' ? headerRaw.trim() : ''
  const auth = req.headers.authorization ?? ''
  const fromBearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const provided = fromHeader || fromBearer
  if (!provided) return false
  return tokensEqual(provided, configured)
}

/**
 * Protège /admin/reset et /admin/seed :
 * - ADMIN_API_TOKEN (header X-Admin-Token ou Bearer), ou
 * - session manager (cookie / Bearer JWT).
 */
export function requireAdminAction(req: Request, res: Response, next: NextFunction): void {
  if (adminApiTokenAccepted(req)) {
    next()
    return
  }
  requireManager(req, res, next)
}
