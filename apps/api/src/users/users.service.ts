import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import type { Db } from '@codeforge/db';
import { users } from '@codeforge/db';
import { UserRole } from '@codeforge/shared';

import { DB_TOKEN } from '../database/database.module';

type UserRow = typeof users.$inferSelect;

export interface CreateUserData {
  username: string;
  email: string;
  passwordHash: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
  role?: UserRole;
  isVerified?: boolean;
}

export interface OAuthProfile {
  email: string;
  username: string;
  oauthProvider: string;
  oauthId: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return result[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async create(data: CreateUserData): Promise<UserRow> {
    try {
      const [user] = await this.db
        .insert(users)
        .values({
          username: data.username,
          email: data.email,
          passwordHash: data.passwordHash,
          oauthProvider: data.oauthProvider ?? null,
          oauthId: data.oauthId ?? null,
          role: data.role ?? UserRole.USER,
          isVerified: data.isVerified ?? false,
        })
        .returning();
      return user;
    } catch (err: unknown) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictException('Username or email already taken');
      }
      throw err;
    }
  }

  async findOrCreateGuest(email: string): Promise<UserRow> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;

    const baseUsername = email
      .split('@')[0]
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 40);
    const username = await this.uniqueUsername(baseUsername || 'candidate');

    return this.create({
      username,
      email,
      passwordHash: null,
      role: UserRole.GUEST,
      isVerified: false,
    });
  }

  async markVerified(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isVerified: true })
      .where(eq(users.id, id));
  }

  async upsertOAuthUser(profile: OAuthProfile): Promise<UserRow> {
    const existing = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, profile.email),
          eq(users.oauthId, profile.oauthId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Link the OAuth provider to the existing account if not already linked
      if (!existing[0].oauthProvider) {
        const [updated] = await this.db
          .update(users)
          .set({
            oauthProvider: profile.oauthProvider,
            oauthId: profile.oauthId,
            isVerified: true,
          })
          .where(eq(users.id, existing[0].id))
          .returning();
        return updated;
      }
      return existing[0];
    }

    // New OAuth user — generate a unique username
    const baseUsername = profile.email
      .split('@')[0]
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 40);
    const username = await this.uniqueUsername(baseUsername);

    return this.create({
      username,
      email: profile.email,
      passwordHash: null,
      oauthProvider: profile.oauthProvider,
      oauthId: profile.oauthId,
      isVerified: true,
    });
  }

  private async uniqueUsername(base: string): Promise<string> {
    const candidate = base || 'user';
    const existing = await this.findByUsername(candidate);
    if (!existing) return candidate;
    // Append a random 4-char hex suffix to guarantee uniqueness
    return `${candidate.slice(0, 44)}_${Math.random().toString(16).slice(2, 6)}`;
  }
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}
