import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, gte, lt, lte } from 'drizzle-orm';

import { contestProblems, contests, problems } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { ContestScoringMode } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import type {
  AddContestProblemBodyDto,
  ContestListQueryDto,
  CreateContestBodyDto,
} from './contests.types';

@Injectable()
export class ContestsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async listContests(query: ContestListQueryDto) {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;
    const now = new Date();

    const filters = [eq(contests.isPublic, true)];

    if (status === 'upcoming') {
      filters.push(gt(contests.startsAt, now));
    } else if (status === 'ongoing') {
      const ongoingFilter = and(lte(contests.startsAt, now), gte(contests.endsAt, now));
      if (ongoingFilter) filters.push(ongoingFilter);
    } else if (status === 'past') {
      filters.push(lt(contests.endsAt, now));
    }

    return this.db
      .select({
        id: contests.id,
        title: contests.title,
        slug: contests.slug,
        scoringMode: contests.scoringMode,
        startsAt: contests.startsAt,
        endsAt: contests.endsAt,
        isPublic: contests.isPublic,
        createdBy: contests.createdBy,
      })
      .from(contests)
      .where(and(...filters))
      .limit(limit)
      .offset(offset);
  }

  async getContestBySlug(slug: string) {
    const [contest] = await this.db
      .select()
      .from(contests)
      .where(eq(contests.slug, slug))
      .limit(1);

    if (!contest) throw new NotFoundException(`Contest '${slug}' not found`);

    const contestProblemsList = await this.db
      .select({
        id: contestProblems.id,
        problemId: contestProblems.problemId,
        points: contestProblems.points,
        orderIndex: contestProblems.orderIndex,
        title: problems.title,
        slug: problems.slug,
        difficulty: problems.difficulty,
      })
      .from(contestProblems)
      .innerJoin(problems, eq(contestProblems.problemId, problems.id))
      .where(eq(contestProblems.contestId, contest.id));

    return { ...contest, problems: contestProblemsList };
  }

  async createContest(body: CreateContestBodyDto, userId: string) {
    const slug = slugify(body.title);

    const [existing] = await this.db
      .select({ id: contests.id })
      .from(contests)
      .where(eq(contests.slug, slug))
      .limit(1);

    if (existing) throw new ConflictException(`A contest with slug '${slug}' already exists`);

    const [created] = await this.db
      .insert(contests)
      .values({
        title: body.title,
        slug,
        orgId: body.orgId ?? null,
        scoringMode: body.scoringMode as ContestScoringMode,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        isPublic: body.isPublic,
        createdBy: userId,
      })
      .returning();

    return created;
  }

  async addProblemToContest(contestId: string, body: AddContestProblemBodyDto) {
    const [contest] = await this.db
      .select({ id: contests.id })
      .from(contests)
      .where(eq(contests.id, contestId))
      .limit(1);

    if (!contest) throw new NotFoundException(`Contest ${contestId} not found`);

    const [existing] = await this.db
      .select({ id: contestProblems.id })
      .from(contestProblems)
      .where(
        and(
          eq(contestProblems.contestId, contestId),
          eq(contestProblems.problemId, body.problemId),
        ),
      )
      .limit(1);

    if (existing) throw new ConflictException('Problem already added to this contest');

    const [added] = await this.db
      .insert(contestProblems)
      .values({
        contestId,
        problemId: body.problemId,
        points: body.points,
        orderIndex: body.orderIndex,
      })
      .returning();

    return added;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
