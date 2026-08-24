import { captureSecurityMessage } from './sentry.js'

export type SecuritySpikeMetric = 'login_failures' | 'otp_failures'

interface SpikeConfig {
  threshold: number
  windowMs: number
  cooldownMs: number
}

const CONFIG: Record<SecuritySpikeMetric, SpikeConfig> = {
  login_failures: { threshold: 25, windowMs: 5 * 60_000, cooldownMs: 15 * 60_000 },
  otp_failures: { threshold: 20, windowMs: 5 * 60_000, cooldownMs: 15 * 60_000 },
}

type WindowState = { count: number; resetAt: number; lastAlertAt: number }

const windows = new Map<SecuritySpikeMetric, WindowState>()

/** Détecte les pics d’échecs auth/OTP et émet une alerte structurée (logs / Sentry). */
export function recordSecuritySpike(metric: SecuritySpikeMetric): void {
  const cfg = CONFIG[metric]
  const now = Date.now()
  let state = windows.get(metric)
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + cfg.windowMs, lastAlertAt: 0 }
    windows.set(metric, state)
  }

  state.count += 1
  if (state.count < cfg.threshold) return
  if (now - state.lastAlertAt < cfg.cooldownMs) return

  state.lastAlertAt = now
  captureSecurityMessage(`Spike détecté: ${metric}`, {
    metric,
    count: state.count,
    windowMs: cfg.windowMs,
    threshold: cfg.threshold,
  })
}

/** Réinitialise l’état (tests). */
export function resetSecuritySpikeMonitor(): void {
  windows.clear()
}
