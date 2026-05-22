'use client';
import { create } from 'zustand';

export type Language = 'cpp' | 'python' | 'java' | 'javascript';
export type EditorTheme = 'vs-dark' | 'vs-light' | 'hc-black';

export interface TestCaseResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  timedOut?: boolean;
}

export interface SubmissionVerdict {
  id: string;
  verdict: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testCasesPassed: number | null;
  totalTestCases: number | null;
  // Extended fields (populated by judge when available)
  compileError?: string | null;
  failingTestCase?: {
    input: string;
    expected: string;
    actual: string;
    isHidden: boolean;
  } | null;
  runtimePercentile?: number | null;
  memoryPercentile?: number | null;
}

export interface AiReview {
  timeComplexity: string | null;
  spaceComplexity: string | null;
  correctnessNotes: string | null;
  optimizationHint: string | null;
  dryRun: string | null;
  qualityScore: number | null;
}

export interface SubmissionHistoryEntry {
  id: string;
  verdict: string | null;
  language: string;
  runtimeMs: number | null;
  submittedAt: string;
}

interface EditorStore {
  // Editor config
  language: Language;
  theme: EditorTheme;
  fontSize: number;
  vimMode: boolean;
  code: string;

  // Test panel
  activeTestTab: 'cases' | 'input' | 'result';
  customInput: string;
  testResults: TestCaseResult[] | null;
  isRunning: boolean;

  // Submission
  submissionId: string | null;
  isSubmitting: boolean;
  verdict: SubmissionVerdict | null;
  aiReview: AiReview | null;
  aiReviewLoading: boolean;
  aiRating: 'up' | 'down' | null;

  // Realtime queue/execution state
  queuePosition: number | null;
  executingProgress: { current: number; total: number } | null;

  // Session submission history (prepended on each new verdict)
  submissionHistory: SubmissionHistoryEntry[];

  // AI drawer
  drawerOpen: boolean;
  aiLevel: 'eli5' | 'standard' | 'expert';
  aiExplanation: string | null;
  aiLoading: boolean;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  followupInput: string;

  // Hints
  revealedHints: string[];
  hintsRemaining: number;

  // Left panel active tab
  leftTab: 'description' | 'examples' | 'constraints' | 'submissions';

  // Actions
  setLanguage: (lang: Language, problemId: string) => void;
  setTheme: (theme: EditorTheme) => void;
  setFontSize: (size: number) => void;
  toggleVimMode: () => void;
  setCode: (code: string) => void;
  setActiveTestTab: (tab: 'cases' | 'input' | 'result') => void;
  setCustomInput: (v: string) => void;
  setTestResults: (r: TestCaseResult[] | null) => void;
  setIsRunning: (v: boolean) => void;
  setSubmissionId: (id: string | null) => void;
  setIsSubmitting: (v: boolean) => void;
  setVerdict: (v: SubmissionVerdict | null) => void;
  setAiReview: (r: AiReview | null) => void;
  setAiReviewLoading: (v: boolean) => void;
  setAiRating: (r: 'up' | 'down' | null) => void;
  setQueuePosition: (pos: number | null) => void;
  setExecutingProgress: (p: { current: number; total: number } | null) => void;
  prependSubmission: (entry: SubmissionHistoryEntry) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setAiLevel: (l: 'eli5' | 'standard' | 'expert') => void;
  setAiExplanation: (e: string | null) => void;
  setAiLoading: (v: boolean) => void;
  addHistory: (msg: { role: 'user' | 'assistant'; content: string }) => void;
  setFollowupInput: (v: string) => void;
  addHint: (hint: string, remaining: number) => void;
  setLeftTab: (tab: 'description' | 'examples' | 'constraints' | 'submissions') => void;
  loadSavedCode: (problemId: string, lang?: Language) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  language: 'cpp',
  theme: 'vs-dark',
  fontSize: 14,
  vimMode: false,
  code: '',
  activeTestTab: 'cases',
  customInput: '',
  testResults: null,
  isRunning: false,
  submissionId: null,
  isSubmitting: false,
  verdict: null,
  aiReview: null,
  aiReviewLoading: false,
  aiRating: null,
  queuePosition: null,
  executingProgress: null,
  submissionHistory: [],
  drawerOpen: false,
  aiLevel: 'standard',
  aiExplanation: null,
  aiLoading: false,
  conversationHistory: [],
  followupInput: '',
  revealedHints: [],
  hintsRemaining: 3,
  leftTab: 'description',

  setLanguage: (lang, problemId) => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem(`code:${problemId}:${lang}`) : null;
    set({ language: lang, code: saved ?? '' });
  },
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  toggleVimMode: () => set((s) => ({ vimMode: !s.vimMode })),
  setCode: (code) => set({ code }),
  setActiveTestTab: (activeTestTab) => set({ activeTestTab }),
  setCustomInput: (customInput) => set({ customInput }),
  setTestResults: (testResults) => set({ testResults }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setSubmissionId: (submissionId) => set({ submissionId }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  setVerdict: (verdict) => set({ verdict }),
  setAiReview: (aiReview) => set({ aiReview }),
  setAiReviewLoading: (aiReviewLoading) => set({ aiReviewLoading }),
  setAiRating: (aiRating) => set({ aiRating }),
  setQueuePosition: (queuePosition) => set({ queuePosition }),
  setExecutingProgress: (executingProgress) => set({ executingProgress }),
  prependSubmission: (entry) =>
    set((s) => ({
      submissionHistory: [entry, ...s.submissionHistory.filter((x) => x.id !== entry.id)],
    })),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  setAiLevel: (aiLevel) => set({ aiLevel }),
  setAiExplanation: (aiExplanation) => set({ aiExplanation }),
  setAiLoading: (aiLoading) => set({ aiLoading }),
  addHistory: (msg) =>
    set((s) => ({ conversationHistory: [...s.conversationHistory, msg] })),
  setFollowupInput: (followupInput) => set({ followupInput }),
  addHint: (hint, remaining) =>
    set((s) => ({
      revealedHints: [...s.revealedHints, hint],
      hintsRemaining: remaining,
    })),
  setLeftTab: (leftTab) => set({ leftTab }),
  loadSavedCode: (problemId, lang) => {
    const language = lang ?? get().language;
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem(`code:${problemId}:${language}`) : null;
    if (saved) set({ code: saved });
  },
  reset: () =>
    set({
      submissionId: null,
      isSubmitting: false,
      verdict: null,
      aiReview: null,
      aiReviewLoading: false,
      aiRating: null,
      queuePosition: null,
      executingProgress: null,
      testResults: null,
    }),
}));
