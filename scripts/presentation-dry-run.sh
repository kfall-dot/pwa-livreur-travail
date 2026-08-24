#!/usr/bin/env bash
# Test sec du parcours livraison + OTP pour la présentation (compte Aya, arrêt del-k1).
# Usage : BASE_URL=https://pwa-livreur.netlify.app bash scripts/presentation-dry-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-https://pwa-livreur.netlify.app}"
API="${BASE_URL}/api/v1"
DELIVERY_ID="${DELIVERY_ID:-del-k1}"
DRIVER_PHONE="${DRIVER_PHONE:-0700430402}"
DRIVER_PIN="${DRIVER_PIN:-1234}"
# Coordonnées Supermarché Abidjan Centre (del-k1)
LAT="${LAT:-5.32}"
LNG="${LNG:--4.016}"

PASS=0
FAIL=0
log_ok() { echo "  OK   $*"; PASS=$((PASS + 1)); }
log_fail() { echo "  FAIL $*"; FAIL=$((FAIL + 1)); }

echo "=== Test sec présentation TraceO ==="
echo "API: $API | arrêt: $DELIVERY_ID | livreur: $DRIVER_PHONE"
echo ""

echo "1. Connexion livreur"
LOGIN_JSON=$(curl -sf -X POST "$API/auth/login-driver" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$DRIVER_PHONE\",\"pin\":\"$DRIVER_PIN\"}") || { log_fail "login-driver"; exit 1; }
TOKEN=$(node -e "console.log(JSON.parse(process.argv[1]).accessToken)" "$LOGIN_JSON")
[[ -n "$TOKEN" ]] && log_ok "accessToken reçu" || { log_fail "accessToken manquant"; exit 1; }

AUTH=(-H "Authorization: Bearer $TOKEN")

echo "2. Détail livraison"
DETAIL=$(curl -sf "$API/deliveries/$DELIVERY_ID" "${AUTH[@]}") || { log_fail "GET delivery"; exit 1; }
STATUS=$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.delivery&&d.delivery.status)||'unknown')" "$DETAIL")
log_ok "statut actuel: $STATUS"

echo "3. Démarrer (si pending)"
if [[ "$STATUS" == "pending" ]]; then
  START_CODE=$(curl -s -o /tmp/start.json -w "%{http_code}" -X POST "$API/deliveries/$DELIVERY_ID/start" \
    "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"lat\":$LAT,\"lng\":$LNG}")
  if [[ "$START_CODE" == "200" ]]; then
    log_ok "start"
    STATUS=in_progress
  else
    log_fail "start HTTP $START_CODE — $(cat /tmp/start.json)"
  fi
else
  log_ok "start ignoré (déjà $STATUS)"
fi

echo "4. Photo (si requis)"
PHOTOS_JSON=$(curl -sf "$API/deliveries/$DELIVERY_ID/photos" "${AUTH[@]}") || true
PHOTO_COUNT=$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.photos||[]).length)" "$PHOTOS_JSON" 2>/dev/null || echo 0)
REQUIRED=$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.requiredPhotos||1)" "$DETAIL" 2>/dev/null || echo 1)
if [[ "${PHOTO_COUNT:-0}" -lt "${REQUIRED:-1}" ]]; then
  FIXTURE="${ROOT:-.}/scripts/fixtures-dry-run-photo.jpg"
  if [[ ! -f "$FIXTURE" ]]; then
    FIXTURE="${ROOT:-.}/scripts/fixtures-dry-run-photo.png"
  fi
  if [[ ! -f "$FIXTURE" ]]; then
    FIXTURE="${ROOT:-.}/public/brand/login-hero-photo.jpg"
  fi
  PHOTO_CODE=$(curl -s -o /tmp/photo.json -w "%{http_code}" -X POST "$API/deliveries/$DELIVERY_ID/photo" \
    "${AUTH[@]}" -F "photo=@${FIXTURE}" -F "lat=$LAT" -F "lng=$LNG" -F "hash=dry-run-$(date +%s)")
  if [[ "$PHOTO_CODE" == "200" ]]; then
    log_ok "photo uploadée"
  else
    log_fail "photo HTTP $PHOTO_CODE — $(cat /tmp/photo.json)"
  fi
else
  log_ok "photos déjà présentes ($PHOTO_COUNT)"
fi

echo "5. Déclaration (si pas encore déclarée)"
DECLARED=$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.declared===true?'true':'false')" "$DETAIL" 2>/dev/null || echo false)
if [[ "$DECLARED" != "true" ]]; then
  LINES=$(node -e "const d=JSON.parse(process.argv[1]); const lines=(d.adjustmentLines||[]).map(l=>({productLabel:l.productLabel,unit:l.unit,quantityAccepted:l.quantityExpected})); console.log(JSON.stringify({outcome:'full',lines}))" "$DETAIL")
  DECL_CODE=$(curl -s -o /tmp/declare.json -w "%{http_code}" -X POST "$API/deliveries/$DELIVERY_ID/declare" \
    "${AUTH[@]}" -H 'Content-Type: application/json' -d "$LINES")
  if [[ "$DECL_CODE" == "200" ]]; then
    log_ok "déclaration full"
  else
    log_fail "declare HTTP $DECL_CODE — $(cat /tmp/declare.json)"
  fi
else
  log_ok "déjà déclarée"
fi

echo "6. Envoi OTP SMS"
OTP_JSON=$(curl -s -X POST "$API/deliveries/$DELIVERY_ID/send-otp" "${AUTH[@]}") || true
SENT=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.sent===true?'true':'false')" "$OTP_JSON" 2>/dev/null || echo false)
SMS_TO=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.smsTo||'')" "$OTP_JSON" 2>/dev/null || echo '')
DEV_OTP=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.devOtpCode||'')" "$OTP_JSON" 2>/dev/null || echo '')
if [[ "$SENT" == "true" ]]; then
  log_ok "SMS OTP envoyé → $SMS_TO"
else
  WARN=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.smsWarning||j.message||'unknown')" "$OTP_JSON" 2>/dev/null || echo unknown)
  log_fail "SMS non envoyé — $WARN"
fi

echo "7. Confirmation OTP"
if [[ -n "$DEV_OTP" ]]; then
  CONF_CODE=$(curl -s -o /tmp/confirm.json -w "%{http_code}" -X POST "$API/deliveries/$DELIVERY_ID/confirm" \
    "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"otp\":\"$DEV_OTP\",\"lat\":$LAT,\"lng\":$LNG}")
  if [[ "$CONF_CODE" == "200" ]]; then
    log_ok "confirmation + certificat"
  else
    log_fail "confirm HTTP $CONF_CODE — $(cat /tmp/confirm.json)"
  fi
else
  echo "  SKIP confirmation automatique — saisir le code SMS reçu sur $SMS_TO manuellement"
  echo "  → Manager Suivi : ${BASE_URL}/manager/suivi"
fi

echo ""
echo "=== Résultat : $PASS OK, $FAIL échec(s) ==="
[[ $FAIL -eq 0 ]] || exit 1
