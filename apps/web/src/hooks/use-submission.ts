'use client';
import { useCallback, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createSubmission, getSubmissionReview, cancelSubmission } from '@/lib/api';
import { useEditorStore, type SubmissionVerdict, type AiReview } from '@/store/editor-store';

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let _socket: Socket | null = null;
function getSocket(): Socket {
  if (!_socket) {
    _socket = io(`${WS_URL}/ws`, { transports: ['websocket', 'polling'] });
  }
  return _socket;
}

export function useSubmission(problemId: string, language: string, code: string) {
  const store = useEditorStore();
  const unsubRef = useRef<(() => void) | null>(null);

  const subscribeToVerdict = useCallback(
    (submissionId: string, lang: string) => {
      const socket = getSocket();
      socket.emit('subscribe', { submissionId });

      const onProgress = (data: { current: number; total: number }) => {
        store.setQueuePosition(null);
        store.setExecutingProgress({ current: data.current, total: data.total });
      };

      const onVerdict = (data: SubmissionVerdict) => {
        store.setVerdict(data);
        store.setIsSubmitting(false);
        store.setQueuePosition(null);
        store.setExecutingProgress(null);
        store.setActiveTestTab('result');

        store.prependSubmission({
          id: data.id || submissionId,
          verdict: data.verdict,
          language: lang,
          runtimeMs: data.runtimeMs,
          submittedAt: new Date().toISOString(),
        });

        store.setAiReviewLoading(true);
        setTimeout(async () => {
          try {
            const review = await getSubmissionReview(submissionId);
            store.setAiReview(review as AiReview);
          } catch {
            // Review not ready yet; WebSocket will deliver it
          } finally {
            store.setAiReviewLoading(false);
          }
        }, 2500);
      };

      const onReview = (data: AiReview) => {
        store.setAiReview(data);
        store.setAiReviewLoading(false);
      };

      socket.on('submission:progress', onProgress);
      socket.on('submission:verdict', onVerdict);
      socket.on('submission:review', onReview);

      return () => {
        socket.off('submission:progress', onProgress);
        socket.off('submission:verdict', onVerdict);
        socket.off('submission:review', onReview);
        socket.emit('unsubscribe', { submissionId });
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const submit = useCallback(async () => {
    if (store.isSubmitting) return;
    store.reset();
    store.setIsSubmitting(true);
    store.setActiveTestTab('result');

    try {
      const { submissionId, position } = await createSubmission({ problemId, language, code });
      store.setSubmissionId(submissionId);
      store.setQueuePosition(position);

      unsubRef.current?.();
      unsubRef.current = subscribeToVerdict(submissionId, language);
    } catch (err) {
      store.setIsSubmitting(false);
      store.setVerdict({
        id: '',
        verdict: 'ERROR',
        runtimeMs: null,
        memoryKb: null,
        testCasesPassed: null,
        totalTestCases: null,
      });
      console.error('Submit failed:', err);
    }
  }, [problemId, language, code, store, subscribeToVerdict]);

  const cancel = useCallback(async () => {
    const id = store.submissionId;
    if (!id) return;
    try {
      await cancelSubmission(id);
    } catch {
      // Already judged or not found — just reset UI
    }
    unsubRef.current?.();
    unsubRef.current = null;
    store.reset();
  }, [store]);

  const run = useCallback(async () => {
    if (store.isRunning) return;
    store.setIsRunning(true);
    store.setActiveTestTab('cases');

    try {
      const { submissionId } = await createSubmission({ problemId, language, code });

      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts++;
        const { getSubmissionStatus } = await import('@/lib/api');
        const status = await getSubmissionStatus(submissionId);
        if (status.verdict !== null || attempts >= 20) {
          store.setIsRunning(false);
        } else {
          await new Promise((r) => setTimeout(r, 1000));
          return poll();
        }
      };
      await poll();
    } catch {
      store.setIsRunning(false);
    }
  }, [problemId, language, code, store]);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  return { submit, run, cancel };
}
