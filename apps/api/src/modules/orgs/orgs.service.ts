import { randomBytes } from 'crypto';

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, gt, isNull } from 'drizzle-orm';

import { orgInvites, orgMembers, organizations, users } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { OrgPlan } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { MailService } from '../../mail/mail.service';
import type {
  AcceptInviteBodyDto,
  CreateOrgBodyDto,
  InviteMemberBodyDto,
  UpdateMemberRoleBodyDto,
} from './orgs.types';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class OrgsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly mailService: MailService,
  ) {}

  async createOrg(body: CreateOrgBodyDto, userId: string) {
    const slug = slugify(body.name);

    const [existing] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (existing) throw new ConflictException(`Organization with slug '${slug}' already exists`);

    const [org] = await this.db
      .insert(organizations)
      .values({ name: body.name, slug, ownerId: userId, plan: body.plan as OrgPlan })
      .returning();

    await this.db.insert(orgMembers).values({ orgId: org!.id, userId, role: 'admin' });

    return org;
  }

  async getOrgBySlug(slug: string) {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!org) throw new NotFoundException(`Organization '${slug}' not found`);

    const [memberCount] = await this.db
      .select({ count: count() })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, org.id));

    return { ...org, memberCount: Number(memberCount?.count ?? 0) };
  }

  async getMembers(orgId: string, requesterId: string) {
    await this.requireOrgAdmin(orgId, requesterId);

    return this.db
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        email: users.email,
        username: users.username,
      })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.orgId, orgId))
      .orderBy(orgMembers.joinedAt);
  }

  async inviteMember(orgId: string, body: InviteMemberBodyDto, requesterId: string, frontendUrl: string) {
    const org = await this.requireOrgAdmin(orgId, requesterId);

    // Idempotency: reuse unexpired pending invite for this email
    const [existing] = await this.db
      .select({ id: orgInvites.id })
      .from(orgInvites)
      .where(
        and(
          eq(orgInvites.orgId, orgId),
          eq(orgInvites.email, body.email),
          isNull(orgInvites.acceptedAt),
          gt(orgInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    let token: string;
    if (existing) {
      const [inv] = await this.db
        .select({ token: orgInvites.token })
        .from(orgInvites)
        .where(eq(orgInvites.id, existing.id))
        .limit(1);
      token = inv!.token;
    } else {
      token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
      await this.db.insert(orgInvites).values({ orgId, email: body.email, role: body.role, token, expiresAt });
    }

    const inviteUrl = `${frontendUrl}/orgs/accept-invite?token=${token}`;
    await this.mailService.sendOrgInvite(body.email, org.name, inviteUrl);

    return { invited: true, email: body.email };
  }

  async acceptInvite(body: AcceptInviteBodyDto, userId: string) {
    const [invite] = await this.db
      .select()
      .from(orgInvites)
      .where(eq(orgInvites.token, body.token))
      .limit(1);

    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.acceptedAt) throw new GoneException('Invitation already accepted');
    if (invite.expiresAt < new Date()) throw new GoneException('Invitation has expired');

    // Idempotency: already a member
    const [existing] = await this.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, userId)))
      .limit(1);

    if (!existing) {
      await this.db.insert(orgMembers).values({ orgId: invite.orgId, userId, role: invite.role });
    }

    await this.db
      .update(orgInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(orgInvites.id, invite.id));

    const [org] = await this.db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, invite.orgId))
      .limit(1);

    return { orgSlug: org?.slug, orgName: org?.name };
  }

  async updateMemberRole(orgId: string, targetUserId: string, body: UpdateMemberRoleBodyDto, requesterId: string) {
    const org = await this.requireOrgAdmin(orgId, requesterId);

    if (org.ownerId === targetUserId) {
      throw new ForbiddenException('Cannot change the role of the org owner');
    }

    const [updated] = await this.db
      .update(orgMembers)
      .set({ role: body.role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))
      .returning({ id: orgMembers.id });

    if (!updated) throw new NotFoundException('Member not found in this organization');
    return { updated: true };
  }

  async removeMember(orgId: string, targetUserId: string, requesterId: string) {
    const org = await this.requireOrgAdmin(orgId, requesterId);

    if (org.ownerId === targetUserId) {
      throw new ForbiddenException('Cannot remove the org owner');
    }

    await this.db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));

    return { removed: true };
  }

  // ─── Shared helper ──────────────────────────────────────────────────────────

  private async requireOrgAdmin(orgId: string, userId: string) {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);

    if (org.ownerId !== userId) {
      const [membership] = await this.db
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role !== 'admin') {
        throw new ForbiddenException('Only org admins can perform this action');
      }
    }

    return org;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
