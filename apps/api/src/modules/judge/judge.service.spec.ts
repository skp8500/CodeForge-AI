import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Language, QUEUE_NAMES } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { JudgeService } from './judge.service';
import {
  CONTEST_QUEUE_TOKEN,
  PRACTICE_QUEUE_TOKEN,
  MAX_PENDING_PER_USER,
} from './judge.types';

// ─── Fixed IDs ────────────────────────────────────────────────────────────────

const PROBLEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SUBMISSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTEST_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const PROBLEM_ROW = { id: PROBLEM_ID, timeLimitMs: 1000, memoryLimitMb: 256 };
const SUBMISSION_ROW = {
  id: SUBMISSION_ID,
  userId: USER_ID,
  problemId: PROBLEM_ID,
  contestId: null,
  language: Language.CPP,
  code: 'int main(){}',
  verdict: null,
  runtimeMs: null,
  memoryKb: null,
  testCasesPassed: null,
  totalTestCases: null,
  aiReviewId: null,
  submittedAt: new Date('2026-01-01T00:00:00Z'),
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

  return {
    select: mockSelect,
    from: mockFrom,
    where: mockWhere,
    limit: mockLimit,
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    // Drizzle count query shape: select().from().where() (no limit)
    _whereNoLimit: mockWhere,
  };
}

function buildQueueMock() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getWaitingCount: jest.fn().mockResolvedValue(3),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JudgeService', () => {
  let service: JudgeService;
  let db: ReturnType<typeof buildDbMock>;
  let contestQueue: ReturnType<typeof buildQueueMock>;
  let practiceQueue: ReturnType<typeof buildQueueMock>;
  let redis: { publish: jest.Mock };

  beforeEach(async () => {
    db = buildDbMock();
    contestQueue = buildQueueMock();
    practiceQueue = buildQueueMock();
    redis = { publish: jest.fn().mockResolvedValue(1) };

    const module = await Test.createTestingModule({
      providers: [
        JudgeService,
        { provide: DB_TOKEN, useValue: db },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: CONTEST_QUEUE_TOKEN, useValue: contestQueue },
        { provide: PRACTICE_QUEUE_TOKEN, useValue: practiceQueue },
      ],
    }).compile();

    service = module.get(JudgeService);
  });

  // ─── createSubmission ────────────────────────────────────────────────────────

  describe('createSubmission', () => {
    function setupHappyPath(pendingCount = 0) {
      // fetchProblem: select().from().where().limit(1)
      db.where.mockReturnValueOnce({ limit: db.limit });
      db.limit.mockResolvedValueOnce([PROBLEM_ROW]);
      // countPendingSubmissions: select().from().where() — awaited directly (no .limit)
      db.where.mockResolvedValueOnce([{ count: pendingCount }]);
      // insert → returning
      db.returning.mockResolvedValueOnce([{ id: SUBMISSION_ID }]);
    }

    it('inserts a submission with null verdict and enqueues to practice queue', async () => {
      setupHappyPath();

      const result = await service.createSubmission(
        { problemId: PROBLEM_ID, language: Language.CPP, code: 'int main(){}' },
        USER_ID,
      );

      expect(result.submissionId).toBe(SUBMISSION_ID);
      expect(result.position).toBe(3);

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(practiceQueue.add).toHaveBeenCalledWith(
        QUEUE_NAMES.CONTEST_SUBMISSIONS,
        expect.objectContaining({
          submissionId: SUBMISSION_ID,
          userId: USER_ID,
          problemId: PROBLEM_ID,
          language: Language.CPP,
          mode: 'practice',
          timeLimitMs: 1000,
          memoryLimitMb: 256,
        }),
        expect.objectContaining({ jobId: SUBMISSION_ID }),
      );
      expect(contestQueue.add).not.toHaveBeenCalled();
    });

    it('routes to the contest queue when contestId is provided', async () => {
      setupHappyPath();

      await service.createSubmission(
        { problemId: PROBLEM_ID, language: Language.PYTHON, code: 'print(1)', contestId: CONTEST_ID },
        USER_ID,
      );

      expect(contestQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ mode: 'contest', contestId: CONTEST_ID }),
        expect.objectContaining({ priority: 1, jobId: SUBMISSION_ID }),
      );
      expect(practiceQueue.add).not.toHaveBeenCalled();
    });

    it(`throws 429 HttpException when user already has ${MAX_PENDING_PER_USER} pending submissions`, async () => {
      db.where.mockReturnValueOnce({ limit: db.limit });
      db.limit.mockResolvedValueOnce([PROBLEM_ROW]);
      db.where.mockResolvedValueOnce([{ count: MAX_PENDING_PER_USER }]);

      await expect(
        service.createSubmission(
          { problemId: PROBLEM_ID, language: Language.CPP, code: 'int main(){}' },
          USER_ID,
        ),
      ).rejects.toThrow(HttpException);

      expect(db.insert).not.toHaveBeenCalled();
      expect(practiceQueue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when problem does not exist', async () => {
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.createSubmission(
          { problemId: PROBLEM_ID, language: Language.CPP, code: 'int main(){}' },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('includes timeLimitMs and memoryLimitMb from the problem in the job payload', async () => {
      db.where.mockReturnValueOnce({ limit: db.limit });
      db.limit.mockResolvedValueOnce([{ id: PROBLEM_ID, timeLimitMs: 3000, memoryLimitMb: 512 }]);
      db.where.mockResolvedValueOnce([{ count: 0 }]);
      db.returning.mockResolvedValueOnce([{ id: SUBMISSION_ID }]);

      await service.createSubmission(
        { problemId: PROBLEM_ID, language: Language.JAVA, code: 'class Solution{}' },
        USER_ID,
      );

      expect(practiceQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeLimitMs: 3000, memoryLimitMb: 512 }),
        expect.anything(),
      );
    });

    it('returns the queue waiting count as position', async () => {
      setupHappyPath();
      practiceQueue.getWaitingCount.mockResolvedValueOnce(7);

      const result = await service.createSubmission(
        { problemId: PROBLEM_ID, language: Language.CPP, code: 'int main(){}' },
        USER_ID,
      );

      expect(result.position).toBe(7);
    });
  });

  // ─── getSubmission ───────────────────────────────────────────────────────────

  describe('getSubmission', () => {
    it('returns submission details when found', async () => {
      db.limit.mockResolvedValueOnce([SUBMISSION_ROW]);

      const result = await service.getSubmission(SUBMISSION_ID, USER_ID);

      expect(result.id).toBe(SUBMISSION_ID);
      expect(result.verdict).toBeNull();
      expect(result.language).toBe(Language.CPP);
    });

    it('returns verdict once judging completes', async () => {
      db.limit.mockResolvedValueOnce([{ ...SUBMISSION_ROW, verdict: 'AC', runtimeMs: 42, testCasesPassed: 10, totalTestCases: 10 }]);

      const result = await service.getSubmission(SUBMISSION_ID, USER_ID);

      expect(result.verdict).toBe('AC');
      expect(result.runtimeMs).toBe(42);
      expect(result.testCasesPassed).toBe(10);
    });

    it('throws NotFoundException when submission not found', async () => {
      db.limit.mockResolvedValueOnce([]);

      await expect(service.getSubmission(SUBMISSION_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when submission belongs to a different user', async () => {
      // The query uses AND(id, userId) — no row returned for wrong user
      db.limit.mockResolvedValueOnce([]);

      await expect(service.getSubmission(SUBMISSION_ID, 'other-user-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
