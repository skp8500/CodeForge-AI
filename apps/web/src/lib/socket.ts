import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Event data shapes ────────────────────────────────────────────────────────

export interface QueuedData {
  submissionId: string;
  position: number;
}

export interface ExecutingData {
  submissionId: string;
  completed: number;
  total: number;
}

export interface VerdictData {
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

export interface ReviewData {
  submissionId: string;
  review: {
    id: string;
    submissionId: string;
    timeComplexity: string | null;
    spaceComplexity: string | null;
    correctnessNotes: string | null;
    optimizationHint: string | null;
    dryRun: string | null;
    qualityScore: number | null;
    createdAt: Date;
  };
}

export interface SubmissionCallbacks {
  onQueued?: (data: QueuedData) => void;
  onExecuting?: (data: ExecutingData) => void;
  onVerdict?: (data: VerdictData) => void;
  onReview?: (data: ReviewData) => void;
}

// ─── Singleton socket ─────────────────────────────────────────────────────────

let _socket: Socket | null = null;

export function getJudgeSocket(): Socket {
  if (_socket?.connected) return _socket;

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  _socket = io(`${API_URL}/judge`, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return _socket;
}

export function disconnectJudgeSocket(): void {
  _socket?.disconnect();
  _socket = null;
}

// ─── Per-submission subscription ──────────────────────────────────────────────

export function subscribeToSubmission(
  submissionId: string,
  callbacks: SubmissionCallbacks,
): () => void {
  const socket = getJudgeSocket();

  const onQueued = (data: QueuedData) => {
    if (data.submissionId !== submissionId) return;
    callbacks.onQueued?.(data);
  };

  const onExecuting = (data: ExecutingData) => {
    if (data.submissionId !== submissionId) return;
    callbacks.onExecuting?.(data);
  };

  const onVerdict = (data: VerdictData) => {
    if (data.submissionId !== submissionId) return;
    callbacks.onVerdict?.(data);
  };

  const onReview = (data: ReviewData) => {
    if (data.submissionId !== submissionId) return;
    callbacks.onReview?.(data);
  };

  socket.on('submission:queued', onQueued);
  socket.on('submission:executing', onExecuting);
  socket.on('submission:verdict', onVerdict);
  socket.on('submission:review', onReview);

  return () => {
    socket.off('submission:queued', onQueued);
    socket.off('submission:executing', onExecuting);
    socket.off('submission:verdict', onVerdict);
    socket.off('submission:review', onReview);
  };
}
