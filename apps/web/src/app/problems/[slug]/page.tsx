import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { IdeClient } from './ide-client';
import type { ProblemDetail } from '@/lib/api';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function getProblem(slug: string): Promise<ProblemDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/problems/${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<ProblemDetail>;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const problem = await getProblem(params.slug);
  return {
    title: problem ? `${problem.title} — CodeForge AI` : 'Problem Not Found',
  };
}

export default async function ProblemPage({
  params,
}: {
  params: { slug: string };
}) {
  const problem = await getProblem(params.slug);
  if (!problem) notFound();

  return <IdeClient problem={problem} />;
}
