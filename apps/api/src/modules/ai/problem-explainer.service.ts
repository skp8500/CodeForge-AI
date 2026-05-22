import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import type OpenAI from 'openai';
import type IORedis from 'ioredis';

import { problems, testCases } from '@codeforge/db';
import type { Db } from '@codeforge/db';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { OPENAI_CLIENT } from './problem-parser.service';
import {
  EXPLAIN_RATE_LIMIT,
  FOLLOWUP_RATE_LIMIT,
  HINTS_TTL_SECONDS,
  HintsResponseSchema,
  type ConversationMessage,
  type ExplainProblemResponse,
  type ExplanationLevel,
  type FollowupResponse,
  type HintResponse,
  type RelatedProblem,
} from './problem-explainer.types';

// ─── Token config per explanation level ──────────────────────────────────────

const MAX_TOKENS: Record<ExplanationLevel, number> = {
  eli5: 400,
  standard: 600,
  expert: 800,
};

@Injectable()
export class ProblemExplainerService {
  private readonly logger = new Logger(ProblemExplainerService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  // ─── POST /ai/explain-problem ─────────────────────────────────────────────

  async explainProblem(
    problemId: string,
    level: ExplanationLevel,
    userId: string,
  ): Promise<ExplainProblemResponse> {
    await this.checkExplainRateLimit(userId);

    const problem = await this.fetchProblem(problemId);

    // Standard level needs visible sample test cases in the prompt
    let samples: { input: string; expectedOutput: string }[] = [];
    if (level === 'standard') {
      samples = await this.db
        .select({ input: testCases.input, expectedOutput: testCases.expectedOutput })
        .from(testCases)
        .where(and(eq(testCases.problemId, problemId), eq(testCases.isHidden, false)))
        .limit(5);
    }

    const { systemPrompt, userPrompt } = buildExplanationPrompt(level, problem, samples);
    const explanation = await this.callOpenAI(systemPrompt, userPrompt, MAX_TOKENS[level]);

    const relatedProblems = await this.fetchRelatedProblems(
      problemId,
      problem.tags as string[],
    );

    return { explanation, relatedProblems };
  }

  // ─── GET /problems/:id/hint ───────────────────────────────────────────────

  async getHint(
    problemId: string,
    hintNumber: 1 | 2 | 3,
    userId: string,
  ): Promise<HintResponse> {
    const progressKey = `hints:progress:${problemId}:${userId}`;
    const hintsKey = `hints:${problemId}:${userId}`;

    // Enforce forward-only progression
    const progressRaw = await this.redis.get(progressKey);
    const progress = progressRaw ? parseInt(progressRaw, 10) : 0;

    if (hintNumber > progress + 1) {
      throw new BadRequestException(
        `You must view hint ${progress + 1} before hint ${hintNumber}`,
      );
    }

    // Retrieve cached hints or generate them
    let hints: string[];
    const cachedRaw = await this.redis.get(hintsKey);

    if (cachedRaw) {
      hints = JSON.parse(cachedRaw) as string[];
    } else {
      const problem = await this.fetchProblem(problemId);
      hints = await this.generateHints(problem.statement);
      await this.redis.setex(hintsKey, HINTS_TTL_SECONDS, JSON.stringify(hints));
    }

    const newProgress = Math.max(progress, hintNumber);
    await this.redis.set(progressKey, newProgress.toString());

    return {
      hint: hints[hintNumber - 1],
      hintsRemaining: 3 - newProgress,
    };
  }

  // ─── POST /ai/explain-problem/followup ───────────────────────────────────

  async explainFollowup(
    problemId: string,
    question: string,
    conversationHistory: ConversationMessage[],
    userId: string,
  ): Promise<FollowupResponse> {
    await this.checkFollowupRateLimit(problemId, userId);

    const problem = await this.fetchProblem(problemId);

    // Truncate history to last 6 messages
    const recentHistory = conversationHistory.slice(-6);

    const systemPrompt = [
      'You are an expert competitive programming coach answering follow-up questions about a specific problem.',
      'Always reference the actual problem when answering. Never reveal hidden test case inputs or complete solutions.',
      'Keep answers focused, concise, and educational.',
      '',
      `Problem context: ${problem.statement}`,
    ].join('\n');

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: question },
    ];

