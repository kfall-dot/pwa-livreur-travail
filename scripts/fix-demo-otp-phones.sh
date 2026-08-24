#!/usr/bin/env bash
# Corrige les numéros OTP fictifs (+2250102030405) sur le compte démo co-demo.
# Usage : BASE_URL=https://pwa-livreur.netlify.app REPLACEMENT=+2250700430402 bash scripts/fix-demo-otp-phones.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://pwa-livreur.netlify.app}"
API="${BASE_URL}/api/v1"
FAKE="${FAKE:-+2250102030405}"
REPLACEMENT="${REPLACEMENT:-+2250700430402}"
MANAGER_EMAIL="${MANAGER_EMAIL:-manager@demo.fr}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-admin1234}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "=== Correction numéros OTP démo ==="
echo "Remplacement : $FAKE → $REPLACEMENT"

curl -sf -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API/auth/login-dashboard" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\"}" > /dev/null

LIST=$(curl -sf -b "$COOKIE_JAR" "$API/dashboard/supermarkets")
COUNT=0
node -e "
const list = JSON.parse(process.argv[1]);
const fake = process.argv[2];
const replacement = process.argv[3];
for (const sm of list.supermarkets || []) {
  if ((sm.contactPhone || '').trim() === fake) {
    console.log(sm.id);
  }
}
" "$LIST" "$FAKE" "$REPLACEMENT" | while read -r SM_ID; do
  [[ -z "$SM_ID" ]] && continue
  curl -sf -b "$COOKIE_JAR" -X PATCH "$API/dashboard/supermarkets/$SM_ID" \
    -H 'Content-Type: application/json' \
    -d "{\"contactPhone\":\"$REPLACEMENT\"}" > /dev/null
  echo "  OK catalogue $SM_ID"
  COUNT=$((COUNT + 1))
done

echo "Points catalogue mis à jour."
echo "Note : les arrêts en cours conservent leur copie jusqu’au prochain send-otp (résolution catalogue prioritaire)."
