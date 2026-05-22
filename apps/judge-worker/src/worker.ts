import { Queue, Worker, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import IORedis from 'ioredis';

import { submissions, testCases } from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { Verdict, QUEUE_NAMES, type JudgeResultPayload, type SubmissionJob } from '@codeforge/shared';

import { ExecutorService } from './executor/executor.service.js';
import type { ExecutionResult } from './executor/executor.types.js';
import { log } from './logger.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WorkerDeps {
  db: Db;
  redisUrl: string;
  executor: ExecutorService;
}

export interface WorkerHandle {
  workers: Worker[];
  close(): Promise<void>;
}

// ─── Concurrency allocation (total = WORKER_CONCURRENCY = 4) ─────────────────

const CONTEST_CONCURRENCY = 2; // 2× throughput for contest queue
const PRACTICE_CONCURRENCY = 1;
const BATCH_CONCURRENCY = 1;

// ─── Slack alert ──────────────────────────────────────────────────────────────

interface FailedJobSummary {
  id: string;
  error: string;
}

async function sendSlackAlert(jobs: FailedJobSummary[], title?: string): Promise<void> {
  const webhookUrl = process.env['SLACK_WEBHOOK_URL'];
  if (!webhookUrl) return;

  const text =
    title ??
    `🚨 CodeForge Judge: ${jobs.length} job(s) permanently failed`;

  const blocks = jobs
    .map((j) => `• Job \`${j.id}\`: ${j.error.slice(0, 200)}`)
    .join('\n');

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${text}\n${blocks}` }),
    });
  } catch (err) {
    log('warn', 'Failed to send Slack alert', { error: String(err) });
  }
}

// ─── Job processor ────────────────────────────────────────────────────────────

function makeProcessor(deps: WorkerDeps & { publisher: IORedis; aiQueue: Queue }) {
  const { db, executor, publisher, aiQueue } = deps;

  return async function processSubmission(job: Job<SubmissionJob>): Promise<void> {
    const { submissionId, problemId, language, code, timeLimitMs, memoryLimitMb, mode } = job.data;

    log('info', 'Job started', {
      jobId: job.id,
      submissionId,
      queue: job.queueName,
      attempt: job.attemptsMade + 1,
    });

    // 1. Fetch all test cases for the problem (hidden + visible)
    const testCaseRows = await db
      .select({
        id: testCases.id,
        input: testCases.input,
        expectedOutput: testCases.expectedOutput,
        isHidden: testCases.isHidden,
      })
      .from(testCases)
      .where(eq(testCases.problemId, problemId));

    if (testCaseRows.length === 0) {
      log('warn', 'No test cases found — marking IE', { submissionId, problemId });
      await db
        .update(submissions)
        .set({ verdict: Verdict.IE })
        .where(eq(submissions.id, submissionId));
      throw new Error(`No test cases found for problem ${problemId}`);
    }

    // 2. Execute
    let result: ExecutionResult;
    try {
      result = await executor.execute({
        submissionId,
        language,
        sourceCode: code,
        testCases: testCaseRows.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
        timeLimitMs,
        memoryLimitMb,
        // Contest mode stops on first failure (faster feedback + leaderboard accuracy)
        stopOnFirstFail: mode === 'contest',
      });
    } catch (err) {
      log('error', 'Executor threw unexpectedly — marking IE and retrying', {
        submissionId,
        error: String(err),
      });
      await db
        .update(submissions)
        .set({ verdict: Verdict.IE })
        .where(eq(submissions.id, submissionId));
      throw err; // triggers BullMQ retry
    }

    // 3. Aggregate stats across all test case results
    const tcResults = result.testCaseResults;
    const passedCount = tcResults.filter((r) => r.verdict === Verdict.AC).length;
    const totalCount = testCaseRows.length;
    const maxRuntimeMs = tcResults.length > 0 ? Math.max(...tcResults.map((r) => r.runtimeMs)) : null;
    // memoryMb from executor is best-effort; convert to KB
    const maxMemoryKb =
      tcResults.length > 0
        ? Math.max(...tcResults.map((r) => (isFinite(r.memoryMb) ? Math.round(r.memoryMb * 1024) : 0)))
        : null;

    // 4. Persist final verdict
    await db
      .update(submissions)
      .set({
        verdict: result.verdict,
        runtimeMs: maxRuntimeMs ?? null,
        memoryKb: maxMemoryKb && maxMemoryKb > 0 ? maxMemoryKb : null,
        testCasesPassed: passedCount,
        totalTestCases: totalCount,
      })
      .where(eq(submissions.id, submissionId));

    // 5. Build extended payload and publish to Redis pub/sub
    const firstFailIdx = tcResults.findIndex((r) => r.verdict !== Verdict.AC);
    let failingTestCase: JudgeResultPayload['failingTestCase'] = null;
    if (firstFailIdx !== -1 && result.verdict !== Verdict.CE) {
      const failRow = testCaseRows[firstFailIdx];
      const failResult = tcResults[firstFailIdx];
      if (failRow && failResult) {
        failingTestCase = failRow.isHidden
          ? { input: '', expected: '', actual: '', isHidden: true }
          : {
              input: failRow.input,
              expected: failRow.expectedOutput,
              actual: failResult.stdout.trim(),
              isHidden: false,
            };
      }
    }

    const payload: JudgeResultPayload = {
      submissionId,
      verdict: result.verdict,
      runtimeMs: maxRuntimeMs ?? null,
      memoryKb: maxMemoryKb && maxMemoryKb > 0 ? maxMemoryKb : null,
      testCasesPassed: passedCount,
      totalTestCases: totalCount,
      compileError: result.verdict === Verdict.CE ? (result.compileResult?.output ?? null) : null,
      failingTestCase,
    };
    await publisher.publish(`submissions:${submissionId}`, JSON.stringify(payload));

    // 6. Queue an AI code-review job (fire-and-forget) unless execution errored
    if (result.verdict !== Verdict.IE) {
      await aiQueue.add('review', { submissionId }, { priority: 10 }).catch((err) => {
        log('warn', 'Failed to enqueue AI review job', { submissionId, error: String(err) });
      });
    }

    log('info', 'Job completed', {
      jobId: job.id,
      submissionId,
      verdict: result.verdict,
      runtimeMs: maxRuntimeMs,
      passedCount,
      totalCount,
    });
  };
}

// ─── Dead-letter monitor ──────────────────────────────────────────────────────

const DLQ_ALERT_THRESHOLD = 10;
const DLQ_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function startDlqMonitor(queues: Queue[]): NodeJS.Timeout {
  return setInterval(async () => {
    for (const q of queues) {
      try {
        const failedCount = await q.getFailedCount();
        if (failedCount > DLQ_ALERT_THRESHOLD) {
          const failedJobs = await q.getFailed(0, 4);
          log('warn', `DLQ alert: ${q.name} has ${failedCount} failed jobs`);
          await sendSlackAlert(
            failedJobs.map((j) => ({ id: j.id ?? 'unknown', error: j.failedReason ?? 'unknown' })),
            `🚨 DLQ ALERT: ${q.name} has ${failedCount} failed jobs`,
          );
        }
      } catch (err) {
        log('warn', 'DLQ monitor error', { queue: q.name, error: String(err) });
      }
    }
  }, DLQ_POLL_INTERVAL_MS);
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function createWorkers(deps: WorkerDeps): WorkerHandle {
  const { redisUrl } = deps;

  // BullMQ workers share a connection; pub/sub publish uses a separate client
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const aiQueue = new Queue(QUEUE_NAMES.AI_REVIEWS, { connection });

  const processor = makeProcessor({ ...deps, publisher, aiQueue });

  const workerOptions = { connection, removeOnComplete: { count: 500 }, removeOnFail: { count: 200 } };

  const contestWorker = new Worker(QUEUE_NAMES.CONTEST_SUBMISSIONS, processor, {
    ...workerOptions,
    concurrency: CONTEST_CONCURRENCY,
  });

  const practiceWorker = new Worker(QUEUE_NAMES.PRACTICE_SUBMISSIONS, processor, {
    ...workerOptions,
    concurrency: PRACTICE_CONCURRENCY,
  });

  const batchWorker = new Worker(QUEUE_NAMES.BATCH_EVALUATION, processor, {
    ...workerOptions,
    concurrency: BATCH_CONCURRENCY,
  });

  const allWorkers = [contestWorker, practiceWorker, batchWorker];

  // Monitoring queues (read-only, for the DLQ monitor)
  const monitorQueues = allWorkers.map((w) => new Queue(w.name, { connection }));
  const dlqTimer = startDlqMonitor(monitorQueues);

  for (const worker of allWorkers) {
    worker.on('active', (job) =>
      log('debug', 'Job active', { jobId: job.id, queue: worker.name }),
    );
    worker.on('completed', (job) =>
      log('info', 'Job completed', { jobId: job.id, queue: worker.name }),
    );
    worker.on('stalled', (jobId) =>
      log('warn', 'Job stalled', { jobId, queue: worker.name }),
    );
    worker.on('failed', async (job, err) => {
      const isFinal =
        job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);

      log('error', isFinal ? 'Job permanently failed' : 'Job attempt failed', {
        jobId: job?.id,
        queue: worker.name,
        error: err.message,
        attemptsMade: job?.attemptsMade,
        isFinal,
      });

      if (isFinal && job) {
        await sendSlackAlert([{ id: job.id ?? 'unknown', error: err.message }]);
      }
    });
  }

  return {
    workers: allWorkers,
    async close() {
      clearInterval(dlqTimer);
      await Promise.all(allWorkers.map((w) => w.close()));
      await aiQueue.close();
      await Promise.all(monitorQueues.map((q) => q.close()));
      publisher.disconnect();
      connection.disconnect();
    },
  };
}
