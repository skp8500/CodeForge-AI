import { z } from 'zod';

import {
  ContestScoringMode,
  Difficulty,
  Language,
  OrgPlan,
  TestCaseCategory,
  UserRole,
  Verdict,
} from './enums.js';

// ─── Primitives ────────────────────────────────────────────────────────────────

const UuidSchema = z.string().uuid();
const DateSchema = z.coerce.date();

// ─── Constraint Range ──────────────────────────────────────────────────────────

export const ConstraintRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

export const ProblemConstraintsSchema = z.record(z.string(), ConstraintRangeSchema);

// ─── Problem ───────────────────────────────────────────────────────────────────

export const ProblemSchema = z.object({
  id: UuidSchema,
  title: z.string().min(3).max(255),
  slug: z.string().min(3).max(255),
  statement: z.string().min(1),
  difficulty: z.nativeEnum(Difficulty),
  constraints: ProblemConstraintsSchema,
  tags: z.array(z.string()),
  timeLimitMs: z.number().int().min(100).max(10000),
  memoryLimitMb: z.number().int().min(16).max(1024),
  isSpecialJudge: z.boolean(),
  isPublished: z.boolean(),
  createdBy: UuidSchema,
  orgId: UuidSchema.nullable(),
  aiConfidence: z.number().min(0).max(1).nullable(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
});

export type ProblemDto = z.infer<typeof ProblemSchema>;

// ─── Test Case ─────────────────────────────────────────────────────────────────

export const TestCaseSchema = z.object({
  id: UuidSchema,
  problemId: UuidSchema,
  input: z.string(),
  expectedOutput: z.string(),
  isHidden: z.boolean(),
  category: z.nativeEnum(TestCaseCategory),
  createdBy: z.enum(['ai', 'human']),
  createdAt: DateSchema,
});

export type TestCaseDto = z.infer<typeof TestCaseSchema>;

// ─── Submission ────────────────────────────────────────────────────────────────

export const SubmissionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  problemId: UuidSchema,
  contestId: UuidSchema.nullable(),
  language: z.nativeEnum(Language),
  code: z.string().min(1).max(65536),
  verdict: z.nativeEnum(Verdict).nullable(),
  score: z.number().int().nullable(),
  runtimeMs: z.number().int().nonnegative().nullable(),
  memoryKb: z.number().int().nonnegative().nullable(),
  testCasesPassed: z.number().int().nonnegative().nullable(),
  totalTestCases: z.number().int().nonnegative().nullable(),
  aiReviewId: UuidSchema.nullable(),
  submittedAt: DateSchema,
});

export type SubmissionDto = z.infer<typeof SubmissionSchema>;

// ─── Create Submission Request ─────────────────────────────────────────────────

export const CreateSubmissionSchema = z.object({
  problemId: UuidSchema,
  contestId: UuidSchema.optional(),
  language: z.nativeEnum(Language),
  code: z.string().min(1).max(65536),
});

export type CreateSubmissionDto = z.infer<typeof CreateSubmissionSchema>;

// ─── AI Review ─────────────────────────────────────────────────────────────────

export const AiReviewSchema = z.object({
  id: UuidSchema,
  submissionId: UuidSchema,
  timeComplexity: z.string().nullable(),
  spaceComplexity: z.string().nullable(),
  correctnessNotes: z.string().nullable(),
  optimizationHint: z.string().nullable(),
  dryRun: z.string().nullable(),
  qualityScore: z.number().min(0).max(1).nullable(),
  createdAt: DateSchema,
});

export type AiReviewDto = z.infer<typeof AiReviewSchema>;

// ─── AI Parsed Problem ─────────────────────────────────────────────────────────

export const AiParsedProblemSchema = z.object({
  title: z.string().min(3).max(255),
  difficulty: z.nativeEnum(Difficulty),
  tags: z.array(z.string()),
  timeLimitMs: z.number().int().min(100).max(10000),
  memoryLimitMb: z.number().int().min(16).max(1024),
  constraints: ProblemConstraintsSchema,
  inputFormat: z.string(),
  outputFormat: z.string(),
  samples: z.array(
    z.object({
      input: z.string(),
      output: z.string(),
      explanation: z.string(),
    }),
  ),
  expectedComplexity: z.object({
    time: z.string(),
    space: z.string(),
  }),
  confidenceScore: z.number().min(0).max(1),
});

export type AiParsedProblemDto = z.infer<typeof AiParsedProblemSchema>;

// ─── Parse Problem Request ─────────────────────────────────────────────────────

export const ParseProblemRequestSchema = z.object({
  rawText: z.string().min(10).max(50000),
});

export type ParseProblemRequestDto = z.infer<typeof ParseProblemRequestSchema>;

// ─── User ──────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: UuidSchema,
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  rating: z.number().int().min(0),
  isVerified: z.boolean(),
  createdAt: DateSchema,
  lastActiveAt: DateSchema.nullable(),
});

export type UserDto = z.infer<typeof UserSchema>;

// ─── Register Request ──────────────────────────────────────────────────────────

export const RegisterRequestSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
    }),
});

export type RegisterRequestDto = z.infer<typeof RegisterRequestSchema>;

// ─── Login Request ─────────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;

// ─── Organization ──────────────────────────────────────────────────────────────

export const OrganizationSchema = z.object({
  id: UuidSchema,
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  ownerId: UuidSchema,
  plan: z.nativeEnum(OrgPlan),
  createdAt: DateSchema,
});

export type OrganizationDto = z.infer<typeof OrganizationSchema>;

// ─── Contest ───────────────────────────────────────────────────────────────────

export const ContestSchema = z.object({
  id: UuidSchema,
  title: z.string().min(3).max(255),
  slug: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9-]+$/),
  orgId: UuidSchema.nullable(),
  scoringMode: z.nativeEnum(ContestScoringMode),
  startsAt: DateSchema,
  endsAt: DateSchema,
  isPublic: z.boolean(),
  createdBy: UuidSchema,
});

export type ContestDto = z.infer<typeof ContestSchema>;

// ─── Judge Job ─────────────────────────────────────────────────────────────────

export const JudgeJobSchema = z.object({
  submissionId: UuidSchema,
  problemId: UuidSchema,
  language: z.nativeEnum(Language),
  code: z.string().min(1),
  timeLimitMs: z.number().int().min(100),
  memoryLimitMb: z.number().int().min(16),
  testCases: z.array(
    z.object({
      id: UuidSchema,
      input: z.string(),
      expectedOutput: z.string(),
      isHidden: z.boolean(),
    }),
  ),
  isSpecialJudge: z.boolean(),
});

export type JudgeJobDto = z.infer<typeof JudgeJobSchema>;

// ─── Judge Result ──────────────────────────────────────────────────────────────

export const JudgeResultSchema = z.object({
  submissionId: UuidSchema,
  verdict: z.nativeEnum(Verdict),
  runtimeMs: z.number().int().nonnegative().nullable(),
  memoryKb: z.number().int().nonnegative().nullable(),
  testCasesPassed: z.number().int().nonnegative(),
  totalTestCases: z.number().int().nonnegative(),
  failedTestCase: z
    .object({
      id: UuidSchema,
      input: z.string(),
      expectedOutput: z.string(),
      actualOutput: z.string(),
      isHidden: z.boolean(),
    })
    .nullable(),
  compileError: z.string().nullable(),
});

export type JudgeResultDto = z.infer<typeof JudgeResultSchema>;

// ─── Paginated Response ────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  });
