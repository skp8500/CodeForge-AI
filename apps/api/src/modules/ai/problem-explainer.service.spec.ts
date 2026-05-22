import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { OPENAI_CLIENT } from './problem-parser.service';
import { ProblemExplainerService } from './problem-explainer.service';
import { EXPLAIN_RATE_LIMIT, FOLLOWUP_RATE_LIMIT } from './problem-explainer.types';

// ─── Fixed test data ──────────────────────────────────────────────────────────

const PROBLEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const PROBLEM_ROW = {
  id: PROBLEM_ID,
  statement: 'Given an array find the maximum subarray sum.',
  constraints: { n: { min: 1, max: 100000 } },
  tags: ['dynamic-programming', 'arrays'],
  timeLimitMs: 1000,
};

const SAMPLE_ROWS = [
  { input: '[1,-2,3]', expectedOutput: '3' },
  { input: '[-1,-2,-3]', expectedOutput: '-1' },
];

const RELATED_ROWS = [
  { id: 'r1', title: 'Min Subarray', slug: 'min-subarray', difficulty: 'easy' },
  { id: 'r2', title: 'Circular Subarray', slug: 'circular-subarray', difficulty: 'hard' },
];

const HINTS = ['Use a linear scan.', 'Think about Kadane\'s algorithm.', 'Maintain a running max sum.'];

// ─── Mock factories ────────────────────────────────────────────────────────────

function buildDbMock() {
  const mockLimit = jest.fn();
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  return { select: mockSelect, from: mockFrom, where: mockWhere, limit: mockLimit };
}

function buildRedisMock() {
  return {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
  };
}

