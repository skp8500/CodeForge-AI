import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type OpenAI from 'openai';
import type IORedis from 'ioredis';

import { aiReviews, submissions, problems, testCases } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { Verdict, QUEUE_NAMES } from '@codeforge/shared';
import type { Language } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { OPENAI_CLIENT } from './problem-parser.service';
import {
  AI_REVIEW_QUEUE_TOKEN,
  AiReviewResultSchema,
  type AiReview,
  type AiReviewResult,
  type ReviewRequest,
} from './code-review.types';

@Injectable()
export class CodeReviewService {
  private readonly logger = new Logger(CodeReviewService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    @Inject(AI_REVIEW_QUEUE_TOKEN) private readonly reviewQueue: Queue,
  ) {}

  // ─── Called by BullMQ processor after judging ────────────────────────────────

  async generate(submissionId: string): Promise<void> {
    // Idempotency guard — skip if review already exists
    const [existing] = await this.db
      .select({ id: aiReviews.id })
      .from(aiReviews)
      .where(eq(aiReviews.submissionId, submissionId))
      .limit(1);

    if (existing) {
      this.logger.debug(`Review already exists for submission ${submissionId}`);
      return;
    }

    const [sub] = await this.db
      .select({
        id: submissions.id,
        code: submissions.code,
        language: submissions.language,
        verdict: submissions.verdict,
        problemId: submissions.problemId,
        runtimeMs: submissions.runtimeMs,
        memoryKb: submissions.memoryKb,
      })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!sub || !sub.verdict) {
      throw new Error(`Submission ${submissionId} not found or has no verdict`);
    }

    const [problem] = await this.db
      .select({
        statement: problems.statement,
        constraints: problems.constraints,
        timeLimitMs: problems.timeLimitMs,
      })
      .from(problems)
      .where(eq(problems.id, sub.problemId))
      .limit(1);

    if (!problem) throw new Error(`Problem not found for submission ${submissionId}`);

    // For WA: include the first visible test case as a concrete example
    let sampleTest: { input: string; expectedOutput: string } | undefined;
    if (sub.verdict === Verdict.WA) {
      const [tc] = await this.db
        .select({ input: testCases.input, expectedOutput: testCases.expectedOutput })
        .from(testCases)
        .where(and(eq(testCases.problemId, sub.problemId), eq(testCases.isHidden, false)))
        .limit(1);
      sampleTest = tc;
    }

    const req: ReviewRequest = {
      submissionId,
      code: sub.code,
      language: sub.language as Language,
      verdict: sub.verdict as Verdict,
      problemStatement: problem.statement,
      problemConstraints: (problem.constraints as object) ?? {},
      timeLimitMs: problem.timeLimitMs,
      failingTestCaseInput: sampleTest?.input,
      failingTestCaseExpected: sampleTest?.expectedOutput,
      runtimeMs: sub.runtimeMs ?? undefined,
      memoryKb: sub.memoryKb ?? undefined,
    };

    const result = await this.callWithRetry(req);

    const [review] = await this.db
      .insert(aiReviews)
      .values({
        submissionId,
        timeComplexity: result.timeComplexity,
        spaceComplexity: result.spaceComplexity,
        correctnessNotes: result.correctnessNotes,
        optimizationHint: result.optimizationHint ?? null,
        dryRun: result.dryRun ?? null,
        qualityScore: result.qualityScore,
      })
      .returning({ id: aiReviews.id });

    if (!review) throw new Error('Failed to insert AI review');

    await this.db
      .update(submissions)
      .set({ aiReviewId: review.id })
      .where(eq(submissions.id, submissionId));

    const publishPayload: AiReview = {
      id: review.id,
      submissionId,
      ...result,
      createdAt: new Date(),
    };
    await this.redis.publish(
      `submissions:${submissionId}:review`,
      JSON.stringify(publishPayload),
    );

