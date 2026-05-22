import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { Language, Verdict, QUEUE_NAMES } from '@codeforge/shared';

import type { ExecutionResult } from './executor/executor.types.js';
import { createWorkers, type WorkerHandle } from './worker.js';

// ─── Unit: pure logger (no Redis) ─────────────────────────────────────────────

describe('logger', () => {
  it('writes info to stdout', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { log } = await import('./logger.js');
    log('info', 'hello', { x: 1 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"hello"'));
    spy.mockRestore();
  });

  it('writes error to stderr', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { log } = await import('./logger.js');
    log('error', 'boom');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"boom"'));
    spy.mockRestore();
  });
});

// ─── Integration: real Redis via testcontainers, mocked executor + DB ─────────

const RUN_INTEGRATION = !!process.env['QUEUE_TESTS'];

describe.skipIf(!RUN_INTEGRATION)(
  '@slow Worker integration (real Redis, mocked executor + DB)',
  { timeout: 120_000 },
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let redisContainer: any;
    let redisUrl: string;
    let connection: IORedis;
    let handle: WorkerHandle;

    // Mock DB: returns 2 test cases for any select, resolves updates silently
    const mockTestCases = [
      { id: 'tc-1', input: '5\n', expectedOutput: '5' },
      { id: 'tc-2', input: '0\n', expectedOutput: '0' },
    ];

    const mockDbUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockTestCases),
        }),
      }),
      update: mockDbUpdate,
    };

    // Mock ExecutorService: returns AC by default
    const mockAcResult: ExecutionResult = {
      verdict: Verdict.AC,
      testCaseResults: [
        { index: 0, verdict: Verdict.AC, runtimeMs: 12, memoryMb: 4, stdout: '5', stderr: '' },
        { index: 1, verdict: Verdict.AC, runtimeMs: 10, memoryMb: 4, stdout: '0', stderr: '' },
      ],
      totalRuntimeMs: 25,
    };

    const mockExecute = vi.fn().mockResolvedValue(mockAcResult);
    const mockExecutor = { execute: mockExecute } as never;

    beforeAll(async () => {
      const { GenericContainer } = await import('testcontainers');
      redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
      redisUrl = `redis://localhost:${redisContainer.getMappedPort(6379)}`;
      connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    }, 60_000);

    afterAll(async () => {
      connection.disconnect();
      await redisContainer?.stop();
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockExecute.mockResolvedValue(mockAcResult);
      handle = createWorkers({ db: mockDb as never, redisUrl, executor: mockExecutor });
    });

    afterEach(async () => {
      await handle.close();
    });

    // ── helpers ──────────────────────────────────────────────────────────────

    async function addJob(
      queueName: string,
      data: Partial<ReturnType<typeof makeJob>> = {},
    ) {
      const queue = new Queue(queueName, { connection });
      const job = await queue.add('submission', makeJob(data), {
        jobId: `test-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 100 },
      });
      await queue.close();
      return job;
    }

    function makeJob(overrides = {}) {
      return {
        submissionId: `sub-${Math.random().toString(36).slice(2)}`,
        userId: 'user-1',
        problemId: 'prob-1',
        language: Language.CPP,
        code: 'int main(){}',
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        mode: 'practice' as const,
        ...overrides,
      };
    }

    async function waitForJob(queueName: string, jobId: string, timeoutMs = 15_000) {
      const events = new QueueEvents(queueName, { connection });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Job ${jobId} timed out`)), timeoutMs);
          events.on('completed', ({ jobId: id }) => {
            if (id === jobId) { clearTimeout(timer); resolve(); }
          });
          events.on('failed', ({ jobId: id, failedReason }) => {
            if (id === jobId) { clearTimeout(timer); reject(new Error(failedReason)); }
          });
        });
      } finally {
        await events.close();
      }
    }

    // ── test cases ────────────────────────────────────────────────────────────

    it('processes a practice submission end-to-end and updates DB with AC', async () => {
      const job = await addJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS);
      await waitForJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS, job.id!);

      expect(mockExecute).toHaveBeenCalledOnce();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ language: Language.CPP, stopOnFirstFail: false }),
      );

      // DB update was called with AC verdict
      const setCalls = mockDbUpdate.mock.results[0]?.value?.set?.mock?.calls;
      expect(setCalls?.[0]?.[0]).toMatchObject({ verdict: Verdict.AC });
    });

    it('uses stopOnFirstFail=true for contest submissions', async () => {
      const job = await addJob(QUEUE_NAMES.CONTEST_SUBMISSIONS, {
        mode: 'contest',
        contestId: 'contest-1',
      });
      await waitForJob(QUEUE_NAMES.CONTEST_SUBMISSIONS, job.id!);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ stopOnFirstFail: true }),
      );
    });

    it('persists the max runtime and testCasesPassed', async () => {
      const job = await addJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS);
      await waitForJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS, job.id!);

      const setCalls = mockDbUpdate.mock.results[0]?.value?.set?.mock?.calls;
      const update = setCalls?.[0]?.[0];
      expect(update?.runtimeMs).toBe(12); // max(12, 10)
      expect(update?.testCasesPassed).toBe(2);
      expect(update?.totalTestCases).toBe(2);
    });

    it('publishes result to Redis pub/sub channel', async () => {
      const subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      const received: string[] = [];
      let submissionId: string;

      await new Promise<void>(async (resolve) => {
        await subscriber.psubscribe('submissions:*');
        subscriber.on('pmessage', (_pattern, _channel, message) => {
          received.push(message);
          resolve();
        });

        const job = await addJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS);
        submissionId = (job.data as ReturnType<typeof makeJob>).submissionId;
        await waitForJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS, job.id!).catch(() => {});
      });

      subscriber.disconnect();
      expect(received.length).toBeGreaterThan(0);
      expect(JSON.parse(received[0]!)).toMatchObject({
        submissionId,
        verdict: Verdict.AC,
        testCasesPassed: 2,
        totalTestCases: 2,
      });
    });

    it('marks submission IE and retries when executor throws', async () => {
      mockExecute
        .mockRejectedValueOnce(new Error('Docker daemon unreachable'))
        .mockRejectedValueOnce(new Error('Docker daemon unreachable'))
        .mockResolvedValueOnce(mockAcResult); // succeeds on 3rd attempt

      const job = await addJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS);
      await waitForJob(QUEUE_NAMES.PRACTICE_SUBMISSIONS, job.id!);

      // Was retried and eventually succeeded
      expect(mockExecute).toHaveBeenCalledTimes(3);

      // Final DB update reflects AC
      const allSetCalls = mockDbUpdate.mock.results
        .map((r: { value: { set: { mock: { calls: unknown[][] } } } }) => r?.value?.set?.mock?.calls?.[0]?.[0])
        .filter(Boolean);
      const lastUpdate = allSetCalls[allSetCalls.length - 1];
      expect(lastUpdate).toMatchObject({ verdict: Verdict.AC });
    });

    it('processes batch evaluation jobs the same as practice', async () => {
      const job = await addJob(QUEUE_NAMES.BATCH_EVALUATION, { mode: 'batch' });
      await waitForJob(QUEUE_NAMES.BATCH_EVALUATION, job.id!);

      expect(mockExecute).toHaveBeenCalledOnce();
    });
  },
);
