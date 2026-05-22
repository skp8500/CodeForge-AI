import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ContestScoringMode,
  Difficulty,
  Language,
  OrgPlan,
  TestCaseCategory,
  UserRole,
  Verdict,
} from '@codeforge/shared';

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const verdictEnum = pgEnum('verdict', [
  Verdict.AC,
  Verdict.WA,
  Verdict.TLE,
  Verdict.MLE,
  Verdict.RE,
  Verdict.CE,
  Verdict.OLE,
  Verdict.IE,
]);

export const difficultyEnum = pgEnum('difficulty', [
  Difficulty.EASY,
  Difficulty.MEDIUM,
  Difficulty.HARD,
]);

export const languageEnum = pgEnum('language', [
  Language.CPP,
  Language.PYTHON,
  Language.JAVA,
  Language.JAVASCRIPT,
]);

export const userRoleEnum = pgEnum('user_role', [
  UserRole.GUEST,
  UserRole.USER,
  UserRole.PROBLEM_SETTER,
  UserRole.ORG_ADMIN,
  UserRole.PLATFORM_ADMIN,
]);

export const orgPlanEnum = pgEnum('org_plan', [OrgPlan.FREE, OrgPlan.PRO, OrgPlan.ENTERPRISE]);

export const scoringModeEnum = pgEnum('scoring_mode', [
  ContestScoringMode.ICPC,
  ContestScoringMode.IOI,
  ContestScoringMode.CUSTOM,
]);

export const testCaseCategoryEnum = pgEnum('test_case_category', [
  TestCaseCategory.SAMPLE,
  TestCaseCategory.BOUNDARY,
  TestCaseCategory.EDGE,
  TestCaseCategory.RANDOM,
  TestCaseCategory.STRESS,
  TestCaseCategory.ADVERSARIAL,
]);

// ─── Table definitions — ordered so every reference points backward ────────────
// users → organizations → org_members
//       → problems → test_cases
//       → contests → contest_problems
//       → submissions → ai_reviews

// ─── Users ─────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).unique().notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: text('password_hash'),
    oauthProvider: varchar('oauth_provider', { length: 20 }),
    oauthId: text('oauth_id'),
    role: userRoleEnum('role').notNull().default(UserRole.USER),
    rating: integer('rating').notNull().default(1200),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    usernameIdx: index('users_username_idx').on(t.username),
  }),
);

// ─── Organizations ─────────────────────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 50 }).unique().notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    plan: orgPlanEnum('plan').notNull().default(OrgPlan.FREE),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('organizations_slug_idx').on(t.slug),
  }),
);

// ─── Org Members ───────────────────────────────────────────────────────────────

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Org-scoped role ('member' | 'admin') — separate from the platform-wide user_role.
    role: varchar('role', { length: 20 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserUnique: uniqueIndex('org_members_org_user_unique').on(t.orgId, t.userId),
    orgIdx: index('org_members_org_idx').on(t.orgId),
    userIdx: index('org_members_user_idx').on(t.userId),
  }),
);

// ─── Problems ──────────────────────────────────────────────────────────────────

export const problems = pgTable(
  'problems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    statement: text('statement').notNull(),
    difficulty: difficultyEnum('difficulty').notNull(),
    constraints: jsonb('constraints'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    timeLimitMs: integer('time_limit_ms').notNull().default(1000),
    memoryLimitMb: integer('memory_limit_mb').notNull().default(256),
    isSpecialJudge: boolean('is_special_judge').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    orgId: uuid('org_id').references(() => organizations.id),
    aiConfidence: real('ai_confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('problems_slug_idx').on(t.slug),
    difficultyIdx: index('idx_problems_difficulty').on(t.difficulty),
    publishedIdx: index('problems_published_idx').on(t.isPublished),
    orgIdx: index('problems_org_idx').on(t.orgId),
    // GIN index enables fast array containment: WHERE tags @> ARRAY['dp']
    tagsGinIdx: index('idx_problems_tags').using('gin', sql`tags`),
  }),
);

// ─── Test Cases ────────────────────────────────────────────────────────────────

export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    input: text('input').notNull(),
    expectedOutput: text('expected_output').notNull(),
    isHidden: boolean('is_hidden').notNull().default(true),
    category: testCaseCategoryEnum('category'),
    createdBy: varchar('created_by', { length: 10 }).notNull().default('ai'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    problemIdx: index('idx_test_cases_problem').on(t.problemId),
    hiddenIdx: index('test_cases_hidden_idx').on(t.isHidden),
  }),
);

