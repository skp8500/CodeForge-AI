import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@codeforge/shared': resolve(dir, '../../packages/shared/src/index.ts'),
      '@codeforge/db': resolve(dir, '../../packages/db/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
