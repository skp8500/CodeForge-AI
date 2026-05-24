import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { GoogleGenAI } from '@google/genai';

import { QUEUE_NAMES } from '@codeforge/shared';

import { ConfigService } from '@nestjs/config';
import { REDIS_TOKEN } from '../../redis/redis.module';
import { AiController } from './ai.controller';
import { AI_BULL_CONNECTION_TOKEN, AI_REVIEW_QUEUE_TOKEN } from './code-review.types';
import { CodeReviewProcessor } from './code-review.processor';
import { CodeReviewService } from './code-review.service';
import { DEFAULT_GEMINI_MODEL, GEMINI_CLIENT } from './gemini.client';
import { ProblemExplainerService } from './problem-explainer.service';
import { ProblemsController } from './problems.controller';
import { ProblemParserService } from './problem-parser.service';
import { TestGeneratorService } from './test-generator.service';

@Module({
  imports: [],
  controllers: [AiController, ProblemsController],
  providers: [
    {
      provide: GEMINI_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        process.env.GEMINI_MODEL =
          config.get<string>('GEMINI_MODEL') || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

        return new GoogleGenAI({
          apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
        });
      },
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
