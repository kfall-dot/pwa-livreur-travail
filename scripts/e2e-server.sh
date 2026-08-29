#!/usr/bin/env bash
# Serveur e2e autonome — remplace `netlify dev` dans la non-régression.
#
# Architecture identique à la production Railway : un seul process Express
# qui sert le frontend compilé (dist/) et l'API sur la MÊME origine :8888.
# Conséquences voulues :
#   • plus de CLI Netlify (crashes EMFILE/ECONNRESET, timeout functions 30s)
#   • photos → stockage disque local (isBlobsEnabled()=false), comme sur Railway
#   • reset/seed/emails mock : endpoints serveur, rien à voir avec Netlify
#
# Prérequis : E2E_DATABASE_URL (branche e2e — voir docs/SECURITY-OPS.md §4),
# exportée par playwright.config (webServer env) ou .env.e2e.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"
      fi
      export "$key=$val"
    fi
  done < "$file"
}

# Même ordre que scripts/netlify-dev.sh : .env.development fournit les
# contournements e2e (GEOFENCE_BYPASS, VITE_E2E…), .env.e2e.local la DB e2e.
load_env_file ".env"
load_env_file ".env.development"
load_env_file ".env.local"
load_env_file ".env.e2e.local"

if [[ -z "${E2E_DATABASE_URL:-}" ]]; then
  echo "e2e-server: E2E_DATABASE_URL manquant (.env.e2e.local ou secret CI)" >&2
  exit 1
fi
# La DB e2e écrase tout NETLIFY_DB_URL (potentiellement pilote) de .env.development.
export NETLIFY_DB_URL="$E2E_DATABASE_URL"

# ── Overrides e2e NON NÉGOCIABLES (après les load_env_file) ──────────────────
# .env.development est taillé pour le dev Vite (PUBLIC_BASE_URL=:5173) et peut
# évoluer — en e2e tout est servi par Express :8888, même origine que la prod.
export EMAIL_PROVIDER="mock"
export SMS_PROVIDER="mock"
export SMS_OTP_FAIL_OPEN="true"
export PUBLIC_BASE_URL="http://localhost:${E2E_PORT:-8888}"

# ── Keep-alive de la branche Neon e2e ────────────────────────────────────────
# Les branches Neon se suspendent après ~5 min d'inactivité. Le build Vite
# (~4 min) ne touche jamais la DB → branche endormie au boot du serveur →
# les premières queries tapent un WebSocket mort (ErrorEvent) et hangent.
# Ce ping (SELECT 1 / 45s) maintient la branche chaude, build compris.
KEEPALIVE_PID=""
cleanup() {
  if [[ -n "$KEEPALIVE_PID" ]]; then
    kill "$KEEPALIVE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM
node scripts/e2e-keepalive.mjs &
KEEPALIVE_PID=$!

# Pas de SEED_MANAGER_EMAIL ici — contrairement à netlify-dev.sh (dev local),
# le serveur e2e doit rester l'environnement des specs Playwright : le manager
# seedé est manager@demo.fr (DEMO_MANAGER). Sinon le test « mot de passe oublié »
# demande un reset pour manager@demo.fr qui n'existe plus (email réaligné pilote).
if [[ -n "${CI:-}" ]]; then
  unset SEED_MANAGER_EMAIL SEED_DRIVER_PHONE SEED_DRIVER2_PHONE
fi

echo "e2e-server: migrations BTP sur la branche e2e…"
node scripts/apply-btp-migration.mjs || echo "  (déjà appliquées — toléré)"

# Toujours rebuild : un dist antérieur (build prod sans VITE_E2E) casserait
# les testids e2e et le SW PWA. ~1-2 min une seule fois par run.
echo "e2e-server: build frontend (dist)…"
npm run build

# Libérer :8888 (ancien serveur e2e/dev qui traîne → ERR_CONNECTION_RESET).
for pid in $(lsof -ti :8888 2>/dev/null || true); do
  echo "e2e-server: arrêt pid $pid sur :8888"
  kill "$pid" 2>/dev/null || true
done
sleep 1

export PORT=8888
echo "e2e-server: Express + dist → http://localhost:8888"
exec npx tsx server/index.ts
