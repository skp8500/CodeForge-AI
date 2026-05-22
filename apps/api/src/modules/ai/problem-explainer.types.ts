import { z } from 'zod';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ExplanationLevel = 'eli5' | 'standard' | 'expert';

export interface RelatedProblem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
}

export interface ExplainProblemResponse {
  explanation: string;
  relatedProblems: RelatedProblem[];
}

export interface HintResponse {
  hint: string;
  hintsRemaining: number;
}

export interface FollowupResponse {
  answer: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Zod schemas (runtime validation) ────────────────────────────────────────
//
// Using z.string() for enum-like fields to avoid ts-jest inference issues
// with z.enum(). The service validates the value before using it.

export const ExplainProblemBodySchema = z.object({
  problemId: z.string().uuid('problemId must be a valid UUID'),
  level: z
    .string()
    .min(1)
    .refine((v) => ['eli5', 'standard', 'expert'].includes(v), {
      message: "level must be 'eli5', 'standard', or 'expert'",
    }),
});

export interface ExplainProblemBodyDto {
  problemId: string;
  level: ExplanationLevel;
}

export const FollowupBodySchema = z.object({
  problemId: z.string().uuid('problemId must be a valid UUID'),
  question: z.string().min(1, 'Question is required').max(2000),
  conversationHistory: z
    .array(
      z.object({
        role: z.string().refine((v) => ['user', 'assistant'].includes(v), {
          message: "role must be 'user' or 'assistant'",
        }),
        content: z.string().max(10_000),
      }),
    )
    .max(50),
});

export interface FollowupBodyDto {
  problemId: string;
  question: string;
  conversationHistory: ConversationMessage[];
}

// ─── OpenAI hints response schema ─────────────────────────────────────────────

export const HintsResponseSchema = z.object({
  hints: z.array(z.string()).length(3),
});

// ─── Rate limit / TTL constants ───────────────────────────────────────────────

export const EXPLAIN_RATE_LIMIT = 20;      // requests per hour per user
export const FOLLOWUP_RATE_LIMIT = 10;     // questions per problem per user (lifetime)
export const HINTS_TTL_SECONDS = 604_800;  // 7 days
