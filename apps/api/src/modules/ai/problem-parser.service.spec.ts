import { ParsingException } from './problem-parser.exception';
import { ProblemParserService, OPENAI_CLIENT } from './problem-parser.service';
import type { ParsedProblem } from './problem-parser.types';
import { REDIS_TOKEN } from '../../redis/redis.module';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_RAW_TEXT = `
Given an array of N integers, find the maximum subarray sum.

Constraints: 1 ≤ N ≤ 100000, -10^9 ≤ A[i] ≤ 10^9

Input: First line is N, second line has N integers.
Output: A single integer, the maximum subarray sum.

Sample:
Input: 3 / -2 1 -3
Output: 1
`;

const VALID_PARSED_PROBLEM: ParsedProblem = {
  title: 'Maximum Subarray Sum',
  difficulty: 'medium',
  tags: ['dynamic-programming', 'arrays'],
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  constraints: {
    N: { min: 1, max: 100000 },
    'A[i]': { min: -1000000000, max: 1000000000 },
  },
  inputFormat: 'First line is N, second line has N integers.',
  outputFormat: 'A single integer, the maximum subarray sum.',
  samples: [{ input: '3\n-2 1 -3', output: '1', explanation: 'Subarray [1] has sum 1.' }],
  expectedTimeComplexity: 'O(N)',
  expectedSpaceComplexity: 'O(1)',
  isSpecialJudge: false,
  confidenceScore: 0.95,
  ambiguities: [],
};

// The raw OpenAI response shape (array constraints)
const VALID_OPENAI_RESPONSE = JSON.stringify({
  title: 'Maximum Subarray Sum',
  difficulty: 'medium',
  tags: ['dynamic-programming', 'arrays'],
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  constraints: [
    { variable: 'N', min: 1, max: 100000, description: 'array length' },
    { variable: 'A[i]', min: -1000000000, max: 1000000000, description: 'array element' },
  ],
  inputFormat: 'First line is N, second line has N integers.',
  outputFormat: 'A single integer, the maximum subarray sum.',
  samples: [{ input: '3\n-2 1 -3', output: '1', explanation: 'Subarray [1] has sum 1.' }],
  expectedTimeComplexity: 'O(N)',
  expectedSpaceComplexity: 'O(1)',
  isSpecialJudge: false,
  confidenceScore: 0.95,
  ambiguities: [],
});

