import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { UserRole } from '@codeforge/shared';

import { MailService } from '../mail/mail.service';
import { REDIS_TOKEN } from '../redis/redis.module';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockAdminUser = {
  id: 'user-uuid-1',
  username: 'aryan',
  email: 'aryan@example.com',
  passwordHash: '$2b$12$hashedpassword',
  oauthProvider: null,
  oauthId: null,
  role: UserRole.USER,
  rating: 1200,
  isVerified: true,
  createdAt: new Date(),
  lastActiveAt: null,
};

const mockUnverifiedUser = {
  ...mockAdminUser,
  id: 'user-uuid-2',
  email: 'unverified@example.com',
  isVerified: false,
};

const VALID_REGISTER_BODY = {
  username: 'newuser',
  email: 'new@example.com',
  password: 'SecurePass1!',
};

const VALID_LOGIN_BODY = {
  email: 'aryan@example.com',
  password: 'PlainPassword1!',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUsersService: jest.Mocked<UsersService> = {
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  markVerified: jest.fn(),
  upsertOAuthUser: jest.fn(),
} as unknown as jest.Mocked<UsersService>;

const mockJwtService: jest.Mocked<JwtService> = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
} as unknown as jest.Mocked<JwtService>;

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      FRONTEND_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    };
    if (!(key in map)) throw new Error(`Config key "${key}" not found`);
    return map[key];
  }),
  get: jest.fn((key: string, fallback?: unknown) => {
    const map: Record<string, string> = { NODE_ENV: 'test' };
    return map[key] ?? fallback;
  }),
} as unknown as jest.Mocked<ConfigService>;

