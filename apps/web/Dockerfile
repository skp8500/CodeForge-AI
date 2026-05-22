# ─────────────────────────────────────────────────────────────────────────────
# Build context: repo root
#   docker build -t codeforge-web -f apps/web/Dockerfile .
#
# Uses Next.js "standalone" output mode:
#   https://nextjs.org/docs/app/api-reference/next-config-js/output#automatically-copying-traced-files
# Produces a minimal server bundle in .next/standalone/ — no full node_modules.
# ─────────────────────────────────────────────────────────────────────────────

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json  packages/config/
COPY packages/shared/package.json  packages/shared/
COPY apps/web/package.json         apps/web/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/config/  packages/config/
COPY packages/shared/  packages/shared/
COPY apps/web/         apps/web/

# Build shared package first (transpilePackages still needs the source)
RUN pnpm --filter @codeforge/shared build

# Build Next.js in standalone mode
WORKDIR /repo/apps/web
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone bundle (includes a minimal server.js + required node_modules)
COPY --from=builder /repo/apps/web/.next/standalone ./

# Static assets and public directory must be placed alongside the standalone server
COPY --from=builder /repo/apps/web/.next/static  .next/static
COPY --from=builder /repo/apps/web/public         public

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
# next.js standalone server — started from the repo root inside the container
CMD ["node", "apps/web/server.js"]
