



FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache npm
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3000
CMD ["node", "dist-server/server/index.js"]
