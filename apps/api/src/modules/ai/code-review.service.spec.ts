import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Language, Verdict } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { OPENAI_CLIENT } from './problem-parser.service';
import { CodeReviewService } from './code-review.service';
import { AI_REVIEW_QUEUE_TOKEN } from './code-review.types';
import type { AiReviewResult } from './code-review.types';

// ─── Fixed IDs ────────────────────────────────────────────────────────────────

const SUBMISSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROBLEM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REVIEW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const PROBLEM_ROW = {
  statement: 'Given an array, return the maximum sum subarray.',
  constraints: { n: { min: 1, max: 100000 } },
  timeLimitMs: 1000,
};

const TEST_CASE_ROW = { input: '[1, -2, 3]', expectedOutput: '3' };

const REVIEW_ROW = {
  id: REVIEW_ID,
  submissionId: SUBMISSION_ID,
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  correctnessNotes: 'Correct solution using Kadane\'s algorithm.',
  optimizationHint: null,
  dryRun: null,
  qualityScore: 0.9,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const DEFAULT_AI_RESULT: AiReviewResult = {
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  correctnessNotes: 'Correct solution.',
  optimizationHint: null,
  dryRun: null,
  qualityScore: 0.85,
};

// ─── Mock factories ────────────────────────────────────────────────────────────

function buildDbMock() {
  const mockLimit = jest.fn();
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });

  const mockReturning = jest.fn();
  const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });

  return {
    select: mockSelect,
    from: mockFrom,
    where: mockWhere,
    limit: mockLimit,
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    update: mockUpdate,
    set: mockSet,
    updateWhere: mockUpdateWhere,
  };
}