    let rawContent: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 600,
        messages,
      });
      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new Error(`OpenAI API error: ${errorMessage(err)}`);
    }

    if (!rawContent.trim()) throw new Error('OpenAI returned empty response');
    return { answer: rawContent };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async fetchProblem(problemId: string) {
    const [row] = await this.db
      .select({
        id: problems.id,
        statement: problems.statement,
        constraints: problems.constraints,
        tags: problems.tags,
        timeLimitMs: problems.timeLimitMs,
      })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!row) throw new NotFoundException(`Problem ${problemId} not found`);
    return row;
  }

  private async fetchRelatedProblems(
    problemId: string,
    tags: string[],
  ): Promise<RelatedProblem[]> {
    if (tags.length === 0) return [];

    return this.db
      .select({
        id: problems.id,
        title: problems.title,
        slug: problems.slug,
        difficulty: problems.difficulty,
      })
      .from(problems)
      .where(
        and(
          ne(problems.id, problemId),
          eq(problems.isPublished, true),
          // Postgres array overlap: finds problems sharing at least one tag
          sql`${problems.tags} && ARRAY[${sql.join(
            tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`,
        ),
      )
      .limit(3) as Promise<RelatedProblem[]>;
  }

  private async generateHints(problemStatement: string): Promise<string[]> {
    const systemPrompt = [
      'Generate exactly 3 progressive hints for this competitive programming problem.',
      'Hint 1: Point the solver toward the right data structure or general category of algorithm. No specifics.',
      'Hint 2: Describe the core insight or key observation needed. Don\'t give the full approach.',
      'Hint 3: Describe the algorithm approach in enough detail that a skilled programmer could implement it. Stop short of writing code.',
      '',
      'Return JSON: { "hints": ["hint1", "hint2", "hint3"] }',
    ].join('\n');

    let rawContent: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: problemStatement },
        ],
      });
      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new Error(`OpenAI API error: ${errorMessage(err)}`);
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      throw new Error('OpenAI returned invalid JSON for hints');
    }

    const parsed = HintsResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new Error(`Hints schema validation failed: ${parsed.error.message}`);
    }

    return parsed.data.hints;
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    let content: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      content = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new Error(`OpenAI API error: ${errorMessage(err)}`);
    }

    if (!content.trim()) throw new Error('OpenAI returned empty response');
    return content;
  }

  private async checkExplainRateLimit(userId: string): Promise<void> {
    const key = `explain:rl:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600); // 1 hour window
    if (count > EXPLAIN_RATE_LIMIT) {
      throw new HttpException(
        `Explanation rate limit reached (${EXPLAIN_RATE_LIMIT}/hour). Try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async checkFollowupRateLimit(
    problemId: string,
    userId: string,
  ): Promise<void> {
    const key = `followup:rl:${problemId}:${userId}`;
    const count = await this.redis.incr(key);
    if (count > FOLLOWUP_RATE_LIMIT) {
      throw new HttpException(
        `Follow-up question limit reached (${FOLLOWUP_RATE_LIMIT} per problem).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildExplanationPrompt(
  level: ExplanationLevel,
  problem: { statement: string; constraints: unknown; tags: unknown },
  samples: { input: string; expectedOutput: string }[],
): { systemPrompt: string; userPrompt: string } {
  switch (level) {
    case 'eli5':
      return {
        systemPrompt:
          'You are a friendly teacher explaining coding problems to a complete beginner. Use simple analogies, no jargon, relatable real-world comparisons.',
        userPrompt: `Explain this problem in simple terms a non-programmer could understand: ${problem.statement}`,
      };

    case 'standard': {
      const samplesText =
        samples.length > 0
          ? samples
              .map((s, i) => `Sample ${i + 1}:\n  Input: ${s.input}\n  Output: ${s.expectedOutput}`)
              .join('\n')
          : 'No visible samples available.';

      return {
        systemPrompt:
          'You are a coding tutor. Break down the problem clearly: what is being asked, what the input/output means, walk through the sample cases, and give 1-2 hints about the approach without revealing the full solution.',
        userPrompt: [
          `Explain this problem: ${problem.statement}`,
          `Constraints: ${JSON.stringify(problem.constraints ?? {})}`,
          `Samples:\n${samplesText}`,
        ].join('\n'),
      };
    }

    case 'expert': {
      return {
        systemPrompt:
          'You are an expert competitive programmer. Give a technical breakdown: algorithm taxonomy (what category this problem falls into), known solution patterns, time/space complexity of the optimal solution, and discussion of common pitfalls.',
        userPrompt: [
          `Give an expert-level explanation of this problem: ${problem.statement}`,
          `Constraints: ${JSON.stringify(problem.constraints ?? {})}`,
        ].join('\n'),
      };
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
