'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  verifyAssessmentToken,
  logCandidateFlag,
  submitCandidateSession,
  candidateCreateSubmission,
  getSubmissionStatus,
  type CandidateVerifyResult,
  type AssessmentProblem,
} from '@/lib/api';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  { ssr: false },
);

const LANG_MAP: Record<string, string> = {
  cpp: 'cpp',
  python: 'python',
  java: 'java',
  javascript: 'javascript',
};

interface Props {
  assessmentId: string;
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function useCountdown(endAt: Date | null): { display: string; expired: boolean } {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!endAt) return;
    const tick = () => setRemaining(Math.max(0, endAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]);

  if (!endAt) return { display: '--:--:--', expired: false };
  const expired = remaining === 0;
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1_000);
  const display = [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  return { display, expired };
}

// ─── Problem statement renderer ────────────────────────────────────────────────

function ProblemView({ problem }: { problem: AssessmentProblem }) {
  return (
    <div className="h-full overflow-y-auto px-5 py-5 text-sm text-gray-200">
      <h2 className="text-lg font-bold mb-1">{problem.title}</h2>
      <span className={`text-xs rounded px-2 py-0.5 ${
        problem.difficulty === 'easy' ? 'bg-green-500/10 text-green-400' :
        problem.difficulty === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
        'bg-red-500/10 text-red-400'
      }`}>{problem.difficulty}</span>
      <p className="mt-3 text-xs text-gray-500">
        Time: {problem.timeLimitMs}ms · Memory: {problem.memoryLimitMb}MB
      </p>
      <div className="mt-4 prose prose-invert prose-sm max-w-none">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-300">
          {problem.statement}
        </pre>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssessClient({ assessmentId }: Props) {
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready' | 'submitted'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<CandidateVerifyResult | null>(null);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState<Record<number, string>>({});
  const [verdict, setVerdict] = useState<Record<number, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const candidateJwtRef = useRef<string>('');
  const autoSubmittedRef = useRef(false);

  // Compute session end time
  const sessionEndAt = data
    ? (() => {
        const startMs = new Date(data.session.startedAt).getTime();
        const durationMs = data.assessment.durationMinutes * 60 * 1000;
        const endMs = new Date(data.assessment.endsAt).getTime();
        return new Date(Math.min(startMs + durationMs, endMs));
      })()
    : null;

  const { display: timerDisplay, expired: timerExpired } = useCountdown(sessionEndAt);

  // ─── Verify token on mount ─────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setErrorMsg('No candidate token in URL. Check your invitation link.');
      setPhase('error');
      return;
    }

    void verifyAssessmentToken(assessmentId, token)
      .then((result) => {
        candidateJwtRef.current = result.candidateJwt;
        setData(result);

        // Pick default language from allowed list
        const allowed = result.assessment.allowedLanguages;
        if (allowed.length > 0) setLanguage(allowed[0]!);

        // Restore code from sessionStorage if resuming
        result.problems.forEach((_, idx) => {
          const saved = sessionStorage.getItem(`assess:${assessmentId}:code:${idx}`);
          if (saved) setCode((prev) => ({ ...prev, [idx]: saved }));
        });

        setPhase('ready');
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to verify token');
        setPhase('error');
      });
  }, [assessmentId]);

  // ─── Tab switch detection ──────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'ready') return;

    const handleVisibility = () => {
      if (document.hidden) {
        void logCandidateFlag(
          assessmentId,
          { type: 'tab_switch', metadata: { timestamp: new Date().toISOString() } },
          candidateJwtRef.current,
        ).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [assessmentId, phase]);

  // ─── Paste detection ───────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'ready') return;

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (text.length > 10) {
        void logCandidateFlag(
          assessmentId,
          { type: 'paste', metadata: { contentLength: text.length, timestamp: new Date().toISOString() } },
          candidateJwtRef.current,
        ).catch(() => {});
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [assessmentId, phase]);

  // ─── Auto-submit on timer expiry ───────────────────────────────────────────

  const handleFinalSubmit = useCallback(async () => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    try {
      const result = await submitCandidateSession(assessmentId, candidateJwtRef.current);
      setFinalScore(result.score);
      setPhase('submitted');
    } catch {
      setPhase('submitted');
    }
  }, [assessmentId]);

  useEffect(() => {
    if (timerExpired && phase === 'ready') {
      void handleFinalSubmit();
    }
  }, [timerExpired, phase, handleFinalSubmit]);

  // ─── Persist code to sessionStorage ───────────────────────────────────────

  const handleCodeChange = (value: string | undefined, idx: number) => {
    const v = value ?? '';
    setCode((prev) => ({ ...prev, [idx]: v }));
    sessionStorage.setItem(`assess:${assessmentId}:code:${idx}`, v);
  };

  // ─── Submit code for a single problem ─────────────────────────────────────

  const handleRunSubmit = async (problemId: string, idx: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { submissionId } = await candidateCreateSubmission(
        { problemId, language, code: code[idx] ?? '' },
        candidateJwtRef.current,
      );

      // Poll for verdict
      let attempts = 0;
      const poll = async (): Promise<void> => {
        attempts++;
        const status = await getSubmissionStatus(submissionId);
        if (status.verdict !== null || attempts >= 30) {
          setVerdict((prev) => ({ ...prev, [idx]: status.verdict }));
        } else {
          await new Promise((r) => setTimeout(r, 1500));
          return poll();
        }
      };
      await poll();
    } catch (err) {
      console.error('Submit failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render states ─────────────────────────────────────────────────────────

  if (phase === 'loading') return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      <p className="text-sm text-gray-400">Verifying your invitation…</p>
    </div>
  );

  if (phase === 'error') return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950">
      <p className="text-lg font-semibold text-red-400">Access Denied</p>
      <p className="text-sm text-gray-500">{errorMsg}</p>
    </div>
  );

  if (phase === 'submitted') return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-950">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center max-w-md">
        <p className="text-4xl mb-4">✓</p>
        <h1 className="text-2xl font-bold text-green-400 mb-2">Assessment Submitted</h1>
        <p className="text-gray-400 mb-4">
          {data?.assessment.title ?? 'Assessment'} completed.
        </p>
        {finalScore !== null && (
          <p className="text-3xl font-bold text-gray-100">{finalScore} pts</p>
        )}
        <p className="mt-4 text-xs text-gray-600">You may close this tab.</p>
      </div>
    </div>
  );

  const problems = data?.assessment ? (data as CandidateVerifyResult).problems : [];
  const currentProblem = problems[currentProblemIdx] as AssessmentProblem | undefined;
  const allowedLangs = data?.assessment.allowedLanguages ?? [];
  const timerColor = timerExpired ? 'text-red-400' : (
    sessionEndAt && sessionEndAt.getTime() - Date.now() < 5 * 60_000
      ? 'text-yellow-400'
      : 'text-green-400'
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-100">
      {/* ── Top bar ── */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-200">{data?.assessment.title}</span>
          <span className="text-xs text-gray-500">{problems.length} problem{problems.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:outline-none"
          >
            {allowedLangs.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>

          {/* Timer */}
          <div className={`font-mono text-sm font-bold ${timerColor}`}>
            {timerDisplay}
          </div>

          {/* Final submit */}
          <button
            onClick={handleFinalSubmit}
            disabled={submitting}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Submit Assessment
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Problem navigator sidebar */}
        <div className="w-14 shrink-0 flex flex-col items-center border-r border-gray-800 bg-gray-900 pt-3 gap-2">
          {problems.map((p, idx) => {
            const v = verdict[idx];
            const isActive = idx === currentProblemIdx;
            const bg = v === 'AC'
              ? 'bg-green-600'
              : v != null
              ? 'bg-red-600'
              : isActive
              ? 'bg-blue-600'
              : 'bg-gray-700 hover:bg-gray-600';
            return (
              <button
                key={p.id}
                onClick={() => setCurrentProblemIdx(idx)}
                className={`h-9 w-9 rounded-lg text-xs font-bold text-white ${bg}`}
                title={p.title}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Problem statement */}
        <div className="w-[380px] shrink-0 border-r border-gray-800 overflow-hidden">
          {currentProblem ? <ProblemView problem={currentProblem} /> : (
            <div className="p-5 text-sm text-gray-500">No problem selected</div>
          )}
        </div>

        {/* Code editor + actions */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language={LANG_MAP[language] ?? 'plaintext'}
              value={code[currentProblemIdx] ?? ''}
              onChange={(v) => handleCodeChange(v, currentProblemIdx)}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderWhitespace: 'selection',
              }}
            />
          </div>

          {/* Bottom action bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-gray-800 bg-gray-900 px-4">
            <div className="flex items-center gap-3">
              {currentProblem && verdict[currentProblemIdx] && (
                <span className={`text-xs font-semibold ${verdict[currentProblemIdx] === 'AC' ? 'text-green-400' : 'text-red-400'}`}>
                  {verdict[currentProblemIdx]}
                </span>
              )}
              {submitting && (
                <span className="text-xs text-blue-400 animate-pulse">Judging…</span>
              )}
            </div>
            <button
              onClick={() => currentProblem && handleRunSubmit(currentProblem.id, currentProblemIdx)}
              disabled={submitting || !currentProblem || !(code[currentProblemIdx]?.trim())}
              className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Submit Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
