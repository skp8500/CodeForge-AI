import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { JwtAccessPayload } from '../types/jwt-payload.types';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(
    req: Request & { requestId?: string; user?: JwtAccessPayload },
    res: Response,
    next: NextFunction,
  ): void {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const userId = req.user?.sub ?? 'anonymous';
      this.logger.log(
        `${method} ${originalUrl} ${res.statusCode} ${duration}ms [user=${userId}] [reqId=${req.requestId ?? '-'}]`,
      );
    });

    next();
  }
}
