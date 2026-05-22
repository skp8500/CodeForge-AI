# CodeForge AI

An AI-powered online coding judge platform. Converts raw natural language problem statements into fully structured coding challenges — with AI-generated test cases, sandboxed execution, and intelligent feedback.

## Monorepo Structure

```
codeforge-ai/
├── apps/
│   ├── web/           # Next.js 14 frontend (App Router, TypeScript)
│   ├── api/           # NestJS backend (TypeScript)
│   └── judge-worker/  # Standalone Node.js judge worker process
├── packages/
│   ├── shared/        # Shared TypeScript types, enums, and Zod schemas
│   ├── db/            # Drizzle ORM schema and migrations
│   └── config/        # Shared ESLint, TypeScript, Tailwind configs
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Prerequisites

- **Node.js** >= 20 (use `nvm use` or `fnm use`)
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Docker** (for the judge sandbox and local Postgres/Redis)
- **PostgreSQL** 16
- **Redis** 7

## Local Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-org/codeforge-ai.git
cd codeforge-ai
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Fill in your values in .env
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `JWT_ACCESS_SECRET` | Secret for signing access JWTs |
| `JWT_REFRESH_SECRET` | Secret for signing refresh JWTs |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `AWS_REGION` | AWS region for S3 |
| `AWS_S3_BUCKET` | S3 bucket name |
| `NEXT_PUBLIC_API_URL` | Public URL for the API (used by the frontend) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for real-time judge results |

### 3. Start local infrastructure

```bash
# Start Postgres + Redis via Docker Compose (added in Phase 1 implementation)
docker compose up -d postgres redis
```

### 4. Run database migrations

```bash
pnpm --filter @codeforge/db db:generate
pnpm --filter @codeforge/db db:migrate
```

### 5. Start all apps in development mode

```bash
pnpm dev
```

This runs all three apps in parallel via Turborepo:

| App | URL |
|---|---|
| `apps/web` | http://localhost:3000 |
| `apps/api` | http://localhost:3001 |
| `apps/api` (Swagger) | http://localhost:3001/api/docs |
| `apps/judge-worker` | (background process, no HTTP) |

### Running a single app

```bash
pnpm --filter @codeforge/web dev
pnpm --filter @codeforge/api dev
pnpm --filter @codeforge/judge-worker dev
```

## Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm --filter <package> <script>` | Run a script in a specific package |

## Package Reference

### `@codeforge/shared`

Shared TypeScript interfaces, enums, and Zod schemas used across all apps.

```ts
import { Verdict, Difficulty, Language, UserRole } from '@codeforge/shared';
import { ProblemSchema, SubmissionSchema } from '@codeforge/shared';
```

### `@codeforge/db`

Drizzle ORM schema and database client. Import the singleton `getDb()` to access the database.

```ts
import { getDb, problems, submissions } from '@codeforge/db';

const db = getDb();
const allProblems = await db.select().from(problems);
```

### `@codeforge/config`

Shared configuration files. Consumed via `extends` in each app's config files — not imported in application code.

## Architecture Overview

```
Browser
  └── apps/web (Next.js 14)
        └── apps/api (NestJS) ──── packages/db (Drizzle + Postgres)
              └── apps/judge-worker (BullMQ + Docker)
                    └── Docker Sandbox (per-submission container)
```

Real-time submission results are pushed from `apps/api` to the browser via WebSockets (Socket.IO).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, Monaco Editor |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL 16, Drizzle ORM |
| Queue | Redis 7, BullMQ |
| Code Execution | Docker + seccomp profiles |
| AI | OpenAI GPT-4o |
| Real-time | Socket.IO |
| Build | pnpm workspaces, Turborepo |
