import { z } from 'zod';

export const CreateOrgBodySchema = z.object({
  name: z.string().min(2).max(100),
  plan: z.string().default('free'),
});

export type CreateOrgBodyDto = z.infer<typeof CreateOrgBodySchema>;

export const InviteMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['member', 'admin']).default('member'),
});

export type InviteMemberBodyDto = z.infer<typeof InviteMemberBodySchema>;

export const UpdateMemberRoleBodySchema = z.object({
  role: z.enum(['member', 'admin']),
});

export type UpdateMemberRoleBodyDto = z.infer<typeof UpdateMemberRoleBodySchema>;

export const AcceptInviteBodySchema = z.object({
  token: z.string().min(1),
});

export type AcceptInviteBodyDto = z.infer<typeof AcceptInviteBodySchema>;
