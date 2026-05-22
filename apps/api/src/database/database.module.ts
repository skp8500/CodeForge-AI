import { Module } from '@nestjs/common';
import { getDb } from '@codeforge/db';

export const DB_TOKEN = 'DB';

@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => getDb(),
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
