import { isProduction } from './production.js'

export type SecurityIssueLevel = 'error' | 'warn'

export interface SecurityIssue {
  level: SecurityIssueLevel
  code: string
  message: string
}

function truthy(v: string | undefined): boolean {
  return v === 'true' || v === '1'
}

function provider(name: string | undefined): string {
  return (name ?? 'mock').trim().toLowerCase()
}

/** Audit des variables d'environnement sensibles (prod et local). */
export function auditProductionEnvironment(): SecurityIssue[] {
  const issues: SecurityIssue[] = []
  const prod = isProduction()

  if (prod) {
    if (!process.env.JWT_SECRET?.trim()) {
      issues.push({
        level: 'error',
        code: 'JWT_SECRET_MISSING',
        message: 'JWT_SECRET obligatoire en production.',
      })
    }

    if (provider(process.env.SMS_PROVIDER) === 'mock') {
      issues.push({
        level: 'error',
        code: 'SMS_MOCK',
        message: 'SMS_PROVIDER=mock interdit en production — configurez textbee ou twilio.',
      })
    }

    if (provider(process.env.EMAIL_PROVIDER) === 'mock') {
      issues.push({
        level: 'warn',
        code: 'EMAIL_MOCK',
        message: 'EMAIL_PROVIDER=mock en production — les e-mails de confirmation ne partent pas.',
      })
    }

    if (truthy(process.env.OTP_CODE)) {
      issues.push({
        level: 'error',
        code: 'OTP_CODE',
        message: 'OTP_CODE interdit en production.',
      })
    }

    if (truthy(process.env.DRIVER_PIN)) {
      issues.push({
        level: 'error',
        code: 'DRIVER_PIN',
        message: 'DRIVER_PIN interdit en production.',
      })
    }

    if (truthy(process.env.GEOFENCE_BYPASS) && !truthy(process.env.ALLOW_GEOFENCE_BYPASS)) {
      issues.push({
        level: 'error',
        code: 'GEOFENCE_BYPASS',
        message:
          'GEOFENCE_BYPASS interdit en production sans ALLOW_GEOFENCE_BYPASS=true explicite.',
      })
    }

    if (truthy(process.env.ALLOW_SEED) || truthy(process.env.ALLOW_RESET)) {
      if (!process.env.ADMIN_API_TOKEN?.trim()) {
        issues.push({
          level: 'warn',
          code: 'ADMIN_FLAGS_NO_TOKEN',
          message: 'ALLOW_SEED/ALLOW_RESET actifs sans ADMIN_API_TOKEN — limitez l’accès admin.',
        })
      }
    }

    if (truthy(process.env.SMS_OTP_FAIL_OPEN)) {
      issues.push({
        level: 'warn',
        code: 'SMS_OTP_FAIL_OPEN',
        message: 'SMS_OTP_FAIL_OPEN actif — livraison possible sans SMS OTP.',
      })
    }

    if (truthy(process.env.ALLOW_SELF_SIGNUP)) {
      issues.push({
        level: 'warn',
        code: 'SELF_SIGNUP',
        message: 'ALLOW_SELF_SIGNUP actif — inscription publique ouverte.',
      })
    }

    if (!process.env.PUBLIC_BASE_URL?.trim()) {
      issues.push({
        level: 'warn',
        code: 'PUBLIC_BASE_URL',
        message: 'PUBLIC_BASE_URL absent — CORS et liens certificat peuvent être incorrects.',
      })
    }
  }

  return issues
}

/** Bloque le démarrage en production si une erreur critique est détectée. */
export function validateProductionSecurityAtStartup(): void {
  const issues = auditProductionEnvironment()
  for (const issue of issues) {
    const line = `[security-audit] ${issue.code}: ${issue.message}`
    if (issue.level === 'error') {
      if (isProduction()) throw new Error(line)
      console.error(line)
    } else {
      console.warn(line)
    }
  }
}

export function securityAuditSnapshot(): {
  production: boolean
  issues: SecurityIssue[]
} {
  return { production: isProduction(), issues: auditProductionEnvironment() }
}
