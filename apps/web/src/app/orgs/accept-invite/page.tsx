'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { acceptOrgInvite } from '@/lib/api';

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [phase, setPhase] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const isLoggedIn = () => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('accessToken');
  };

  const handleAccept = async () => {
    if (!token) return;
    if (!isLoggedIn()) {
      // Save token and redirect to login
      sessionStorage.setItem('pendingInviteToken', token);
      router.push(`/login?redirect=${encodeURIComponent(`/orgs/accept-invite?token=${token}`)}`);
      return;
    }
    setPhase('loading');
    try {
      const result = await acceptOrgInvite(token);
      setOrgSlug(result.orgSlug);
      setMsg(`You've joined ${result.orgName}!`);
      setPhase('success');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to accept invite');
      setPhase('error');
    }
  };

  // Auto-accept if already logged in
  useEffect(() => {
    if (token && isLoggedIn() && phase === 'idle') {
      void handleAccept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <p className="text-red-400">Invalid invite link — no token provided.</p>
    </div>
  );

  return (
    <div className="flex h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">Organization Invitation</h1>

        {phase === 'idle' && (
          <>
            <p className="text-gray-400 mb-6">You've been invited to join an organization on CodeForge AI.</p>
            <button
              onClick={handleAccept}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Accept Invitation
            </button>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {phase === 'success' && (
          <>
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-green-400 font-semibold mb-4">{msg}</p>
            <button
              onClick={() => router.push(`/orgs/${orgSlug}/dashboard`)}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="text-red-400 mb-4">{msg}</p>
            <button
              onClick={() => router.push('/')}
              className="w-full rounded-lg border border-gray-700 py-3 text-sm text-gray-300 hover:border-gray-500"
            >
              Go Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
