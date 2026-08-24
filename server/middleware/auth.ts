import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../config/jwt.js'

export interface AuthPayload {
  sub: string
  phone: string
  /** Isolément multi-entreprise (présent après login post-migration). */
  companyId?: string
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' })
}

export function verifyAccessToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthPayload
  } catch {
    return null
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token manquant' })
    return
  }
  const token = header.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) {
    res.status(401).json({ message: 'Token invalide ou expiré' })
    return
  }
  ;(req as Request & { user: AuthPayload }).user = payload
  next()
}
