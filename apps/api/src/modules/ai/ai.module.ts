import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import OpenAI from 'openai';

import { QUEUE_NAMES } from '@codeforge/shared';

import { ConfigService } from '@nestjs/config';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { AiController } from './ai.controller';
import { ProblemsController } from './problems.controller';
import { OPENAI_CLIENT, ProblemParserService } from './problem-parser.service';
import { TestGeneratorService } from './test-generator.service';
import { CodeReviewService } from './code-review.service';
import { CodeReviewProcessor } from './code-review.processor';
import { ProblemExplainerService } from './problem-explainer.service';
import { AI_BULL_CONNECTION_TOKEN, AI_REVIEW_QUEUE_TOKEN } from './code-review.types';

@Module({
  imports: [],
  controllers: [AiController, ProblemsController],
  providers: [
    {
      provide: OPENAI_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenAI({ apiKey: config.getOrThrow<string>('OPENAI_API_KEY') }),
    },

    {
      provide: AI_BULL_CONNECTION_TOKEN,
      inject: [REDIS_TOKEN],
      useFactory: (redis: IORedis) => redis,
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
