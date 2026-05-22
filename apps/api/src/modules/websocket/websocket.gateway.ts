import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import IORedis from 'ioredis';

import { REDIS_TOKEN } from '../../redis/redis.module';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketGateway.name);
  private subscriber!: IORedis;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @WebSocketServer()
  server!: any;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  onModuleInit(): void {
    this.subscriber = this.redis.duplicate();

    void this.subscriber.psubscribe('submissions:*', (err) => {
      if (err) this.logger.error('Redis psubscribe error', err);
      else this.logger.log('WebSocket gateway subscribed to Redis submissions:* channels');
    });

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const verdictMatch = /^submissions:([^:]+)$/.exec(channel);
      if (verdictMatch) {
        let payload: unknown;
        try {
          payload = JSON.parse(message);
        } catch {
          payload = { raw: message };
        }
        this.server
          .to(`submission:${verdictMatch[1]}`)
          .emit('submission:verdict', { submissionId: verdictMatch[1], ...(payload as object) });
        return;
      }

      const reviewMatch = /^submissions:([^:]+):review$/.exec(channel);
      if (reviewMatch) {
        let payload: unknown;
        try {
          payload = JSON.parse(message);
        } catch {
          payload = { raw: message };
        }
        this.server
          .to(`submission:${reviewMatch[1]}`)
          .emit('submission:review', { submissionId: reviewMatch[1], ...(payload as object) });
        return;
      }

      const progressMatch = /^submissions:([^:]+):progress$/.exec(channel);
      if (progressMatch) {
        let payload: unknown;
        try {
          payload = JSON.parse(message);
        } catch {
          payload = { raw: message };
        }
        this.server
          .to(`submission:${progressMatch[1]}`)
          .emit('submission:progress', { submissionId: progressMatch[1], ...(payload as object) });
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
  }

  @SubscribeMessage('subscribe')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSubscribe(
    @ConnectedSocket() client: any,
    @MessageBody() data: { submissionId: string },
  ): void {
    if (!data?.submissionId) return;
    void client.join(`submission:${data.submissionId}`);
    this.logger.debug(`Client ${client.id} joined submission:${data.submissionId}`);
  }

  @SubscribeMessage('unsubscribe')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleUnsubscribe(
    @ConnectedSocket() client: any,
    @MessageBody() data: { submissionId: string },
  ): void {
    if (!data?.submissionId) return;
    void client.leave(`submission:${data.submissionId}`);
  }
}
