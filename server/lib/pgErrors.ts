/** Erreurs Postgres / Neon / Drizzle liées à une contrainte UNIQUE. */

export function isPgUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>()
  const walk = (value: unknown): boolean => {
    if (value == null || seen.has(value)) return false
    seen.add(value)
    if (typeof value === 'object') {
      const obj = value as { code?: unknown; message?: unknown; cause?: unknown }
      if (obj.code === '23505') return true
      if (typeof obj.message === 'string') {
        const m = obj.message.toLowerCase()
        if (m.includes('unique') || m.includes('duplicate key')) return true
      }
      if (walk(obj.cause)) return true
    } else if (typeof value === 'string') {
      const m = value.toLowerCase()
      if (m.includes('unique') || m.includes('duplicate key')) return true
    }
    return false
  }
  return walk(err)
}

export function isPgMissingRelation(err: unknown): boolean {
  const seen = new Set<unknown>()
  const walk = (value: unknown): boolean => {
    if (value == null || seen.has(value)) return false
    seen.add(value)
    if (typeof value === 'object') {
      const obj = value as { code?: unknown; message?: unknown; cause?: unknown }
      if (obj.code === '42P01') return true
      if (typeof obj.message === 'string' && obj.message.includes('does not exist')) return true
      if (walk(obj.cause)) return true
    }
    return false
  }
  return walk(err)
}
