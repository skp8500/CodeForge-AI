const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ProblemDetail {
  id: string;
  title: string;
  slug: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  constraints: unknown;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  isSpecialJudge: boolean;
  sampleTestCases: { input: string; expectedOutput: string }[];
  stats: { totalSubmissions: number; acceptedSubmissions: number; acceptanceRate: number };
}

export interface SubmissionListItem {
  id: string;
  verdict: string | null;
  language: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  score: number | null;
  submittedAt: string;
}

export interface SubmissionStatus {
  id: string;
  verdict: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number | null;
  totalTestCases: number | null;
  submittedAt: string;
}

export interface AiReviewData {
  timeComplexity: string | null;
  spaceComplexity: string | null;
  correctnessNotes: string | null;
  optimizationHint: string | null;
  dryRun: string | null;
  qualityScore: number | null;
}

// ─── API calls ─────────────────────────────────────────────────────────────────

export const fetchProblem = (slug: string) =>
  request<ProblemDetail>(`/api/v1/problems/${slug}`);

export const createSubmission = (body: {
  problemId: string;
  language: string;
  code: string;
  contestId?: string;
}) =>
  request<{ submissionId: string; position: number }>(`/api/v1/submissions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getSubmissionStatus = (id: string) =>
  request<SubmissionStatus>(`/api/v1/submissions/${id}`);

export const getProblemSubmissions = (problemId: string, page = 1) =>
  request<SubmissionListItem[]>(
    `/api/v1/problems/${problemId}/submissions?page=${page}&limit=20`,
  );

export const explainProblem = (body: {
  problemId: string;
  level: 'eli5' | 'standard' | 'expert';
}) =>
  request<{ explanation: string }>(`/api/v1/ai/explain-problem`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getHint = (problemId: string, hintNumber: 1 | 2 | 3) =>
  request<{ hint: string; hintsRemaining: number }>(
    `/api/v1/problems/${problemId}/hint?hintNumber=${hintNumber}`,
  );

export const sendFollowup = (body: {
  problemId: string;
  question: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}) =>
  request<{ answer: string }>(`/api/v1/ai/explain-problem/followup`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getSubmissionReview = (submissionId: string) =>
  request<AiReviewData>(`/api/v1/submissions/${submissionId}/review`);

// ─── Problem list types ───────────────────────────────────────────────────────

export interface ProblemListItem {
  id: string;
  slug: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  acceptanceRate: number;
  totalSubmissions: number;
  solvedStatus: 'solved' | 'attempted' | 'untouched';
  isAiGenerated: boolean;
}

export interface PaginatedProblems {
  data: ProblemListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Dashboard types ──────────────────────────────────────────────────────────

export interface UserStats {
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  currentStreak: number;
  acceptanceRate: number;
  rating: number;
  ratingTrend: 'up' | 'down' | 'neutral';
}

export interface HeatmapEntry {
  date: string;
  count: number;
}

export interface RecentSubmissionItem {
  id: string;
  problemTitle: string;
  problemSlug: string;
  language: string;
  verdict: string | null;
  runtimeMs: number | null;
  submittedAt: string;
}

export interface TopicProgress {
  tag: string;
  attempted: number;
  solved: number;
}

export interface AiInsights {
  commonMistake: string | null;
  strongestTopic: string | null;
  weakestTopic: string | null;
  suggestedProblems: { id: string; title: string; slug: string; difficulty: 'easy' | 'medium' | 'hard' }[];
}

// ─── Problem list API ─────────────────────────────────────────────────────────

export const getProblems = (params: {
  page?: number;
  limit?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  search?: string;
  sort?: 'difficulty' | 'acceptance' | 'recent';
  recommended?: boolean;
}) => {
  const qp = new URLSearchParams();
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.difficulty) qp.set('difficulty', params.difficulty);
  params.tags?.forEach((t) => qp.append('tags', t));
  if (params.search) qp.set('search', params.search);
  if (params.sort) qp.set('sort', params.sort);
  if (params.recommended) qp.set('recommended', 'true');
  return request<PaginatedProblems>(`/api/v1/problems?${qp.toString()}`);
};

export const getRandomProblem = () =>
  request<{ slug: string }>(`/api/v1/problems/random`);

export const getAllTags = () =>
  request<string[]>(`/api/v1/problems/tags`);

// ─── Dashboard API ────────────────────────────────────────────────────────────

export const getUserStats = () =>
  request<UserStats>(`/api/v1/users/me/stats`);

export const getSubmissionHeatmap = () =>
  request<HeatmapEntry[]>(`/api/v1/users/me/heatmap`);

export const getRecentSubmissions = (limit = 10) =>
  request<RecentSubmissionItem[]>(`/api/v1/users/me/submissions?limit=${limit}`);

export const getTopicProgress = () =>
  request<TopicProgress[]>(`/api/v1/users/me/topic-progress`);

export const getAiInsights = () =>
  request<AiInsights>(`/api/v1/users/me/ai-insights`);

// ─── Problem creator API ──────────────────────────────────────────────────────

export interface ParsedConstraint {
  variable: string;
  min: number;
  max: number;
  description: string;
}

export interface ParsedSample {
  input: string;
  output: string;
  explanation: string;
}

export interface ParseProblemResult {
  parsed: {
    title: string;
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    timeLimitMs: number;
    memoryLimitMb: number;
    constraints: Record<string, { min: number; max: number }>;
    inputFormat: string;
    outputFormat: string;
    samples: ParsedSample[];
    expectedTimeComplexity: string;
    expectedSpaceComplexity: string;
    isSpecialJudge: boolean;
    confidenceScore: number;
    ambiguities: string[];
  };
  needsReview: boolean;
  processingTimeMs: number;
}

export const parseProblem = (rawText: string) =>
  request<ParseProblemResult>('/api/v1/ai/parse-problem', {
    method: 'POST',
    body: JSON.stringify({ rawText }),
  });

export interface CreateProblemInput {
  title: string;
  statement: string;
  difficulty: string;
  constraints?: Record<string, { min: number; max: number }>;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  isSpecialJudge: boolean;
}

export interface CreatedProblem {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
}

export const createProblem = (body: CreateProblemInput) =>
  request<CreatedProblem>('/api/v1/problems', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const publishProblem = (id: string) =>
  request<CreatedProblem>(`/api/v1/problems/${id}/publish`, { method: 'PATCH' });

export interface GeneratedTestCase {
  input: string;
  expectedOutput: string;
  category: string;
  isHidden: boolean;
}

export const generateTests = (problemId: string) =>
  request<{ testCases: GeneratedTestCase[]; unverifiedCount: number; generationTimeMs: number }>(
    '/api/v1/ai/generate-tests',
    { method: 'POST', body: JSON.stringify({ problemId }) },
  );

export const cancelSubmission = (id: string) =>
  request<void>(`/api/v1/submissions/${id}`, { method: 'DELETE' });
