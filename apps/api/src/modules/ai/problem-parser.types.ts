import { z } from 'zod';

// ─── Request body ──────────────────────────────────────────────────────────────

export const ParseProblemBodySchema = z.object({
  rawText: z
    .string()
    .min(10, 'Problem text must be at least 10 characters')
    .max(10_000, 'Problem text must not exceed 10,000 characters'),
});

export type ParseProblemBodyDto = z.infer<typeof ParseProblemBodySchema>;

// ─── OpenAI JSON Schema (strict-mode compatible) ───────────────────────────────
//
// Constraints are modelled as an *array* of {variable, min, max, description}
// objects rather than a free-form record. OpenAI strict mode forbids
// additionalProperties with a sub-schema, so this avoids that limitation.
// Post-processing converts the array to the record shape consumers expect.

export const OPENAI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    tags: { type: 'array', items: { type: 'string' } },
    timeLimitMs: { type: 'number' },
    memoryLimitMb: { type: 'number' },
    constraints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          variable: { type: 'string' },
          min: { type: 'number' },
          max: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['variable', 'min', 'max', 'description'],
        additionalProperties: false,
      },
    },
    inputFormat: { type: 'string' },
    outputFormat: { type: 'string' },
    samples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['input', 'output', 'explanation'],
        additionalProperties: false,
      },
    },
    expectedTimeComplexity: { type: 'string' },
    expectedSpaceComplexity: { type: 'string' },
    isSpecialJudge: { type: 'boolean' },
    confidenceScore: { type: 'number' },
    ambiguities: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'difficulty',
    'tags',
    'timeLimitMs',
    'memoryLimitMb',
    'constraints',
    'inputFormat',
    'outputFormat',
    'samples',
    'expectedTimeComplexity',
    'expectedSpaceComplexity',
    'isSpecialJudge',
    'confidenceScore',
    'ambiguities',
  ],
  additionalProperties: false,
} as const;

// ─── Zod: raw OpenAI response (array constraints) ──────────────────────────────

const RawConstraintSchema = z.object({
  variable: z.string().min(1),
  min: z.number(),
  max: z.number(),
  description: z.string(),
});

export const RawParsedProblemSchema = z.object({
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
  timeLimitMs: z.number().min(100).max(60_000).default(1000),
  memoryLimitMb: z.number().min(16).max(2048).default(256),
  constraints: z.array(RawConstraintSchema),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  samples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: z.string(),
      }),
    )
    .min(1, 'At least one sample is required'),
  expectedTimeComplexity: z.string(),
  expectedSpaceComplexity: z.string(),
  isSpecialJudge: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  ambiguities: z.array(z.string()),
});

// ─── Zod: final parsed problem (record constraints) ───────────────────────────

export const ParsedProblemSchema = z.object({
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
  timeLimitMs: z.number().int().min(100).max(60_000),
  memoryLimitMb: z.number().int().min(16).max(2048),
  /** Variable name → { min, max } */
  constraints: z.record(z.string(), z.object({ min: z.number(), max: z.number() })),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  samples: z.array(
    z.object({ input: z.string(), output: z.string(), explanation: z.string() }),
  ),
  expectedTimeComplexity: z.string(),
  expectedSpaceComplexity: z.string(),
  isSpecialJudge: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  ambiguities: z.array(z.string()),
});

export type ParsedProblem = z.infer<typeof ParsedProblemSchema>;

// ─── API response ──────────────────────────────────────────────────────────────

export interface ParseProblemResponse {
  parsed: ParsedProblem;
  needsReview: boolean;
  processingTimeMs: number;
  cached?: boolean;
}

// ─── OpenAI prompts ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert competitive programming problem analyst. You extract structured metadata from raw coding problem text.

Rules:
1. Extract ALL constraint ranges as explicit min/max numbers. Never leave constraints as text strings.
2. If a constraint is implicit (e.g., "array of integers" implies elements can be negative), infer a reasonable range and set confidenceScore lower.
3. Set isSpecialJudge=true for problems where output is non-unique (permutations, "any valid answer", multiple correct orderings).
4. Set confidenceScore based on how unambiguous the problem is: 1.0 = crystal clear, 0.5 = missing key details, 0.3 = very underspecified.
5. List every ambiguity you detect in the ambiguities array.
6. Return ONLY valid JSON matching the schema. No preamble, no explanation.`;

export const RETRY_SUFFIX = `

CRITICAL: Your previous response failed schema validation. You MUST return ONLY a raw JSON object.
- No markdown fences (\`\`\`), no "json" prefix, no explanatory text before or after.
- timeLimitMs and memoryLimitMb must be plain integers (e.g., 1000, not "1s" or "1000ms").
- confidenceScore must be a decimal between 0.0 and 1.0.
- Every constraint entry must have numeric min and max values, not strings.
- samples array must contain at least one entry.`;

export function buildMessages(
  rawText: string,
  isRetry: boolean,
): Array<{ role: 'system' | 'user'; content: string }> {
  const userContent = `Parse this competitive programming problem and return structured JSON:

---
${rawText}
---${isRetry ? RETRY_SUFFIX : ''}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}
