import { drizzle } from 'drizzle-orm/postgres-js';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export const client = postgres(databaseUrl, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export * from './schema.js';
export type { InferSelectModel, InferInsertModel };
export type Db = typeof db;
