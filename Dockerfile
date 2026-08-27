



# Image unique : npm embarqué de l'image Node (aucun apk add — le npm d'Alpine
# casse l'environnement du runner). Le frontend est servi par Netlify :
# Railway ne build et n'héberge que l'API Express.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:server

EXPOSE 3000
CMD ["node", "dist-server/server/index.js"]
