import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';

import type { UserRow } from '../auth.types';
import { UsersService } from '../../users/users.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: `${config.getOrThrow<string>('NEXT_PUBLIC_API_URL')}/api/v1/auth/github/callback`,
      // user:email scope ensures we always receive the primary email
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<UserRow> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException(
        'No email address from GitHub. Please make your email public or grant user:email scope.',
      );
    }

    return this.usersService.upsertOAuthUser({
      email,
      username: profile.username ?? email.split('@')[0],
      oauthProvider: 'github',
      oauthId: profile.id,
    });
  }
}
