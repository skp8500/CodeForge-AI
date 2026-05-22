import { Language } from '@codeforge/shared';

export interface LangConfig {
  /** Image used for compilation. null means the language is interpreted. */
  compilerImage: string | null;
  runnerImage: string;
  sourceFilename: string;
  needsCompilation: boolean;
}

export const LANGUAGE_CONFIGS: Record<Language, LangConfig> = {
  [Language.CPP]: {
    compilerImage: 'codeforge-compiler-cpp:latest',
    runnerImage: 'codeforge-runner-cpp:latest',
    sourceFilename: 'solution.cpp',
    needsCompilation: true,
  },
  [Language.PYTHON]: {
    compilerImage: null,
    runnerImage: 'codeforge-runner-python:latest',
    sourceFilename: 'solution.py',
    needsCompilation: false,
  },
  [Language.JAVA]: {
    compilerImage: 'codeforge-compiler-java:latest',
    runnerImage: 'codeforge-runner-java:latest',
    sourceFilename: 'Solution.java',
    needsCompilation: true,
  },
  [Language.JAVASCRIPT]: {
    compilerImage: null,
    runnerImage: 'codeforge-runner-node:latest',
    sourceFilename: 'solution.js',
    needsCompilation: false,
  },
};
