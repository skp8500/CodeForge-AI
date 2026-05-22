const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  token?: string;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cf_access_token') ?? localStorage.getItem('accessToken');
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string> | undefined) ?? {}),
  };

  const authToken = token ?? getStoredToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}/api/v1${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(
      (error as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return apiClient<T>(path.replace(/^\/api\/v1/, ''), options);
}

export const api = {
  get: <T>(path: string, token?: string) => apiClient<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    apiClient<T>(path, { method: 'POST', body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    apiClient<T>(path, { method: 'PATCH', body: JSON.stringify(body), token }),
  delete: <T>(path: string, token?: string) =>
    apiClient<T>(path, { method: 'DELETE', token }),
};

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

// ─── Organizations API ────────────────────────────────────────────────────────

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  email: string;
  username: string;
}

export const getOrg = (slug: string) =>
  request<OrgInfo>(`/api/v1/orgs/${slug}`);

export const getOrgMembers = (orgId: string) =>
  request<OrgMember[]>(`/api/v1/orgs/${orgId}/members`);

export const inviteOrgMember = (orgId: string, body: { email: string; role: 'member' | 'admin' }) =>
  request<{ invited: boolean; email: string }>(`/api/v1/orgs/${orgId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateOrgMemberRole = (orgId: string, userId: string, role: 'member' | 'admin') =>
  request<{ updated: boolean }>(`/api/v1/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const removeOrgMember = (orgId: string, userId: string) =>
  request<{ removed: boolean }>(`/api/v1/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });

export const acceptOrgInvite = (token: string) =>
  request<{ orgSlug: string; orgName: string }>(`/api/v1/orgs/invite/accept`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

// ─── Assessments API ──────────────────────────────────────────────────────────

export interface AssessmentListItem {
  id: string;
  title: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  allowedLanguages: string[];
  randomizeProblems: boolean;
  uniqueVariants: boolean;
  createdAt: string;
}

export interface CandidateResult {
  id: string;
  candidateEmail: string;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  tabSwitches: number;
  pasteEvents: number;
  problemsAttempted: number;
  problemsSolved: number;
  avgRuntimeMs: number | null;
  plagiarismRisk: 'high' | 'low';
}

export interface AssessmentProblem {
  id: string;
  title: string;
  slug: string;
  statement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  constraints: unknown;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface CandidateVerifyResult {
  session: { id: string; startedAt: string; submittedAt: string | null };
  assessment: {
    id: string;
    title: string;
    durationMinutes: number;
    startsAt: string;
    endsAt: string;
    allowedLanguages: string[];
  };
  problems: AssessmentProblem[];
  candidateJwt: string;
}

export const listOrgAssessments = (orgId: string) =>
  request<AssessmentListItem[]>(`/api/v1/assessments/org/${orgId}`);

export const createAssessment = (body: {
  title: string;
  orgId: string;
  problemIds: string[];
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  allowedLanguages: string[];
  randomizeProblems: boolean;
  uniqueVariants: boolean;
}) =>
  request<{ id: string; title: string }>(`/api/v1/assessments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const inviteCandidates = (assessmentId: string, emails: string[]) =>
  request<{ invited: number; alreadyInvited: number }>(
    `/api/v1/assessments/${assessmentId}/candidates`,
    { method: 'POST', body: JSON.stringify({ emails }) },
  );

export const getAssessmentResults = (assessmentId: string) =>
  request<CandidateResult[]>(`/api/v1/assessments/${assessmentId}/results`);

export const verifyAssessmentToken = (assessmentId: string, token: string) =>
  request<CandidateVerifyResult>(
    `/api/v1/assessments/${assessmentId}/candidate/verify?token=${encodeURIComponent(token)}`,
  );

export const logCandidateFlag = (
  assessmentId: string,
  body: { type: 'tab_switch' | 'paste'; metadata?: Record<string, unknown> },
  candidateJwt: string,
) =>
  request<void>(`/api/v1/assessments/${assessmentId}/candidate/flag`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${candidateJwt}` },
  });

export const submitCandidateSession = (assessmentId: string, candidateJwt: string) =>
  request<{ score: number }>(`/api/v1/assessments/${assessmentId}/candidate/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateJwt}` },
  });

export const candidateCreateSubmission = (
  body: { problemId: string; language: string; code: string },
  candidateJwt: string,
) =>
  request<{ submissionId: string; position: number }>(`/api/v1/submissions`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${candidateJwt}` },
  });
