#!/usr/bin/env bash
# Audit des variables sensibles — à lancer avant deploy prod ou en local avec env Netlify exporté.
# Usage : CONTEXT=production JWT_SECRET=... SMS_PROVIDER=textbee bash scripts/audit-production-env.sh

set -euo pipefail

fail=0
warn=0

err() { echo "ERROR: $*"; fail=$((fail + 1)); }
warning() { echo "WARN:  $*"; warn=$((warn + 1)); }
ok() { echo "OK:   $*"; }

is_prod() {
  [[ "${CONTEXT:-}" == "production" ]]
}

truthy() {
  case "${1:-}" in true|1|yes) return 0 ;; *) return 1 ;; esac
}

echo "=== Audit sécurité TraceO (CONTEXT=${CONTEXT:-<unset>}) ==="

if is_prod; then
  if [[ -z "${JWT_SECRET:-}" ]]; then err "JWT_SECRET manquant"; else ok "JWT_SECRET défini"; fi
  if [[ "${SMS_PROVIDER:-mock}" == "mock" ]]; then err "SMS_PROVIDER=mock"; else ok "SMS_PROVIDER=${SMS_PROVIDER}"; fi
  if [[ "${EMAIL_PROVIDER:-mock}" == "mock" ]]; then warning "EMAIL_PROVIDER=mock"; else ok "EMAIL_PROVIDER=${EMAIL_PROVIDER}"; fi
  if [[ -n "${OTP_CODE:-}" ]]; then err "OTP_CODE défini"; fi
  if [[ -n "${DRIVER_PIN:-}" ]]; then err "DRIVER_PIN défini"; fi
  if truthy "${GEOFENCE_BYPASS:-}" && ! truthy "${ALLOW_GEOFENCE_BYPASS:-}"; then
    err "GEOFENCE_BYPASS sans ALLOW_GEOFENCE_BYPASS"
  fi
  if truthy "${ALLOW_SEED:-}" || truthy "${ALLOW_RESET:-}"; then
    if [[ -z "${ADMIN_API_TOKEN:-}" ]]; then warning "ALLOW_SEED/RESET sans ADMIN_API_TOKEN"; fi
  fi
  if truthy "${SMS_OTP_FAIL_OPEN:-}"; then warning "SMS_OTP_FAIL_OPEN actif"; fi
  if truthy "${ALLOW_SELF_SIGNUP:-}"; then warning "ALLOW_SELF_SIGNUP actif"; fi
  if [[ -z "${PUBLIC_BASE_URL:-}" ]]; then warning "PUBLIC_BASE_URL absent"; fi
  if [[ -z "${NETLIFY_DB_URL:-}" ]]; then warning "NETLIFY_DB_URL absent (hors Functions Netlify ?)"; fi
else
  ok "Mode non-production — audit allégé"
  if [[ -z "${JWT_SECRET:-}" ]]; then warning "JWT_SECRET absent (dev seulement)"; fi
fi

echo "---"
echo "Erreurs: $fail | Avertissements: $warn"
if [[ $fail -gt 0 ]]; then exit 1; fi
