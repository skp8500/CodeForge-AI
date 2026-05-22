import { z } from 'zod';

export const ContestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['upcoming', 'ongoing', 'past']).optional(),
});

export type ContestListQueryDto = z.infer<typeof ContestListQuerySchema>;

export const CreateContestBodySchema = z.object({
  title: z.string().min(3).max(255),
  orgId: z.string().uuid().optional(),
  scoringMode: z.string().default('icpc'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isPublic: z.boolean().default(true),
});

export type CreateContestBodyDto = z.infer<typeof CreateContestBodySchema>;

export const AddContestProblemBodySchema = z.object({
  problemId: z.string().uuid(),
  points: z.number().int().min(1).default(100),
  orderIndex: z.number().int().min(0).default(0),
});

export type AddContestProblemBodyDto = z.infer<typeof AddContestProblemBodySchema>;
