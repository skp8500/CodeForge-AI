import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { LoginRequestSchema, RegisterRequestSchema } from '@codeforge/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../common/types/jwt-payload.types';
import { AuthService } from './auth.service';
import type { UserRow } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Email/Password ────────────────────────────────────────────────────────

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new account' })
  @ApiBody({
    schema: {
      example: {
        username: 'aryan_coder',
        email: 'aryan@example.com',
        password: 'SecurePass1!',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Verification email sent' })
  @ApiResponse({ status: 409, description: 'Email or username already taken' })
  async register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: unknown,
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    schema: {
      example: { email: 'aryan@example.com', password: 'SecurePass1!' },
    },
  })
  @ApiResponse({ status: 200, description: 'Returns access token; sets refresh cookie' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Email not verified' })
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(body, res);
  }

  @Get('verify-email')
  @Redirect()
  @ApiOperation({ summary: 'Verify email address via token link' })
  @ApiResponse({ status: 302, description: 'Redirects to /login?verified=true' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Query('token') token: string) {
    const url = await this.authService.verifyEmail(token);
    return { url, statusCode: HttpStatus.FOUND };
  }

  // ─── Token management ──────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiOperation({ summary: 'Issue a new access token using the refresh cookie' })
  @ApiResponse({ status: 200, description: 'New access token' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Req() req: Request) {
    return this.authService.refreshToken(req.cookies['refreshToken'] as string | undefined);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('refreshToken')
  @ApiOperation({ summary: 'Logout — blacklists refresh token and clears cookie' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.cookies['refreshToken'] as string | undefined, res);
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  googleAuth() {
    // Passport redirects to Google — this handler is never reached
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request & { user: UserRow },
    @Res() res: Response,
  ) {
    const redirectUrl = await this.authService.oauthLogin(req.user, res);
    res.redirect(redirectUrl);
  }

  // ─── GitHub OAuth ──────────────────────────────────────────────────────────

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth flow' })
  githubAuth() {
    // Passport redirects to GitHub — this handler is never reached
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubCallback(
    @Req() req: Request & { user: UserRow },
    @Res() res: Response,
  ) {
    const redirectUrl = await this.authService.oauthLogin(req.user, res);
    res.redirect(redirectUrl);
  }

  // ─── Session info ──────────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user from access token' })
  @ApiResponse({ status: 200, description: 'JWT payload of the authenticated user' })
  me(@CurrentUser() user: JwtAccessPayload) {
    return user;
  }
}
