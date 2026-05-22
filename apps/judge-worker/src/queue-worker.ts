import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type postgres from 'postgres';

import {
  Verdict,
  QUEUE_NAMES,
  JUDGE_EVENTS_CHANNEL,
  type JudgeEventPayload,
  type JudgeResultPayload,
  type SubmissionJob,
} from '@codeforge/shared';

import { ExecutorService } from './executor/executor.service.js';
import type { ExecutionResult } from './executor/executor.types.js';
import { log } from './logger.js';

export interface WorkerDeps {
  db: postgres.Sql;
  redisUrl: string;
  executor: ExecutorService;
}

export interface WorkerHandle {
  workers: Worker[];
  close(): Promise<void>;
}

const CONTEST_CONCURRENCY = 2;
const PRACTICE_CONCURRENCY = 1;
const BATCH_CONCURRENCY = 1;
const DLQ_ALERT_THRESHOLD = 10;
const DLQ_POLL_INTERVAL_MS = 5 * 60 * 1000;

interface FailedJobSummary {
  id: string;
  error: string;
}

async function sendSlackAlert(jobs: FailedJobSummary[], title?: string): Promise<void> {
  const webhookUrl = process.env['SLACK_WEBHOOK_URL'];
  if (!webhookUrl) return;

  const text = title ?? `CodeForge Judge: ${jobs.length} job(s) permanently failed`;
  const blocks = jobs.map((job) => `- Job ${job.id}: ${job.error.slice(0, 200)}`).join('\n');

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

function makeProcessor(deps: WorkerDeps & { publisher: Redis; aiQueue: Queue }) {
  const { db, executor, publisher, aiQueue } = deps;

  return async function processSubmission(job: Job<SubmissionJob>): Promise<void> {
    const { submissionId, problemId, language, code, timeLimitMs, memoryLimitMb, mode } = job.data;
    const { userId } = job.data;

    log('info', 'Job started', {
      jobId: job.id,
      submissionId,
      queue: job.queueName,
      attempt: job.attemptsMade + 1,
    });

    const testCaseRows = (await db`
      SELECT id, input, expected_output AS "expectedOutput", is_hidden AS "isHidden"
      FROM test_cases
      WHERE problem_id = ${problemId}
      ORDER BY created_at ASC
    `) as Array<{
      id: string;
      input: string;
      expectedOutput: string;
      isHidden: boolean;
    }>;

    if (testCaseRows.length === 0) {
      log('warn', 'No test cases found - marking IE', { submissionId, problemId });
      await db`
        UPDATE submissions
        SET verdict = ${Verdict.IE}
        WHERE id = ${submissionId}
      `;
      throw new Error(`No test cases found for problem ${problemId}`);
    }

    let result: ExecutionResult;
    try {
      result = await executor.execute({
        submissionId,
        language,
        sourceCode: code,
        testCases: testCaseRows.map((testCase) => ({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
        })),
        timeLimitMs,
        memoryLimitMb,
        stopOnFirstFail: mode === 'contest',
        onTestCaseComplete: async (completed, total) => {
          if (completed % 5 !== 0 && completed !== total) return;

          const executingEvent: JudgeEventPayload = {
            userId,
            event: 'submission:executing',
            data: { submissionId, testCasesComplete: completed, totalTestCases: total },
          };
          await publisher.publish(JUDGE_EVENTS_CHANNEL, JSON.stringify(executingEvent)).catch(() => {});
        },
      });
    } catch (err) {
      log('error', 'Executor threw unexpectedly - marking IE and retrying', {
        submissionId,
        error: String(err),
      });
      await db`
        UPDATE submissions
        SET verdict = ${Verdict.IE}
        WHERE id = ${submissionId}
      `;
      throw err;
    }

    const results = result.testCaseResults;
    const passedCount = results.filter((entry) => entry.verdict === Verdict.AC).length;
    const totalCount = testCaseRows.length;
    const maxRuntimeMs = results.length > 0 ? Math.max(...results.map((entry) => entry.runtimeMs)) : null;
    const maxMemoryKb =
      results.length > 0
        ? Math.max(
            ...results.map((entry) => (isFinite(entry.memoryMb) ? Math.round(entry.memoryMb * 1024) : 0)),
          )
        : null;

    await db`
      UPDATE submissions
      SET
        verdict = ${result.verdict},
        runtime_ms = ${maxRuntimeMs ?? null},
        memory_kb = ${maxMemoryKb && maxMemoryKb > 0 ? maxMemoryKb : null},
        test_cases_passed = ${passedCount},
        total_test_cases = ${totalCount}
      WHERE id = ${submissionId}
    `;

    const firstFailIdx = results.findIndex((entry) => entry.verdict !== Verdict.AC);
    let failingTestCase: JudgeResultPayload['failingTestCase'] = null;
    if (firstFailIdx !== -1 && result.verdict !== Verdict.CE) {
      const failRow = testCaseRows[firstFailIdx];
      const failResult = results[firstFailIdx];
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
    await publisher
      .publish(
        JUDGE_EVENTS_CHANNEL,
        JSON.stringify({
          userId,
          event: 'submission:verdict',
          data: payload,
        } satisfies JudgeEventPayload),
      )
      .catch((err: unknown) =>
        log('warn', 'Failed to publish submission:verdict to judge:events', {
          submissionId,
          error: String(err),
        }),
      );

    if (result.verdict !== Verdict.IE) {
      await aiQueue.add('review', { submissionId }, { priority: 10 }).catch((err) => {
        log('warn', 'Failed to enqueue AI review job', { submissionId, error: String(err) });
      });
    }
  };
}

function startDlqMonitor(queues: Queue[]): NodeJS.Timeout {
  return setInterval(async () => {
    for (const queue of queues) {
      try {
        const failedCount = await queue.getFailedCount();
        if (failedCount > DLQ_ALERT_THRESHOLD) {
          const failedJobs = await queue.getFailed(0, 4);
          await sendSlackAlert(
            failedJobs.map((job) => ({
              id: job.id ?? 'unknown',
              error: job.failedReason ?? 'unknown',
            })),
            `DLQ ALERT: ${queue.name} has ${failedCount} failed jobs`,
          );
        }
      } catch (err) {
        log('warn', 'DLQ monitor error', { queue: queue.name, error: String(err) });
      }
    }
  }, DLQ_POLL_INTERVAL_MS);
}

export function createWorkers(deps: WorkerDeps): WorkerHandle {
  const connection = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
  const publisher = new Redis(deps.redisUrl, { maxRetriesPerRequest: null });
  const aiQueue = new Queue(QUEUE_NAMES.AI_REVIEWS, { connection });
  const processor = makeProcessor({ ...deps, publisher, aiQueue });
  const workerOptions = {
    connection,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  };

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
  const monitorQueues = allWorkers.map((worker) => new Queue(worker.name, { connection }));
  const dlqTimer = startDlqMonitor(monitorQueues);

  for (const worker of allWorkers) {
    worker.on('active', (job) => log('debug', 'Job active', { jobId: job.id, queue: worker.name }));
    worker.on('completed', (job) => log('info', 'Job completed', { jobId: job.id, queue: worker.name }));
    worker.on('stalled', (jobId) => log('warn', 'Job stalled', { jobId, queue: worker.name }));
    worker.on('failed', async (job, err) => {
      const isFinal = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);

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
      await Promise.all(allWorkers.map((worker) => worker.close()));
      await aiQueue.close();
      await Promise.all(monitorQueues.map((queue) => queue.close()));
      publisher.disconnect();
      connection.disconnect();
    },
  };
}
