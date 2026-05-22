import type { Language, Verdict } from '@codeforge/shared';

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface ExecutionRequest {
  submissionId: string;
  language: Language;
  sourceCode: string;
  testCases: TestCase[];
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Stop running test cases after the first non-AC verdict (contest mode). */
  stopOnFirstFail?: boolean;
}

export interface TestCaseResult {
  index: number;
  verdict: Verdict;
  runtimeMs: number;
  memoryMb: number;
  stdout: string;
  stderr: string;
}

export interface CompileResult {
  success: boolean;
  output: string;
  runtimeMs: number;
}

export interface ExecutionResult {
  verdict: Verdict;
  compileResult?: CompileResult;
  testCaseResults: TestCaseResult[];
  totalRuntimeMs: number;
}
