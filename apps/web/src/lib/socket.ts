import { io, Socket } from 'socket.io-client';

import { getAccessToken } from './auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

// ─── Event data shapes ────────────────────────────────────────────────────────

export interface QueuedData {
  submissionId: string;
  position: number;
}

export interface ExecutingData {
  submissionId: string;
  testCasesComplete: number;
  totalTestCases: number;
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

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket || socket.disconnected) {
    const token = getAccessToken();
    socket = io(`${WS_URL}/judge`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.log('WebSocket connected'));
    socket.on('disconnect', (reason) => console.log('WebSocket disconnected:', reason));
    socket.on('connect_error', (err) => console.error('WebSocket error:', err.message));
  }

  return socket;
}

export function getJudgeSocket(): Socket {
  return getSocket();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function disconnectJudgeSocket(): void {
  disconnectSocket();
}

// ─── Per-submission subscription ──────────────────────────────────────────────

export function subscribeToSubmission(
  submissionId: string,
  callbacks: SubmissionCallbacks,
): () => void {
  const socket = getSocket();

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
