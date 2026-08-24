import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'

const FINGERPRINT_CANDIDATES = [
  path.join(process.cwd(), 'config/production-db.fingerprint'),
  path.join(process.cwd(), '../config/production-db.fingerprint'),
]

/** SHA-256 (16 hex) du hostname Postgres — identifie la base pilote sans exposer l’URL. */
export function databaseHostFingerprint(connectionUrl: string): string {
  const raw = connectionUrl.trim()
  if (!raw) return ''
  try {
    const normalized = raw.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:')
    const host = new URL(normalized).hostname.trim().toLowerCase()
    if (!host) return ''
    return createHash('sha256').update(host).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

function readCommittedProductionFingerprint(): string | null {
  for (const file of FINGERPRINT_CANDIDATES) {
    try {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#'))
      if (line) return line
    } catch {
      // try next candidate
    }
  }
  return null
}

function configuredProductionFingerprints(): Set<string> {
  const fps = new Set<string>()
  const fromEnv = process.env.PRODUCTION_DB_FINGERPRINT?.trim()
  if (fromEnv) fps.add(fromEnv)
  const fromFile = readCommittedProductionFingerprint()
  if (fromFile) fps.add(fromFile)
  return fps
}

export function activeDatabaseUrl(): string {
  return (process.env.E2E_DATABASE_URL ?? process.env.NETLIFY_DB_URL ?? '').trim()
}

/** True si l’URL courante correspond à la base pilote (fichier + env). */
export function isProtectedProductionDatabase(url = activeDatabaseUrl()): boolean {
  if (!url) return false
  const fp = databaseHostFingerprint(url)
  if (!fp) return false
  return configuredProductionFingerprints().has(fp)
}

export class DatabaseProtectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseProtectionError'
  }
}

/**
 * Refuse ALLOW_WIPE_USERS sur la base pilote (même depuis netlify dev local ou CI).
 * Casse verre : ALLOW_PRODUCTION_DB_WIPE=true (jamais en prod Netlify par défaut).
 */
export function assertDatabaseWipeAllowed(): void {
  const wipe =
    process.env.ALLOW_WIPE_USERS === 'true' || process.env.ALLOW_WIPE_USERS === '1'
  if (!wipe) return

  if (!isProtectedProductionDatabase()) return

  const breakGlass =
    process.env.ALLOW_PRODUCTION_DB_WIPE === 'true' ||
    process.env.ALLOW_PRODUCTION_DB_WIPE === '1'
  if (breakGlass) {
    console.warn('[database] ALLOW_PRODUCTION_DB_WIPE actif — wipe complet autorisé sur base pilote.')
    return
  }

  throw new DatabaseProtectionError(
    'ALLOW_WIPE_USERS refusé : NETLIFY_DB_URL pointe vers la base pilote production. ' +
      'Utilisez une branche DB dédiée (E2E_DATABASE_URL) pour les tests, ou seed sans wipe.',
  )
}

/**
 * Refuse tout reset admin hors runtime Netlify production sur la base pilote.
 * (Les tournées/comptes pilote ne doivent pas être effacés depuis un Mac ou la CI.)
 */
export function assertDatabaseResetAllowed(): void {
  if (!isProtectedProductionDatabase()) return
  if (process.env.CONTEXT === 'production') return

  throw new DatabaseProtectionError(
    'Reset admin refusé : la base cible est la base pilote production. ' +
      'Lancez les tests E2E avec E2E_DATABASE_URL (branche dev), pas la prod.',
  )
}
