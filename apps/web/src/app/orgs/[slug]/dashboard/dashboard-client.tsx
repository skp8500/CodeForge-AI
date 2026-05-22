'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getOrg,
  getOrgMembers,
  listOrgAssessments,
  inviteOrgMember,
  removeOrgMember,
  updateOrgMemberRole,
  createAssessment,
  inviteCandidates,
  getProblems,
  type OrgInfo,
  type OrgMember,
  type AssessmentListItem,
} from '@/lib/api';

interface Props {
  slug: string;
}

function readUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split('.')[1]!)) as { sub?: string };
    return p.sub ?? null;
  } catch {
    return null;
  }
}

export function OrgDashboardClient({ slug }: Props) {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite member state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Create assessment state
  const [showCreateAssessment, setShowCreateAssessment] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [assessmentDuration, setAssessmentDuration] = useState(60);
  const [assessmentStart, setAssessmentStart] = useState('');
  const [assessmentEnd, setAssessmentEnd] = useState('');
  const [assessmentLanguages, setAssessmentLanguages] = useState<string[]>(['cpp', 'python']);
  const [assessmentRandomize, setAssessmentRandomize] = useState(false);
  const [assessmentVariants, setAssessmentVariants] = useState(false);
  const [creatingAssessment, setCreatingAssessment] = useState(false);

  // Invite candidates state
  const [invitingForId, setInvitingForId] = useState<string | null>(null);
  const [candidateEmails, setCandidateEmails] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const orgData = await getOrg(slug);
      setOrg(orgData);
      const [memberData, assessmentData] = await Promise.all([
        getOrgMembers(orgData.id),
        listOrgAssessments(orgData.id),
      ]);
      setMembers(memberData);
      setAssessments(assessmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !inviteEmail) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await inviteOrgMember(org.id, { email: inviteEmail, role: inviteRole });
      setInviteMsg(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      void load();
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!org) return;
    if (!confirm('Remove this member?')) return;
    try {
      await removeOrgMember(org.id, userId);
      void load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRoleChange = async (userId: string, role: 'member' | 'admin') => {
    if (!org) return;
    try {
      await updateOrgMemberRole(org.id, userId, role);
      void load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setCreatingAssessment(true);
    try {
      // For demo purposes, use first 3 problems from the org or public pool
      const problemsData = await getProblems({ limit: 3 });
      const problemIds = problemsData.data.map((p) => p.id);
      await createAssessment({
        title: assessmentTitle,
        orgId: org.id,
        problemIds,
        durationMinutes: assessmentDuration,
        startsAt: new Date(assessmentStart).toISOString(),
        endsAt: new Date(assessmentEnd).toISOString(),
        allowedLanguages: assessmentLanguages,
        randomizeProblems: assessmentRandomize,
        uniqueVariants: assessmentVariants,
      });
      setShowCreateAssessment(false);
      setAssessmentTitle('');
      void load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create assessment');
    } finally {
      setCreatingAssessment(false);
    }
  };

  const handleInviteCandidates = async (assessmentId: string) => {
    const emails = candidateEmails.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setSendingInvites(true);
    setInviteResult(null);
    try {
      const result = await inviteCandidates(assessmentId, emails);
      setInviteResult(`Sent ${result.invited} invites (${result.alreadyInvited} already invited)`);
      setCandidateEmails('');
    } catch (err) {
      setInviteResult(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setSendingInvites(false);
    }
  };

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

  const currentUserId = readUserId();
  const assessmentStatus = (a: AssessmentListItem) => {
    const now = Date.now();
    const start = new Date(a.startsAt).getTime();
    const end = new Date(a.endsAt).getTime();
    if (now < start) return { label: 'Upcoming', color: 'text-blue-400 bg-blue-400/10' };
    if (now <= end) return { label: 'Live', color: 'text-green-400 bg-green-400/10' };
    return { label: 'Ended', color: 'text-gray-400 bg-gray-400/10' };
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← CodeForge AI</Link>
            <h1 className="mt-1 text-xl font-bold">{org?.name}</h1>
            <p className="text-xs text-gray-500 capitalize">{org?.plan} plan · {org?.memberCount} member{org?.memberCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">

        {/* ── Members ── */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Members</h2>

          {/* Invite form */}
          <form onSubmit={handleInvite} className="mb-5 flex gap-3 items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-400">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>
          {inviteMsg && (
            <p className={`mb-3 text-sm ${inviteMsg.startsWith('Invite sent') ? 'text-green-400' : 'text-red-400'}`}>
              {inviteMsg}
            </p>
          )}

          {/* Members table */}
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/60 text-left text-xs text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-900/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-200">{m.username}</p>
                      <p className="text-xs text-gray-500">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {m.userId !== org?.ownerId ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.userId, e.target.value as 'member' | 'admin')}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-400">Owner</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.userId !== org?.ownerId && m.userId !== currentUserId && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Assessments ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Assessments</h2>
            <button
              onClick={() => setShowCreateAssessment((v) => !v)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {showCreateAssessment ? 'Cancel' : '+ New Assessment'}
            </button>
          </div>

          {/* Create assessment form */}
          {showCreateAssessment && (
            <form onSubmit={handleCreateAssessment} className="mb-6 rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-4">
              <h3 className="font-medium">New Assessment</h3>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Title</label>
                <input
                  type="text"
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                  placeholder="Spring 2025 Backend Interview"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Duration (minutes)</label>
                  <input
                    type="number"
                    value={assessmentDuration}
                    onChange={(e) => setAssessmentDuration(Number(e.target.value))}
                    min={5} max={480}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Allowed Languages</label>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {['cpp', 'python', 'java', 'javascript'].map((lang) => (
                      <label key={lang} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assessmentLanguages.includes(lang)}
                          onChange={(e) => setAssessmentLanguages((prev) =>
                            e.target.checked ? [...prev, lang] : prev.filter((l) => l !== lang)
                          )}
                          className="accent-blue-500"
                        />
                        {lang}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Starts At</label>
                  <input
                    type="datetime-local"
                    value={assessmentStart}
                    onChange={(e) => setAssessmentStart(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Ends At</label>
                  <input
                    type="datetime-local"
                    value={assessmentEnd}
                    onChange={(e) => setAssessmentEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assessmentRandomize}
                    onChange={(e) => setAssessmentRandomize(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Randomize problem order
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assessmentVariants}
                    onChange={(e) => setAssessmentVariants(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Unique variants (AI-adjusted constraints)
                </label>
              </div>
              <button
                type="submit"
                disabled={creatingAssessment}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingAssessment ? 'Creating…' : 'Create Assessment'}
              </button>
            </form>
          )}

          {/* Assessment list */}
          {assessments.length === 0 ? (
            <p className="text-sm text-gray-500">No assessments yet.</p>
          ) : (
            <div className="space-y-3">
              {assessments.map((a) => {
                const status = assessmentStatus(a);
                return (
                  <div key={a.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{a.title}</h3>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.color}`}>{status.label}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {a.durationMinutes} min · {a.allowedLanguages.join(', ')} ·
                          Starts {new Date(a.startsAt).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        href={`/orgs/${slug}/assessments/${a.id}`}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        View Results →
                      </Link>
                    </div>

                    {/* Inline candidate invite */}
                    {invitingForId === a.id ? (
                      <div className="mt-4 border-t border-gray-700 pt-4">
                        <label className="mb-1 block text-xs text-gray-400">Candidate emails (comma or newline separated)</label>
                        <textarea
                          value={candidateEmails}
                          onChange={(e) => setCandidateEmails(e.target.value)}
                          rows={3}
                          placeholder="alice@company.com&#10;bob@company.com"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                        />
                        {inviteResult && (
                          <p className={`mt-1 text-xs ${inviteResult.startsWith('Sent') ? 'text-green-400' : 'text-red-400'}`}>
                            {inviteResult}
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleInviteCandidates(a.id)}
                            disabled={sendingInvites}
                            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {sendingInvites ? 'Sending…' : 'Send Invites'}
                          </button>
                          <button
                            onClick={() => { setInvitingForId(null); setInviteResult(null); setCandidateEmails(''); }}
                            className="rounded-lg border border-gray-700 px-4 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setInvitingForId(a.id); setInviteResult(null); }}
                        className="mt-3 text-xs text-gray-500 hover:text-gray-300"
                      >
                        + Invite candidates
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
