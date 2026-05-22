import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';

import { QUEUE_NAMES } from '@codeforge/shared';

import { AI_BULL_CONNECTION_TOKEN } from './code-review.types';
import { CodeReviewService } from './code-review.service';

@Injectable()
export class CodeReviewProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CodeReviewProcessor.name);
  private worker!: Worker;

  constructor(
    @Inject(AI_BULL_CONNECTION_TOKEN) private readonly connection: IORedis,
    private readonly codeReviewService: CodeReviewService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUE_NAMES.AI_REVIEWS,
      async (job) => {
        const submissionId = job.data.submissionId as string;
        this.logger.debug(`Processing AI review job for submission ${submissionId}`);
        await this.codeReviewService.generate(submissionId);
      },
      {
        connection: this.connection,
        concurrency: 3,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`AI review job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
