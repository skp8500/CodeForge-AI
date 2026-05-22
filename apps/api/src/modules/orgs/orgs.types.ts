import { z } from 'zod';

export const CreateOrgBodySchema = z.object({
  name: z.string().min(2).max(100),
  plan: z.string().default('free'),
});

export type CreateOrgBodyDto = z.infer<typeof CreateOrgBodySchema>;

export const AddMemberBodySchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['member', 'admin']).default('member'),
});

export type AddMemberBodyDto = z.infer<typeof AddMemberBodySchema>;
