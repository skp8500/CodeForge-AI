'use client';
import { useEditorStore } from '@/store/editor-store';
import type { ProblemDetail } from '@/lib/api';
import { VerdictCard } from './verdict-card';
import { AiReviewCard } from './ai-review-card';

interface Props {
  problem: ProblemDetail;
  onRun: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const TABS = [
  { key: 'cases', label: 'Test Cases' },
  { key: 'input', label: 'Custom Input' },
  { key: 'result', label: 'Submission' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export function TestPanel({ problem, onRun, onSubmit, onCancel }: Props) {
  const {
    activeTestTab,
    setActiveTestTab,
    customInput,
    setCustomInput,
    isRunning,
    isSubmitting,
    verdict,
    aiReview,
    aiReviewLoading,
    aiRating,
    setAiRating,
  } = useEditorStore();

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-800">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTestTab(key as Tab)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTestTab === key
                ? 'border-b-2 border-brand-500 text-brand-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2 px-3">
          <button
            onClick={onRun}
            disabled={isRunning || isSubmitting}
            className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-50"
          >
            {isRunning ? 'Running…' : '▶ Run'}
          </button>
          <button
            onClick={onSubmit}
            disabled={isRunning || isSubmitting}
            className="rounded bg-brand-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : '↑ Submit'}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* Test Cases */}
        {activeTestTab === 'cases' && (
          <div className="space-y-3 p-3">
            {problem.sampleTestCases.map((tc, i) => (
              <div key={i} className="rounded border border-gray-800 bg-gray-800/40">
                <div className="border-b border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400">
                  Test {i + 1}
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-700">
                  <div className="p-2.5">
                    <div className="mb-1 text-xs text-gray-500">Input</div>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">
                      {tc.input}
                    </pre>
                  </div>
                  <div className="p-2.5">
                    <div className="mb-1 text-xs text-gray-500">Expected</div>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="animate-spin">⏳</span> Running test cases…
              </div>
            )}
          </div>
        )}

        {/* Custom Input */}
        {activeTestTab === 'input' && (
          <div className="flex h-full flex-col p-3">
            <label className="mb-1.5 text-xs text-gray-500">Custom stdin</label>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="flex-1 resize-none rounded border border-gray-700 bg-gray-800 p-2 font-mono text-xs text-gray-200 focus:border-brand-500 focus:outline-none"
              placeholder="Enter custom input here…"
              spellCheck={false}
            />
          </div>
        )}

        {/* Submission Result */}
        {activeTestTab === 'result' && (
          <div className="space-y-3 p-3">
            <VerdictCard onCancel={onCancel} />

            {!isSubmitting && !verdict && (
              <p className="text-sm text-gray-500">Submit your code to see results here.</p>
            )}

            {(aiReview || aiReviewLoading) && verdict && (
              <AiReviewCard
                review={aiReview}
                loading={aiReviewLoading}
                rating={aiRating}
                onRate={setAiRating}
                verdict={verdict.verdict}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
