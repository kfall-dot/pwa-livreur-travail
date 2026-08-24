import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Certificate } from '../db/schema.js'
import { getJwtSecret } from '../config/jwt.js'
import { getDeliveryStopForCompany, getStopWithDriverContext } from '../db/queries.js'
import { verifyAccessToken } from './auth.js'
import { readManagerToken } from './managerAuth.js'

const CERT_ACCESS_TTL = '90d'

export function signCertificateAccessToken(receiptId: string): string {
  return jwt.sign({ purpose: 'certificate', receiptId }, getJwtSecret(), { expiresIn: CERT_ACCESS_TTL })
}

export function verifyCertificateAccessToken(token: string, receiptId: string): boolean {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { purpose?: string; receiptId?: string }
    return payload.purpose === 'certificate' && payload.receiptId === receiptId
  } catch {
    return false
  }
}

type SessionAuth =
  | { kind: 'driver'; driverId: string }
  | { kind: 'manager'; companyId: string }

function readManagerCompany(token: string): string | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { role?: string; companyId?: string }
    if (payload.role === 'manager' && payload.companyId) return payload.companyId
  } catch {
    /* ignore */
  }
  return null
}

function parseSessionAuth(req: Request): SessionAuth | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    const driver = verifyAccessToken(token)
    if (driver) return { kind: 'driver', driverId: driver.sub }
    const companyId = readManagerCompany(token)
    if (companyId) return { kind: 'manager', companyId }
  }

  const managerToken = readManagerToken(req)
  if (managerToken) {
    const companyId = readManagerCompany(managerToken)
    if (companyId) return { kind: 'manager', companyId }
  }

  return null
}

export async function authorizeCertificateAccess(
  req: Request,
  res: Response,
  cert: Certificate
): Promise<boolean> {
  const queryAccess = typeof req.query.access === 'string' ? req.query.access : ''
  if (queryAccess && verifyCertificateAccessToken(queryAccess, cert.receiptId)) {
    return true
  }

  const session = parseSessionAuth(req)
  if (!session) {
    res.status(401).json({ message: 'Accès non autorisé au certificat' })
    return false
  }

  if (session.kind === 'manager') {
    const owned = await getDeliveryStopForCompany(cert.deliveryId, session.companyId)
    if (!owned) {
      res.status(403).json({ message: 'Accès non autorisé à ce certificat' })
      return false
    }
    return true
  }

  const stop = await getStopWithDriverContext(cert.deliveryId)
  if (!stop || stop.driverId !== session.driverId) {
    res.status(403).json({ message: 'Accès non autorisé à ce certificat' })
    return false
  }
  return true
}
