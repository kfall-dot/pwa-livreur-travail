#!/usr/bin/env bash
# Libère les ports utilisés par netlify dev (E2E / régression).
set -euo pipefail

# netlify CLI + Vite + Neon : le défaut macOS (256) provoque EMFILE après la suite BTP.
if [[ "$(ulimit -n)" -lt 10240 ]]; then
  ulimit -n 10240 2>/dev/null || ulimit -n 4096 2>/dev/null || true
fi

for port in 8888 5199; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Arrêt processus sur port $port (pid: $pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
done

sleep 1
