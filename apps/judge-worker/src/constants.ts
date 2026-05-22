import { Language } from '@codeforge/shared';

// Re-export from shared so the API and worker always use the same values
export { QUEUE_NAMES } from '@codeforge/shared';

export const DOCKER_IMAGES: Record<Language, string> = {
  [Language.CPP]: 'codeforge-runner-cpp:latest',
  [Language.PYTHON]: 'codeforge-runner-python:latest',
  [Language.JAVA]: 'codeforge-runner-java:latest',
  [Language.JAVASCRIPT]: 'codeforge-runner-node:latest',
};

export const SOURCE_FILENAMES: Record<Language, string> = {
  [Language.CPP]: 'solution.cpp',
  [Language.PYTHON]: 'solution.py',
  [Language.JAVA]: 'Solution.java',
  [Language.JAVASCRIPT]: 'solution.js',
};

export const WORKER_CONCURRENCY = 4;
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024; // 64 MB
export const MAX_RETRY_ATTEMPTS = 3;
export const CONTAINER_PID_LIMIT = 64;
