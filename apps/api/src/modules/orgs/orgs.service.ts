import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';

import { orgMembers, organizations } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { OrgPlan } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import type { AddMemberBodyDto, CreateOrgBodyDto } from './orgs.types';

@Injectable()
export class OrgsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

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
      .values({
        name: body.name,
        slug,
        ownerId: userId,
        plan: body.plan as OrgPlan,
      })
      .returning();

    await this.db.insert(orgMembers).values({
      orgId: org!.id,
      userId,
      role: 'admin',
    });

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

  async addMember(orgId: string, body: AddMemberBodyDto, requesterId: string) {
    const [org] = await this.db
      .select({ id: organizations.id, ownerId: organizations.ownerId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);

    if (org.ownerId !== requesterId) {
      const [membership] = await this.db
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, requesterId)))
        .limit(1);

      if (!membership || membership.role !== 'admin') {
        throw new ForbiddenException('Only org admins can add members');
      }
    }

    const [existing] = await this.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, body.userId)))
      .limit(1);

    if (existing) throw new ConflictException('User is already a member of this organization');

    const [member] = await this.db
      .insert(orgMembers)
      .values({ orgId, userId: body.userId, role: body.role })
      .returning();

    return member;
  }

  async removeMember(orgId: string, targetUserId: string, requesterId: string) {
    const [org] = await this.db
      .select({ id: organizations.id, ownerId: organizations.ownerId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);

    if (org.ownerId !== requesterId) {
      const [membership] = await this.db
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, requesterId)))
        .limit(1);

      if (!membership || membership.role !== 'admin') {
        throw new ForbiddenException('Only org admins can remove members');
      }
    }

    await this.db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)));

    return { removed: true };
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