    this.logger.log(`AI review generated for submission ${submissionId}`);
  }

  // ─── POST /ai/review-submission ──────────────────────────────────────────────

  async triggerReview(
    submissionId: string,
    userId: string,
  ): Promise<AiReview | { status: 'pending' }> {
    await this.requireOwnership(submissionId, userId);

    const [review] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.submissionId, submissionId))
      .limit(1);

    if (review) return this.mapReview(review);

    await this.reviewQueue.add(
      'review',
      { submissionId },
      { jobId: `review:${submissionId}`, priority: 10 },
    );

    return { status: 'pending' };
  }

  // ─── GET /submissions/:id/review ─────────────────────────────────────────────

  async getReview(submissionId: string, userId: string): Promise<AiReview> {
    await this.requireOwnership(submissionId, userId);

    const [review] = await this.db
      .select()
      .from(aiReviews)
      .where(eq(aiReviews.submissionId, submissionId))
      .limit(1);

    if (!review) throw new NotFoundException(`Review for submission ${submissionId} not found`);
    return this.mapReview(review);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async requireOwnership(submissionId: string, userId: string): Promise<void> {
    const [sub] = await this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
      .limit(1);

    if (!sub) throw new NotFoundException(`Submission ${submissionId} not found`);
  }

  private async callWithRetry(req: ReviewRequest): Promise<AiReviewResult> {
    try {
      return await this.callOpenAI(req, false);
    } catch (err) {
      this.logger.warn(`First review attempt failed (${errorMessage(err)}). Retrying.`);
    }
    return this.callOpenAI(req, true);
  }

  private async callOpenAI(req: ReviewRequest, isRetry: boolean): Promise<AiReviewResult> {
    const { systemPrompt, userPrompt } = buildPrompt(req, isRetry);

    let rawContent: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new Error(`OpenAI API error: ${errorMessage(err)}`);
    }

    if (!rawContent.trim()) throw new Error('OpenAI returned empty response');

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      throw new Error(`OpenAI returned invalid JSON: ${rawContent.slice(0, 200)}`);
    }

    const parsed = AiReviewResultSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new Error(
        `Schema validation failed: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
      );
    }

    return parsed.data;
  }

  private mapReview(row: typeof aiReviews.$inferSelect): AiReview {
    return {
      id: row.id,
      submissionId: row.submissionId,
      timeComplexity: row.timeComplexity ?? null,
      spaceComplexity: row.spaceComplexity ?? null,
      correctnessNotes: row.correctnessNotes ?? null,
      optimizationHint: row.optimizationHint ?? null,
      dryRun: row.dryRun ?? null,
      qualityScore: row.qualityScore ?? null,
      createdAt: row.createdAt,
    };
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert competitive programming coach reviewing a student's code submission.
You give concise, accurate, educational feedback. You never reveal hidden test case inputs.
Always analyze the ACTUAL submitted code, not a hypothetical solution.
Return ONLY valid JSON matching the exact schema provided.`;

const RETRY_SUFFIX =
  '\n\nIMPORTANT: Your previous response did not match the required JSON schema. Return ONLY the JSON object with no additional text.';

const JSON_SCHEMA = `{
  "timeComplexity": "Big-O string",
  "spaceComplexity": "Big-O string",
  "correctnessNotes": "explanation",
  "optimizationHint": null or "hint string",
  "dryRun": null or "step-through string",
  "qualityScore": 0.0-1.0
}`;

function buildPrompt(
  req: ReviewRequest,
  isRetry: boolean,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = isRetry ? SYSTEM_PROMPT + RETRY_SUFFIX : SYSTEM_PROMPT;

  const header = [
    `The student submitted this ${req.language} code for the following problem:`,
    '',
    `Problem: ${req.problemStatement}`,
    `Constraints: ${JSON.stringify(req.problemConstraints)}`,
    '',
    `Their code:`,
    `\`\`\`${req.language}`,
    req.code,
    '```',
  ].join('\n');

  let verdictBlock: string;

  switch (req.verdict) {
    case Verdict.WA:
      verdictBlock = [
        'Verdict: WRONG ANSWER',
        `Failing test input (visible test): ${req.failingTestCaseInput ?? 'hidden test — do not reveal'}`,
        `Expected output: ${req.failingTestCaseExpected ?? 'hidden'}`,
        `Their actual output: ${req.failingTestCaseActual ?? 'hidden'}`,
        '',
        'Analyze their code and return JSON:',
        JSON_SCHEMA,
        '',
        'For this WA verdict:',
        '- "correctnessNotes": 2-3 sentences explaining the logical flaw. Be specific — point to the line or logic that\'s wrong. Do NOT just say \'your output is wrong\'.',
        '- "optimizationHint": null',
        '- "dryRun": Step through a simple failing example showing where the logic diverges. Max 200 words.',
      ].join('\n');
      break;

    case Verdict.TLE:
      verdictBlock = [
        `Verdict: TIME LIMIT EXCEEDED (their solution ran in ${req.runtimeMs ?? 'unknown'}ms, limit is ${req.timeLimitMs}ms)`,
        '',
        'Return JSON:',
        JSON_SCHEMA,
        '',
        'For this TLE verdict:',
        '- "correctnessNotes": Explain that this is a TLE and why their approach is too slow for the constraints.',
        '- "optimizationHint": Describe a more efficient approach (algorithm/data structure) without giving the full solution. Max 100 words.',
        '- "dryRun": null',
      ].join('\n');
      break;

    case Verdict.AC:
      verdictBlock = [
        `Verdict: ACCEPTED (runtime: ${req.runtimeMs ?? 'unknown'}ms, memory: ${req.memoryKb ?? 'unknown'}KB)`,
        '',
        'Return JSON:',
        JSON_SCHEMA,
        '',
        'For this AC verdict:',
        '- "correctnessNotes": Acknowledge the correct solution in one sentence.',
        '- "optimizationHint": If their solution is not optimal, describe a better approach briefly. If already optimal, say so.',
        '- "dryRun": null',
      ].join('\n');
      break;

    default:
      // MLE, RE, CE, OLE
      verdictBlock = [
        `Verdict: ${req.verdict}`,
        `Failing test input (visible test): ${req.failingTestCaseInput ?? 'hidden test — do not reveal'}`,
        `Expected output: ${req.failingTestCaseExpected ?? 'hidden'}`,
        '',
        'Analyze their code and return JSON:',
        JSON_SCHEMA,
        '',
        `For this ${req.verdict} verdict:`,
        `- "correctnessNotes": 2-3 sentences explaining what caused the ${req.verdict} verdict.`,
        '- "optimizationHint": null',
        '- "dryRun": null',
      ].join('\n');
  }

  return { systemPrompt, userPrompt: `${header}\n\n${verdictBlock}` };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
