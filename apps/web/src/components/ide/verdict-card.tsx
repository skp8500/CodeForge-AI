'use client';
import { useMemo } from 'react';
import { useEditorStore, type SubmissionVerdict } from '@/store/editor-store';

const CONFETTI_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

// ─── Confetti burst ───────────────────────────────────────────────────────────

function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: 2 + Math.random() * 96,
        delay: Math.random() * 0.7,
        dur: 0.9 + Math.random() * 0.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        w: 5 + Math.random() * 8,
        h: 4 + Math.random() * 5,
        rot: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onCancel: () => void;
}

export function VerdictCard({ onCancel }: Props) {
  const { verdict, isSubmitting, queuePosition, executingProgress, submissionId } = useEditorStore();

  // Queued — position received from HTTP response, waiting for execution
  if (isSubmitting && !executingProgress && !verdict) {
    if (queuePosition !== null) {
      return (
        <div className="animate-slide-up rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
                <span className="inline-block animate-spin">⏳</span>
                Waiting in queue…
              </div>
              <div className="text-xs text-blue-400/80">
                {queuePosition === 0 ? "You're next!" : `~${queuePosition} ahead of you`}
              </div>
            </div>
            {submissionId && (
              <button
                onClick={onCancel}
                className="rounded border border-blue-500/40 px-2.5 py-1 text-xs text-blue-300 transition-colors hover:bg-blue-500/20"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      );
    }
    // Brief gap between POST and first WS event
    return (
      <div className="space-y-2">
        <div className="h-12 animate-pulse rounded bg-gray-800" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-gray-800" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-gray-800" />
      </div>
    );
  }

  // Executing — progress WS event arrived
  if (isSubmitting && executingProgress && !verdict) {
    const pct =
      executingProgress.total > 0
        ? Math.round((executingProgress.current / executingProgress.total) * 100)
        : 0;
    return (
      <div className="animate-slide-up rounded-lg border border-gray-700 bg-gray-800/60 p-4">
        <div className="mb-2 text-sm font-semibold text-gray-200">Running test cases…</div>
        <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-gray-400">
          {executingProgress.current} / {executingProgress.total}
        </div>
      </div>
    );
  }

  if (!verdict) return null;

  const v = verdict.verdict;
  if (v === 'AC') return <AcceptedCard verdict={verdict} />;
  if (v === 'WA') return <WrongAnswerCard verdict={verdict} />;
  if (v === 'TLE') return <TLECard verdict={verdict} />;
  if (v === 'CE') return <CECard verdict={verdict} />;
  return <GenericCard verdict={verdict} />;
}

// ─── AC ───────────────────────────────────────────────────────────────────────

function AcceptedCard({ verdict }: { verdict: SubmissionVerdict }) {
  return (
    <div className="animate-slide-up relative overflow-hidden rounded-lg border border-green-500/40 bg-gradient-to-br from-green-900/30 to-emerald-950/30 p-4">
      <Confetti />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-xl font-bold text-green-300">
          <span>✓</span>
          <span>Accepted</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {verdict.runtimeMs != null && (
            <span className="rounded bg-green-900/40 px-2 py-1 text-green-200">
              {verdict.runtimeMs}ms runtime
              {verdict.runtimePercentile != null && (
                <span className="ml-1 text-green-400">
                  · faster than {verdict.runtimePercentile}%
                </span>
              )}
            </span>
          )}
          {verdict.memoryKb != null && (
            <span className="rounded bg-green-900/40 px-2 py-1 text-green-200">
              {(verdict.memoryKb / 1024).toFixed(1)} MB memory
              {verdict.memoryPercentile != null && (
                <span className="ml-1 text-green-400">
                  · better than {verdict.memoryPercentile}%
                </span>
              )}
            </span>
          )}
          {verdict.testCasesPassed != null && verdict.totalTestCases != null && (
            <span className="rounded bg-green-900/40 px-2 py-1 text-green-200">
              {verdict.testCasesPassed}/{verdict.totalTestCases} tests
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WA ───────────────────────────────────────────────────────────────────────

function WrongAnswerCard({ verdict }: { verdict: SubmissionVerdict }) {
  return (
    <div className="animate-slide-up rounded-lg border border-red-500/40 bg-red-950/20 p-4">
      <div className="flex items-center gap-2 text-lg font-bold text-red-300">
        <span>✗</span>
        <span>Wrong Answer</span>
      </div>
      {verdict.testCasesPassed != null && verdict.totalTestCases != null && (
        <div className="mt-1 text-xs text-red-300/70">
          {verdict.testCasesPassed} / {verdict.totalTestCases} tests passed
        </div>
      )}
      {verdict.failingTestCase && (
        <div className="mt-3">
          {verdict.failingTestCase.isHidden ? (
            <div className="rounded border border-red-800/40 bg-red-900/20 px-3 py-2 text-xs text-red-300/80">
              The failing test case is hidden — check your edge cases carefully.
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-red-800/40 text-xs">
              <div className="bg-red-900/30 px-3 py-1.5 font-medium text-red-300">
                Failing Test Case
              </div>
              <div className="divide-y divide-red-800/30">
                <div className="p-2.5">
                  <div className="mb-1 text-red-400/70">Input</div>
                  <pre className="whitespace-pre-wrap font-mono text-red-100/80">
                    {verdict.failingTestCase.input}
                  </pre>
                </div>
                <div className="grid grid-cols-2 divide-x divide-red-800/30">
                  <div className="p-2.5">
                    <div className="mb-1 text-green-500/80">Expected</div>
                    <pre className="whitespace-pre-wrap font-mono text-green-300">
                      {verdict.failingTestCase.expected}
                    </pre>
                  </div>
                  <div className="p-2.5">
                    <div className="mb-1 text-red-400/70">Your Output</div>
                    <pre className="whitespace-pre-wrap font-mono text-red-300">
                      {verdict.failingTestCase.actual}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TLE ──────────────────────────────────────────────────────────────────────

function TLECard({ verdict }: { verdict: SubmissionVerdict }) {
  return (
    <div className="animate-slide-up rounded-lg border border-orange-500/40 bg-orange-950/20 p-4">
      <div className="flex items-center gap-2 text-lg font-bold text-orange-300">
        <span>⏱</span>
        <span>Time Limit Exceeded</span>
      </div>
      <p className="mt-2 text-xs text-orange-200/80">
        {verdict.runtimeMs != null
          ? `Your solution ran for ${verdict.runtimeMs}ms — try a more efficient algorithm.`
          : 'Your solution exceeded the time limit. Try a more efficient algorithm.'}
      </p>
      {verdict.testCasesPassed != null && verdict.totalTestCases != null && (
        <div className="mt-1 text-xs text-orange-300/60">
          {verdict.testCasesPassed} / {verdict.totalTestCases} tests passed before timeout
        </div>
      )}
    </div>
  );
}

// ─── CE ───────────────────────────────────────────────────────────────────────

function CECard({ verdict }: { verdict: SubmissionVerdict }) {
  return (
    <div className="animate-slide-up rounded-lg border border-slate-500/40 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 text-base font-bold text-slate-300">
        <span>⚠</span>
        <span>Compilation Error</span>
      </div>
      {verdict.compileError && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs leading-relaxed text-red-300">
          {verdict.compileError}
        </pre>
      )}
    </div>
  );
}

// ─── Generic (MLE, RE, OLE, IE, ERROR, CANCELLED) ────────────────────────────

const GENERIC_CONFIG: Record<string, { border: string; text: string; icon: string; label: string }> = {
  MLE:       { border: 'border-purple-500/40', text: 'text-purple-300', icon: '💾', label: 'Memory Limit Exceeded' },
  RE:        { border: 'border-pink-500/40',   text: 'text-pink-300',   icon: '💥', label: 'Runtime Error' },
  OLE:       { border: 'border-orange-500/40', text: 'text-orange-300', icon: '📤', label: 'Output Limit Exceeded' },
  IE:        { border: 'border-gray-500/40',   text: 'text-gray-300',   icon: '?',  label: 'Internal Error — please try again' },
  CANCELLED: { border: 'border-gray-600/40',   text: 'text-gray-400',   icon: '✕',  label: 'Cancelled' },
  ERROR:     { border: 'border-gray-500/40',   text: 'text-gray-300',   icon: '!',  label: 'Submission Error' },
};

function GenericCard({ verdict }: { verdict: SubmissionVerdict }) {
  const v = verdict.verdict ?? 'IE';
  const cfg = GENERIC_CONFIG[v] ?? GENERIC_CONFIG['IE']!;
  return (
    <div className={`animate-slide-up rounded-lg border ${cfg.border} bg-gray-900/40 p-4`}>
      <div className={`flex items-center gap-2 text-base font-bold ${cfg.text}`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>
      {verdict.testCasesPassed != null && verdict.totalTestCases != null && (
        <div className={`mt-2 text-xs ${cfg.text} opacity-70`}>
          {verdict.testCasesPassed} / {verdict.totalTestCases} tests passed
        </div>
      )}
    </div>
  );
}
