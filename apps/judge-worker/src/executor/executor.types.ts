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
  /**
   * Called after each test case completes. Useful for streaming progress to
   * the client without waiting for all tests to finish.
   * @param completed - number of test cases finished so far (1-based)
   * @param total     - total number of test cases
   */
  onTestCaseComplete?: (completed: number, total: number) => void | Promise<void>;
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
