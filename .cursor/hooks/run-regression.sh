#!/usr/bin/env bash
# Cursor stop hook — lance la non-régression quand l'agent termine un tour.
# Désactiver temporairement : CURSOR_SKIP_REGRESSION=1
set -euo pipefail

# Consommer le JSON stdin (obligatoire pour les hooks Cursor)
if [ -t 0 ]; then
  :
else
  cat >/dev/null || true
fi

if [[ "${CURSOR_SKIP_REGRESSION:-}" == "1" ]]; then
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[cursor hook] npm run regression…" >&2
npm run regression
