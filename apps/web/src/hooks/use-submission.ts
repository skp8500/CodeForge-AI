'use client';
import { useCallback, useEffect, useRef } from 'react';
import { createSubmission, getSubmissionReview, cancelSubmission } from '@/lib/api';
import { subscribeToSubmission, type VerdictData, type ReviewData } from '@/lib/socket';
import { useEditorStore, type SubmissionVerdict, type AiReview } from '@/store/editor-store';

export function useSubmission(problemId: string, language: string, code: string) {
  const store = useEditorStore();
  const unsubRef = useRef<(() => void) | null>(null);

  const subscribeToVerdict = useCallback(
    (submissionId: string, lang: string) => {
      return subscribeToSubmission(submissionId, {
        onExecuting(data) {
          store.setQueuePosition(null);
          store.setExecutingProgress({
            current: data.testCasesComplete,
            total: data.totalTestCases,
          });
        },

        onVerdict(data: VerdictData) {
          const verdict: SubmissionVerdict = {
            id: data.submissionId,
            verdict: data.verdict,
            runtimeMs: data.runtimeMs,
            memoryKb: data.memoryKb,
            testCasesPassed: data.testCasesPassed,
            totalTestCases: data.totalTestCases,
            compileError: data.compileError,
            failingTestCase: data.failingTestCase,
          };

          store.setVerdict(verdict);
          store.setIsSubmitting(false);
          store.setQueuePosition(null);
          store.setExecutingProgress(null);
          store.setActiveTestTab('result');

          store.prependSubmission({
            id: data.submissionId,
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
              // Review not ready yet — WebSocket will deliver it via onReview
            } finally {
              store.setAiReviewLoading(false);
            }
          }, 2500);
        },

        onReview(data: ReviewData) {
          store.setAiReview(data.review as AiReview);
          store.setAiReviewLoading(false);
        },
      });
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
      // Already judged or not found — reset UI regardless
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
