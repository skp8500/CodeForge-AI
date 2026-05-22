# Requirements: Monorepo Setup

## Requirement 1: Root Workspace Configuration

### Acceptance Criteria

1.1. A `pnpm-workspace.yaml` file exists at the repository root listing `apps/*` and `packages/*` as workspace packages.

1.2. A `turbo.json` file exists at the repository root with pipelines for `build`, `dev`, `lint`, and `test` tasks.

1.3. The `build` pipeline depends on upstream builds (`^build`) and outputs `dist/**` and `.next/**`.

1.4. The `dev` pipeline has caching disabled and persistence enabled.

1.5. The `lint` pipeline depends on upstream builds (`^build`).

1.6. The `test` pipeline depends on the local `build` task.

1.7. A root `package.json` exists with scripts: `dev` (runs `turbo run dev --parallel`), `build` (runs `turbo run build`), `lint` (runs `turbo run lint`), and `test` (runs `turbo run test`).

1.8. The root `package.json` declares `turbo` and `typescript` as devDependencies.

1.9. An `.nvmrc` file exists at the root specifying Node.js version 20.

1.10. A `.env.example` file exists at the root containing all required environment variables with placeholder values: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AWS_REGION`, `AWS_S3_BUCKET`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.

1.11. A base `tsconfig.json` exists at the root with `strict` mode enabled, `target` set to `ES2022`, `module` set to `ESNext`, `moduleResolution` set to `bundler`, and `declaration` enabled.

## Requirement 2: Shared Types Package (packages/shared)

### Acceptance Criteria

2.1. A `packages/shared` directory exists with a valid `package.json` using the name `@codeforge/shared`.

2.2. The package exports a `Verdict` enum with values: `AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`, `OLE`, `IE`.

2.3. The package exports a `Difficulty` enum with values: `EASY`, `MEDIUM`, `HARD`.

2.4. The package exports a `Language` enum with values: `CPP`, `PYTHON`, `JAVA`, `JAVASCRIPT`.

2.5. The package exports a `UserRole` enum with values: `GUEST`, `USER`, `PROBLEM_SETTER`, `ORG_ADMIN`, `PLATFORM_ADMIN`.

2.6. The package exports a `Problem` interface with fields: `id`, `title`, `slug`, `statement`, `difficulty`, `constraints`, `tags`, `timeLimitMs`, `memoryLimitMb`, `isSpecialJudge`.

2.7. The package exports a `Submission` interface with fields: `id`, `userId`, `problemId`, `language`, `code`, `verdict`, `runtimeMs`, `memoryKb`, `testCasesPassed`, `totalTestCases`.

2.8. The package exports a `TestCase` interface with fields: `id`, `problemId`, `input`, `expectedOutput`, `isHidden`, `category`.

2.9. The package exports an `AiReview` interface with fields: `timeComplexity`, `spaceComplexity`, `correctnessNotes`, `optimizationHint`, `dryRun`.

2.10. The package exports Zod schemas `ProblemSchema`, `SubmissionSchema`, `TestCaseSchema`, and `AiReviewSchema` that validate to their corresponding interfaces.

2.11. The package declares `zod` as a dependency.

2.12. The package has a `tsconfig.json` that extends the root base TypeScript configuration.

## Requirement 3: Database Package (packages/db)

### Acceptance Criteria

3.1. A `packages/db` directory exists with a valid `package.json` using the name `@codeforge/db`.

3.2. The package declares `drizzle-orm`, `drizzle-kit`, and `pg` as dependencies.

3.3. The package contains a Drizzle ORM schema file defining table structures.

3.4. The package contains a `drizzle.config.ts` file for migration configuration.

3.5. The package depends on `@codeforge/shared` as a workspace dependency.

3.6. The package has a `tsconfig.json` that extends the root base TypeScript configuration.

## Requirement 4: Config Package (packages/config)

### Acceptance Criteria

4.1. A `packages/config` directory exists with a valid `package.json` using the name `@codeforge/config`.

4.2. The package provides a base ESLint configuration exportable by consuming packages.

4.3. The package provides a Next.js-specific ESLint configuration.

4.4. The package provides a NestJS/Node-specific ESLint configuration.

4.5. The package provides TypeScript configuration presets for Next.js and Node.js applications.

4.6. The package provides a shared Tailwind CSS preset with base theme configuration.

4.7. The package declares `eslint`, `@typescript-eslint/eslint-plugin`, `tailwindcss`, and `prettier` as dependencies.

## Requirement 5: Next.js Frontend Application (apps/web)

### Acceptance Criteria

5.1. An `apps/web` directory exists with a valid `package.json` using the name `@codeforge/web`.

5.2. The application is configured as a Next.js 14 project using the App Router.

5.3. The application declares `next`, `react`, `react-dom`, and `tailwindcss` as dependencies.

5.4. The application depends on `@codeforge/shared` and `@codeforge/config` as workspace dependencies.

5.5. The application has a `tsconfig.json` that extends the shared Next.js TypeScript configuration.

5.6. The application has an ESLint configuration extending the shared Next.js ESLint config.

5.7. The application contains a minimal App Router structure with a root layout and page.

## Requirement 6: NestJS Backend Application (apps/api)

### Acceptance Criteria

6.1. An `apps/api` directory exists with a valid `package.json` using the name `@codeforge/api`.

6.2. The application is configured as a NestJS project with TypeScript.

6.3. The application declares `@nestjs/core`, `@nestjs/common`, and `@nestjs/platform-express` as dependencies.

6.4. The application depends on `@codeforge/shared`, `@codeforge/db`, and `@codeforge/config` as workspace dependencies.

6.5. The application has a `tsconfig.json` that extends the shared Node.js TypeScript configuration.

6.6. The application has an ESLint configuration extending the shared NestJS ESLint config.

6.7. The application contains a minimal NestJS bootstrap file configured for port 3001.

## Requirement 7: Judge Worker Application (apps/judge-worker)

### Acceptance Criteria

7.1. An `apps/judge-worker` directory exists with a valid `package.json` using the name `@codeforge/judge-worker`.

7.2. The application is configured as a standalone Node.js TypeScript process.

7.3. The application depends on `@codeforge/shared`, `@codeforge/db`, and `@codeforge/config` as workspace dependencies.

7.4. The application has a `tsconfig.json` that extends the shared Node.js TypeScript configuration.

7.5. The application has an ESLint configuration extending the shared Node ESLint config.

7.6. The application contains a minimal entry point file (`src/index.ts`).

## Requirement 8: Git and Project Documentation

### Acceptance Criteria

8.1. A `.gitignore` file exists at the root ignoring `node_modules`, `dist`, `.next`, `.turbo`, `.env`, and other build artifacts.

8.2. A root `README.md` exists explaining how to set up and run the project locally, including prerequisites, installation steps, and available scripts.
