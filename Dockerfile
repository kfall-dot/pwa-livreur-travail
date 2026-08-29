



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
EXPOSE 3000
# Au boot : appliquer les migrations DB (idempotent, erreurs tolérées) puis démarrer.
CMD ["sh", "-c", "node scripts/apply-btp-migration.mjs || true; exec node dist-server/server/index.js"]
