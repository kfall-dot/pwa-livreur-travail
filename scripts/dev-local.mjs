// Dev quotidien sans `netlify:dev` (pas de Functions / Blobs / proxy Netlify).
// Usage : npm run dev:local
//
// Remplace l'ancien `scripts/dev-local.sh` : sur Windows, `bash` n'est pas dans
// le PATH (`'bash' is not recognized…`), donc un script npm en bash rend le dev
// quotidien impossible hors Git Bash / WSL. Écrit en Node, il tourne partout.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)

const WEB_URL = 'http://localhost:5173'
const API_PORT = process.env.PORT || '3002'
const API_URL = `http://localhost:${API_PORT}`

/**
 * Charge un fichier `.env` dans `process.env`.
 * Mêmes règles que l'ancien script bash : on ignore commentaires et lignes
 * vides, on retire les guillemets autour de la valeur, aucune évaluation shell.
 */
function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile('.env')
loadEnvFile('.env.development')
loadEnvFile('.env.local')

// Reprend les mêmes exports que le script bash (les enfants en héritent).
process.env.PORT = API_PORT
process.env.VITE_API_PROXY_TARGET ||= API_URL
process.env.PUBLIC_BASE_URL ||= WEB_URL
process.env.EMAIL_PROVIDER ||= 'mock'
// Pas de contexte Netlify Functions / Blobs.
delete process.env.NETLIFY_DEV
delete process.env.NETLIFY_BLOBS_CONTEXT

/**
 * URL Postgres utilisable en local : on refuse le proxy local netlify database
 * (sans credentials → crash neon) et on exige un user dans l'URL.
 */
function isUsableDbUrl(url) {
  if (!url) return false
  if (/localhost|127\.0\.0\.1/.test(url)) return false
  if (!/^postgres(ql)?:\/\//.test(url)) return false
  return /:\/\/[^/@]+@/.test(url)
}

const dbUrlCandidates = [process.env.NETLIFY_DB_URL, process.env.E2E_DATABASE_URL]
const dbUrl = dbUrlCandidates.find((url) => isUsableDbUrl(url)) ?? ''

// Mot de passe masqué dans le log.
const dbHost = dbUrl ? (dbUrl.replace(/^[^@]+@/, '').split('/')[0] ?? '') : ''

console.log('══════════════════════════════════════════════════════════════')
console.log('  TraceO® — dev local (sans netlify:dev)')
console.log('══════════════════════════════════════════════════════════════')
console.log('')
console.log(`  Front  → ${WEB_URL}`)
console.log(`  API    → ${API_URL}  (proxy Vite /api → ${process.env.VITE_API_PROXY_TARGET})`)
console.log(`  E-mail → ${process.env.EMAIL_PROVIDER}`)
console.log('')

if (!dbUrl) {
  // Diagnostic le plus probable : les .env ne sont jamais commités, donc un clone
  // neuf n'en a aucun. On le dit explicitement plutôt que d'orienter vers une
  // variable à créer de toutes pièces. Seul `.env.development` est attendu :
  // `.env` et `.env.local` sont des surcharges optionnelles.
  const mainEnv = '.env.development'
  const hasMainEnv = existsSync(join(ROOT, mainEnv))

  console.error('ERREUR: aucune URL Postgres utilisable pour le mode local.')
  console.error('')
  if (!hasMainEnv) {
    console.error(`  ${mainEnv} est absent de la racine du projet.`)
    console.error('')
    console.error('  Les .env ne sont jamais commités (ils contiennent des secrets).')
    console.error('  Sur une nouvelle machine, les récupérer depuis le poste de référence')
    console.error('  (archive pwa-livreur-secrets.zip) et les extraire ici.')
    console.error('')
  }
  console.error('  Il faut y définir une seule de ces variables, avec l\'URL Postgres :')
  console.error('    NETLIFY_DB_URL=postgresql://user:pass@….neon.tech/neondb?sslmode=require')
  console.error('    E2E_DATABASE_URL=…   (branche de test, JAMAIS la production)')
  console.error('')
  console.error('  ⚠ NETLIFY_DB_URL est un NOM HÉRITÉ : ce n\'est plus Netlify.')
  console.error('    La base est chez Neon — le serveur ne lit que ce nom-là (server/db/index.ts).')
  console.error('    Où la trouver : Neon Console (console.neon.tech) → ton projet →')
  console.error('    « Connection string », puis choisir l\'option pooler.')
  console.error('')
  console.error('  Sont refusées les URLs localhost (ancien proxy Netlify Database).')
  console.error('  Postgres 100 % local : postgresql://user:pass@127.0.0.1:5432/traceo')
  console.error('  (avec user ET password — pas seulement l\'hôte).')
  console.error('')
  process.exit(1)
}

// Mot de passe masqué dans le log.
console.log(`  DB     → ${dbHost}`)
console.log('')
console.log('  Limites vs netlify:dev :')
console.log('    • Netlify Blobs indisponible (photos : fallback / bypass OK en dev)')
console.log('    • E2E / npm run regression → toujours netlify:dev :8888')
console.log('')
console.log('══════════════════════════════════════════════════════════════')
console.log('')

// `concurrently` est lancé via son point d'entrée JS et non `npx` : sur Windows,
// Node refuse de spawn un `.cmd` sans shell, et un shell casserait le quoting des
// commandes composées (« npm run dev » doit rester un seul argument).
const CONCURRENTLY_BIN = join(ROOT, 'node_modules', 'concurrently', 'dist', 'bin', 'concurrently.js')

if (!existsSync(CONCURRENTLY_BIN)) {
  console.error('ERREUR: concurrently introuvable — lance `npm install` dans le projet.')
  process.exit(1)
}

const child = spawn(
  process.execPath,
  [CONCURRENTLY_BIN, '-n', 'web,api', '-c', 'cyan,green', 'npm run dev', 'npm run dev:server'],
  { stdio: 'inherit', env: process.env },
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
