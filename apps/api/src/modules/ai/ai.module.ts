import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import OpenAI from 'openai';

import { QUEUE_NAMES } from '@codeforge/shared';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../redis/redis.module';
import { AiController } from './ai.controller';
import { ProblemsController } from './problems.controller';
import { OPENAI_CLIENT, ProblemParserService } from './problem-parser.service';
import { TestGeneratorService } from './test-generator.service';
import { CodeReviewService } from './code-review.service';
import { CodeReviewProcessor } from './code-review.processor';
import { ProblemExplainerService } from './problem-explainer.service';
import { AI_BULL_CONNECTION_TOKEN, AI_REVIEW_QUEUE_TOKEN } from './code-review.types';

@Module({
  imports: [RedisModule, DatabaseModule],
  controllers: [AiController, ProblemsController],
  providers: [
    {
      provide: OPENAI_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenAI({ apiKey: config.getOrThrow<string>('OPENAI_API_KEY') }),
    },

    // Dedicated BullMQ connection for the AI review queue/worker
    {
      provide: AI_BULL_CONNECTION_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
    },

    {
      provide: AI_REVIEW_QUEUE_TOKEN,
      inject: [AI_BULL_CONNECTION_TOKEN],
      useFactory: (connection: IORedis) =>
        new Queue(QUEUE_NAMES.AI_REVIEWS, { connection }),
    },

    ProblemParserService,
    TestGeneratorService,
    CodeReviewService,
    CodeReviewProcessor,
    ProblemExplainerService,
  ],
  exports: [ProblemParserService, TestGeneratorService, CodeReviewService, ProblemExplainerService],
})
export class AiModule {}
