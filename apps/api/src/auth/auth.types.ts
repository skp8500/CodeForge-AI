import type { users } from '@codeforge/db';

export type UserRow = typeof users.$inferSelect;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
