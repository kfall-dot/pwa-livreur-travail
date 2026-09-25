// Active les hooks git du projet (pre-push → garde de non-régression).
//
// Remplace l'ancien `scripts/install-githooks.sh` : un hook npm ne peut pas être
// écrit en bash, car sur Windows npm exécute les scripts via `cmd.exe`, qui ne
// comprend pas `command -v`, `&&`, `; then`, `; fi` → `npm install` échoue avec
// « npm error command C:\WINDOWS\system32\cmd.exe /d /s /c if command -v bash … ».
//
// Ce script est volontairement tolérant : un poste sans dépôt git (CI, archive
// extraite, `npm ci` en production) ne doit jamais casser l'installation.
// Il sort toujours en 0.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = join(ROOT, '.githooks', 'pre-push')

/** `true` si on est dans un dépôt git (racine, worktree ou sous-module). */
function isGitRepo() {
  try {
    execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

try {
  if (existsSync(HOOK)) {
    // Sans effet sur Windows (NTFS), utile sur macOS/Linux.
    try {
      chmodSync(HOOK, 0o755)
    } catch {
      /* droits déjà corrects, ou système de fichiers non POSIX */
    }
  }

  if (!isGitRepo()) {
    console.log('install-githooks: pas de dépôt git — ignoré')
    process.exit(0)
  }

  execFileSync('git', ['-C', ROOT, 'config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' })
  console.log('✓ Hook pre-push activé → garde de non-régression avant chaque git push')
} catch (err) {
  // Ne jamais faire échouer `npm install` pour un hook de confort.
  console.log(`install-githooks: ignoré (${err?.message ?? err})`)
}

process.exit(0)
