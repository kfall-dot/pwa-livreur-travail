#!/usr/bin/env bash
# Vérification complète avant de considérer une livraison « terminée ».
# Usage : npm run verify
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1/4 Build TypeScript + Vite"
npm run build

echo "==> 2/4 Non-régression (serveur + lint + E2E)"
bash scripts/regression.sh

echo "==> 3/4 (inclus ci-dessus) — voir scripts/regression.sh"
echo "==> 4/4 API Livraison (optionnel si Docker actif)"
if curl -sf --max-time 3 http://localhost:3001/health >/dev/null 2>&1; then
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'livraison-api'; then
    echo "WARN: :3001 répond mais conteneur livraison-api absent — vérif API ignorée"
    exit 0
  fi

  PHOTOS_MIN="$(docker inspect livraison-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^PHOTOS_MIN_ONLY=' | cut -d= -f2- || true)"
  if [[ "$PHOTOS_MIN" != "true" ]]; then
    echo "ERREUR: livraison-api sans PHOTOS_MIN_ONLY=true (env actuel: ${PHOTOS_MIN:-non défini})"
    echo "  → cd Livraison && PHOTOS_MIN_ONLY=true GEOFENCE_DISABLED=true docker compose up -d --build api"
    exit 1
  fi

  RUNTIME_MIN="$(docker exec livraison-api node -e "console.log(require('./src/config/index.js').app.photosMinOnly)" 2>/dev/null || echo 'missing')"
  if [[ "$RUNTIME_MIN" != "true" ]]; then
    echo "ERREUR: PHOTOS_MIN_ONLY=true dans Docker mais le code chargé ne l'applique pas (runtime: $RUNTIME_MIN)"
    echo "  → Image obsolète : docker compose up -d --build api dans le monorepo Livraison"
    exit 1
  fi

  COUNT="$(docker exec livraison-api node -e "
    const { requiredPhotoCount } = require('./src/utils/deliveryDeclaration.js');
    console.log(requiredPhotoCount([
      { product_label: 'A', quantity_accepted: 1 },
      { product_label: 'B', quantity_accepted: 1 },
    ]));
  " 2>/dev/null || echo '?')"
  if [[ "$COUNT" != "1" ]]; then
    echo "ERREUR: requiredPhotoCount(2 produits)=$COUNT, attendu 1 avec PHOTOS_MIN_ONLY"
    exit 1
  fi

  echo "OK: livraison-api — PHOTOS_MIN_ONLY actif (1 photo pour OTP même multi-produits)"
else
  echo "SKIP: pas d'API sur :3001 (mode mock seul — OK pour CI sans Docker)"
fi

echo ""
echo "✓ Vérification terminée"
