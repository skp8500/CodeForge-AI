import * as dotenv from 'dotenv';
dotenv.config();

import Docker from 'dockerode';

import { client } from '@codeforge/db';

import { ExecutorService } from './executor/executor.service.js';
import { createWorkers } from './queue-worker.js';
import { log } from './logger.js';

const dockerSocketPath =
  process.env.DOCKER_SOCKET_PATH ||
  (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock');

console.log('Judge Worker starting...');
console.log(`Connecting to Redis: ${process.env.REDIS_URL}`);
console.log(`Docker socket: ${dockerSocketPath}`);
console.log(`Queue concurrency: ${process.env.QUEUE_CONCURRENCY || 2}`);

const docker = new Docker({ socketPath: dockerSocketPath });

let workerHandle: ReturnType<typeof createWorkers> | null = null;

docker
  .ping()
  .then(() => console.log('✓ Docker daemon connected'))
  .then(() => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const executor = new ExecutorService();

    workerHandle = createWorkers({ db: client, redisUrl, executor });
    log('info', 'Judge worker started', {
      queues: workerHandle.workers.map((worker) => worker.name),
      redisUrl,
    });
  })
  .catch((err: Error) => {
    console.error('✗ Cannot connect to Docker daemon:', err.message);
    console.error('Make sure Docker Desktop is running and the socket is accessible.');
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  console.log('Worker shutting down gracefully...');
  await workerHandle?.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Worker interrupted, shutting down...');
  await workerHandle?.close();
  process.exit(0);
});
