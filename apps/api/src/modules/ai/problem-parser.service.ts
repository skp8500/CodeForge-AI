import { createHash } from 'crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type OpenAI from 'openai';
import type IORedis from 'ioredis';

import { REDIS_TOKEN } from '../../redis/redis.module';
import { ParsingException } from './problem-parser.exception';
import {
  buildMessages,
  OPENAI_JSON_SCHEMA,
  ParsedProblemSchema,
  RawParsedProblemSchema,
  type ParsedProblem,
  type ParseProblemResponse,
} from './problem-parser.types';

export const OPENAI_CLIENT = 'OPENAI_CLIENT';

/** Redis key prefix; value is cached for 24 h */
const CACHE_PREFIX = 'ai:parse:';
const CACHE_TTL_SECONDS = 86_400;

/** Problems with confidence below this threshold are flagged for human review */
const REVIEW_THRESHOLD = 0.75;

@Injectable()
export class ProblemParserService {
  private readonly logger = new Logger(ProblemParserService.name);

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async parse(rawText: string): Promise<ParseProblemResponse> {
    const startMs = Date.now();
    const cacheKey = `${CACHE_PREFIX}${sha256(rawText)}`;

    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for key ${cacheKey.slice(-8)}`);
      const parsed = JSON.parse(cached) as ParsedProblem;
      return {
        parsed,
        needsReview: parsed.confidenceScore < REVIEW_THRESHOLD,
        processingTimeMs: 0,
        cached: true,
      };
    }

    // ── Cache miss → call OpenAI ─────────────────────────────────────────────
    this.logger.debug('Cache miss — calling OpenAI');
    const parsed = await this.parseWithRetry(rawText);

    await this.redis.set(cacheKey, JSON.stringify(parsed), 'EX', CACHE_TTL_SECONDS);

    return {
      parsed,
      needsReview: parsed.confidenceScore < REVIEW_THRESHOLD,
      processingTimeMs: Date.now() - startMs,
    };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async parseWithRetry(rawText: string): Promise<ParsedProblem> {
    // First attempt
    try {
      return await this.callOpenAI(rawText, false);
    } catch (firstErr) {
      this.logger.warn(
        `First parse attempt failed (${errorMessage(firstErr)}). Retrying with stricter prompt.`,
      );
    }

    // Single retry with the stricter user message suffix
    try {
      return await this.callOpenAI(rawText, true);
    } catch (retryErr) {
      const raw = retryErr instanceof ParsingException ? retryErr.rawResponse : '';
      throw new ParsingException(
        `Problem parsing failed after retry: ${errorMessage(retryErr)}`,
        raw,
      );
    }
  }

  private async callOpenAI(rawText: string, isRetry: boolean): Promise<ParsedProblem> {
    // ── 1. API call ──────────────────────────────────────────────────────────
    let rawContent: string;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ParsedProblem',
            strict: true,
            schema: OPENAI_JSON_SCHEMA,
          },
        },
        messages: buildMessages(rawText, isRetry),
      });

      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new ParsingException(`OpenAI API error: ${errorMessage(err)}`, '');
    }

    if (!rawContent.trim()) {
      throw new ParsingException('OpenAI returned an empty response', rawContent);
    }

    // ── 2. JSON parse ────────────────────────────────────────────────────────
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      throw new ParsingException('OpenAI response is not valid JSON', rawContent);
    }

    // ── 3. Validate raw shape (array constraints) ────────────────────────────
    const rawResult = RawParsedProblemSchema.safeParse(rawJson);
    if (!rawResult.success) {
      throw new ParsingException(
        `Schema validation failed: ${rawResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`,
        rawContent,
      );
    }

    // ── 4. Transform constraints array → record ──────────────────────────────
    const constraintsRecord = Object.fromEntries(
      rawResult.data.constraints.map((c) => [c.variable, { min: c.min, max: c.max }]),
    );

    // ── 5. Validate final shape ──────────────────────────────────────────────
    return ParsedProblemSchema.parse({
      ...rawResult.data,
      constraints: constraintsRecord,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
