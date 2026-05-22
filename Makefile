.PHONY: dev dev-full migrate seed test build-images logs

# ── Development ───────────────────────────────────────────────────────────────

# Start only postgres + redis in Docker, run apps with hot-reload outside.
dev:
	docker compose up -d postgres redis
	pnpm dev

# Start the full stack in Docker (prod images required — run build-images first).
dev-full:
	docker compose -f docker-compose.prod.yml up

# ── Database ──────────────────────────────────────────────────────────────────

migrate:
	pnpm --filter @codeforge/db db:migrate

seed:
	pnpm --filter @codeforge/db db:seed

# ── Testing ───────────────────────────────────────────────────────────────────

test:
	pnpm test

# ── Docker images ─────────────────────────────────────────────────────────────

build-images:
	docker build -t codeforge-api    -f apps/api/Dockerfile          .
	docker build -t codeforge-worker -f apps/judge-worker/Dockerfile .
	docker build -t codeforge-web    -f apps/web/Dockerfile          .

# ── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose logs -f
