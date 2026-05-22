import type { UserRole } from '@codeforge/shared';

export interface JwtAccessPayload {
  /** userId */
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  /** userId */
  sub: string;
  /** JWT ID — stored in Redis on logout for blacklisting */
  jti: string;
  iat?: number;
  exp?: number;
}

export interface JwtVerificationPayload {
  /** userId */
  sub: string;
  type: 'email-verification';
  iat?: number;
  exp?: number;
}
