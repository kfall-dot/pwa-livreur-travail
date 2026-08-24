/**
 * Signature électronique simple pour le workflow EB.
 * Port de `docs/signature_simple.py` : PIN + traçabilité (qui, quand, IP, document).
 * Pas de cryptographie lourde — enregistrement irréfutable de l’approbation.
 */
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import type { ProcurementRole } from '../db/schema.js'

export type SignatureRole = 'DT' | 'DAF' | 'PDG' | 'SA'

export type EbApprobation = {
  ebReference: string
  etape: string
  approbateur: string
  role: SignatureRole
  timestamp: string
  ipAddress: string
  codePinVerifie: boolean
  commentaire: string
  contenuHash: string
}

export const SIGNATURE_ETAPES_PAR_ROLE: Record<SignatureRole, string[]> = {
  DT: ['validation_dt'],
  DAF: ['approbation_daf_1', 'validation_daf_2'],
  PDG: ['validation_pdg'],
  SA: ['lancement_achat'],
}

/** PINs de démo — alignés sur UTILISATEURS de signature_simple.py + seed BTP */
const DEMO_PINS: Record<string, { role: SignatureRole; pin: string }> = {
  'mgr-btp-dt': { role: 'DT', pin: '1234' },
  'mgr-btp-daf': { role: 'DAF', pin: '5678' },
  'mgr-btp-sa': { role: 'SA', pin: '0000' },
  'mgr-btp-pdg': { role: 'PDG', pin: '9999' },
}

export function procurementRoleToSignatureRole(role: ProcurementRole | null | undefined): SignatureRole | null {
  if (role === 'technical_director') return 'DT'
  if (role === 'daf') return 'DAF'
  if (role === 'pdg') return 'PDG'
  if (role === 'purchasing') return 'SA'
  return null
}

export function formatSignatureTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function hashEbContenu(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function clientIpFromReq(req: {
  headers: { [key: string]: string | string[] | undefined }
  ip?: string
  socket?: { remoteAddress?: string }
}): string {
  const xf = req.headers['x-forwarded-for']
  const raw = Array.isArray(xf) ? xf[0] : xf
  if (raw?.trim()) return raw.split(',')[0]!.trim()
  return req.ip || req.socket?.remoteAddress || '127.0.0.1'
}

export async function verifySignaturePin(input: {
  managerId: string
  pin: string
  passwordHash: string
}): Promise<boolean> {
  const pin = input.pin.trim()
  if (!pin) return false
  const demo = DEMO_PINS[input.managerId]
  if (demo && demo.pin === pin) return true
  try {
    return await bcrypt.compare(pin, input.passwordHash)
  } catch {
    return false
  }
}

export function assertEtapeForRole(role: SignatureRole, etape: string): string | null {
  if (!SIGNATURE_ETAPES_PAR_ROLE[role].includes(etape)) {
    return `Étape '${etape}' non autorisée pour le rôle ${role}`
  }
  return null
}

export function createApprobation(input: {
  ebReference: string
  etape: string
  approbateur: string
  role: SignatureRole
  ipAddress: string
  contenuHash: string
  commentaire?: string
}): EbApprobation {
  return {
    ebReference: input.ebReference,
    etape: input.etape,
    approbateur: input.approbateur,
    role: input.role,
    timestamp: formatSignatureTimestamp(),
    ipAddress: input.ipAddress,
    codePinVerifie: true,
    commentaire: input.commentaire ?? '',
    contenuHash: input.contenuHash,
  }
}

export function formatSignatureBlock(a: EbApprobation | null | undefined): string {
  if (!a?.codePinVerifie) return ''
  const lines = [`${a.approbateur} (${a.role})`, a.timestamp, 'PIN vérifié']
  if (a.commentaire) lines.push(a.commentaire)
  return lines.join('\n')
}
