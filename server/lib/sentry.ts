import * as Sentry from '@sentry/node'
import type { Express } from 'express'
import { shouldDropSentryError } from '../../shared/sentryFilters.js'
import { isProduction } from '../config/production.js'

let initialized = false

function sentryEnvironment(): string {
  return (
    process.env.CONTEXT?.trim() ||
    process.env.NETLIFY_CONTEXT?.trim() ||
    (isProduction() ? 'production' : 'development')
  )
}

export function isSentryReady(): boolean {
  return initialized
}

export function initSentry(): void {
  if (initialized) return

  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    tracesSampleRate: isProduction() ? 0.05 : 1.0,
    includeLocalVariables: false,
    sendDefaultPii: false,
    integrations: [Sentry.expressIntegration()],
    beforeSend(event, hint) {
      if (shouldDropSentryError(hint.originalException)) return null
      return event
    },
  })
  initialized = true
  console.info(`[sentry] initialisé (env=${sentryEnvironment()})`)
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      type: 'exception',
      env: isProduction() ? 'production' : 'development',
      error: err instanceof Error ? err.message : String(err),
      ...context,
      ts: new Date().toISOString(),
    }),
  )

  if (!initialized || shouldDropSentryError(err)) return

  Sentry.withScope((scope) => {
    if (context) scope.setContext('extra', context)
    Sentry.captureException(err)
  })
}

/** Journalise les alertes sécurité (spikes login/OTP) — logs uniquement, pas Sentry. */
export function captureSecurityMessage(message: string, context?: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      type: 'security_alert',
      message,
      ...context,
      ts: new Date().toISOString(),
    }),
  )
}

/** Handler Express — à placer après toutes les routes API. */
export function setupExpressSentryErrorHandler(app: Express): void {
  if (!initialized) return
  Sentry.setupExpressErrorHandler(app)
}

/** À appeler en fin de handler serverless pour ne pas perdre les événements. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return
  await Sentry.flush(timeoutMs)
}
