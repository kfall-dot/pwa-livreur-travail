import { neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/netlify-db'
import ws from 'ws'
import * as schema from './schema.js'

// Node 20 n’expose pas WebSocket global — requis pour les transactions Neon (Pool).
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

/**
 * URL utilisable par le driver Neon (prod / override manuel).
 * Ignore les proxies locaux netlify:dev (`postgres://localhost:…`) — sans user/password
 * ils font planter `neon()` ; on retombe alors sur E2E_DATABASE_URL (branche e2e)
 * si elle est distante, sinon sur la résolution Netlify Database.
 */
function isRemoteNeonUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return false
    if (!u.hostname || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false
    if (!u.username) return false
    return true
  } catch {
    return false
  }
}

function createDb() {
  const netlifyUrl = process.env.NETLIFY_DB_URL?.trim()
  if (netlifyUrl && isRemoteNeonUrl(netlifyUrl)) {
    return drizzle({ connection: netlifyUrl, schema })
  }
  // netlify:dev injecte souvent un Postgres local (sans tables) à la place de NETLIFY_DB_URL.
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim()
  if (e2eUrl && isRemoteNeonUrl(e2eUrl)) {
    return drizzle({ connection: e2eUrl, schema })
  }
  return drizzle({ schema })
}

export const db = createDb()

export * from './schema.js'
