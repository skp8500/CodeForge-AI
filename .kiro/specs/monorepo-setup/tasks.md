# Tasks: Monorepo Setup

## Task 1: Create Root Workspace Configuration Files

### Description
Set up the root-level configuration files that define the pnpm workspace, Turborepo pipelines, base TypeScript config, Node version, and environment variable template.

### Requirements Addressed
- Requirement 1: Root Workspace Configuration (1.1–1.11)

### Acceptance Criteria
- [ ] 1.1 `pnpm-workspace.yaml` exists listing `apps/*` and `packages/*`
- [ ] 1.2 `turbo.json` exists with `build`, `dev`, `lint`, `test` pipelines
- [ ] 1.3 `build` pipeline has `dependsOn: ["^build"]` and `outputs: ["dist/**", ".next/**"]`
- [ ] 1.4 `dev` pipeline has `cache: false` and `persistent: true`
- [ ] 1.5 `lint` pipeline has `dependsOn: ["^build"]`
- [ ] 1.6 `test` pipeline has `dependsOn: ["build"]`
- [ ] 1.7 Root `package.json` has `dev`, `build`, `lint`, `test` scripts using turbo
- [ ] 1.8 Root `package.json` has `turbo` and `typescript` as devDependencies
- [ ] 1.9 `.nvmrc` specifies Node 20
- [ ] 1.10 `.env.example` contains all 14 required environment variables with placeholders
- [ ] 1.11 Root `tsconfig.json` has strict mode, ES2022 target, ESNext module, bundler resolution, declarations enabled

## Task 2: Create Shared Types Package (packages/shared)

### Description
Create the shared package containing all TypeScript enums, interfaces, and Zod validation schemas used across the monorepo.

### Requirements Addressed
- Requirement 2: Shared Types Package (2.1–2.12)

### Acceptance Criteria
- [ ] 2.1 `packages/shared/package.json` exists with name `@codeforge/shared`
- [ ] 2.2 `Verdict` enum exported with values AC, WA, TLE, MLE, RE, CE, OLE, IE
- [ ] 2.3 `Difficulty` enum exported with values EASY, MEDIUM, HARD
- [ ] 2.4 `Language` enum exported with values CPP, PYTHON, JAVA, JAVASCRIPT
- [ ] 2.5 `UserRole` enum exported with values GUEST, USER, PROBLEM_SETTER, ORG_ADMIN, PLATFORM_ADMIN
- [ ] 2.6 `Problem` interface exported with all specified fields
- [ ] 2.7 `Submission` interface exported with all specified fields
- [ ] 2.8 `TestCase` interface exported with all specified fields
- [ ] 2.9 `AiReview` interface exported with all specified fields
- [ ] 2.10 Zod schemas `ProblemSchema`, `SubmissionSchema`, `TestCaseSchema`, `AiReviewSchema` exported
- [ ] 2.11 `zod` declared as a dependency in package.json
- [ ] 2.12 `tsconfig.json` extends root base TypeScript configuration

## Task 3: Create Database Package (packages/db)

### Description
Create the database package with Drizzle ORM schema definitions and migration configuration.

### Requirements Addressed
- Requirement 3: Database Package (3.1–3.6)

### Acceptance Criteria
- [ ] 3.1 `packages/db/package.json` exists with name `@codeforge/db`
- [ ] 3.2 `drizzle-orm`, `drizzle-kit`, and `pg` declared as dependencies
- [ ] 3.3 Drizzle ORM schema file exists defining table structures
- [ ] 3.4 `drizzle.config.ts` exists for migration configuration
- [ ] 3.5 `@codeforge/shared` declared as a workspace dependency
- [ ] 3.6 `tsconfig.json` extends root base TypeScript configuration

## Task 4: Create Config Package (packages/config)

### Description
Create the shared configuration package providing ESLint, TypeScript, and Tailwind CSS presets for all workspace packages.

### Requirements Addressed
- Requirement 4: Config Package (4.1–4.7)

### Acceptance Criteria
- [ ] 4.1 `packages/config/package.json` exists with name `@codeforge/config`
- [ ] 4.2 Base ESLint configuration file exists and is exportable
- [ ] 4.3 Next.js-specific ESLint configuration file exists
- [ ] 4.4 NestJS/Node-specific ESLint configuration file exists
- [ ] 4.5 TypeScript config presets for Next.js and Node.js exist
- [ ] 4.6 Shared Tailwind CSS preset with base theme exists
- [ ] 4.7 `eslint`, `@typescript-eslint/eslint-plugin`, `tailwindcss`, `prettier` declared as dependencies

## Task 5: Create Next.js Frontend Application (apps/web)

### Description
Scaffold the Next.js 14 frontend application with App Router, extending shared configs.

### Requirements Addressed
- Requirement 5: Next.js Frontend Application (5.1–5.7)

### Acceptance Criteria
- [ ] 5.1 `apps/web/package.json` exists with name `@codeforge/web`
- [ ] 5.2 Configured as Next.js 14 with App Router
- [ ] 5.3 `next`, `react`, `react-dom`, `tailwindcss` declared as dependencies
- [ ] 5.4 `@codeforge/shared` and `@codeforge/config` declared as workspace dependencies
- [ ] 5.5 `tsconfig.json` extends shared Next.js TypeScript configuration
- [ ] 5.6 ESLint configuration extends shared Next.js ESLint config
- [ ] 5.7 Minimal App Router structure with root layout and page exists

## Task 6: Create NestJS Backend Application (apps/api)

### Description
Scaffold the NestJS backend API application, extending shared configs and configured for port 3001.

### Requirements Addressed
- Requirement 6: NestJS Backend Application (6.1–6.7)

### Acceptance Criteria
- [ ] 6.1 `apps/api/package.json` exists with name `@codeforge/api`
- [ ] 6.2 Configured as a NestJS project with TypeScript
- [ ] 6.3 `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` declared as dependencies
- [ ] 6.4 `@codeforge/shared`, `@codeforge/db`, `@codeforge/config` declared as workspace dependencies
- [ ] 6.5 `tsconfig.json` extends shared Node.js TypeScript configuration
- [ ] 6.6 ESLint configuration extends shared NestJS ESLint config
- [ ] 6.7 Minimal NestJS bootstrap file exists configured for port 3001

## Task 7: Create Judge Worker Application (apps/judge-worker)

### Description
Scaffold the standalone judge worker Node.js process, extending shared configs.

### Requirements Addressed
- Requirement 7: Judge Worker Application (7.1–7.6)

### Acceptance Criteria
- [ ] 7.1 `apps/judge-worker/package.json` exists with name `@codeforge/judge-worker`
- [ ] 7.2 Configured as standalone Node.js TypeScript process
- [ ] 7.3 `@codeforge/shared`, `@codeforge/db`, `@codeforge/config` declared as workspace dependencies
- [ ] 7.4 `tsconfig.json` extends shared Node.js TypeScript configuration
- [ ] 7.5 ESLint configuration extends shared Node ESLint config
- [ ] 7.6 Minimal entry point `src/index.ts` exists

## Task 8: Create Git Configuration and Project Documentation

### Description
Set up .gitignore for the monorepo and create a comprehensive README with setup instructions.

### Requirements Addressed
- Requirement 8: Git and Project Documentation (8.1–8.2)

### Acceptance Criteria
- [ ] 8.1 `.gitignore` ignores `node_modules`, `dist`, `.next`, `.turbo`, `.env`, and build artifacts
- [ ] 8.2 Root `README.md` explains prerequisites, installation, and available scripts
