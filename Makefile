.PHONY: infra infra-down dev migrate seed reset-db build test clean logs help build-judge-images verify

help:
	@echo ""
	@echo "CodeForge AI — Available Commands"
	@echo "----------------------------------"
	@echo "make infra        Start PostgreSQL + Redis"
	@echo "make infra-down   Stop infrastructure containers"
	@echo "make migrate      Run database migrations"
	@echo "make seed         Seed database with sample data"
	@echo "make reset-db     Drop + recreate + migrate + seed"
	@echo "make dev          Start all services in dev mode"
	@echo "make build        Build all packages"
	@echo "make test         Run all tests"
	@echo "make logs         Tail all dev logs"
	@echo "make clean        Remove node_modules and build artifacts"
	@echo ""

infra:
	docker-compose up -d postgres redis redis-commander
	@echo "Waiting for services to be healthy..."
	@until docker-compose exec postgres pg_isready -U codeforge > /dev/null 2>&1; do sleep 1; done
	@echo "✓ PostgreSQL ready"
	@until docker-compose exec redis redis-cli ping > /dev/null 2>&1; do sleep 1; done
	@echo "✓ Redis ready"
	@echo ""
	@echo "Services running:"
	@echo "  PostgreSQL  → localhost:5432"
	@echo "  Redis       → localhost:6379"
	@echo "  Redis UI    → http://localhost:8081"

infra-down:
	docker-compose down

migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

reset-db:
	docker-compose exec postgres psql -U codeforge -c "DROP DATABASE IF EXISTS codeforge;"
	docker-compose exec postgres psql -U codeforge -c "CREATE DATABASE codeforge;"
	pnpm db:migrate
	pnpm db:seed
	@echo "✓ Database reset complete"

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

build-judge-images:
	bash apps/judge-worker/scripts/build-images.sh

verify:
	pnpm verify

logs:
	pnpm dev 2>&1 | tee dev.log

clean:
	powershell -Command "Get-ChildItem -Path . -Recurse -Directory -Force | Where-Object { $$_.Name -in @('node_modules','dist','.next','.turbo') } | Sort-Object FullName -Descending | Remove-Item -Recurse -Force"
	@echo "✓ Clean complete"
