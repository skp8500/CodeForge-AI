import { z } from 'zod';

export const ProblemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  difficulty: z.string().optional(),
  tags: z.string().optional(),
  search: z.string().optional(),
  solved: z.enum(['true', 'false']).optional(),
});

export type ProblemListQueryDto = z.infer<typeof ProblemListQuerySchema>;

export const CreateProblemBodySchema = z.object({
  title: z.string().min(3).max(255),
  statement: z.string().min(20),
  difficulty: z.string(),
  constraints: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).default([]),
  timeLimitMs: z.number().int().min(100).max(10_000).default(1000),
  memoryLimitMb: z.number().int().min(16).max(1024).default(256),
  isSpecialJudge: z.boolean().default(false),
  orgId: z.string().uuid().optional(),
});

export type CreateProblemBodyDto = z.infer<typeof CreateProblemBodySchema>;

export interface ProblemListItem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  tags: string[];
  timeLimitMs: number;
  isPublished: boolean;
  createdAt: Date;
}

export interface ProblemDetail extends ProblemListItem {
  statement: string;
  constraints: unknown;
  memoryLimitMb: number;
  isSpecialJudge: boolean;
  orgId: string | null;
  aiConfidence: number | null;
  updatedAt: Date;
  sampleTestCases: { input: string; expectedOutput: string }[];
  stats: {
    totalSubmissions: number;
    acceptedSubmissions: number;
    acceptanceRate: number;
  };
}

export interface PaginatedProblems {
  data: ProblemListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
