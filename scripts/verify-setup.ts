import * as dotenv from 'dotenv';
dotenv.config();

import Docker from 'dockerode';
import Redis from 'ioredis';
import postgres from 'postgres';

const checks: { name: string; status: 'pass' | 'fail'; message: string }[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    checks.push({ name, status: 'pass', message: 'OK' });
  } catch (err: any) {
    checks.push({ name, status: 'fail', message: err.message });
  }
}

async function main() {
  console.log('\n🔍 CodeForge AI — Setup Verification\n');
  const dockerSocketPath =
    process.env.DOCKER_SOCKET_PATH ||
    (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock');

  await check('Environment: DATABASE_URL', async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  });
  await check('Environment: REDIS_URL', async () => {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not set');
  });
  await check('Environment: OPENAI_API_KEY', async () => {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'REPLACE_ME') {
      throw new Error('OPENAI_API_KEY is not set');
    }
  });
  await check('Environment: JWT secrets', async () => {
    if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT secrets are not set');
    }
  });

  await check('PostgreSQL: connection', async () => {
    const sql = postgres(process.env.DATABASE_URL!);
    await sql`SELECT 1`;
    await sql.end();
  });
  await check('PostgreSQL: tables exist', async () => {
    const sql = postgres(process.env.DATABASE_URL!);
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const names = tables.map((t: any) => t.table_name);
    const required = ['users', 'problems', 'test_cases', 'submissions'];
    const missing = required.filter((t) => !names.includes(t));
    await sql.end();
    if (missing.length > 0) throw new Error(`Missing tables: ${missing.join(', ')} — run: make migrate`);
  });
  await check('PostgreSQL: seed data exists', async () => {
    const sql = postgres(process.env.DATABASE_URL!);
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM users`;
    await sql.end();
    if (Number(count) === 0) throw new Error('No users found — run: make seed');
  });

  await check('Redis: connection', async () => {
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.ping();
    redis.disconnect();
  });

  await check('Docker: daemon running', async () => {
    const docker = new Docker({ socketPath: dockerSocketPath });
    await docker.ping();
  });
  await check('Docker: judge images built', async () => {
    const docker = new Docker({ socketPath: dockerSocketPath });
    const images = await docker.listImages();
    const tags = images.flatMap((img: any) => img.RepoTags || []);
    const required = ['codeforge/runner-cpp:latest', 'codeforge/runner-python:latest'];
    const missing = required.filter((img) => !tags.includes(img));
    if (missing.length > 0) {
      throw new Error(`Missing images: ${missing.join(', ')} — run: make build-judge-images`);
    }
  });

  console.log('Results:');
  console.log('─'.repeat(50));
  let allPassed = true;
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✓' : '✗';
    const color = c.status === 'pass' ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${icon}\x1b[0m ${c.name}: ${c.message}`);
    if (c.status === 'fail') allPassed = false;
  }
  console.log('─'.repeat(50));

  if (allPassed) {
    console.log('\n✅ All checks passed! Run: make dev\n');
  } else {
    console.log('\n❌ Some checks failed. Fix the issues above then re-run.\n');
    process.exit(1);
  }
}

void main();
