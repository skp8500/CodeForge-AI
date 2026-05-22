import { spawn } from 'child_process';
import { createHash } from 'crypto';

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type OpenAI from 'openai';

import { problems, testCases } from '@codeforge/db';
import type { Db } from '@codeforge/db';

import { TestCaseCategory } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { OPENAI_CLIENT } from './problem-parser.service';
import {
  BRUTEFORCE_OPENAI_JSON_SCHEMA,
  CATEGORY_HIDDEN,
  TESTCASE_OPENAI_JSON_SCHEMA,
  RawBruteForceResponseSchema,
  RawTestCaseResponseSchema,
  buildBruteForcePrompt,
  buildCategoryPrompt,
  buildSystemPrompt,
  type EnrichedTestCase,
  type GenerateTestsResponse,
  type ProblemRow,
  type RawTestCase,
  type VerificationStatus,
} from './test-generator.types';

@Injectable()
export class TestGeneratorService {
  private readonly logger = new Logger(TestGeneratorService.name);

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async generateTests(problemId: string): Promise<GenerateTestsResponse> {
    const startMs = Date.now();
    const problem = await this.fetchProblem(problemId);
    const seed = problemSeed(problemId);

    this.logger.debug(`Generating test cases for "${problem.title}" (seed ${seed})`);

    // 6 category calls + 1 brute-force call, all in parallel
    const results = await Promise.all([
      this.callCategory(problem, TestCaseCategory.SAMPLE, seed).catch((): RawTestCase[] => []),
      this.callCategory(problem, TestCaseCategory.BOUNDARY, seed).catch((): RawTestCase[] => []),
      this.callCategory(problem, TestCaseCategory.EDGE, seed).catch((): RawTestCase[] => []),
      this.callCategory(problem, TestCaseCategory.RANDOM, seed).catch((): RawTestCase[] => []),
      this.callCategory(problem, TestCaseCategory.STRESS, seed).catch((): RawTestCase[] => []),
      this.callCategory(problem, TestCaseCategory.ADVERSARIAL, seed).catch((): RawTestCase[] => []),
      this.getBruteForce(problem).catch((): null => null),
    ] as const);

    const [sample, boundary, edge, random, stress, adversarial, bruteForce] = results as [
      RawTestCase[],
      RawTestCase[],
      RawTestCase[],
      RawTestCase[],
      RawTestCase[],
      RawTestCase[],
      string | null,
    ];

    // Attach category + isHidden, then deduplicate
    const enriched: EnrichedTestCase[] = [
      ...enrich(sample, TestCaseCategory.SAMPLE),
      ...enrich(boundary, TestCaseCategory.BOUNDARY),
      ...enrich(edge, TestCaseCategory.EDGE),
      ...enrich(random, TestCaseCategory.RANDOM),
      ...enrich(stress, TestCaseCategory.STRESS),
      ...enrich(adversarial, TestCaseCategory.ADVERSARIAL),
    ];

    const deduped = TestGeneratorService.deduplicate(enriched);

    const verified = await this.verifyTestCases(deduped, bruteForce);

    await this.storeTestCases(problemId, verified);

    const unverifiedCount = verified.filter(
      (tc) => tc.verification === 'mismatch' || tc.verification === 'error',
    ).length;

    this.logger.log(
      `Generated ${verified.length} test cases for ${problemId} ` +
        `(${unverifiedCount} unverified, ${Date.now() - startMs}ms)`,
    );

    return {
      testCases: verified.map(({ input, expectedOutput, category, isHidden }) => ({
        input,
        expectedOutput,
        category,
        isHidden,
      })),
      unverifiedCount,
      generationTimeMs: Date.now() - startMs,
    };
  }

  // ─── Deduplication (static so specs can call it directly) ───────────────────