// ─── Contests ──────────────────────────────────────────────────────────────────

export const contests = pgTable(
  'contests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    orgId: uuid('org_id').references(() => organizations.id),
    scoringMode: scoringModeEnum('scoring_mode').notNull().default(ContestScoringMode.ICPC),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    slugIdx: uniqueIndex('contests_slug_idx').on(t.slug),
    timeIdx: index('contests_time_idx').on(t.startsAt, t.endsAt),
  }),
);

// ─── Contest Problems ──────────────────────────────────────────────────────────

export const contestProblems = pgTable(
  'contest_problems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(100),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => ({
    contestProblemUnique: uniqueIndex('contest_problems_unique').on(t.contestId, t.problemId),
    contestIdx: index('contest_problems_contest_idx').on(t.contestId),
  }),
);

// ─── Submissions ───────────────────────────────────────────────────────────────
// aiReviewId is a plain uuid (no FK) to avoid a circular dependency with ai_reviews.
// The application updates this column after the review row is inserted.

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id),
    contestId: uuid('contest_id').references(() => contests.id),
    language: languageEnum('language').notNull(),
    code: text('code').notNull(),
    verdict: verdictEnum('verdict'),
    score: integer('score'),
    runtimeMs: integer('runtime_ms'),
    memoryKb: integer('memory_kb'),
    testCasesPassed: integer('test_cases_passed'),
    totalTestCases: integer('total_test_cases'),
    aiReviewId: uuid('ai_review_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('idx_submissions_user').on(t.userId),
    problemIdx: index('idx_submissions_problem').on(t.problemId),
    contestIdx: index('submissions_contest_idx').on(t.contestId),
    verdictIdx: index('submissions_verdict_idx').on(t.verdict),
    submittedAtIdx: index('submissions_submitted_at_idx').on(t.submittedAt),
  }),
);

// ─── AI Reviews ────────────────────────────────────────────────────────────────

export const aiReviews = pgTable('ai_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  // unique() enforces one review per submission at the DB level.
  submissionId: uuid('submission_id')
    .notNull()
    .unique()
    .references(() => submissions.id),
  timeComplexity: varchar('time_complexity', { length: 50 }),
  spaceComplexity: varchar('space_complexity', { length: 50 }),
  correctnessNotes: text('correctness_notes'),
  optimizationHint: text('optimization_hint'),
  dryRun: text('dry_run'),
  qualityScore: real('quality_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  submissions: many(submissions),
  problems: many(problems),
  orgMemberships: many(orgMembers),
  ownedOrganizations: many(organizations),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(orgMembers),
  problems: many(problems),
  contests: many(contests),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, { fields: [orgMembers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  creator: one(users, { fields: [problems.createdBy], references: [users.id] }),
  organization: one(organizations, { fields: [problems.orgId], references: [organizations.id] }),
  testCases: many(testCases),
  submissions: many(submissions),
  contestProblems: many(contestProblems),
}));

export const testCasesRelations = relations(testCases, ({ one }) => ({
  problem: one(problems, { fields: [testCases.problemId], references: [problems.id] }),
}));

export const contestsRelations = relations(contests, ({ one, many }) => ({
  organization: one(organizations, { fields: [contests.orgId], references: [organizations.id] }),
  creator: one(users, { fields: [contests.createdBy], references: [users.id] }),
  submissions: many(submissions),
  contestProblems: many(contestProblems),
}));

export const contestProblemsRelations = relations(contestProblems, ({ one }) => ({
  contest: one(contests, { fields: [contestProblems.contestId], references: [contests.id] }),
  problem: one(problems, { fields: [contestProblems.problemId], references: [problems.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  user: one(users, { fields: [submissions.userId], references: [users.id] }),
  problem: one(problems, { fields: [submissions.problemId], references: [problems.id] }),
  contest: one(contests, { fields: [submissions.contestId], references: [contests.id] }),
  aiReview: one(aiReviews, { fields: [submissions.aiReviewId], references: [aiReviews.id] }),
}));

export const aiReviewsRelations = relations(aiReviews, ({ one }) => ({
  submission: one(submissions, { fields: [aiReviews.submissionId], references: [submissions.id] }),
}));
