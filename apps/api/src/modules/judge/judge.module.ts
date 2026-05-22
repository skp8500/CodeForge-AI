import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { QUEUE_NAMES } from '@codeforge/shared';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { JudgeController } from './judge.controller';
import { JudgeService } from './judge.service';
import {
  BATCH_QUEUE_TOKEN,
  BULL_CONNECTION_TOKEN,
  CONTEST_QUEUE_TOKEN,
  PRACTICE_QUEUE_TOKEN,
} from './judge.types';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

@Module({
  imports: [DatabaseModule, RedisModule, AiModule],
  controllers: [JudgeController],
  providers: [
    // Shared BullMQ connection (ioredis instance passed to all queues)
    {
      provide: BULL_CONNECTION_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
    },

    {
      provide: CONTEST_QUEUE_TOKEN,
      inject: [BULL_CONNECTION_TOKEN],
      useFactory: (connection: IORedis) =>
        new Queue(QUEUE_NAMES.CONTEST_SUBMISSIONS, {
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
    },
    {
      provide: PRACTICE_QUEUE_TOKEN,
      inject: [BULL_CONNECTION_TOKEN],
      useFactory: (connection: IORedis) =>
        new Queue(QUEUE_NAMES.PRACTICE_SUBMISSIONS, {
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
    },
    {
      provide: BATCH_QUEUE_TOKEN,
      inject: [BULL_CONNECTION_TOKEN],
      useFactory: (connection: IORedis) =>
        new Queue(QUEUE_NAMES.BATCH_EVALUATION, {
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
    },

    JudgeService,
  ],
  exports: [JudgeService, CONTEST_QUEUE_TOKEN, PRACTICE_QUEUE_TOKEN, BATCH_QUEUE_TOKEN],
})
export class JudgeModule {}
