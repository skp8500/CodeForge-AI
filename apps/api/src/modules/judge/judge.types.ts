import { z } from 'zod';

import type { Language } from '@codeforge/shared';

// ─── Request DTOs ─────────────────────────────────────────────────────────────

// Runtime schema (used by ZodValidationPipe — Language is validated as a string
// at runtime so we avoid z.nativeEnum / z.enum with workspace-package values,
// which break ts-jest Zod inference when the enum resolves as `any`).
export const CreateSubmissionBodySchema = z.object({
  problemId: z.string().uuid('problemId must be a valid UUID'),
  language: z.string().min(1, 'language is required'),
  code: z.string().min(1, 'Code is required').max(65_536, 'Code exceeds 64 KB limit'),
  contestId: z.string().uuid('contestId must be a valid UUID').optional(),
});

// Explicit interface (not z.infer) so TypeScript always has a concrete shape
// regardless of how ts-jest resolves the workspace package imports.
export interface CreateSubmissionBodyDto {
  problemId: string;
  language: Language;
  code: string;
  contestId?: string;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface SubmissionEnqueuedResponse {
  submissionId: string;
  /** Approximate position in the queue at the time of enqueue. */
  position: number;
}

export interface SubmissionStatusResponse {
  id: string;
  userId: string;
  problemId: string;
  contestId: string | null;
  language: string;
  /** null while judging is in progress */
  verdict: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number | null;
  totalTestCases: number | null;
  submittedAt: Date;
}

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const CONTEST_QUEUE_TOKEN = 'CONTEST_QUEUE';
export const PRACTICE_QUEUE_TOKEN = 'PRACTICE_QUEUE';
export const BATCH_QUEUE_TOKEN = 'BATCH_QUEUE';
export const BULL_CONNECTION_TOKEN = 'BULL_CONNECTION';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_PENDING_PER_USER = 5;
