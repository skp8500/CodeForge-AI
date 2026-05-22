import { defineConfig } from 'drizzle-kit';

// drizzle-kit >=0.21 API: dialect + dbCredentials.url (replaces driver + connectionString)
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
