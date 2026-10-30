# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend/open-sse/package.json backend/open-sse/package.json
COPY backend/open-sse ./backend/open-sse
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY . .
RUN npm run build --workspace=9router-frontend
RUN npm run build --workspace=9router-backend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
# Pastikan DATA_DIR selalu ada di dalam container (Back4App tanpa volume eksternal).
RUN mkdir -p /data
# Deployment single-container (mis. Back4App tanpa layanan MySQL terpisah):
# izinkan SQLite persisten di /data agar app tidak langsung exit saat start.
# Jika MYSQL_URL di-set (Railway MySQL), guard ini otomatis tidak dipakai.
ENV ALLOW_EPHEMERAL_SQLITE=true

# Chromium untuk MAX Browser (render halaman + JavaScript, ala Chrome sungguhan).
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY backend/bin backend/bin
COPY backend/open-sse/package.json backend/open-sse/package.json
COPY backend/open-sse ./backend/open-sse
RUN npm ci --omit=dev
# puppeteer-core dipasang --no-save supaya package-lock.json tetap sinkron dengan npm ci.
RUN npm install --no-save --omit=dev puppeteer-core@23.11.0

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist
# Generated browser profiles are excluded by .dockerignore.
COPY backend/src ./backend/src

EXPOSE 3001
CMD ["npm", "run", "start", "--workspace=9router-backend"]
