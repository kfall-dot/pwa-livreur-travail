



# Image unique : npm embarqué de l'image Node (aucun apk add — le npm d'Alpine
# casse l'environnement du runner). Depuis la bascule « tout sur Railway »,
# ce conteneur build ET sert le frontend (dist/) et l'API Express sur la même
# origine — Netlify ne sert plus le frontend.
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# build = tsc -b + vite build (frontend → dist/) ; build:server → dist-server/
RUN npm run build && npm run build:server

ENV NODE_ENV=production
# Photos : sur Railway, Netlify Blobs n'est pas disponible → stockage local sur
# le Volume monté dans /data (Railway → Service → Volumes → mount path /data).
# En local, PHOTOS_DIR est ignoré si non défini : défaut .data/delivery-photos.
ENV PHOTO_STORAGE=local
ENV PHOTOS_DIR=/data/delivery-photos
EXPOSE 3000
# Au boot : appliquer les migrations DB (idempotent, erreurs tolérées) puis démarrer.
CMD ["sh", "-c", "node scripts/apply-btp-migration.mjs || true; exec node dist-server/server/index.js"]
