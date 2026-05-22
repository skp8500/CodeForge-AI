import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { AiModule } from './modules/ai/ai.module';
import { ContestsModule } from './modules/contests/contests.module';
import { HealthModule } from './modules/health/health.module';
import { JudgeModule } from './modules/judge/judge.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 200,
      },
    ]),

    DatabaseModule,
    RedisModule,
    MailModule,
    UsersModule,
    AuthModule,
    AiModule,
    JudgeModule,
    ProblemsModule,
    ContestsModule,
    OrgsModule,
    AssessmentsModule,
    WebsocketModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
