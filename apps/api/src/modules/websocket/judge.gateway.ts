import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import IORedis from 'ioredis';

import { JUDGE_EVENTS_CHANNEL, type JudgeEventPayload } from '@codeforge/shared';

import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import { REDIS_TOKEN } from '../../redis/redis.module';

@WebSocketGateway({
  namespace: '/judge',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket'],
})
export class JudgeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(JudgeGateway.name);
  private subscriber!: IORedis;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @WebSocketServer()
  server!: any;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.subscriber = this.redis.duplicate();

    void this.subscriber.subscribe(JUDGE_EVENTS_CHANNEL, (err) => {
      if (err) this.logger.error('Redis subscribe error', err);
      else this.logger.log('JudgeGateway subscribed to judge:events');
    });

    this.subscriber.on('message', (_channel: string, raw: string) => {
      let payload: JudgeEventPayload;
      try {
        payload = JSON.parse(raw) as JudgeEventPayload;
      } catch {
        return;
      }
      this.server.to(`user:${payload.userId}`).emit(payload.event, payload.data);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
  }

  // ─── Connection / disconnection ──────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleConnection(client: any): Promise<void> {
    // Accept token from auth handshake or Authorization header
    const token: string | undefined =
      client.handshake?.auth?.token ??
      client.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      this.logger.warn(`Connection rejected — no token (${client.id})`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: 'codeforge-api',
      });

      client.data.userId = payload.sub;
      void client.join(`user:${payload.sub}`);
      this.logger.debug(`Client ${client.id} authenticated as user ${payload.sub}`);
    } catch (err) {
      this.logger.warn(`Connection rejected — invalid token (${client.id}): ${String(err)}`);
      client.disconnect(true);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleDisconnect(client: any): void {
    this.logger.debug(`Client ${client.id} (user ${client.data?.userId ?? 'unknown'}) disconnected`);
  }
}
