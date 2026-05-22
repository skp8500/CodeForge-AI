# ─────────────────────────────────────────────────────────────────────────────
# Build context: repo root
#   docker build -t codeforge-api -f apps/api/Dockerfile .
# ─────────────────────────────────────────────────────────────────────────────

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /repo

# Workspace manifests first — layer-cached until deps change
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json  packages/config/
COPY packages/shared/package.json  packages/shared/
COPY packages/db/package.json      packages/db/
COPY apps/api/package.json         apps/api/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Source
COPY packages/config/  packages/config/
COPY packages/shared/  packages/shared/
COPY packages/db/      packages/db/
COPY apps/api/         apps/api/
COPY tsconfig.json     ./

# Build dependency packages then the API
RUN pnpm --filter @codeforge/shared build
RUN pnpm --filter @codeforge/db     build
RUN pnpm --filter @codeforge/api    build

# Deploy: resolves workspace packages into a standalone node_modules tree
RUN pnpm deploy --filter @codeforge/api --prod /deploy/api

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Production node_modules (workspace packages already resolved by pnpm deploy)
COPY --from=builder /deploy/api/node_modules ./node_modules

# Compiled API
COPY --from=builder /repo/apps/api/dist ./dist

# package.json for module-type resolution
COPY --from=builder /deploy/api/package.json ./

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs \
 && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3001
CMD ["node", "dist/main.js"]