function buildOpenAIMock(content: string) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProblemExplainerService', () => {
  let service: ProblemExplainerService;
  let db: ReturnType<typeof buildDbMock>;
  let redis: ReturnType<typeof buildRedisMock>;
  let openai: ReturnType<typeof buildOpenAIMock>;

  async function buildService(aiContent = 'A clear explanation.') {
    db = buildDbMock();
    redis = buildRedisMock();
    openai = buildOpenAIMock(aiContent);

    const module = await Test.createTestingModule({
      providers: [
        ProblemExplainerService,
        { provide: DB_TOKEN, useValue: db },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: OPENAI_CLIENT, useValue: openai },
      ],
    }).compile();

    service = module.get(ProblemExplainerService);
  }

  // ─── explainProblem ──────────────────────────────────────────────────────────

  describe('explainProblem', () => {
    it('ELI5: calls OpenAI with 400 max tokens and returns explanation + related problems', async () => {
      await buildService('Imagine you have a bunch of numbers...');

      db.limit
        .mockResolvedValueOnce([PROBLEM_ROW]) // fetchProblem
        .mockResolvedValueOnce(RELATED_ROWS);  // fetchRelatedProblems

      const result = await service.explainProblem(PROBLEM_ID, 'eli5', USER_ID);

      expect(result.explanation).toBe('Imagine you have a bunch of numbers...');
      expect(result.relatedProblems).toHaveLength(2);
      expect(openai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 400 }),
      );
    });

    it('standard: fetches visible samples and passes them to the prompt', async () => {
      await buildService('Standard explanation with samples.');

      db.limit
        .mockResolvedValueOnce([PROBLEM_ROW]) // fetchProblem
        .mockResolvedValueOnce(SAMPLE_ROWS)   // fetchVisibleSamples (limit 5)
        .mockResolvedValueOnce(RELATED_ROWS); // fetchRelatedProblems

      const result = await service.explainProblem(PROBLEM_ID, 'standard', USER_ID);

      expect(result.explanation).toBeTruthy();
      const promptArg = openai.chat.completions.create.mock.calls[0][0];
      const userMsg = (promptArg.messages as { role: string; content: string }[]).find(
        (m) => m.role === 'user',
      )!.content;
      expect(userMsg).toContain('[1,-2,3]');
      expect(promptArg.max_tokens).toBe(600);
    });

    it('expert: passes constraints in prompt with 800 max tokens', async () => {
      await buildService('Expert analysis: this is a DP problem.');

      db.limit
        .mockResolvedValueOnce([PROBLEM_ROW]) // fetchProblem
        .mockResolvedValueOnce(RELATED_ROWS); // fetchRelatedProblems

      const result = await service.explainProblem(PROBLEM_ID, 'expert', USER_ID);

      expect(result.explanation).toContain('DP problem');
      const promptArg = openai.chat.completions.create.mock.calls[0][0];
      expect(promptArg.max_tokens).toBe(800);
    });

    it('throws NotFoundException when problem does not exist', async () => {
      await buildService();
      db.limit.mockResolvedValueOnce([]); // problem not found

      await expect(service.explainProblem(PROBLEM_ID, 'eli5', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(openai.chat.completions.create).not.toHaveBeenCalled();
    });

    it(`throws 429 when user exceeds ${EXPLAIN_RATE_LIMIT} explanations/hour`, async () => {
      await buildService();
      redis.incr.mockResolvedValue(EXPLAIN_RATE_LIMIT + 1);

      await expect(service.explainProblem(PROBLEM_ID, 'eli5', USER_ID)).rejects.toThrow(
        HttpException,
      );
      expect(db.limit).not.toHaveBeenCalled();
    });

    it('returns empty relatedProblems when problem has no tags', async () => {
      await buildService('Simple explanation.');
      db.limit.mockResolvedValueOnce([{ ...PROBLEM_ROW, tags: [] }]);

      const result = await service.explainProblem(PROBLEM_ID, 'eli5', USER_ID);

      expect(result.relatedProblems).toEqual([]);
      // Only 1 DB call (fetchProblem) — fetchRelatedProblems skipped
      expect(db.limit).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getHint ─────────────────────────────────────────────────────────────────

  describe('getHint', () => {
    it('generates and caches 3 hints on first request, returns hint 1', async () => {
      await buildService(JSON.stringify({ hints: HINTS }));
      // No cached hints, no progress
      redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      db.limit.mockResolvedValueOnce([PROBLEM_ROW]);

      const result = await service.getHint(PROBLEM_ID, 1, USER_ID);

      expect(result.hint).toBe(HINTS[0]);
      expect(result.hintsRemaining).toBe(2);
      expect(redis.setex).toHaveBeenCalledWith(
        `hints:${PROBLEM_ID}:${USER_ID}`,
        expect.any(Number),
        JSON.stringify(HINTS),
      );
    });

    it('serves hint 2 from cache when progress allows', async () => {
      await buildService();
      // Progress = 1 (already viewed hint 1), hints cached
      redis.get
        .mockResolvedValueOnce('1')                // progress key
        .mockResolvedValueOnce(JSON.stringify(HINTS)); // hints key

      const result = await service.getHint(PROBLEM_ID, 2, USER_ID);

      expect(result.hint).toBe(HINTS[1]);
      expect(result.hintsRemaining).toBe(1);
      expect(db.limit).not.toHaveBeenCalled(); // no DB call needed
    });

    it('throws BadRequestException when user tries to skip ahead', async () => {
      await buildService();
      redis.get.mockResolvedValueOnce('1'); // progress = 1

      await expect(service.getHint(PROBLEM_ID, 3, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('hintsRemaining is 0 after viewing all 3 hints', async () => {
      await buildService();
      redis.get
        .mockResolvedValueOnce('2')                // progress = 2
        .mockResolvedValueOnce(JSON.stringify(HINTS));

      const result = await service.getHint(PROBLEM_ID, 3, USER_ID);

      expect(result.hintsRemaining).toBe(0);
    });

    it('allows re-fetching a hint already viewed (idempotent)', async () => {
      await buildService();
      // Progress = 2 (hints 1 & 2 already viewed); request hint 1 again
      redis.get
        .mockResolvedValueOnce('2')
        .mockResolvedValueOnce(JSON.stringify(HINTS));

      const result = await service.getHint(PROBLEM_ID, 1, USER_ID);

      expect(result.hint).toBe(HINTS[0]);
      expect(result.hintsRemaining).toBe(1); // progress stays at 2
    });
  });

  // ─── explainFollowup ──────────────────────────────────────────────────────────

  describe('explainFollowup', () => {
    it('calls OpenAI with last 6 messages from history and returns answer', async () => {
      await buildService('Try using Kadane\'s algorithm.');

      db.limit.mockResolvedValueOnce([PROBLEM_ROW]);
      const longHistory = Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i}`,
      }));

      const result = await service.explainFollowup(
        PROBLEM_ID,
        'What is the optimal approach?',
        longHistory,
        USER_ID,
      );

      expect(result.answer).toBe("Try using Kadane's algorithm.");
      const promptArg = openai.chat.completions.create.mock.calls[0][0];
      const messages = promptArg.messages as { role: string }[];
      // system + 6 history + 1 question = 8 messages
      expect(messages).toHaveLength(8);
    });

    it(`throws 429 after ${FOLLOWUP_RATE_LIMIT} follow-up questions`, async () => {
      await buildService();
      redis.incr.mockResolvedValue(FOLLOWUP_RATE_LIMIT + 1);

      await expect(
        service.explainFollowup(PROBLEM_ID, 'Another question?', [], USER_ID),
      ).rejects.toThrow(HttpException);
      expect(db.limit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when problem does not exist', async () => {
      await buildService();
      // rate limit passes, problem not found
      redis.incr.mockResolvedValue(1);
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.explainFollowup(PROBLEM_ID, 'What is this?', [], USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
