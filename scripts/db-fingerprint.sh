#!/usr/bin/env bash
# Affiche l’empreinte hostname d’une URL Postgres (pour config/production-db.fingerprint).
set -euo pipefail
URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: npm run db:fingerprint -- \"\$NETLIFY_DB_URL\"" >&2
  exit 1
fi
node --input-type=module -e "
import { databaseHostFingerprint } from './server/config/databaseProtection.ts';
const fp = databaseHostFingerprint(process.argv[1]);
if (!fp) { console.error('URL invalide'); process.exit(1); }
console.log(fp);
" "$URL"
