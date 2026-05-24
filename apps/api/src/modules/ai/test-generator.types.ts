import { z } from 'zod';

import { TestCaseCategory } from '@codeforge/shared';

// ─── Request body ──────────────────────────────────────────────────────────────

export const GenerateTestsBodySchema = z.object({
  problemId: z.string().uuid('problemId must be a valid UUID'),
});

export type GenerateTestsBodyDto = z.infer<typeof GenerateTestsBodySchema>;

// ─── Gemini JSON schemas ──────────────────────────────────────────────────────

export const TESTCASE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          expectedOutput: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['input', 'expectedOutput', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['testCases'],
  additionalProperties: false,
} as const;

export const BRUTEFORCE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    pythonCode: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['pythonCode', 'explanation'],
  additionalProperties: false,
} as const;

// ─── Zod: raw model response validators ──────────────────────────────────────

export const RawTestCaseResponseSchema = z.object({
  testCases: z
    .array(
      z.object({
        input: z.string().min(1),
        expectedOutput: z.string(),
        explanation: z.string(),
      }),
    )
    .min(1, 'At least one test case required'),
});

export const RawBruteForceResponseSchema = z.object({
  pythonCode: z.string().min(10),
  explanation: z.string(),
});

// ─── Problem context (fetched from DB) ────────────────────────────────────────

export interface ProblemRow {
  id: string;
  title: string;
  statement: string;
  constraints: Record<string, { min: number; max: number }> | null;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
}

// ─── Internal types ────────────────────────────────────────────────────────────

export type VerificationStatus = 'verified' | 'mismatch' | 'skipped' | 'error';

export interface RawTestCase {
  input: string;
  expectedOutput: string;
  explanation: string;
}

export interface EnrichedTestCase extends RawTestCase {
  category: TestCaseCategory;
  isHidden: boolean;
  verification: VerificationStatus;
}

// ─── API response ──────────────────────────────────────────────────────────────

export interface GenerateTestsResponse {
  testCases: Array<{
    input: string;
    expectedOutput: string;
    category: string;
    isHidden: boolean;
  }>;
  unverifiedCount: number;
  generationTimeMs: number;
}

// ─── Category metadata ─────────────────────────────────────────────────────────

/** isHidden=false only for SAMPLE — everything else is hidden from users. */
export const CATEGORY_HIDDEN: Record<TestCaseCategory, boolean> = {
  [TestCaseCategory.SAMPLE]: false,
  [TestCaseCategory.BOUNDARY]: true,
  [TestCaseCategory.EDGE]: true,
  [TestCaseCategory.RANDOM]: true,
  [TestCaseCategory.STRESS]: true,
  [TestCaseCategory.ADVERSARIAL]: true,
};

// ─── Prompt builders ───────────────────────────────────────────────────────────

export function buildSystemPrompt(problem: ProblemRow): string {
  return `You are an expert competitive programmer generating test cases.

Problem: ${problem.title}

Problem Statement:
${problem.statement}

Constraints:
${JSON.stringify(problem.constraints ?? {}, null, 2)}

Tags: ${problem.tags.length ? problem.tags.join(', ') : 'none'}
Time limit: ${problem.timeLimitMs}ms | Memory limit: ${problem.memoryLimitMb}MB

For each test case, mentally execute the correct algorithm to compute the expected output.
Double-check every answer. Return ONLY valid JSON matching the schema — no preamble or trailing text.`;
}

export function buildCategoryPrompt(
  category: TestCaseCategory,
  problem: ProblemRow,
  seed: number,
): string {
  switch (category) {
    case TestCaseCategory.SAMPLE:
      return `Generate between 2 and 4 sample test cases that match the given examples in difficulty and style. Each must have the correct expected output verified step-by-step.`;

    case TestCaseCategory.BOUNDARY:
      return `Generate between 4 and 6 boundary test cases: n=1, n=max, all elements at min value, all elements at max value, single-element arrays, empty input where valid. Show the expected output for each.`;

    case TestCaseCategory.EDGE:
      return `Generate between 4 and 6 tricky edge cases that commonly cause wrong answers: all same elements, already sorted input, reverse sorted, alternating max/min, cases where the answer is 0 or the empty set.`;

    case TestCaseCategory.RANDOM:
      return `Generate between 8 and 10 random test cases at approximately 50% of max constraints. Use seed ${seed} for pseudorandom generation mentally. Return input and correct expected output.`;

    case TestCaseCategory.STRESS:
      return `Generate between 4 and 6 maximum-scale stress tests with n at or near the maximum constraint (use seed ${seed}). These are for TLE detection — expected output must still be correct.`;

    case TestCaseCategory.ADVERSARIAL:
      return `Generate between 3 and 4 adversarial test cases specifically designed to break common wrong approaches for problems tagged [${problem.tags.join(', ')}]. Common pitfalls include: off-by-one errors, integer overflow, greedy assumptions that fail, not handling duplicates, forgetting the empty-set answer. Explain which wrong approach each case breaks.`;

    default:
      throw new Error(`Unhandled category: ${category as string}`);
  }
}

export function buildBruteForcePrompt(problem: ProblemRow): string {
  return `Generate a correct, simple Python 3 solution for the following problem.

Requirements:
- Reads from stdin exactly as described in the problem statement
- Writes the answer to stdout
- Correct for all valid inputs (brute-force is acceptable — no optimization needed)
- Complete, runnable Python 3 program (no external libraries)

Problem: ${problem.title}

${problem.statement}

Return the complete Python 3 code as the pythonCode field.`;
}
