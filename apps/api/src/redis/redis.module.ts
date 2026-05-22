import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const REDIS_TOKEN = 'REDIS';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
          lazyConnect: false,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_TOKEN],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_TOKEN) private readonly redis: IORedis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
