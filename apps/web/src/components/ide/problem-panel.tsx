'use client';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { DifficultyBadge } from '@/components/ui/difficulty-badge';
import { VerdictBadge } from '@/components/ui/verdict-badge';
import { useEditorStore } from '@/store/editor-store';
import { getHint, getProblemSubmissions } from '@/lib/api';
import type { ProblemDetail, SubmissionListItem } from '@/lib/api';

interface Props {
  problem: ProblemDetail;
}

const TAB_LABELS = [
  { key: 'description', label: 'Description' },
  { key: 'examples', label: 'Examples' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'submissions', label: 'Submissions' },
] as const;

type Tab = (typeof TAB_LABELS)[number]['key'];

export function ProblemPanel({ problem }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('description');
  const [submissions, setSubmissions] = useState<SubmissionListItem[] | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const { revealedHints, hintsRemaining, addHint, openDrawer } = useEditorStore();

  const handleTabChange = async (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'submissions' && !submissions) {
      setLoadingSubmissions(true);
      try {
        const data = await getProblemSubmissions(problem.id);
        setSubmissions(data);
      } catch {
        setSubmissions([]);
      } finally {
        setLoadingSubmissions(false);
      }
    }
  };

  const handleGetHint = async () => {
    const nextHint = (revealedHints.length + 1) as 1 | 2 | 3;
    if (nextHint > 3) return;
    try {
      const data = await getHint(problem.id, nextHint);
      addHint(data.hint, data.hintsRemaining);
    } catch (err) {
      console.error('Hint fetch failed:', err);
    }
  };

  const { setCode } = useEditorStore();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base font-semibold text-gray-100">{problem.title}</h1>
          <DifficultyBadge difficulty={problem.difficulty} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {problem.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5 text-xs text-gray-500">
          <span>Time: {problem.timeLimitMs}ms</span>
          <span>·</span>
          <span>Memory: {problem.memoryLimitMb}MB</span>
          <span>·</span>
          <span>
            AC: {(problem.stats.acceptanceRate * 100).toFixed(1)}% (
            {problem.stats.totalSubmissions} submissions)
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === key
                ? 'border-b-2 border-brand-500 text-brand-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'description' && (
          <div className="px-4 py-3">
            <div className="prose prose-invert prose-sm max-w-none prose-code:text-brand-400 prose-pre:bg-gray-800">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {problem.statement}
              </Markdown>
            </div>
          </div>
        )}

        {activeTab === 'examples' && (
          <div className="space-y-4 px-4 py-3">
            {problem.sampleTestCases.length === 0 ? (
              <p className="text-sm text-gray-500">No sample test cases available.</p>
            ) : (
              problem.sampleTestCases.map((tc, i) => (
                <div key={i} className="rounded-lg border border-gray-800 bg-gray-800/50">
                  <div className="border-b border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400">
                    Example {i + 1}
                  </div>
                  <div className="grid grid-cols-2 gap-0 divide-x divide-gray-700">
                    <div className="p-3">
                      <div className="mb-1 text-xs font-medium text-gray-500">Input</div>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">
                        {tc.input}
                      </pre>
                    </div>
                    <div className="p-3">
                      <div className="mb-1 text-xs font-medium text-gray-500">Output</div>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">
                        {tc.expectedOutput}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'constraints' && (
          <div className="px-4 py-3">
            <pre className="rounded bg-gray-800 p-3 font-mono text-xs text-gray-200">
              {JSON.stringify(problem.constraints, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="px-4 py-3">
            {loadingSubmissions ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-gray-800" />
                ))}
              </div>
            ) : !submissions || submissions.length === 0 ? (
              <p className="text-sm text-gray-500">No submissions yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500">
                    <th className="pb-2 pr-3 font-medium">Verdict</th>
                    <th className="pb-2 pr-3 font-medium">Language</th>
                    <th className="pb-2 pr-3 font-medium">Runtime</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr
                      key={sub.id}
                      className="cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50"
                      onClick={() => {
                        // Load submission code into editor (requires fetching full submission)
                        void fetch(`/api/v1/submissions/${sub.id}`)
                          .then((r) => r.json())
                          .then((data: { code?: string }) => {
                            if (data.code) setCode(data.code);
                          })
                          .catch(() => {});
                      }}
                    >
                      <td className="py-2 pr-3">
                        {sub.verdict ? (
                          <VerdictBadge verdict={sub.verdict} short />
                        ) : (
                          <span className="text-gray-500">Pending</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-400">{sub.language}</td>
                      <td className="py-2 pr-3 text-gray-400">
                        {sub.runtimeMs != null ? `${sub.runtimeMs}ms` : '—'}
                      </td>
                      <td className="py-2 text-gray-500">
                        {new Date(sub.submittedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Hints section */}
      {revealedHints.length > 0 && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="space-y-2">
            {revealedHints.map((hint, i) => (
              <div key={i} className="rounded bg-yellow-500/10 p-3 text-xs text-yellow-200">
                <span className="font-semibold">Hint {i + 1}:</span> {hint}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 border-t border-gray-800 px-4 py-2">
        <button
          onClick={openDrawer}
          className="flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
        >
          ✨ Ask AI
        </button>
        {hintsRemaining > 0 && (
          <button
            onClick={() => void handleGetHint()}
            className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
          >
            💡 Get Hint ({hintsRemaining} left)
          </button>
        )}
      </div>
    </div>
  );
}
