'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { setAccessToken } from '@/lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      router.replace('/login');
      return;
    }

    setAccessToken(token);
    router.replace('/dashboard');
    router.refresh();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 text-gray-100">
      <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-gray-300">
        Completing sign-in...
      </div>
    </main>
  );
}
