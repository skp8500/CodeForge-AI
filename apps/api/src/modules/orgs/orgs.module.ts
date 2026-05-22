import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../../mail/mail.module';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
