# Builds the frontend and backend separately, then assembles a single lean
# runtime image that serves both — matches how backend/src/index.ts already
# expects to find the built frontend (../../frontend/dist relative to itself).

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-build
# Must be installed before `prisma generate` runs, not just in the runtime
# stage — Prisma picks its query-engine binary based on the OpenSSL version
# it detects at generate time, and silently defaults to the wrong one
# (openssl-1.1.x) without it, which then fails at runtime on real Alpine.
RUN apk add --no-cache openssl
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build
# Drop devDependencies (typescript, vitest, tsx, supertest, ...) now that the
# build is done — the runtime image only needs what dist/index.js requires.
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=backend-build /app/backend/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN chmod +x docker-entrypoint.sh && mkdir -p /data/uploads

# Runs as an unprivileged user rather than root — standard container hardening.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app /data
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
