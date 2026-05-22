# ─────────────────────────────────────────────────────────────────────────────
# Build context: repo root
#   docker build -t codeforge-worker -f apps/judge-worker/Dockerfile .
#
# PRODUCTION NOTE — Docker socket access:
#   The judge worker spawns isolated Docker containers for code execution.
#   In production, grant access to the host Docker daemon by mounting the
#   socket at runtime — never bake it into the image:
#
#     docker run --rm \
#       -v /var/run/docker.sock:/var/run/docker.sock \
#       codeforge-worker
#
#   Alternatively, use a DinD (Docker-in-Docker) sidecar and point
#   DOCKER_HOST=tcp://dind:2375 at the sidecar's exposed port.
#   DinD requires the sidecar to run with --privileged, which may be
#   restricted in managed Kubernetes environments.
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
COPY packages/config/package.json      packages/config/
COPY packages/shared/package.json      packages/shared/
COPY packages/db/package.json          packages/db/
COPY apps/judge-worker/package.json    apps/judge-worker/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/config/    packages/config/
COPY packages/shared/    packages/shared/
COPY packages/db/        packages/db/
COPY apps/judge-worker/  apps/judge-worker/
COPY tsconfig.json       ./

RUN pnpm --filter @codeforge/shared   build
RUN pnpm --filter @codeforge/db       build
RUN pnpm --filter @codeforge/judge-worker build

RUN pnpm deploy --filter @codeforge/judge-worker --prod /deploy/worker

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# docker CLI is needed if the worker shells out to `docker` commands.
# Dockerode (used here) talks directly to the Docker socket — no CLI needed.
# Install only the minimal runtime requirements.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /deploy/worker/node_modules ./node_modules
COPY --from=builder /repo/apps/judge-worker/dist ./dist
COPY --from=builder /deploy/worker/package.json  ./

# Seccomp profiles used when spawning containers
COPY docker/ /docker/

# Non-root user — note: socket access requires the user to be in the
# 'docker' group on the host (GID typically 999 or varies by distro).
# In Kubernetes, use a hostPath volume + appropriate securityContext instead.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 worker \
 && chown -R worker:nodejs /app
USER worker

# Runtime env vars (override via docker run -e or compose env_file)
ENV REDIS_URL=redis://redis:6379
ENV DATABASE_URL=postgresql://codeforge:devpassword@postgres:5432/codeforge

CMD ["node", "dist/index.js"]
