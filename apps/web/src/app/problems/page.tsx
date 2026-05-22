import type { Metadata } from 'next';
import { ProblemsClient } from './problems-client';
import type { PaginatedProblems } from '@/lib/api';

export const metadata: Metadata = { title: 'Problems' };

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function fetchInitialProblems(): Promise<PaginatedProblems | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/problems?page=1&limit=20`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<PaginatedProblems>;
  } catch {
    return null;
  }
}

async function fetchAllTags(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/problems/tags`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<string[]>;
  } catch {
    return [];
  }
}

export default async function ProblemsPage() {
  const [initialData, allTags] = await Promise.all([
    fetchInitialProblems(),
    fetchAllTags(),
  ]);

  return <ProblemsClient initialData={initialData} allTags={allTags} />;
}
