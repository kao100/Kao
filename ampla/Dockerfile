FROM node:22-alpine

# curl e unzip são usados pelos scripts de carga dos dados abertos.
RUN apk add --no-cache curl unzip

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY types ./types
COPY src ./src
COPY ingest ./ingest
COPY web ./web

ENV NODE_ENV=production
EXPOSE 3000

# Roda direto do TypeScript pelo strip-types do Node 22 — sem passo de build.
CMD ["node", "--experimental-strip-types", "src/server.ts"]
