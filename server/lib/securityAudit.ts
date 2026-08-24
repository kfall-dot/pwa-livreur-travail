import { randomUUID } from 'crypto'
import type { Request } from 'express'
import { db } from '../db/index.js'
import { securityAuditEvents } from '../db/schema.js'
import { recordSecuritySpike } from './securitySpikeMonitor.js'

export type SecurityAuditAction =
  | 'driver.login.success'
  | 'driver.login.failure'
  | 'driver.login.locked'
  | 'manager.login.success'
  | 'manager.login.failure'
  | 'manager.totp.failure'
  | 'manager.totp.enabled'
  | 'manager.totp.disabled'
  | 'manager.password.reset'
  | 'manager.invite.accepted'
  | 'manager.role.changed'
  | 'manager.deleted'
  | 'delivery.otp.failure'
  | 'delivery.otp.manager_resend'
  | 'delivery.otp.manager_bypass'
  | 'manager.driver.unlock'
  | 'admin.reset'
  | 'admin.reset.refused'
  | 'admin.seed'
  | 'admin.seed-btp'
  | 'demo.enter.driver'
  | 'demo.enter.manager'

export interface SecurityAuditInput {
  action: SecurityAuditAction
  actorType: 'driver' | 'manager' | 'system'
  actorId?: string | null
  companyId?: string | null
  metadata?: Record<string, unknown>
  req?: Request
}

function clientIp(req?: Request): string | undefined {
  if (!req) return undefined
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim()
  return req.socket.remoteAddress ?? undefined
}

/** Journalise un événement de sécurité (console structurée + persistance best-effort). */
export function logSecurityEvent(input: SecurityAuditInput): void {
  const row = {
    id: `sec-${randomUUID()}`,
    companyId: input.companyId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    metadata: input.metadata ?? null,
    ip: clientIp(input.req) ?? null,
  }

  console.info(
    JSON.stringify({
      type: 'security_audit',
      ts: new Date().toISOString(),
      ...row,
    }),
  )

  if (
    input.action === 'driver.login.failure' ||
    input.action === 'driver.login.locked' ||
    input.action === 'manager.login.failure' ||
    input.action === 'manager.totp.failure'
  ) {
    recordSecuritySpike('login_failures')
  }
  if (input.action === 'delivery.otp.failure') {
    recordSecuritySpike('otp_failures')
  }

  void db
    .insert(securityAuditEvents)
    .values({
      id: row.id,
      companyId: row.companyId,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      metadata: row.metadata,
      ip: row.ip,
    })
    .catch((err: unknown) => {
      console.warn('[security-audit] persist failed', err instanceof Error ? err.message : String(err))
    })
}
