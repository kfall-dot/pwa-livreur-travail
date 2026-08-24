#!/usr/bin/env bash
# netlify dev avec DB de test (branche e2e) par défaut — évite timeouts prod et reset bloqué.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Node 20 requis (Functions Netlify) — évite crash CLI (ECONNRESET) sous Node 24+
if [[ -x "$HOME/.local/node20/bin/node" ]]; then
  export PATH="$HOME/.local/node20/bin:$PATH"
fi

# netlify CLI ouvre un FD par invocation ; 43 chantiers catalogue → EMFILE si soft limit 256.
if [[ "$(ulimit -n)" -lt 10240 ]]; then
  ulimit -n 10240 2>/dev/null || ulimit -n 4096 2>/dev/null || true
  echo "  netlify:dev → ulimit -n $(ulimit -n)"
fi

# Polling au lieu de fs.watch (kqueue) — le watcher natif plante le CLI (EMFILE).
export CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-1}"
export CHOKIDAR_INTERVAL="${CHOKIDAR_INTERVAL:-2000}"
export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"

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

load_env_file ".env"
load_env_file ".env.development"
load_env_file ".env.local"

# Libère les ports netlify dev (évite Vite sur :5200 → proxy cassé)
for dev_port in 8888 5199 5200; do
  pids="$(lsof -ti :"${dev_port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Liberation port ${dev_port}..."
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
  fi
done
sleep 1

# Le Postgres WASM local (.netlify/db, ~3000 fichiers) fait planter le CLI (EMFILE).
# netlify:dev pointe déjà vers NETLIFY_DB_URL (branche e2e).
if [[ -d .netlify/db ]]; then
  echo "  netlify:dev → purge .netlify/db (évite crash EMFILE du CLI)"
  rm -rf .netlify/db
fi
rm -rf .netlify/functions-serve

# Branche e2e (tests) prioritaire pour le dev local sur :8888
if [[ -f .env.e2e.local ]]; then
  load_env_file ".env.e2e.local"
  if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
    export NETLIFY_DB_URL="$E2E_DATABASE_URL"
    export VITE_E2E_DB_WARNING=1
    # Identité pilote locale — sauf en CI/E2E (manager@demo.fr attendu par Playwright).
    if [[ -n "${CI:-}" ]]; then
      unset SEED_MANAGER_EMAIL
      unset SEED_DRIVER_PHONE
      unset SEED_DRIVER2_PHONE
    else
      export SEED_MANAGER_EMAIL="${SEED_MANAGER_EMAIL:-kfallet@gmail.com}"
      export MANAGER_PASSWORD="${MANAGER_PASSWORD:-admin1234}"
    fi
    echo "══════════════════════════════════════════════════════════════"
    echo "  netlify:dev → DB branche e2e (depuis .env.e2e.local)"
    if [[ -n "${CI:-}" ]]; then
      echo "  Mode CI/E2E — manager seed : manager@demo.fr"
    else
      echo "  Manager local : ${SEED_MANAGER_EMAIL} / ${MANAGER_PASSWORD}"
    fi
    echo "  Seed démo : POST /api/admin/seed (manager connecté ou X-Admin-Token)"
    echo "  ATTENTION : npm run regression / E2E réinitialisent cette base."
    echo "══════════════════════════════════════════════════════════════"
  fi
fi

node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${node_major}" != "20" ]]; then
  echo "  ATTENTION: Node $(node -v) — ce projet cible Node 20 (Netlify Functions)."
  echo "  Si l'API renvoie 500, installez Node 20 (nvm) ou utilisez: npm run dev:local"
  echo ""
fi

# netlify-cli local : timeout sync hardcodé à 30s — trop court pour reset+seed Neon.
# Aligner sur [functions."api"] timeout = 60 (netlify.toml) pour le dev / E2E.
_dev_js="${ROOT}/node_modules/netlify-cli/dist/utils/dev.js"
if [[ -f "${_dev_js}" ]] && grep -q 'SYNCHRONOUS_FUNCTION_TIMEOUT = 30' "${_dev_js}"; then
  sed -i.bak 's/SYNCHRONOUS_FUNCTION_TIMEOUT = 30/SYNCHRONOUS_FUNCTION_TIMEOUT = 60/' "${_dev_js}"
  rm -f "${_dev_js}.bak"
  echo "  netlify:dev → timeout functions locales 60s"
fi

echo "  Demarrage ~30-90 s — ouvrez le navigateur SEULEMENT apres :"
echo "     « Local dev server ready: http://localhost:8888 »"
echo "  Laissez ce terminal ouvert (fermer = ERR_CONNECTION_REFUSED sur :8888)"
echo ""

exec npx netlify dev --no-open "$@"
