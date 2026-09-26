// Diagnostic de la base de données locale : lit les .env, puis tente réellement
// de se connecter à Postgres. À lancer quand l'API ne démarre pas sans message —
// `npm run dev:local` masque en effet les plantages silencieux (le serveur peut
// rester bloqué sur la connexion, ou mourir dans applyMigrations()).
//
// Usage : npm run db:check
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)

// Même ordre de chargement que dev-local.mjs.
function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

loadEnvFile('.env')
loadEnvFile('.env.development')
loadEnvFile('.env.local')

const url = process.env.NETLIFY_DB_URL || process.env.E2E_DATABASE_URL

console.log('── Fichiers .env ──')
for (const file of ['.env', '.env.development', '.env.local']) {
  console.log(`  ${existsSync(join(ROOT, file)) ? '✔' : '✖'} ${file}`)
}

console.log('\n── Variable d\'URL ──')
if (!url) {
  console.log('  ✖ NETLIFY_DB_URL / E2E_DATABASE_URL absente')
  process.exit(1)
}
const masked = url.replace(/^([^:]+):\/\/[^@]*@/, '$1://***:***@')
console.log(`  ${masked}`)

let host = 'inconnue'
try {
  host = new URL(url).hostname
} catch {
  console.log('  ✖ URL illisible — saisissez-la entre guillemets dans le .env')
  process.exit(1)
}
console.log(`  hôte : ${host}`)

console.log('\n── Connexion (timeout 15 s) ──')
const { Client } = await import('pg')
const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 })

const startedAt = Date.now()
try {
  await client.connect()
  const { rows } = await client.query('select current_database() as db, version() as version')
  console.log(`  ✔ Connexion réussie en ${Date.now() - startedAt} ms`)
  console.log(`  base : ${rows[0]?.db}`)
  console.log(`  version : ${String(rows[0]?.version ?? '').split(' ').slice(0, 2).join(' ')}`)
  await client.end()
  console.log('\nLa base est joignable : le problème n\'est PAS la base.')
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`  ✖ Connexion ÉCHOUÉE après ${Date.now() - startedAt} ms`)
  console.error(`    ${message}`)
  console.error('')
  console.error('  Pistes :')
  let hinted = false
  if (/timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(message)) {
    console.error('    · réseau : pare-feu / antivirus bloquant le port 5432-5433 sortant')
    console.error('    · ou branche Neon endormie (suspendue après inactivité) → réessaie une fois')
    hinted = true
  }
  if (/password authentication|could not connect|role .* does not exist/i.test(message)) {
    console.error('    · identifiants : user / mot de passe / base à revérifier dans le .env')
    hinted = true
  }
  if (/database .* does not exist/i.test(message)) {
    console.error('    · base inexistante : le nom après le dernier "/" de l\'URL est à corriger')
    console.error('      (format attendu … /neondb?sslmode=require)')
    hinted = true
  }
  if (/certificate|CERT_|SSL|self.signed/i.test(message)) {
    console.error('    · TLS : la chaîne de certificats du poste est peut-être incomplète')
    hinted = true
  }
  if (!hinted) {
    console.error(`    · message inattendu — recherches « ${message.slice(0, 60)} »`)
    console.error('    · vérifie aussi que l\'URL est sur une seule ligne dans le .env')
  }
  process.exit(1)
}
