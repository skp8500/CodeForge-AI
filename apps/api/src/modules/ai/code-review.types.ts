import { z } from 'zod';

import type { Language, Verdict } from '@codeforge/shared';

// ─── DB / response shape ──────────────────────────────────────────────────────

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

// ─── Internal request shape (passed to prompt builder) ───────────────────────

export interface ReviewRequest {
  submissionId: string;
  code: string;
  language: Language;
  verdict: Verdict;
  problemStatement: string;
  problemConstraints: object;
  timeLimitMs: number;
  failingTestCaseInput?: string;
  failingTestCaseExpected?: string;
  /** Not stored in DB — omitted when building from DB records. */
  failingTestCaseActual?: string;
  runtimeMs?: number;
  memoryKb?: number;
}

// ─── OpenAI JSON response schema ──────────────────────────────────────────────

export const AiReviewResultSchema = z.object({
  timeComplexity: z.string().max(50),
  spaceComplexity: z.string().max(50),
  correctnessNotes: z.string(),
  optimizationHint: z.string().nullable(),
  dryRun: z.string().nullable(),
  qualityScore: z.number().min(0).max(1),
});

export type AiReviewResult = z.infer<typeof AiReviewResultSchema>;

// ─── API DTOs ─────────────────────────────────────────────────────────────────

export const ReviewSubmissionBodySchema = z.object({
  submissionId: z.string().uuid('submissionId must be a valid UUID'),
});

export interface ReviewSubmissionBodyDto {
  submissionId: string;
}

// ─── DI tokens ────────────────────────────────────────────────────────────────

export const AI_BULL_CONNECTION_TOKEN = 'AI_BULL_CONNECTION';
export const AI_REVIEW_QUEUE_TOKEN = 'AI_REVIEW_QUEUE';
