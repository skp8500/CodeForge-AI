'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function normalizeRedirect(value: string | null): Route {
  if (!value || !value.startsWith('/')) return '/dashboard';
  return value as Route;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = useMemo(
    () => normalizeRedirect(searchParams.get('redirect')),
    [searchParams],
  );
  const verified = searchParams.get('verified') === 'true';

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-gray-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.24),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.16),_transparent_26%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12 sm:px-10">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur lg:block">
            <Link href="/" className="text-sm font-bold text-brand-300">
              CodeForge AI
            </Link>
            <h1 className="mt-8 text-5xl font-black tracking-tight text-white">
              Sign in and pick up where you left off.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-300">
              Access your dashboard, continue solving, and use the full coding judge workflow
              instead of getting dropped back on the landing page.
            </p>
            <div className="mt-10 space-y-4 text-sm text-gray-300">
              <p>Track progress, verdicts, and streaks.</p>
              <p>Review submissions with AI guidance.</p>
              <p>Open assessments and team workflows.</p>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-[#0b1224] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <Link href="/" className="text-sm font-bold text-brand-300 lg:hidden">
              CodeForge AI
            </Link>
            <h2 className="mt-4 text-3xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-400">
              Use your email and password to continue to your workspace.
            </p>

            {verified ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Email verified. You can sign in now.
              </div>
            ) : null}

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-brand-400"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-200">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-brand-400"
                  placeholder="Your password"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href={`${API_URL}/api/v1/auth/google`}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-gray-100 transition-colors hover:border-brand-400/50"
              >
                Continue with Google
              </a>
              <a
                href={`${API_URL}/api/v1/auth/github`}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-gray-100 transition-colors hover:border-brand-400/50"
              >
                Continue with GitHub
              </a>
            </div>

            <p className="mt-6 text-sm text-gray-400">
              Need an account? Register through the API flow first, then come back here to sign
              in.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
