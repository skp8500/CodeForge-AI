import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../redis/redis.module';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
