import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { count, eq, isNull, and } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type IORedis from 'ioredis';

import { problems, submissions } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import {
  JUDGE_EVENTS_CHANNEL,
  QUEUE_NAMES,
  type JudgeEventPayload,
  type SubmissionJob,
} from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import {
  CONTEST_QUEUE_TOKEN,
  PRACTICE_QUEUE_TOKEN,
  MAX_PENDING_PER_USER,
  type CreateSubmissionBodyDto,
  type SubmissionEnqueuedResponse,
  type SubmissionStatusResponse,
} from './judge.types';

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
    @Inject(CONTEST_QUEUE_TOKEN) private readonly contestQueue: Queue,
    @Inject(PRACTICE_QUEUE_TOKEN) private readonly practiceQueue: Queue,
  ) {}

  // ─── Create submission ──────────────────────────────────────────────────────

  async createSubmission(
    dto: CreateSubmissionBodyDto,
    userId: string,
  ): Promise<SubmissionEnqueuedResponse> {
    // 1. Fetch problem limits (validates problemId exists)
    const problem = await this.fetchProblem(dto.problemId);

    // 2. Rate-limit: max 5 pending submissions per user
    const pending = await this.countPendingSubmissions(userId);
    if (pending >= MAX_PENDING_PER_USER) {
      throw new HttpException(
        `You have ${pending} pending submissions. Wait for them to complete before submitting again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Persist submission row with null verdict (judging not started)
    const [row] = await this.db
      .insert(submissions)
      .values({
        userId,
        problemId: dto.problemId,
        contestId: dto.contestId ?? null,
        language: dto.language,
        code: dto.code,
      })
      .returning({ id: submissions.id });

    if (!row) throw new Error('Failed to insert submission');

    const submissionId = row.id;

    // 4. Enqueue — contest gets a priority slot; practice is FIFO
    const isContest = !!dto.contestId;
    const queue = isContest ? this.contestQueue : this.practiceQueue;
    const jobData: SubmissionJob = {
      submissionId,
      userId,
      problemId: dto.problemId,
      language: dto.language,
      code: dto.code,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      mode: isContest ? 'contest' : 'practice',
      contestId: dto.contestId,
    };

    await queue.add(QUEUE_NAMES.CONTEST_SUBMISSIONS, jobData, {
      jobId: submissionId,
      priority: isContest ? 1 : undefined,
    });

    const position = await queue.getWaitingCount();
    this.logger.log(
      `Enqueued submission ${submissionId} (${dto.language}, ${isContest ? 'contest' : 'practice'}, pos ~${position})`,
    );

    // 5. Notify the user's browser that their submission is now queued
    const queuedEvent: JudgeEventPayload = {
      userId,
      event: 'submission:queued',
      data: { submissionId, position },
    };
    await this.redis
      .publish(JUDGE_EVENTS_CHANNEL, JSON.stringify(queuedEvent))
      .catch((err) => this.logger.warn('Failed to publish submission:queued', err));

    return { submissionId, position };
  }

  // ─── Get submission status ──────────────────────────────────────────────────

  async getSubmission(submissionId: string, userId: string): Promise<SubmissionStatusResponse> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    return {
      id: row.id,
      userId: row.userId,
      problemId: row.problemId,
      contestId: row.contestId,
      language: row.language,
      verdict: row.verdict,
      runtimeMs: row.runtimeMs,
      memoryKb: row.memoryKb,
      testCasesPassed: row.testCasesPassed,
      totalTestCases: row.totalTestCases,
      submittedAt: row.submittedAt,
    };
  }

  // ─── Cancel submission ──────────────────────────────────────────────────────

  async cancelSubmission(id: string, userId: string): Promise<void> {
    const [updated] = await this.db
      .update(submissions)
      .set({ verdict: 'CANCELLED' })
      .where(and(eq(submissions.id, id), eq(submissions.userId, userId), isNull(submissions.verdict)))
      .returning({ id: submissions.id });
    if (!updated) throw new NotFoundException('Submission not found, already judged, or access denied');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async fetchProblem(problemId: string) {
    const [row] = await this.db
      .select({ id: problems.id, timeLimitMs: problems.timeLimitMs, memoryLimitMb: problems.memoryLimitMb })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!row) throw new NotFoundException(`Problem ${problemId} not found`);
    return row;
  }

  private async countPendingSubmissions(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), isNull(submissions.verdict)));

    return result?.count ?? 0;
  }
}
