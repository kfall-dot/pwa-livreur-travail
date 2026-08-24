import { randomUUID } from 'crypto'
import { DEMO_COMPANY_ID } from '../db/schema.js'

export { DEMO_COMPANY_ID }

/** Slug URL-safe à partir d’un nom d’entreprise. */
export function slugifyCompanyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || `entreprise-${randomUUID().slice(0, 8)}`
}

export function newCompanyId(): string {
  return `co-${randomUUID()}`
}

/** Self-signup : autorisé hors prod, ou si ALLOW_SELF_SIGNUP=true. */
export function isSelfSignupAllowed(): boolean {
  if (process.env.ALLOW_SELF_SIGNUP === 'true' || process.env.ALLOW_SELF_SIGNUP === '1') {
    return true
  }
  const ctx = (process.env.CONTEXT ?? process.env.NODE_ENV ?? '').toLowerCase()
  return ctx !== 'production'
}
