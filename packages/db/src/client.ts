import { db, client, type Db } from './index.js';

export function getDb(): Db {
  return db;
}

export async function closeDb(): Promise<void> {
  await client.end();
}

export type { Db };
