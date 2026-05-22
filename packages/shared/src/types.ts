import type {
  ContestScoringMode,
  Difficulty,
  Language,
  OrgPlan,
  TestCaseCategory,
  UserRole,
  Verdict,
} from './enums.js';

// ─── Constraint Range ──────────────────────────────────────────────────────────

export interface ConstraintRange {
  min: number;
  max: number;
}

export interface ProblemConstraints {
  [variable: string]: ConstraintRange;
}

// ─── Problem ───────────────────────────────────────────────────────────────────

export interface Problem {
  id: string;
  title: string;
  slug: string;
  statement: string;
  difficulty: Difficulty;
  constraints: ProblemConstraints;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  isSpecialJudge: boolean;
  isPublished: boolean;
  createdBy: string;
  orgId: string | null;
  aiConfidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Test Case ─────────────────────────────────────────────────────────────────

export interface TestCase {
  id: string;
  problemId: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  category: TestCaseCategory;
  createdBy: 'ai' | 'human';
  createdAt: Date;
}

// ─── Submission ────────────────────────────────────────────────────────────────

export interface Submission {
  id: string;
  userId: string;
  problemId: string;
  contestId: string | null;
  language: Language;
  code: string;
  verdict: Verdict | null;
  score: number | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number | null;
  totalTestCases: number | null;
  aiReviewId: string | null;
  submittedAt: Date;
}

// ─── AI Review ─────────────────────────────────────────────────────────────────

export interface AiReview {
  id: string;
  submissionId: string;
  timeComplexity: string | null;
  spaceComplexity: string | null;
  correctnessNotes: string | null;
  optimizationHint: string | null;
  dryRun: string | null;
  qualityScore: number | null;
  createdAt: Date;
}

// ─── AI Parsed Problem ─────────────────────────────────────────────────────────

export interface AiParsedProblem {
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  constraints: ProblemConstraints;
  inputFormat: string;
  outputFormat: string;
  samples: Array<{
    input: string;
    output: string;
    explanation: string;
  }>;
  expectedComplexity: {
    time: string;
    space: string;
  };
  confidenceScore: number;
}

// ─── User ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  rating: number;
  isVerified: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
}

// ─── Organization ──────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: OrgPlan;
  createdAt: Date;
}

// ─── Contest ───────────────────────────────────────────────────────────────────

export interface Contest {
  id: string;
  title: string;
  slug: string;
  orgId: string | null;
  scoringMode: ContestScoringMode;
  startsAt: Date;
  endsAt: Date;
  isPublic: boolean;
  createdBy: string;
}

// ─── API Response Wrappers ─────────────────────────────────────────────────────

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Judge Job ─────────────────────────────────────────────────────────────────

export interface JudgeJob {
  submissionId: string;
  problemId: string;
  language: Language;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: Array<{
    id: string;
    input: string;
    expectedOutput: string;
    isHidden: boolean;
  }>;
  isSpecialJudge: boolean;
}

export interface JudgeResult {
  submissionId: string;
  verdict: Verdict;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number;
  totalTestCases: number;
  failedTestCase: {
    id: string;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    isHidden: boolean;
  } | null;
  compileError: string | null;
}
