'use client';
import type { Route } from 'next';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAssessmentResults, type CandidateResult } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  slug: string;
  assessmentId: string;
}

function riskBadge(risk: string) {
  return risk === 'high'
    ? 'rounded px-2 py-0.5 text-xs font-medium text-red-400 bg-red-400/10'
    : 'rounded px-2 py-0.5 text-xs font-medium text-green-400 bg-green-400/10';
}

function statusBadge(r: CandidateResult) {
  if (r.submittedAt) return <span className="rounded px-2 py-0.5 text-xs text-green-400 bg-green-400/10">Submitted</span>;
  if (r.startedAt) return <span className="rounded px-2 py-0.5 text-xs text-yellow-400 bg-yellow-400/10">In Progress</span>;
  return <span className="rounded px-2 py-0.5 text-xs text-gray-400 bg-gray-400/10">Not Started</span>;
}

export function AssessmentResultsClient({ slug, assessmentId }: Props) {
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof CandidateResult>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAssessmentResults(assessmentId);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => { void load(); }, [load]);

  const handleSort = (field: keyof CandidateResult) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const handleExport = () => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_URL}/api/v1/assessments/${assessmentId}/export?format=csv`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    // Attach token as query param since download links can't have custom headers
    a.href = `${url}&_token=${token ?? ''}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filtered = results
    .filter((r) => r.candidateEmail.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const SortHeader = ({ field, label }: { field: keyof CandidateResult; label: string }) => (
    <th
      className="cursor-pointer select-none px-4 py-3 text-left text-xs text-gray-500 hover:text-gray-300"
      onClick={() => handleSort(field)}
    >
      {label} {sortField === field ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );

  if (error) return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <p className="text-red-400">{error}</p>
    </div>
  );

  const totalCandidates = results.length;
  const submitted = results.filter((r) => r.submittedAt).length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.score ?? 0), 0) / results.length)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <Link href={`/orgs/${slug}` as Route} className="text-xs text-gray-500 hover:text-gray-300">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-xl font-bold">Assessment Results</h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Candidates', value: totalCandidates },
            { label: 'Submitted', value: `${submitted} / ${totalCandidates}` },
            { label: 'Avg Score', value: `${avgScore} pts` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email…"
            className="w-72 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleExport}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
          >
            Export CSV
          </button>
        </div>

        {/* Results table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/60">
                  <SortHeader field="candidateEmail" label="Candidate" />
                  <SortHeader field="score" label="Score" />
                  <SortHeader field="problemsSolved" label="Solved" />
                  <SortHeader field="problemsAttempted" label="Attempted" />
                  <SortHeader field="avgRuntimeMs" label="Avg Runtime" />
                  <SortHeader field="plagiarismRisk" label="Risk" />
                  <SortHeader field="tabSwitches" label="Tab Switches" />
                  <SortHeader field="pasteEvents" label="Pastes" />
                  <th className="px-4 py-3 text-left text-xs text-gray-500">Status</th>
                  <SortHeader field="submittedAt" label="Submitted At" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      No candidates found
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-900/40">
                      <td className="px-4 py-3 text-gray-200">{r.candidateEmail}</td>
                      <td className="px-4 py-3 font-mono font-medium">{r.score ?? '—'}</td>
                      <td className="px-4 py-3 text-center">{r.problemsSolved}</td>
                      <td className="px-4 py-3 text-center">{r.problemsAttempted}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {r.avgRuntimeMs != null ? `${r.avgRuntimeMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={riskBadge(r.plagiarismRisk)}>
                          {r.plagiarismRisk}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={r.tabSwitches > 3 ? 'text-red-400 font-medium' : 'text-gray-400'}>
                          {r.tabSwitches}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={r.pasteEvents > 5 ? 'text-red-400 font-medium' : 'text-gray-400'}>
                          {r.pasteEvents}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(r)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
