import type { Language } from './enums.js';

// ─── Queue names (shared between API producer and worker consumer) ────────────

export const QUEUE_NAMES = {
  CONTEST_SUBMISSIONS: 'contest-submissions',
  PRACTICE_SUBMISSIONS: 'practice-submissions',
  BATCH_EVALUATION: 'batch-evaluation',
  AI_REVIEWS: 'ai-reviews',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job payloads ─────────────────────────────────────────────────────────────

export interface SubmissionJob {
  submissionId: string;
  userId: string;
  problemId: string;
  language: Language;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  mode: 'contest' | 'practice' | 'batch';
  contestId?: string;
  /** BullMQ priority — lower number = higher priority. Set by enqueue logic. */
  priority?: number;
}

export interface AiReviewJob {
  submissionId: string;
}

// ─── Pub/sub result payload (published on Redis channel submissions:{id}) ─────

// ─── Real-time event bridge (judge worker / API → WebSocket gateway) ──────────

export const JUDGE_EVENTS_CHANNEL = 'judge:events';

export interface JudgeEventPayload<T = unknown> {
  /** Target user — gateway emits to room user:{userId} */
  userId: string;
  /** Socket.IO event name emitted to the client */
  event: string;
  data: T;
}

// ─── Pub/sub result payload (judge worker → Redis) ────────────────────────────

export interface JudgeResultPayload {
  submissionId: string;
  verdict: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number;
  totalTestCases: number;
  compileError?: string | null;
  failingTestCase?: {
    input: string;
    expected: string;
    actual: string;
    isHidden: boolean;
  } | null;
}
