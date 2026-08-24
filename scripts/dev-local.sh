#!/usr/bin/env bash
# Dev quotidien sans `netlify:dev` (pas de Functions / Blobs / proxy Netlify).
# Usage : npm run dev:local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT="${PORT:-3002}"
WEB_URL="http://localhost:5173"
API_URL="http://localhost:${API_PORT}"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  # Exporte KEY=VALUE (ignore commentaires / lignes vides). Pas d’évaluation shell.
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      # Retire guillemets simples/doubles autour de la valeur
      if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"
      fi
      export "$key=$val"
    fi
  done < "$file"
}

load_env_file ".env"
load_env_file ".env.development"
load_env_file ".env.local"

API_PORT="${PORT:-3002}"
API_URL="http://localhost:${API_PORT}"
export PORT="$API_PORT"
export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-$API_URL}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$WEB_URL}"
export EMAIL_PROVIDER="${EMAIL_PROVIDER:-mock}"
# Pas de contexte Netlify Functions / Blobs
unset NETLIFY_DEV NETLIFY_BLOBS_CONTEXT 2>/dev/null || true

is_usable_db_url() {
  local url="${1:-}"
  [[ -n "$url" ]] || return 1
  # Refuse le proxy local netlify database (sans credentials → crash neon)
  if [[ "$url" =~ localhost|127\.0\.0\.1 ]]; then
    return 1
  fi
  [[ "$url" =~ ^postgres(ql)?:// ]] || return 1
  # Exige un user dans l’URL (user@host)
  [[ "$url" =~ ://[^/@]+@ ]] || return 1
  return 0
}

echo "══════════════════════════════════════════════════════════════"
echo "  TraceO® — dev local (sans netlify:dev)"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Front  → $WEB_URL"
echo "  API    → $API_URL  (proxy Vite /api → $VITE_API_PROXY_TARGET)"
echo "  E-mail → ${EMAIL_PROVIDER}"
echo ""

if ! is_usable_db_url "${NETLIFY_DB_URL:-}"; then
  echo "ERREUR: NETLIFY_DB_URL manquant ou invalide pour le mode local."
  echo ""
  echo "  Ajoute dans .env.development (une fois) l’URL Postgres Neon :"
  echo "    Netlify Dashboard → Site → Database → Copy connection string"
  echo "    NETLIFY_DB_URL=postgresql://user:pass@….neon.tech/neondb?sslmode=require"
  echo ""
  echo "  Évite les URLs localhost (proxy netlify database)."
  echo "  Postgres 100 % local : postgresql://user:pass@127.0.0.1:5432/traceo"
  echo "  (avec user/password — pas seulement host)."
  echo ""
  exit 1
fi

# Masque le mot de passe dans le log
_db_host="$(printf '%s' "$NETLIFY_DB_URL" | sed -E 's#^[^@]+@##; s#/.*##')"
echo "  DB     → ${_db_host}"
echo ""
echo "  Limites vs netlify:dev :"
echo "    • Netlify Blobs indisponible (photos : fallback / bypass OK en dev)"
echo "    • E2E / npm run regression → toujours netlify:dev :8888"
echo ""
echo "══════════════════════════════════════════════════════════════"
echo ""

exec npx concurrently -n web,api -c cyan,green \
  "npm run dev" \
  "npm run dev:server"
