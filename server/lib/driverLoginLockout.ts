import {
  clearRateLimitKey,
  isRateLimitBlocked,
  recordFailureHit,
} from '../middleware/rateLimit.js'

const MAX_FAILURES = 5
const LOCKOUT_MS = 30 * 60_000
const KEY_PREFIX = 'driver-pin-fail:'

function keyForPhone(phone: string): string {
  return `${KEY_PREFIX}${phone.trim().toLowerCase()}`
}

export async function assertDriverLoginNotLocked(phone: string): Promise<string | null> {
  const blocked = await isRateLimitBlocked(keyForPhone(phone), MAX_FAILURES)
  if (!blocked.blocked) return null
  const min = Math.max(1, Math.ceil(blocked.retryAfterSec / 60))
  return `Compte temporairement verrouillé après trop de tentatives. Réessayez dans ${min} min.`
}

export async function recordDriverLoginFailure(phone: string): Promise<void> {
  await recordFailureHit(keyForPhone(phone), MAX_FAILURES, LOCKOUT_MS)
}

export async function clearDriverLoginFailures(phone: string): Promise<void> {
  const normalized = phone.trim().toLowerCase()
  await clearRateLimitKey(keyForPhone(phone))
  await clearRateLimitKey(`login-driver:${normalized}`)
}
