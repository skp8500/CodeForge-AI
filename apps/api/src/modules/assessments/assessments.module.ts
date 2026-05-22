import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../../mail/mail.module';
import { UsersModule } from '../../users/users.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    UsersModule,
    // JwtModule with no default secret — each signAsync/verifyAsync call supplies its own
    JwtModule.register({}),
  ],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
