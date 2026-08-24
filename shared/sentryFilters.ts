/** Messages client / PWA souvent non actionnables (cache, extensions, bots). */
const CLIENT_NOISE_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\d]+ failed/i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Importing a module script failed/i,
]

const TRANSIENT_DB_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'])

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  return ''
}

/** Parcourt error + cause (Drizzle / Neon). */
export function collectErrorMessages(err: unknown, maxDepth = 8): string[] {
  const messages: string[] = []
  const seen = new Set<unknown>()
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < maxDepth && !seen.has(cur)) {
    seen.add(cur)
    const msg = messageOf(cur)
    if (msg) messages.push(msg)
    if (typeof cur === 'object' && cur !== null && 'cause' in cur) {
      cur = (cur as { cause?: unknown }).cause
    } else {
      break
    }
    depth += 1
  }
  return messages
}

export function hasTransientDbCause(err: unknown): boolean {
  const seen = new Set<unknown>()
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < 8 && !seen.has(cur)) {
    seen.add(cur)
    if (typeof cur === 'object' && cur !== null) {
      const code = (cur as { code?: string }).code
      if (code && TRANSIENT_DB_CODES.has(code)) return true
      const msg = messageOf(cur)
      if (msg && [...TRANSIENT_DB_CODES].some((c) => msg.includes(c))) return true
      cur = (cur as { cause?: unknown }).cause
    } else {
      break
    }
    depth += 1
  }
  return false
}

/**
 * Retourne true si l'événement ne doit pas être envoyé à Sentry (bruit / transitoire).
 * Les spikes sécurité sont exclus en amont (logs seulement).
 */
export function shouldDropSentryError(err: unknown): boolean {
  const messages = collectErrorMessages(err)
  const joined = messages.join(' | ')

  if (joined.includes('TraceO Sentry test')) return true
  if (messages.some((m) => m.includes('Maximum call stack size exceeded'))) return true
  if (messages.some((m) => m.startsWith('Spike détecté:'))) return true
  if (messages.some((m) => CLIENT_NOISE_PATTERNS.some((re) => re.test(m)))) return true

  // Timeout / reset DB ponctuel — visible dans les logs Netlify ; évite le spam Sentry.
  if (messages.some((m) => m.startsWith('Failed query:')) && hasTransientDbCause(err)) {
    return true
  }

  return false
}
