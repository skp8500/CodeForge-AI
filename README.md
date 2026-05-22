# CodeForge AI — Local Development

## Prerequisites
- Node.js 20+ (use nvm: `nvm use`)
- pnpm 9+ (`npm install -g pnpm`)
- Docker Desktop (running)
- Git

## First-Time Setup

### 1. Install dependencies
pnpm install

### 2. Set up environment
cp .env.example .env
# Edit .env and fill in:
# - OPENAI_API_KEY (required — get from platform.openai.com)
# - SMTP credentials (get free account at mailtrap.io)
# - Google/GitHub OAuth (optional — only needed for OAuth login)

### 3. Start infrastructure
make infra
# Starts PostgreSQL and Redis in Docker
# PostgreSQL: localhost:5432
# Redis:      localhost:6379
# Redis UI:   http://localhost:8081

### 4. Run database migrations
make migrate

### 5. Seed the database
make seed
# Creates 3 test users and 10 sample problems

### 6. Build Docker judge images
make build-judge-images
# Takes 2-3 minutes on first run

### 7. Verify setup
make verify
# Checks all services are ready

### 8. Start the application
make dev
# Starts all three services:
# Frontend:     http://localhost:3000
# API:          http://localhost:3001/api/v1
# Judge Worker: (background process)

## Test Accounts
| Role           | Email                     | Password   |
|----------------|---------------------------|------------|
| Admin          | admin@codeforge.local     | Admin@123  |
| Problem Setter | setter@codeforge.local    | Setter@123 |
| Regular User   | user@codeforge.local      | User@123   |

## Service URLs
| Service         | URL                                        |
|-----------------|--------------------------------------------|
| Frontend        | http://localhost:3000                      |
| API             | http://localhost:3001/api/v1               |
| API Health      | http://localhost:3001/api/v1/health        |
| Swagger Docs    | http://localhost:3001/api/docs             |
| Redis UI        | http://localhost:8081                      |

## Common Commands
| Command                | Description                            |
|------------------------|----------------------------------------|
| make dev               | Start all services                     |
| make infra             | Start PostgreSQL + Redis only          |
| make migrate           | Run DB migrations                      |
| make seed              | Seed sample data                       |
| make reset-db          | Wipe and re-seed database              |
| make build-judge-images| Build Docker sandbox images            |
| make verify            | Check all dependencies are ready       |
| make clean             | Remove all build artifacts             |

## Troubleshooting

**Port already in use:**
lsof -i :3000 (or 3001, 5432, 6379) → kill the process

**Docker permission denied:**
Make sure Docker Desktop is running.
On Linux: sudo usermod -aG docker $USER (then log out and back in)

**Database connection refused:**
make infra → wait for "✓ PostgreSQL ready"

**Judge Worker won't start:**
make build-judge-images → then restart

**OAuth not working locally:**
OAuth is optional for development. Use email/password login instead.
