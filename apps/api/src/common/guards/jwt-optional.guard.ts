import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Allows both authenticated and unauthenticated requests.
 * If a valid token is present, req.user is populated; otherwise req.user is null.
 */
@Injectable()
export class JwtOptionalGuard extends AuthGuard('jwt') {
  handleRequest<T>(_err: unknown, user: T | false): T | null {
    return user || null;
  }
}
