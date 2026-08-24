#!/usr/bin/env bash
# Active les hooks git du projet (pre-push → npm run regression).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$ROOT/.githooks/pre-push" 2>/dev/null || true

if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "install-githooks: pas de dépôt git — ignoré"
  exit 0
fi

git -C "$ROOT" config core.hooksPath .githooks
echo "✓ Hook pre-push activé → npm run regression avant chaque git push"
