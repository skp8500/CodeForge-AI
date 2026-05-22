'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DifficultyBadge } from '@/components/ui/difficulty-badge';
import {
  getProblems,
  getRandomProblem,
  type ProblemListItem,
  type PaginatedProblems,
} from '@/lib/api';

type Difficulty = 'all' | 'easy' | 'medium' | 'hard';
type SortOption = 'default' | 'difficulty' | 'acceptance' | 'recent';

interface Props {
  initialData: PaginatedProblems | null;
  allTags: string[];
}

const DIFF_ACTIVE: Record<Difficulty, string> = {
  all: 'bg-brand-600 text-white',
  easy: 'bg-green-600 text-white',
  medium: 'bg-yellow-600 text-black',
  hard: 'bg-red-600 text-white',
};

function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!)) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function SolvedIcon({ status }: { status: ProblemListItem['solvedStatus'] }) {
  if (status === 'solved')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-xs">
        ✓
      </span>
    );
  if (status === 'attempted')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400 text-xs">
        −
      </span>
    );
  return <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-700" />;
}

function TagPills({ tags }: { tags: string[] }) {
  const shown = tags.slice(0, 2);
  const extra = tags.length - 2;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
        >
          {t}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="cursor-default rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500"
          title={tags.slice(2).join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function AcceptanceBar({ rate }: { rate: number }) {
  const pct = Math.min(100, rate * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-gray-700">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct.toFixed(0)}%` }} />
      </div>
      <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[4, 40, 12, 20, 12, 4].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-4 w-${w} animate-pulse rounded bg-gray-800`} />
        </td>
      ))}
    </tr>
  );
}

export function ProblemsClient({ initialData, allTags }: Props) {
  const router = useRouter();
  const [data, setData] = useState<PaginatedProblems | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>('default');
  const [page, setPage] = useState(1);
  const [tagSearch, setTagSearch] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserRole(getUserRole());
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch on filter/page change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getProblems({
      page,
      limit: 20,
      ...(difficulty !== 'all' && { difficulty }),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(selectedTags.length && { tags: selectedTags }),
      ...(sort !== 'default' && { sort: sort as 'difficulty' | 'acceptance' | 'recent' }),
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, difficulty, selectedTags, sort]);

  // Close tag dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setPage(1);
  };

  const handleSort = (s: SortOption) => {
    setSort(s);
    setPage(1);
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      setPage(1);
      return next;
    });
  };

  const handleRandom = async () => {
    setRandomLoading(true);
    try {
      const result = await getRandomProblem();
      router.push(`/problems/${result.slug}`);
    } catch {
      setRandomLoading(false);
    }
  };

  const filteredTags = allTags.filter((t) =>
    t.toLowerCase().includes(tagSearch.toLowerCase()),
  );

  const totalPages = data?.meta.totalPages ?? 1;
  const pageWindow = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return start + i;
  });

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-[#0f1117]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold text-brand-400">
              CodeForge AI
            </Link>
            <nav className="flex gap-4 text-sm text-gray-400">
              <Link href="/problems" className="font-medium text-gray-100">
                Problems
              </Link>
              <Link href="/dashboard" className="hover:text-gray-200">
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleRandom()}
              disabled={randomLoading}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {randomLoading ? '…' : '🎲 Random'}
            </button>
            {userRole === 'PROBLEM_SETTER' || userRole === 'ADMIN' ? (
              <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors">
                ✨ Generate Problem
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5">
        {/* Page title */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-100">Problems</h1>
          {data && (
            <p className="mt-0.5 text-sm text-gray-500">
              {data.meta.total} problems total
            </p>
          )}
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems…"
              className="w-full rounded-lg border border-gray-700 bg-gray-800/80 py-1.5 pl-3 pr-8 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>

          {/* Difficulty pills */}
          <div className="flex gap-1">
            {(['all', 'easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => handleDifficulty(d)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  difficulty === d
                    ? DIFF_ACTIVE[d]
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Tag multi-select */}
          <div ref={tagRef} className="relative">
            <button
              onClick={() => setTagOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                tagOpen || selectedTags.length > 0
                  ? 'border-brand-500 bg-brand-600/10 text-brand-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              Tags
              {selectedTags.length > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] text-white">
                  {selectedTags.length}
                </span>
              )}
              <span className="opacity-60">▾</span>
            </button>

            {tagOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
                <div className="p-2">
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags…"
                    autoFocus
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {filteredTags.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-600">No tags found</p>
                  ) : (
                    filteredTags.map((tag) => (
                      <label
                        key={tag}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag)}
                          onChange={() => handleTagToggle(tag)}
                          className="accent-brand-500"
                        />
                        {tag}
                      </label>
                    ))
                  )}
                </div>
                {selectedTags.length > 0 && (
                  <div className="border-t border-gray-800 p-2">
                    <button
                      onClick={() => {
                        setSelectedTags([]);
                        setPage(1);
                      }}
                      className="w-full text-center text-xs text-gray-500 hover:text-gray-300"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => handleSort(e.target.value as SortOption)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 focus:border-brand-500 focus:outline-none"
          >
            <option value="default">Sort: Default</option>
            <option value="difficulty">Sort: Difficulty</option>
            <option value="acceptance">Sort: Acceptance</option>
            <option value="recent">Sort: Most Recent</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                <th className="w-12 px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="w-28 px-4 py-3 font-medium">Difficulty</th>
                <th className="w-48 px-4 py-3 font-medium">Tags</th>
                <th className="w-32 px-4 py-3 font-medium">Acceptance</th>
                <th className="w-12 px-4 py-3 text-center font-medium">✓</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 20 }).map((_, i) => <SkeletonRow key={i} />)
                : data?.data.map((problem, i) => (
                    <ProblemRow
                      key={problem.id}
                      problem={problem}
                      index={(page - 1) * 20 + i + 1}
                    />
                  ))}
              {!loading && data?.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                    No problems match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, data.meta.total)} of{' '}
              {data.meta.total} problems
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                ← Prev
              </button>
              {pageWindow.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-7 w-7 rounded-lg text-xs transition-colors ${
                    page === p
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Problem row ──────────────────────────────────────────────────────────────

function ProblemRow({
  problem,
  index,
}: {
  problem: ProblemListItem;
  index: number;
}) {
  return (
    <tr className="group border-b border-gray-800/60 transition-colors hover:bg-gray-800/30">
      <td className="px-4 py-3 text-xs text-gray-600">{index}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/problems/${problem.slug}`}
            className="text-sm font-medium text-gray-200 hover:text-brand-400 transition-colors"
          >
            {problem.title}
          </Link>
          {problem.isAiGenerated && (
            <span
              className="inline-flex items-center rounded bg-brand-900/60 px-1 py-0.5 text-[10px] font-semibold text-brand-400"
              title="Generated by CodeForge AI"
            >
              AI
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <DifficultyBadge difficulty={problem.difficulty} />
      </td>
      <td className="px-4 py-3">
        <TagPills tags={problem.tags} />
      </td>
      <td className="px-4 py-3">
        <AcceptanceBar rate={problem.acceptanceRate} />
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-center">
          <SolvedIcon status={problem.solvedStatus} />
        </div>
      </td>
    </tr>
  );
}