function buildOpenAIMock(result: Partial<AiReviewResult> = {}) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ ...DEFAULT_AI_RESULT, ...result }) } }],
        }),
      },
    },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CodeReviewService', () => {
  let service: CodeReviewService;
  let db: ReturnType<typeof buildDbMock>;
  let redis: { publish: jest.Mock };
  let openai: ReturnType<typeof buildOpenAIMock>;
  let reviewQueue: { add: jest.Mock };

  beforeEach(async () => {
    db = buildDbMock();
    redis = { publish: jest.fn().mockResolvedValue(1) };
    openai = buildOpenAIMock();
    reviewQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module = await Test.createTestingModule({
      providers: [
        CodeReviewService,
        { provide: DB_TOKEN, useValue: db },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: OPENAI_CLIENT, useValue: openai },
        { provide: AI_REVIEW_QUEUE_TOKEN, useValue: reviewQueue },
      ],
    }).compile();

    service = module.get(CodeReviewService);
  });

  // ─── generate() ─────────────────────────────────────────────────────────────

  describe('generate', () => {
    it('processes an AC verdict: calls OpenAI, saves review, updates submission, publishes to Redis', async () => {
      const sub = {
        id: SUBMISSION_ID,
        code: 'int main() { return 0; }',
        language: Language.CPP,
        verdict: Verdict.AC,
        problemId: PROBLEM_ID,
        runtimeMs: 42,
        memoryKb: 1024,
      };

      db.limit
        .mockResolvedValueOnce([])      // no existing review
        .mockResolvedValueOnce([sub])   // fetch submission
        .mockResolvedValueOnce([PROBLEM_ROW]); // fetch problem
      db.returning.mockResolvedValueOnce([{ id: REVIEW_ID }]);

      await service.generate(SUBMISSION_ID);

      expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(openai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.3,
          max_tokens: 1500,
        }),
      );

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.update).toHaveBeenCalledTimes(1);

      expect(redis.publish).toHaveBeenCalledWith(
        `submissions:${SUBMISSION_ID}:review`,
        expect.stringContaining(REVIEW_ID),
      );
    });

    it('includes visible test case in WA prompt and publishes review', async () => {
      const sub = {
        id: SUBMISSION_ID,
        code: 'print(0)',
        language: Language.PYTHON,
        verdict: Verdict.WA,
        problemId: PROBLEM_ID,
        runtimeMs: null,
        memoryKb: null,
      };
      openai = buildOpenAIMock({ dryRun: 'At step 2, x becomes 0 instead of 3.', optimizationHint: null });
      await Test.createTestingModule({
        providers: [
          CodeReviewService,
          { provide: DB_TOKEN, useValue: db },
          { provide: REDIS_TOKEN, useValue: redis },
          { provide: OPENAI_CLIENT, useValue: openai },
          { provide: AI_REVIEW_QUEUE_TOKEN, useValue: reviewQueue },
        ],
      }).compile().then((m) => { service = m.get(CodeReviewService); });

      db.limit
        .mockResolvedValueOnce([])           // no existing review
        .mockResolvedValueOnce([sub])        // fetch submission
        .mockResolvedValueOnce([PROBLEM_ROW]) // fetch problem
        .mockResolvedValueOnce([TEST_CASE_ROW]); // fetch visible test case (WA)
      db.returning.mockResolvedValueOnce([{ id: REVIEW_ID }]);

      await service.generate(SUBMISSION_ID);

      const promptArg = openai.chat.completions.create.mock.calls[0][0];
      const userMsg = promptArg.messages.find((m: { role: string }) => m.role === 'user').content as string;
      expect(userMsg).toContain('WRONG ANSWER');
      expect(userMsg).toContain(TEST_CASE_ROW.input);
      expect(userMsg).toContain(TEST_CASE_ROW.expectedOutput);

      expect(redis.publish).toHaveBeenCalledTimes(2);
    });

    it('uses TLE prompt with runtime and time limit', async () => {
      const sub = {
        id: SUBMISSION_ID,
        code: 'for i in range(10**9): pass',
        language: Language.PYTHON,
        verdict: Verdict.TLE,
        problemId: PROBLEM_ID,
        runtimeMs: 5000,
        memoryKb: null,
      };
      openai = buildOpenAIMock({ optimizationHint: 'Use binary search instead.', dryRun: null });
      await Test.createTestingModule({
        providers: [
          CodeReviewService,
          { provide: DB_TOKEN, useValue: db },
          { provide: REDIS_TOKEN, useValue: redis },
          { provide: OPENAI_CLIENT, useValue: openai },
          { provide: AI_REVIEW_QUEUE_TOKEN, useValue: reviewQueue },
        ],
      }).compile().then((m) => { service = m.get(CodeReviewService); });

      db.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub])
        .mockResolvedValueOnce([PROBLEM_ROW]);
      db.returning.mockResolvedValueOnce([{ id: REVIEW_ID }]);

      await service.generate(SUBMISSION_ID);

      const promptArg = openai.chat.completions.create.mock.calls[0][0];
      const userMsg = promptArg.messages.find((m: { role: string }) => m.role === 'user').content as string;
      expect(userMsg).toContain('TIME LIMIT EXCEEDED');
      expect(userMsg).toContain('5000ms');
      expect(userMsg).toContain('1000ms');
    });

    it('skips generation if review already exists (idempotency)', async () => {
      db.limit.mockResolvedValueOnce([{ id: REVIEW_ID }]); // existing review found

      await service.generate(SUBMISSION_ID);

      expect(openai.chat.completions.create).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws if submission has no verdict', async () => {
      db.limit
        .mockResolvedValueOnce([])  // no existing review
        .mockResolvedValueOnce([{ ...{}, verdict: null }]); // submission with null verdict

      await expect(service.generate(SUBMISSION_ID)).rejects.toThrow('no verdict');
    });

    it('retries with isRetry=true when first OpenAI response fails schema validation', async () => {
      const sub = {
        id: SUBMISSION_ID,
        code: 'pass',
        language: Language.PYTHON,
        verdict: Verdict.AC,
        problemId: PROBLEM_ID,
        runtimeMs: 10,
        memoryKb: 512,
      };

      db.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub])
        .mockResolvedValueOnce([PROBLEM_ROW]);
      db.returning.mockResolvedValueOnce([{ id: REVIEW_ID }]);

      openai.chat.completions.create
        .mockResolvedValueOnce({ choices: [{ message: { content: '{"bad": "schema"}' } }] }) // invalid
        .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(DEFAULT_AI_RESULT) } }] }); // valid

      await service.generate(SUBMISSION_ID);

      expect(openai.chat.completions.create).toHaveBeenCalledTimes(2);
      // Second call should have retry suffix in system prompt
      const retryCall = openai.chat.completions.create.mock.calls[1][0];
      const systemMsg = retryCall.messages.find((m: { role: string }) => m.role === 'system').content as string;
      expect(systemMsg).toContain('previous response did not match');
    });

    it('throws after both OpenAI attempts fail schema validation', async () => {
      const sub = {
        id: SUBMISSION_ID,
        code: 'pass',
        language: Language.PYTHON,
        verdict: Verdict.AC,
        problemId: PROBLEM_ID,
        runtimeMs: 10,
        memoryKb: 512,
      };

      db.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sub])
        .mockResolvedValueOnce([PROBLEM_ROW]);

      openai.chat.completions.create
        .mockResolvedValueOnce({ choices: [{ message: { content: '{"bad": "schema"}' } }] })
        .mockResolvedValueOnce({ choices: [{ message: { content: 'not json at all' } }] });

      await expect(service.generate(SUBMISSION_ID)).rejects.toThrow();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  // ─── triggerReview() ─────────────────────────────────────────────────────────

  describe('triggerReview', () => {
    it('returns existing review when one already exists', async () => {
      db.limit
        .mockResolvedValueOnce([{ id: SUBMISSION_ID }]) // ownership check
        .mockResolvedValueOnce([REVIEW_ROW]);            // existing review

      const result = await service.triggerReview(SUBMISSION_ID, USER_ID);

      expect(result).toMatchObject({ id: REVIEW_ID, submissionId: SUBMISSION_ID });
      expect(reviewQueue.add).not.toHaveBeenCalled();
    });

    it('enqueues job and returns { status: pending } when no review exists', async () => {
      db.limit
        .mockResolvedValueOnce([{ id: SUBMISSION_ID }]) // ownership
        .mockResolvedValueOnce([]);                      // no existing review

      const result = await service.triggerReview(SUBMISSION_ID, USER_ID);

      expect(result).toEqual({ status: 'pending' });
      expect(reviewQueue.add).toHaveBeenCalledWith(
        'review',
        { submissionId: SUBMISSION_ID },
        expect.objectContaining({ jobId: `review:${SUBMISSION_ID}` }),
      );
    });

    it('throws NotFoundException when submission does not belong to user', async () => {
      db.limit.mockResolvedValueOnce([]); // ownership check fails

      await expect(service.triggerReview(SUBMISSION_ID, 'wrong-user')).rejects.toThrow(
        NotFoundException,
      );
      expect(reviewQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── getReview() ─────────────────────────────────────────────────────────────

  describe('getReview', () => {
    it('returns mapped review when found', async () => {
      db.limit
        .mockResolvedValueOnce([{ id: SUBMISSION_ID }]) // ownership
        .mockResolvedValueOnce([REVIEW_ROW]);            // review

      const result = await service.getReview(SUBMISSION_ID, USER_ID);

      expect(result.id).toBe(REVIEW_ID);
      expect(result.timeComplexity).toBe('O(n)');
      expect(result.qualityScore).toBe(0.9);
    });

    it('throws NotFoundException when review does not exist', async () => {
      db.limit
        .mockResolvedValueOnce([{ id: SUBMISSION_ID }]) // ownership
        .mockResolvedValueOnce([]);                      // no review

      await expect(service.getReview(SUBMISSION_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when submission belongs to a different user', async () => {
      db.limit.mockResolvedValueOnce([]); // ownership check fails

      await expect(service.getReview(SUBMISSION_ID, 'other-user')).rejects.toThrow(NotFoundException);
    });
  });
});
