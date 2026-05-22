import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { Response } from 'express';
import type IORedis from 'ioredis';

import { LoginRequestSchema, RegisterRequestSchema, UserRole } from '@codeforge/shared';

import type { JwtAccessPayload, JwtRefreshPayload, JwtVerificationPayload } from '../common/types/jwt-payload.types';
import { MailService } from '../mail/mail.service';
import { REDIS_TOKEN } from '../redis/redis.module';
import type { OAuthProfile } from '../users/users.service';
import { UsersService } from '../users/users.service';
import type { TokenPair, UserRow } from './auth.types';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    @Inject(REDIS_TOKEN) private readonly redis: IORedis,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(body: unknown): Promise<{ message: string }> {
    const dto = RegisterRequestSchema.parse(body);

    const [byEmail, byUsername] = await Promise.all([
      this.usersService.findByEmail(dto.email),
      this.usersService.findByUsername(dto.username),
    ]);
    if (byEmail) throw new ConflictException('Email already registered');
    if (byUsername) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: UserRole.USER,
      isVerified: false,
    });

    const token = await this.signVerificationToken(user.id);
    await this.mailService.sendVerificationEmail(user.email, token);

    return { message: 'Verification email sent. Please check your inbox.' };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(
    body: unknown,
    res: Response,
  ): Promise<{ accessToken: string }> {
    const dto = LoginRequestSchema.parse(body);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.isVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);
    this.setRefreshCookie(res, refreshToken);

    return { accessToken };
  }

  // ─── Email verification ────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<string> {
    let payload: JwtVerificationPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtVerificationPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification link');
    }

    if (payload.type !== 'email-verification') {
      throw new BadRequestException('Invalid token type');
    }

    await this.usersService.markVerified(payload.sub);

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    return `${frontendUrl}/login?verified=true`;
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async refreshToken(cookieToken: string | undefined): Promise<{ accessToken: string }> {
    if (!cookieToken) throw new UnauthorizedException('No refresh token provided');

    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(cookieToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const blacklisted = await this.redis.get(`blacklist:jti:${payload.jti}`);
    if (blacklisted) throw new UnauthorizedException('Token has been revoked');

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role } satisfies Omit<JwtAccessPayload, 'iat' | 'exp'>,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    return { accessToken };
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(cookieToken: string | undefined, res: Response): Promise<void> {
    if (cookieToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(cookieToken, {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        });

        const now = Math.floor(Date.now() / 1000);
        const remaining = (payload.exp ?? 0) - now;
        if (remaining > 0) {
          await this.redis.set(`blacklist:jti:${payload.jti}`, '1', 'EX', remaining);
        }
      } catch {
        // Token already expired or malformed — still clear the cookie
      }
    }

    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  // ─── OAuth ─────────────────────────────────────────────────────────────────

  async oauthLogin(user: UserRow, res: Response): Promise<string> {
    const { accessToken, refreshToken } = await this.generateTokens(user);
    this.setRefreshCookie(res, refreshToken);

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    return `${frontendUrl}/auth/callback?token=${accessToken}`;
  }

  async validateOAuthUser(profile: OAuthProfile): Promise<UserRow> {
    return this.usersService.upsertOAuthUser(profile);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async generateTokens(user: UserRow): Promise<TokenPair> {
    const jti = randomUUID();
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role } satisfies Omit<JwtAccessPayload, 'iat' | 'exp'>,
        { secret: accessSecret, expiresIn: '15m' },
      ),
      this.jwtService.signAsync(
        { sub: user.id, jti } satisfies Omit<JwtRefreshPayload, 'iat' | 'exp'>,
        { secret: refreshSecret, expiresIn: '7d' },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions());
  }

  private async signVerificationToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, type: 'email-verification' } satisfies Omit<JwtVerificationPayload, 'iat' | 'exp'>,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '24h',
      },
    );
  }

  private cookieOptions() {
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: REFRESH_TTL_SECONDS * 1000,
      path: '/',
    };
  }
}
