#!/usr/bin/env bash
# Suite de non-régression — à lancer après CHAQUE modification fonctionnelle.
# Usage : npm run regression
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Mettre à jour si des tests sont ajoutés/supprimés intentionnellement.
MIN_E2E_TESTS=99

echo "══════════════════════════════════════════════════════════════"
echo "  Non-régression PWA Livreur"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "Couverture cible :"
echo "  • e2e/00-dev-setup.spec.ts  — API JSON, proxy :5199, seed produits, reset confirm"
echo "  • e2e/auth.spec.ts          — login livreur + unités (caisses)"
echo "  • e2e/delivery-flow.spec.ts — parcours livraison + annulation"
echo "  • e2e/manager-replan.spec.ts — replan, édition tournée, refresh Suivi"
echo "  • e2e/manager-delivered-detail.spec.ts — quantité livrée en consultation"
echo ""
echo "Invariants métier (détail) : e2e/INVARIANTS.md"
echo "  → regression OK = ces invariants tiennent, pas « zéro bug »."
echo ""

echo "==> 1/3 Build serveur (TypeScript)"
npm run build:server

echo ""
echo "==> 2/4 Lint"
npm run lint

echo ""
echo "==> 3/4 Tests unitaires (quantités livrées)"
npm run test:unit

echo ""
echo "==> 4/4 Tests E2E (Express :8888, build dist — scripts/e2e-server.sh)"
if [[ "$(ulimit -n)" -lt 10240 ]]; then
  ulimit -n 10240 2>/dev/null || ulimit -n 4096 2>/dev/null || true
  echo "    ulimit -n $(ulimit -n)"
fi

# Aligné sur scripts/netlify-dev.sh — CI=1 exige E2E_DATABASE_URL (voir playwright.config.ts).
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
load_env_file ".env.e2e.local"
if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
  export NETLIFY_DB_URL="$E2E_DATABASE_URL"
  echo "    DB E2E : .env.e2e.local"
  echo "    Migrations BTP / schéma... (aussi rejouées par scripts/e2e-server.sh)"
  if [[ -n "${NETLIFY_DB_URL:-}" ]]; then
    node scripts/apply-btp-migration.mjs || echo "    (migration BTP — déjà appliquée ou DB indisponible)"
  fi
elif [[ -z "${CI:-}" ]]; then
  echo "    ATTENTION: E2E_DATABASE_URL absent — créez .env.e2e.local (docs/SECURITY-OPS.md §4)"
fi

TEST_COUNT="$(npx playwright test --list 2>/dev/null | grep -c '^\s*\[chromium\]' || true)"
if [[ "$TEST_COUNT" -lt "$MIN_E2E_TESTS" ]]; then
  echo "ERREUR: $TEST_COUNT tests listés, minimum $MIN_E2E_TESTS."
  echo "  Si suppression intentionnelle, mettre à jour MIN_E2E_TESTS dans scripts/regression.sh"
  exit 1
fi
echo "    ($TEST_COUNT tests Playwright)"
bash scripts/kill-e2e-ports.sh
# GitHub Actions pose déjà CI=true. En local, ne pas forcer CI=1 :
# ça relance chaque test échoué et triple l'attente sur machine lente.
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  npm run test:e2e
else
  npx playwright test --retries=0
fi

echo ""
echo "✓ Non-régression OK ($TEST_COUNT tests E2E)"