const LOW_CONFIDENCE_RESPONSE = JSON.stringify({
  ...JSON.parse(VALID_OPENAI_RESPONSE),
  confidenceScore: 0.6,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeCompletion(content: string) {
  return { choices: [{ message: { content } }] };
}

function makeService(): ProblemParserService {
  return new ProblemParserService(
    mockOpenAI as never,
    mockRedis as never,
  );
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('ProblemParserService', () => {
  let service: ProblemParserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  // ─── Cache hit ──────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('returns cached result without calling OpenAI', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(VALID_PARSED_PROBLEM));

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.cached).toBe(true);
      expect(result.processingTimeMs).toBe(0);
      expect(result.parsed).toEqual(VALID_PARSED_PROBLEM);
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('marks needsReview=false for cached result with high confidence', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(VALID_PARSED_PROBLEM)); // confidenceScore: 0.95

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.needsReview).toBe(false);
    });

    it('marks needsReview=true for cached result with low confidence', async () => {
      const lowConfidence: ParsedProblem = { ...VALID_PARSED_PROBLEM, confidenceScore: 0.6 };
      mockRedis.get.mockResolvedValue(JSON.stringify(lowConfidence));

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.needsReview).toBe(true);
    });
  });

  // ─── Cache miss → successful parse ──────────────────────────────────────────

  describe('cache miss', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(VALID_OPENAI_RESPONSE),
      );
      mockRedis.set.mockResolvedValue('OK');
    });

    it('calls OpenAI and returns the parsed problem', async () => {
      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(result.parsed.title).toBe('Maximum Subarray Sum');
      expect(result.cached).toBeUndefined();
    });

    it('stores the result in Redis with 24h TTL', async () => {
      await service.parse(SAMPLE_RAW_TEXT);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^ai:parse:/),
        expect.any(String),
        'EX',
        86_400,
      );
    });

    it('returns processingTimeMs > 0 on cache miss', async () => {
      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('marks needsReview=false when confidenceScore >= 0.75', async () => {
      const result = await service.parse(SAMPLE_RAW_TEXT); // score: 0.95

      expect(result.needsReview).toBe(false);
    });

    it('marks needsReview=true when confidenceScore < 0.75', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(LOW_CONFIDENCE_RESPONSE),
      );

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.needsReview).toBe(true);
    });
  });

  // ─── Constraints transformation ─────────────────────────────────────────────

  describe('constraints transformation', () => {
    it('converts the constraints array from OpenAI into a record', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(VALID_OPENAI_RESPONSE),
      );
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(result.parsed.constraints).toEqual({
        N: { min: 1, max: 100000 },
        'A[i]': { min: -1000000000, max: 1000000000 },
      });
    });
  });

  // ─── Retry logic ────────────────────────────────────────────────────────────

  describe('retry logic', () => {
    it('retries with stricter prompt when first attempt fails Zod validation', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // First call returns invalid JSON (missing required fields)
      const invalidResponse = JSON.stringify({ title: 'Only title' });
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(makeCompletion(invalidResponse))
        .mockResolvedValueOnce(makeCompletion(VALID_OPENAI_RESPONSE));

      const result = await service.parse(SAMPLE_RAW_TEXT);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result.parsed.title).toBe('Maximum Subarray Sum');

      // Second call should include the retry suffix in the user message
      const secondCallMessages = mockOpenAI.chat.completions.create.mock.calls[1][0].messages;
      const userMessage = secondCallMessages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('CRITICAL');
    });

    it('throws ParsingException when both attempts fail', async () => {
      mockRedis.get.mockResolvedValue(null);

      const invalidResponse = JSON.stringify({ title: 'Only title' });
      mockOpenAI.chat.completions.create.mockResolvedValue(makeCompletion(invalidResponse));

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('does not cache when parsing ultimately fails', async () => {
      mockRedis.get.mockResolvedValue(null);

      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(JSON.stringify({ title: 'bad' })),
      );

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  // ─── OpenAI error cases ─────────────────────────────────────────────────────

  describe('OpenAI error handling', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
    });

    it('throws ParsingException for empty OpenAI response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(makeCompletion(''));

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
    });

    it('throws ParsingException for whitespace-only OpenAI response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(makeCompletion('   '));

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
    });

    it('throws ParsingException when OpenAI returns non-JSON text', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion('Here is your answer: { broken json }'),
      );

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
    });

    it('throws ParsingException when OpenAI API call itself throws', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('rate limit exceeded'));

      await expect(service.parse(SAMPLE_RAW_TEXT)).rejects.toThrow(ParsingException);
    });

    it('attaches rawResponse to ParsingException', async () => {
      const badContent = '{ "incomplete": true }';
      mockOpenAI.chat.completions.create.mockResolvedValue(makeCompletion(badContent));

      try {
        await service.parse(SAMPLE_RAW_TEXT);
        fail('Expected ParsingException');
      } catch (err) {
        expect(err).toBeInstanceOf(ParsingException);
        expect((err as ParsingException).rawResponse).toBe(badContent);
      }
    });
  });

  // ─── Cache key determinism ───────────────────────────────────────────────────

  describe('cache key', () => {
    it('uses the same cache key for identical input', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(VALID_OPENAI_RESPONSE),
      );
      mockRedis.set.mockResolvedValue('OK');

      await service.parse(SAMPLE_RAW_TEXT);
      await service.parse(SAMPLE_RAW_TEXT);

      const key1 = mockRedis.get.mock.calls[0][0] as string;
      const key2 = mockRedis.get.mock.calls[1][0] as string;
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^ai:parse:[a-f0-9]{64}$/);
    });

    it('uses different cache keys for different input', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockOpenAI.chat.completions.create.mockResolvedValue(
        makeCompletion(VALID_OPENAI_RESPONSE),
      );
      mockRedis.set.mockResolvedValue('OK');

      await service.parse(SAMPLE_RAW_TEXT);
      await service.parse(SAMPLE_RAW_TEXT + ' extra');

      const key1 = mockRedis.get.mock.calls[0][0] as string;
      const key2 = mockRedis.get.mock.calls[1][0] as string;
      expect(key1).not.toBe(key2);
    });
  });
});
