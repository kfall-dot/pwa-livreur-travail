import type { CorsOptions } from 'cors'
import { isProduction } from './production.js'

function parseAllowedOrigins(): Set<string> {
  const origins = new Set<string>()
  const base = process.env.PUBLIC_BASE_URL?.trim()
  if (base) {
    try {
      origins.add(new URL(base).origin)
    } catch {
      /* PUBLIC_BASE_URL invalide — ignoré */
    }
  }
  for (const entry of (process.env.CORS_ORIGINS ?? '').split(',')) {
    const trimmed = entry.trim()
    if (trimmed) origins.add(trimmed)
  }
  return origins
}

export function corsOptions(): CorsOptions {
  if (!isProduction()) {
    return { origin: true, credentials: true }
  }

  const allowed = parseAllowedOrigins()
  if (allowed.size === 0) {
    console.warn(
      '[cors] Aucune origine autorisée — définissez PUBLIC_BASE_URL et/ou CORS_ORIGINS en production. ' +
        'Toutes les requêtes cross-origin avec Origin seront refusées (fail-closed).'
    )
  }

  return {
    origin(origin, callback) {
      // Requêtes same-origin ou non-navigateur (pas d'en-tête Origin) : autorisées.
      if (!origin) {
        callback(null, true)
        return
      }
      // Fail-closed : sans allowlist configurée, on refuse toute origine explicite
      // plutôt que d'autoriser tout le monde.
      if (allowed.has(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    credentials: true,
  }
}
