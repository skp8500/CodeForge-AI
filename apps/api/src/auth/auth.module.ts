import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubStrategy } from './strategies/github.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // JwtModule is registered without a default secret so that each signAsync/
    // verifyAsync call can supply its own secret (access vs. refresh vs. verify).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (_config: ConfigService) => ({
        // No global secret — each call specifies its own.
        signOptions: { issuer: 'codeforge-api' },
      }),
    }),
    UsersModule,
    MailModule,
    RedisModule,
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy, GithubStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
