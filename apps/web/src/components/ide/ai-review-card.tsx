'use client';
import { useState } from 'react';
import type { AiReview } from '@/store/editor-store';

interface Props {
  review: AiReview | null;
  loading: boolean;
  rating: 'up' | 'down' | null;
  onRate: (r: 'up' | 'down' | null) => void;
  verdict?: string | null;
}

export function AiReviewCard({ review, loading, rating, onRate, verdict }: Props) {
  const isAC = verdict === 'AC';
  const [expandOptimize, setExpandOptimize] = useState(() => !isAC);
  const [expandTrace, setExpandTrace] = useState(false);

  return (
    <div className="animate-slide-up-delayed rounded-lg border border-gray-700 bg-gray-800/60">
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
          <span>✨</span> AI Code Review
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onRate(rating === 'up' ? null : 'up')}
            title="Helpful"
            className={`text-sm transition-colors ${
              rating === 'up' ? 'text-green-400' : 'text-gray-600 hover:text-gray-300'
            }`}
          >
            👍
          </button>
          <button
            onClick={() => onRate(rating === 'down' ? null : 'down')}
            title="Not helpful"
            className={`text-sm transition-colors ${
              rating === 'down' ? 'text-red-400' : 'text-gray-600 hover:text-gray-300'
            }`}
          >
            👎
          </button>
          <span className="text-gray-700">·</span>
          <button
            type="button"
            className="text-[11px] text-gray-600 underline transition-colors hover:text-gray-400"
          >
            Report inaccuracy
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2 p-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-700" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-700" />
          <div className="h-12 animate-pulse rounded bg-gray-700" />
        </div>
      )}

      {review && !loading && (
        <div className="space-y-3 p-3 text-xs">
          {/* Complexity chips */}
          <div className="flex flex-wrap items-center gap-2">
            {review.timeComplexity && (
              <span className="rounded bg-brand-900/50 px-2 py-0.5 font-mono text-brand-300">
                Time: {review.timeComplexity}
              </span>
            )}
            {review.spaceComplexity && (
              <span className="rounded bg-gray-700/80 px-2 py-0.5 font-mono text-gray-300">
                Space: {review.spaceComplexity}
              </span>
            )}
            {review.qualityScore != null && (
              <span
                className={`ml-auto font-medium ${
                  review.qualityScore >= 0.8
                    ? 'text-green-400'
                    : review.qualityScore >= 0.5
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                Quality {Math.round(review.qualityScore * 100)}%
              </span>
            )}
          </div>

          {/* Analysis */}
          {review.correctnessNotes && (
            <div>
              <div className="mb-1 font-semibold text-gray-400">Analysis</div>
              <p className="leading-relaxed text-gray-300">{review.correctnessNotes}</p>
            </div>
          )}

          {/* Optimization hint */}
          {review.optimizationHint && (
            <div>
              <button
                onClick={() => setExpandOptimize((v) => !v)}
                className="flex items-center gap-1 font-semibold text-gray-400 transition-colors hover:text-gray-200"
              >
                <span className="tabular-nums">{expandOptimize ? '▾' : '▸'}</span>
                Optimization suggestion
              </button>
              {expandOptimize && (
                <p className="mt-1.5 leading-relaxed text-gray-300">{review.optimizationHint}</p>
              )}
            </div>
          )}

          {/* Dry run / trace — hidden for AC */}
          {review.dryRun && !isAC && (
            <div>
              <button
                onClick={() => setExpandTrace((v) => !v)}
                className="flex items-center gap-1 font-semibold text-gray-400 transition-colors hover:text-gray-200"
              >
                <span className="tabular-nums">{expandTrace ? '▾' : '▸'}</span>
                Step-by-step trace
              </button>
              {expandTrace && (
                <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-2.5 font-mono leading-relaxed text-gray-300">
                  {review.dryRun}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
