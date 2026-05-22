import { z } from 'zod';

import { Language } from '@codeforge/shared';

export const CreateAssessmentSchema = z.object({
  title: z.string().min(1).max(255),
  orgId: z.string().uuid(),
  problemIds: z.array(z.string().uuid()).min(1).max(50),
  durationMinutes: z.number().int().min(5).max(480),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allowedLanguages: z.array(z.nativeEnum(Language)).min(1),
  randomizeProblems: z.boolean().default(false),
  uniqueVariants: z.boolean().default(false),
});

export type CreateAssessmentDto = z.infer<typeof CreateAssessmentSchema>;

export const InviteCandidatesSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(200),
});

export type InviteCandidatesDto = z.infer<typeof InviteCandidatesSchema>;

export const LogFlagSchema = z.object({
  type: z.enum(['tab_switch', 'paste']),
  metadata: z.record(z.unknown()).optional(),
});

export type LogFlagDto = z.infer<typeof LogFlagSchema>;

export const VerifyTokenSchema = z.object({
  token: z.string().min(1),
});

export type VerifyTokenDto = z.infer<typeof VerifyTokenSchema>;
