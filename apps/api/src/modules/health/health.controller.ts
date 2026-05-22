import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type IORedis from 'ioredis';

import type { Db } from '@codeforge/db';
import { QUEUE_NAMES } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    database: 'ok' | 'degraded';
    redis: 'ok' | 'degraded';
    judgeQueue: { depth: number; status: 'ok' | 'degraded' };
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check — always 200; status is ok or degraded' })
  @ApiOkResponse({ description: 'Health status with individual check results' })
  async check(): Promise<HealthResponse> {
    const [dbOk, redisResult] = await Promise.all([
      this.db
        .execute(sql`SELECT 1`)
        .then(() => true)
        .catch(() => false),
      this.checkRedisAndQueues(),
    ]);

    const allOk = dbOk && redisResult.redis;

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'ok' : 'degraded',
        redis: redisResult.redis ? 'ok' : 'degraded',
        judgeQueue: {
          depth: redisResult.queueDepth,
          status: redisResult.redis ? 'ok' : 'degraded',
        },
      },
    };
  }

  private async checkRedisAndQueues(): Promise<{ redis: boolean; queueDepth: number }> {
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') return { redis: false, queueDepth: 0 };

      // BullMQ stores waiting jobs in a list keyed `bull:{queueName}:wait`
      const practiceDepth = await this.redis.llen(
        `bull:${QUEUE_NAMES.PRACTICE_SUBMISSIONS}:wait`,
      );
      const contestDepth = await this.redis.llen(
        `bull:${QUEUE_NAMES.CONTEST_SUBMISSIONS}:wait`,
      );

      return { redis: true, queueDepth: practiceDepth + contestDepth };
    } catch {
      return { redis: false, queueDepth: 0 };
    }
  }
}
