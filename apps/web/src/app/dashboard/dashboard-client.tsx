'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { DifficultyBadge } from '@/components/ui/difficulty-badge';
import { VerdictBadge } from '@/components/ui/verdict-badge';
import { SubmissionHeatmap } from '@/components/dashboard/heatmap';
import { TopicChart } from '@/components/dashboard/topic-chart';
import {
  getUserStats,
  getSubmissionHeatmap,
  getRecentSubmissions,
  getTopicProgress,
  getAiInsights,
  getProblems,
  type UserStats,
  type HeatmapEntry,
  type RecentSubmissionItem,
  type TopicProgress,
  type AiInsights,
  type ProblemListItem,
} from '@/lib/api';

interface User {
  name: string;
  email: string;
  role: string;
  initials: string;
}

function readUser(): User | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split('.')[1]!)) as {
      name?: string;
      email?: string;
      role?: string;
    };
    const name = p.name ?? p.email ?? 'User';
    const initials = name
      .split(' ')
      .map((w) => w[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('');
    return { name, email: p.email ?? '', role: p.role ?? 'user', initials };
  } catch {
    return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1.5 text-3xl font-bold ${accent ?? 'text-gray-100'}`}>{value}</p>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </h2>
  );
}

export function DashboardClient() {
  const navLinks: Array<{ href: Route; label: string; active: boolean }> = [
    { href: '/dashboard', label: '◉  Overview', active: true },
    { href: '/problems', label: '⬡  Problems', active: false },
    { href: '/create', label: '⚑  Create', active: false },
    { href: '/dashboard', label: '⚙  Orgs', active: false },
  ];

  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [submissions, setSubmissions] = useState<RecentSubmissionItem[]>([]);
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [insights, setInsights] = useState<AiInsights | null>(null);
  const [recommended, setRecommended] = useState<ProblemListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const u = readUser();
    setUser(u);
    if (!u) {
      setAuthError(true);
      setLoading(false);
      return;
    }

    void Promise.allSettled([
      getUserStats(),
      getSubmissionHeatmap(),
      getRecentSubmissions(10),
      getTopicProgress(),
      getAiInsights(),
      getProblems({ limit: 3, recommended: true }),
    ]).then(([s, h, sub, t, ins, rec]) => {
      if (s.status === 'fulfilled') setStats(s.value);
      if (h.status === 'fulfilled') setHeatmap(h.value);
      if (sub.status === 'fulfilled') setSubmissions(sub.value);
      if (t.status === 'fulfilled') setTopics(t.value);
      if (ins.status === 'fulfilled') setInsights(ins.value);
      if (rec.status === 'fulfilled') setRecommended(rec.value.data);
      setLoading(false);
    });
  }, []);

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117]">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-300">Sign in to view your dashboard</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0f1117]">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900/50">
        <div className="border-b border-gray-800 px-4 py-4">
          <Link href="/" className="text-sm font-bold text-brand-400">
            CodeForge AI
          </Link>
        </div>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user.initials || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-200">{user.name}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navLinks.map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-brand-600/20 font-medium text-brand-300'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-800 px-4 py-3">
          <button
            onClick={() => {
              localStorage.removeItem('accessToken');
              window.location.href = '/';
            }}
            className="text-xs text-gray-600 hover:text-gray-400"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-gray-100">
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* ── Stats overview ── */}
          <section>
            <SectionTitle>Overview</SectionTitle>
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-800" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Problems Solved"
                  value={stats?.totalSolved ?? 0}
                  accent="text-green-400"
                  sub={
                    stats && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-green-500">{stats.easySolved}E</span>
                        <span className="text-yellow-500">{stats.mediumSolved}M</span>
                        <span className="text-red-500">{stats.hardSolved}H</span>
                      </div>
                    )
                  }
                />
                <StatCard
                  label="Current Streak"
                  value={`${stats?.currentStreak ?? 0}d`}
                  accent="text-orange-400"
                  sub={<p className="text-xs text-gray-600">consecutive days</p>}
                />
                <StatCard
                  label="Acceptance Rate"
                  value={
                    stats
                      ? `${(stats.acceptanceRate * 100).toFixed(1)}%`
                      : '—'
                  }
                  accent="text-brand-400"
                />
                <StatCard
                  label="Rating"
                  value={stats?.rating ?? '—'}
                  accent="text-purple-400"
                  sub={
                    stats?.ratingTrend && stats.ratingTrend !== 'neutral' ? (
                      <span
                        className={`text-xs ${
                          stats.ratingTrend === 'up' ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {stats.ratingTrend === 'up' ? '▲ Rising' : '▼ Falling'}
                      </span>
                    ) : null
                  }
                />
              </div>
            )}
          </section>

          {/* ── Heatmap ── */}
          <section>
            <SectionTitle>Submission Activity</SectionTitle>
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4">
              {loading ? (
                <div className="h-24 animate-pulse rounded bg-gray-800" />
              ) : (
                <SubmissionHeatmap data={heatmap} />
              )}
            </div>
          </section>

          {/* ── Two-column: recent submissions + topic chart ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent activity */}
            <section>
              <SectionTitle>Recent Activity</SectionTitle>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60">
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded bg-gray-800" />
                    ))}
                  </div>
                ) : submissions.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-500">
                    No submissions yet — start solving!
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800 text-left text-gray-500">
                        <th className="px-4 py-2.5 font-medium">Problem</th>
                        <th className="px-3 py-2.5 font-medium">Lang</th>
                        <th className="px-3 py-2.5 font-medium">Verdict</th>
                        <th className="px-3 py-2.5 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((sub) => (
                        <tr
                          key={sub.id}
                          className="cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors"
                          onClick={() => window.open(`/problems/${sub.problemSlug}`, '_blank')}
                        >
                          <td className="max-w-[140px] truncate px-4 py-2.5 font-medium text-gray-200">
                            {sub.problemTitle}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 font-mono">{sub.language}</td>
                          <td className="px-3 py-2.5">
                            {sub.verdict ? (
                              <VerdictBadge verdict={sub.verdict} short />
                            ) : (
                              <span className="text-gray-600">Pending</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">
                            {timeAgo(sub.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Topic progress */}
            <section>
              <SectionTitle>Progress by Topic</SectionTitle>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-4">
                {loading ? (
                  <div className="h-52 animate-pulse rounded bg-gray-800" />
                ) : (
                  <TopicChart data={topics} />
                )}
              </div>
            </section>
          </div>

          {/* ── Two-column: recommended + AI insights ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recommended problems */}
            <section>
              <SectionTitle>Recommended for You</SectionTitle>
              <div className="space-y-2">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-800" />
                    ))
                  : recommended.length === 0
                  ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-500">
                      Solve more problems to get personalized recommendations.
                    </div>
                  )
                  : recommended.map((p) => (
                      <Link
                        key={p.id}
                        href={`/problems/${p.slug}`}
                        className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 transition-colors hover:border-brand-500/40 hover:bg-gray-800/60"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-200">{p.title}</p>
                          <div className="mt-1 flex gap-1.5">
                            {p.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <DifficultyBadge difficulty={p.difficulty} />
                      </Link>
                    ))}
              </div>
            </section>

            {/* AI insights */}
            <section>
              <SectionTitle>AI Insights</SectionTitle>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-5 animate-pulse rounded bg-gray-800" />
                    ))}
                  </div>
                ) : !insights ? (
                  <p className="text-sm text-gray-500">
                    Submit more code for AI analysis of your patterns.
                  </p>
                ) : (
                  <div className="space-y-4 text-sm">
                    {insights.commonMistake && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 text-base">⚠️</span>
                        <div>
                          <p className="font-medium text-gray-300">Common mistake</p>
                          <p className="mt-0.5 text-gray-500">{insights.commonMistake}</p>
                        </div>
                      </div>
                    )}
                    {insights.strongestTopic && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 text-base">💪</span>
                        <div>
                          <p className="font-medium text-gray-300">Strongest topic</p>
                          <p className="mt-0.5 text-gray-500">{insights.strongestTopic}</p>
                        </div>
                      </div>
                    )}
                    {insights.weakestTopic && (
                      <div className="flex gap-3">
                        <span className="mt-0.5 text-base">📈</span>
                        <div>
                          <p className="font-medium text-gray-300">Focus area</p>
                          <p className="mt-0.5 text-gray-500">{insights.weakestTopic}</p>
                        </div>
                      </div>
                    )}
                    {insights.suggestedProblems.length > 0 && (
                      <div className="border-t border-gray-800 pt-3">
                        <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Suggested problems
                        </p>
                        <div className="space-y-1.5">
                          {insights.suggestedProblems.map((p) => (
                            <Link
                              key={p.id}
                              href={`/problems/${p.slug}`}
                              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-800 transition-colors"
                            >
                              <span className="text-gray-300 hover:text-brand-400">{p.title}</span>
                              <DifficultyBadge difficulty={p.difficulty} />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
