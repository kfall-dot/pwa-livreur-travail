import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema.js'

// Node 20 n’expose pas WebSocket global — requis pour les transactions Neon (Pool).
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

/**
 * URL utilisable par le driver Neon (prod / override manuel).
 * Ignore les proxies locaux netlify:dev (`postgres://localhost:…`) — sans user/password
 * ils font planter `new Pool()` ; on retombe alors sur E2E_DATABASE_URL (branche e2e)
 * si elle est distante.
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
  // Typage public de drizzle-orm/neon-serverless (1.0-beta) : DrizzlePgConfig fait
  // `Omit<DrizzleConfig<…>, 'schema'>`, donc `schema` n'existe plus côté types
  // alors que le runtime le lit toujours (validé en prod). On caste donc
  // l'objet littéral vers le membre « objet » de l'union des paramètres.
  // ⚠️ L'union ENTIÈRE ([string] | [string, cfg] | [cfg]) ne satisfait aucune
  // overload (TS2345) — seul ce membre extrait passe.
  type DrizzleConfigArg = Exclude<Parameters<typeof drizzle>[0], string>

  // Ne JAMAIS réutiliser une connexion idle : Neon suspend les branches (~5 min
  // d'inactivité) et le routeur/NAT peut tuer les TCP idle SANS FIN — la
  // connexion morte hang alors toutes les queries suivantes (sans timeout
  // par requête, cf. hang « Validation… » en e2e). On ferme les connexions
  // idle après 30s et on fail-fast si l'établissement dépasse 10s.
  const poolOptions = {
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }

  const netlifyUrl = process.env.NETLIFY_DB_URL?.trim()
  if (netlifyUrl && isRemoteNeonUrl(netlifyUrl)) {
    const pool = new Pool({ connectionString: netlifyUrl, ...poolOptions })
    guardPoolAgainstNeonIdleErrors(pool)
    return drizzle({ client: pool, schema } as unknown as DrizzleConfigArg)
  }

  // netlify:dev injecte souvent un Postgres local (sans tables) à la place de NETLIFY_DB_URL.
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim()
  if (e2eUrl && isRemoteNeonUrl(e2eUrl)) {
    const pool = new Pool({ connectionString: e2eUrl, ...poolOptions })
    guardPoolAgainstNeonIdleErrors(pool)
    return drizzle({ client: pool, schema } as unknown as DrizzleConfigArg)
  }

  throw new Error('NETLIFY_DB_URL (ou E2E_DATABASE_URL) doit être définie avec une URL Neon distante.')
}

/**
 * Client applicatif — NE PAS créer au chargement du module.
 *
 * L'évaluation du bundle (Netlify, Railway build, etc.) se fait sans variables
 * d'environnement DB : un `new Pool()` exécuté au top-level lèverait une erreur.
 * Le client est donc construit paresseusement à la première utilisation
 * (une requête), quand les variables d'environnement sont réellement disponibles.
 */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    cachedDb ??= createDb()
    const value = Reflect.get(cachedDb as object, prop, receiver)
    return typeof value === 'function' ? value.bind(cachedDb) : value
  },
})

let cachedDb: ReturnType<typeof createDb> | undefined

/**
 * Les WebSockets du driver Neon en idle peuvent émettre un événement 'error'
 * sans listener (déconnexion réseau transitoire) → `Unhandled error` → crash
 * du process. On logue et on laisse le pool recycler la connexion au lieu de
 * tuer le serveur (constaté en e2e comme en prod Railway).
 */
function guardPoolAgainstNeonIdleErrors(pool: Pool): void {
  pool.on('error', (err: Error) => {
    console.error('[db] erreur pool Neon (non fatale):', err instanceof Error ? err.message : err)
  })
  pool.on('connect', (client: { on: (event: string, cb: (err: Error) => void) => void }) => {
    client.on('error', (err: Error) => {
      console.error('[db] erreur client Neon (non fatale):', err instanceof Error ? err.message : err)
    })
  })
}

process.on('uncaughtException', (err) => {
  const fromNeon =
    err.stack?.includes('@neondatabase/serverless') ||
    err.message?.includes('WebSocket') ||
    err.message === 'Unhandled error. ()'
  if (fromNeon) {
    console.error('[db] erreur WebSocket Neon ignorée (process maintenu):', err.message)
    return
  }
  console.error('[server] uncaughtException fatale:', err)
  process.exit(1)
})

export * from './schema.js'
