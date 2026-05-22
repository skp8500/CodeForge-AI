import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@codeforge/shared';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtAccessPayload } from '../types/jwt-payload.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: JwtAccessPayload | undefined }>();

    if (!user) throw new ForbiddenException('Authentication required');
    if (!required.includes(user.role)) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