  static deduplicate(cases: EnrichedTestCase[]): EnrichedTestCase[] {
    const seen = new Set<string>();
    return cases.filter((tc) => {
      const key = normInput(tc.input);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async fetchProblem(problemId: string): Promise<ProblemRow> {
    const [row] = await this.db
      .select({
        id: problems.id,
        title: problems.title,
        statement: problems.statement,
        constraints: problems.constraints,
        tags: problems.tags,
        timeLimitMs: problems.timeLimitMs,
        memoryLimitMb: problems.memoryLimitMb,
      })
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Problem ${problemId} not found`);
    }

    return {
      ...row,
      constraints: row.constraints as Record<string, { min: number; max: number }> | null,
    };
  }

  private async callCategory(
    problem: ProblemRow,
    category: TestCaseCategory,
    seed: number,
  ): Promise<RawTestCase[]> {
    let rawContent: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'TestCaseList',
            strict: true,
            schema: TESTCASE_OPENAI_JSON_SCHEMA,
          },
        },
        messages: [
          { role: 'system', content: buildSystemPrompt(problem) },
          { role: 'user', content: buildCategoryPrompt(category, problem, seed) },
        ],
      });
      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      this.logger.warn(`OpenAI call for ${category} failed: ${errorMessage(err)}`);
      return [];
    }

    if (!rawContent.trim()) {
      this.logger.warn(`Empty OpenAI response for category ${category}`);
      return [];
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(rawContent);
    } catch {
      this.logger.warn(`Non-JSON response for category ${category}`);
      return [];
    }

    const parsed = RawTestCaseResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      this.logger.warn(
        `Schema validation failed for ${category}: ${parsed.error.errors.map((e) => e.message).join('; ')}`,
      );
      return [];
    }

    return parsed.data.testCases;
  }

  private async getBruteForce(problem: ProblemRow): Promise<string | null> {
    let rawContent: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'BruteForce',
            strict: true,
            schema: BRUTEFORCE_OPENAI_JSON_SCHEMA,
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert competitive programmer. Generate a correct Python 3 solution that reads from stdin and writes to stdout. Return JSON with pythonCode and explanation fields.',
          },
          { role: 'user', content: buildBruteForcePrompt(problem) },
        ],
      });
      rawContent = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      this.logger.warn(`Brute-force generation failed: ${errorMessage(err)}`);
      return null;
    }

    try {
      const parsed = RawBruteForceResponseSchema.safeParse(JSON.parse(rawContent));
      return parsed.success ? parsed.data.pythonCode : null;
    } catch {
      return null;
    }
  }

  private async verifyTestCases(
    cases: EnrichedTestCase[],
    bruteForce: string | null,
  ): Promise<EnrichedTestCase[]> {
    if (!bruteForce) {
      this.logger.warn('No brute-force solution available; skipping all verification');
      return cases.map((tc) => ({ ...tc, verification: 'skipped' as const }));
    }

    return Promise.all(
      cases.map(async (tc): Promise<EnrichedTestCase> => {
        // Stress tests are large by design — never execute them
        if (tc.category === TestCaseCategory.STRESS) {
          return { ...tc, verification: 'skipped' };
        }

        const n = estimateN(tc.input);
        if (n > 1_000) {
          return { ...tc, verification: 'skipped' };
        }

        const actual = await this.runWithPython(bruteForce, tc.input);
        if (actual === null) {
          return { ...tc, verification: 'error' };
        }

        const status: VerificationStatus =
          actual === tc.expectedOutput.trim() ? 'verified' : 'mismatch';

        if (status === 'mismatch') {
          this.logger.warn(
            `Verification mismatch in ${tc.category}: expected "${tc.expectedOutput.trim()}", got "${actual}"`,
          );
        }

        return { ...tc, verification: status };
      }),
    );
  }

  private async runWithPython(code: string, input: string): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', code], {
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
      // Suppress EPIPE if the process exits before we finish writing
      proc.stdin?.on('error', () => {});
      proc.on('error', () => resolve(null));
      proc.on('close', (exitCode) => {
        resolve(exitCode === 0 ? Buffer.concat(chunks).toString().trim() : null);
      });

      proc.stdin?.write(input, 'utf8');
      proc.stdin?.end();
    });
  }

  private async storeTestCases(problemId: string, cases: EnrichedTestCase[]): Promise<void> {
    if (cases.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.transaction(async (tx: any) => {
      // Delete existing AI-generated cases; preserve manually created ones
      await tx
        .delete(testCases)
        .where(and(eq(testCases.problemId, problemId), eq(testCases.createdBy, 'ai')));

      await tx.insert(testCases).values(
        cases.map((tc) => ({
          problemId,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden,
          category: tc.category,
          createdBy: 'ai' as const,
        })),
      );
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enrich(raw: RawTestCase[], category: TestCaseCategory): EnrichedTestCase[] {
  return raw.map((tc) => ({
    ...tc,
    category,
    isHidden: CATEGORY_HIDDEN[category],
    verification: 'skipped' as const,
  }));
}

function normInput(s: string): string {
  return s.trim().replace(/\r\n/g, '\n');
}

/** Parse the first integer on the first line as a proxy for n (array size). */
function estimateN(input: string): number {
  const token = (input.trim().split('\n')[0] ?? '').trim().split(/\s+/)[0] ?? '';
  const n = parseInt(token, 10);
  return isNaN(n) ? Infinity : n;
}

/** Derive a stable 32-bit seed from a UUID so the same problem always gets the same random cases. */
function problemSeed(problemId: string): number {
  return parseInt(createHash('sha256').update(problemId).digest('hex').slice(0, 8), 16);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
