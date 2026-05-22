import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, inArray, notInArray, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';

import { problems, submissions, testCases } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { Difficulty, Verdict } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import type {
  CreateProblemBodyDto,
  PaginatedProblems,
  ProblemDetail,
  ProblemListItem,
  ProblemListQueryDto,
} from './problems.types';

const LIST_TTL = 60;
const DETAIL_TTL = 300;

@Injectable()
export class ProblemsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  async listProblems(query: ProblemListQueryDto, userId?: string): Promise<PaginatedProblems> {
    // Don't cache when solved filter is active — it's user-specific
    const cacheKey = !query.solved ? `problems:list:${JSON.stringify(query)}` : null;
    if (cacheKey) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedProblems;
    }

    const { page, limit, difficulty, tags, search, solved } = query;
    const offset = (page - 1) * limit;

    const filters = [eq(problems.isPublished, true)];

    if (difficulty && Object.values(Difficulty).includes(difficulty as Difficulty)) {
      filters.push(eq(problems.difficulty, difficulty as Difficulty));
    }

    if (tags) {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tagList.length > 0) {
        filters.push(
          sql`${problems.tags} && ARRAY[${sql.join(
            tagList.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`,
        );
      }
    }

    if (search) {
      filters.push(ilike(problems.title, `%${search}%`));
    }

    // solved filter: requires userId; ignored when unauthenticated
    if (solved !== undefined && userId) {
      const acSubquery = this.db
        .selectDistinct({ problemId: submissions.problemId })
        .from(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.verdict, Verdict.AC)));

      if (solved === 'true') {
        filters.push(inArray(problems.id, acSubquery));
      } else {
        filters.push(notInArray(problems.id, acSubquery));
      }
    }

    const whereClause = and(...filters);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          id: problems.id,
          title: problems.title,
          slug: problems.slug,
          difficulty: problems.difficulty,
          tags: problems.tags,
          timeLimitMs: problems.timeLimitMs,
          isPublished: problems.isPublished,
          createdAt: problems.createdAt,
        })
        .from(problems)
        .where(whereClause)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(problems).where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const result: PaginatedProblems = {
      data: rows as ProblemListItem[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };

    if (cacheKey) {
      await this.redis.setex(cacheKey, LIST_TTL, JSON.stringify(result));
    }
    return result;
  }

  async getProblemBySlug(slug: string): Promise<ProblemDetail> {
    const cacheKey = `problems:slug:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ProblemDetail;

    const [row] = await this.db
      .select()
      .from(problems)
      .where(and(eq(problems.slug, slug), eq(problems.isPublished, true)))
      .limit(1);

    if (!row) throw new NotFoundException(`Problem '${slug}' not found`);

    const [sampleTests, submissionStats] = await Promise.all([
      this.db
        .select({ input: testCases.input, expectedOutput: testCases.expectedOutput })
        .from(testCases)
        .where(and(eq(testCases.problemId, row.id), eq(testCases.isHidden, false)))
        .limit(5),
      this.db
        .select({ count: count(), verdict: submissions.verdict })
        .from(submissions)
        .where(eq(submissions.problemId, row.id))
        .groupBy(submissions.verdict),
    ]);

    const totalSubmissions = submissionStats.reduce(
      (sum: number, s: { count: number | string }) => sum + Number(s.count),
      0,
    );
    const acceptedSubmissions = submissionStats
      .filter((s) => s.verdict === Verdict.AC)
      .reduce((sum: number, s: { count: number | string }) => sum + Number(s.count), 0);

    const detail: ProblemDetail = {
      id: row.id,
      title: row.title,
      slug: row.slug,
      statement: row.statement,
      difficulty: row.difficulty,
      constraints: row.constraints,
      tags: row.tags,
      timeLimitMs: row.timeLimitMs,
      memoryLimitMb: row.memoryLimitMb,
      isSpecialJudge: row.isSpecialJudge,
      isPublished: row.isPublished,
      orgId: row.orgId,
      aiConfidence: row.aiConfidence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sampleTestCases: sampleTests,
      stats: {
        totalSubmissions,
        acceptedSubmissions,
        acceptanceRate: totalSubmissions > 0 ? acceptedSubmissions / totalSubmissions : 0,
      },
    };

    await this.redis.setex(cacheKey, DETAIL_TTL, JSON.stringify(detail));
    return detail;
  }

  async createProblem(body: CreateProblemBodyDto, userId: string): Promise<ProblemListItem> {
    const baseSlug = slugify(body.title);
    const slug = await this.findUniqueSlug(baseSlug);

    const [created] = await this.db
      .insert(problems)
      .values({
        title: body.title,
        slug,
        statement: body.statement,
        difficulty: body.difficulty as Difficulty,
        constraints: body.constraints ?? {},
        tags: body.tags,
        timeLimitMs: body.timeLimitMs,
        memoryLimitMb: body.memoryLimitMb,
        isSpecialJudge: body.isSpecialJudge,
        isPublished: false,
        createdBy: userId,
        orgId: body.orgId ?? null,
      })
      .returning({
        id: problems.id,
        title: problems.title,
        slug: problems.slug,
        difficulty: problems.difficulty,
        tags: problems.tags,
        timeLimitMs: problems.timeLimitMs,
        isPublished: problems.isPublished,
        createdAt: problems.createdAt,
      });

    return created as ProblemListItem;
  }

  async getProblemSubmissions(problemId: string, userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [problem] = await this.db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!problem) throw new NotFoundException(`Problem ${problemId} not found`);

    return this.db
      .select({
        id: submissions.id,
        verdict: submissions.verdict,
        language: submissions.language,
        runtimeMs: submissions.runtimeMs,
        memoryKb: submissions.memoryKb,
        score: submissions.score,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(and(eq(submissions.problemId, problemId), eq(submissions.userId, userId)))
      .limit(limit)
      .offset(offset);
  }

  async publishProblem(id: string, userId: string): Promise<ProblemListItem> {
    const [updated] = await this.db
      .update(problems)
      .set({ isPublished: true, updatedAt: new Date() })
      .where(and(eq(problems.id, id), eq(problems.authorId, userId)))
      .returning({
        id: problems.id,
        title: problems.title,
        slug: problems.slug,
        difficulty: problems.difficulty,
        tags: problems.tags,
        timeLimitMs: problems.timeLimitMs,
        isPublished: problems.isPublished,
        createdAt: problems.createdAt,
      });
    if (!updated) throw new NotFoundException('Problem not found or access denied');
    await this.redis.del(`problem:${updated.slug}`);
    return updated as ProblemListItem;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async findUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let suffix = 2;
    for (;;) {
      const [existing] = await this.db
        .select({ id: problems.id })
        .from(problems)
        .where(eq(problems.slug, slug))
        .limit(1);
      if (!existing) return slug;
      slug = `${baseSlug}-${suffix++}`;
      if (suffix > 100) throw new ConflictException(`Cannot generate unique slug for '${baseSlug}'`);
    }
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
