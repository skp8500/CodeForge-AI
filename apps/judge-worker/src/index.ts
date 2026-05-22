import { getDb } from '@codeforge/db';

import { ExecutorService } from './executor/executor.service.js';
import { log } from './logger.js';
import { createWorkers } from './worker.js';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

const executor = new ExecutorService();
const db = getDb();

const handle = createWorkers({ db, redisUrl, executor });

log('info', 'Judge worker started', {
  queues: handle.workers.map((w) => w.name),
  redisUrl,
});

process.on('SIGTERM', async () => {
  log('info', 'SIGTERM received — shutting down gracefully');
  await handle.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('info', 'SIGINT received — shutting down gracefully');
  await handle.close();
  process.exit(0);
});