const mockMailService: jest.Mocked<MailService> = {
  sendVerificationEmail: jest.fn(),
} as unknown as jest.Mocked<MailService>;

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockResponse = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.signAsync.mockReset();
    mockJwtService.verifyAsync.mockReset();

    // Manually construct so we can inject the mocks by value
    authService = new AuthService(
      mockUsersService as unknown as UsersService,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
      mockMailService as unknown as MailService,
      mockRedis as never,
    );
  });

  // ─── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates the user and sends a verification email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ ...mockAdminUser, isVerified: false });
      mockJwtService.signAsync.mockResolvedValue('verification-token');
      mockMailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await authService.register(VALID_REGISTER_BODY);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: VALID_REGISTER_BODY.email,
          username: VALID_REGISTER_BODY.username,
          isVerified: false,
          role: UserRole.USER,
        }),
      );
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockAdminUser.email,
        'verification-token',
      );
      expect(result.message).toContain('Verification email sent');
    });

    it('throws ConflictException when email is already registered', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockAdminUser);
      mockUsersService.findByUsername.mockResolvedValue(null);

      await expect(authService.register(VALID_REGISTER_BODY)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when username is already taken', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(mockAdminUser);

      await expect(authService.register(VALID_REGISTER_BODY)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('throws ZodError for invalid body (missing password special char)', async () => {
      await expect(
        authService.register({ username: 'x', email: 'x@x.com', password: 'weakpass' }),
      ).rejects.toThrow();
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(() => {
      // Provide a real bcrypt hash for 'PlainPassword1!'
      // We use jest.mock for bcrypt at the top level in a real test env,
      // but here we verify the full flow with a stub hash approach.
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
    });

    it('returns accessToken and sets refresh cookie for valid credentials', async () => {
      // Use a pre-computed bcrypt hash of 'PlainPassword1!'
      const realHash = await import('bcrypt').then((b) =>
        b.hash('PlainPassword1!', 1),
      );
      const userWithHash = { ...mockAdminUser, passwordHash: realHash };

      mockUsersService.findByEmail.mockResolvedValue(userWithHash);

      const result = await authService.login(VALID_LOGIN_BODY, mockResponse);

      expect(result).toEqual({
        accessToken: 'access-token',
        user: expect.objectContaining({
          id: userWithHash.id,
          email: userWithHash.email,
          username: userWithHash.username,
          role: userWithHash.role,
          rating: userWithHash.rating,
        }),
      });
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('throws UnauthorizedException when user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(authService.login(VALID_LOGIN_BODY, mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const realHash = await import('bcrypt').then((b) => b.hash('DifferentPass1!', 1));
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockAdminUser,
        passwordHash: realHash,
      });

      await expect(authService.login(VALID_LOGIN_BODY, mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user has no password (OAuth account)', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockAdminUser,
        passwordHash: null,
      });

      await expect(authService.login(VALID_LOGIN_BODY, mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when email is not verified', async () => {
      const realHash = await import('bcrypt').then((b) =>
        b.hash('PlainPassword1!', 1),
      );
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUnverifiedUser,
        passwordHash: realHash,
      });

      await expect(authService.login(VALID_LOGIN_BODY, mockResponse)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('marks the user as verified and returns the frontend redirect URL', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        type: 'email-verification',
      });
      mockUsersService.markVerified.mockResolvedValue(undefined);

      const url = await authService.verifyEmail('valid-token');

      expect(mockUsersService.markVerified).toHaveBeenCalledWith('user-uuid-1');
      expect(url).toBe('http://localhost:3000/login?verified=true');
    });

    it('throws BadRequestException for an expired or invalid token', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(authService.verifyEmail('bad-token')).rejects.toThrow(
        'Invalid or expired verification link',
      );
    });

    it('throws BadRequestException when token type is not email-verification', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        type: 'access', // wrong type
      });

      await expect(authService.verifyEmail('wrong-type-token')).rejects.toThrow(
        'Invalid token type',
      );
    });
  });

  // ─── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('issues a new access token for a valid, non-blacklisted refresh token', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        jti: 'jti-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockRedis.get.mockResolvedValue(null); // not blacklisted
      mockUsersService.findById.mockResolvedValue(mockAdminUser);
      mockJwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await authService.refreshToken('valid-refresh-cookie');

      expect(mockRedis.get).toHaveBeenCalledWith('blacklist:jti:jti-abc');
      expect(result).toEqual({ accessToken: 'new-access-token' });
    });

    it('throws UnauthorizedException when no cookie is present', async () => {
      await expect(authService.refreshToken(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a blacklisted JTI', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        jti: 'blacklisted-jti',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockRedis.get.mockResolvedValue('1'); // blacklisted

      await expect(authService.refreshToken('revoked-token')).rejects.toThrow(
        'Token has been revoked',
      );
    });

    it('throws UnauthorizedException for a malformed refresh token', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(authService.refreshToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'deleted-user',
        jti: 'jti-xyz',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockRedis.get.mockResolvedValue(null);
      mockUsersService.findById.mockResolvedValue(null);

      await expect(authService.refreshToken('orphaned-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('blacklists the JTI in Redis and clears the cookie', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-1',
        jti: 'jti-logout',
        exp: futureExp,
      });

      await authService.logout('valid-refresh-token', mockResponse);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'blacklist:jti:jti-logout',
        '1',
        'EX',
        expect.any(Number),
      );
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
    });

    it('still clears the cookie even when the token is already expired', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await authService.logout('expired-token', mockResponse);

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
    });

    it('clears the cookie gracefully when no token is provided', async () => {
      await authService.logout(undefined, mockResponse);

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalled();
    });
  });

  // ─── generateTokens ─────────────────────────────────────────────────────────

  describe('generateTokens', () => {
    it('returns an access token and a refresh token', async () => {
      mockJwtService.signAsync.mockImplementation(async (_payload, options) => {
        return options?.expiresIn === '15m' ? 'access-token' : 'refresh-token';
      });

      const tokens = await authService.generateTokens(mockAdminUser);

      expect(tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);

      // Access token signed with access secret, 15m expiry
      expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sub: mockAdminUser.id }),
        expect.objectContaining({ expiresIn: '15m' }),
      );
      // Refresh token signed with refresh secret, 7d expiry, includes jti
      expect(mockJwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ sub: mockAdminUser.id, jti: expect.any(String) }),
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });
  });
});
