import { Verdict } from '@codeforge/shared';

import {
  cleanupWorkDir,
  createWorkDir,
  runContainer,
  writeSource,
  type RunResult,
} from './docker.client.js';
import type { CompileResult, ExecutionResult, ExecutionRequest, TestCaseResult } from './executor.types.js';
import { LANGUAGE_CONFIGS } from './language.config.js';
import { computeTestVerdict, worstVerdict } from './verdict.js';

// Seccomp profile path — override via SECCOMP_PROFILE_PATH env var
const SECCOMP_PATH = process.env['SECCOMP_PROFILE_PATH'];

// Compiler containers get generous time — they don't count against the time limit
const COMPILE_TIMEOUT_MS = 30_000;
const COMPILE_MEMORY_BYTES = 512 * 1024 * 1024; // 512 MB

export class ExecutorService {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startMs = Date.now();
    const config = LANGUAGE_CONFIGS[request.language];
    const memoryBytes = request.memoryLimitMb * 1024 * 1024;

    let workDir: string;
    try {
      workDir = await createWorkDir(request.submissionId);
      await writeSource(workDir, config.sourceFilename, request.sourceCode);
    } catch (err) {
      return {
        verdict: Verdict.IE,
        testCaseResults: [],
        totalRuntimeMs: Date.now() - startMs,
      };
    }

    try {
      // ── Compilation ──────────────────────────────────────────────────────
      if (config.needsCompilation && config.compilerImage) {
        const compile = await this.compile(config.compilerImage, workDir);
        if (!compile.success) {
          return {
            verdict: Verdict.CE,
            compileResult: compile,
            testCaseResults: [],
            totalRuntimeMs: Date.now() - startMs,
          };
        }
      }

      // ── Execution (sequential for accurate memory readings) ──────────────
      const testCaseResults: TestCaseResult[] = [];

      for (let i = 0; i < request.testCases.length; i++) {
        const tc = request.testCases[i]!;

        const raw = await runContainer({
          image: config.runnerImage,
          workDir,
          stdin: tc.input,
          timeoutMs: request.timeLimitMs,
          memoryBytes,
          seccompProfilePath: SECCOMP_PATH,
        });

        const verdict = computeTestVerdict(raw, tc.expectedOutput);
        testCaseResults.push(this.buildResult(i, verdict, raw));

        // Notify caller of progress after each test case
        await request.onTestCaseComplete?.(i + 1, request.testCases.length);

        if (request.stopOnFirstFail && verdict !== Verdict.AC) {
          break;
        }
      }

      const overall = worstVerdict(testCaseResults.map((r) => r.verdict));

      return {
        verdict: overall,
        testCaseResults,
        totalRuntimeMs: Date.now() - startMs,
      };
    } finally {
      await cleanupWorkDir(workDir!);
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async compile(image: string, workDir: string): Promise<CompileResult> {
    const startMs = Date.now();
    const result = await runContainer({
      image,
      workDir,
      timeoutMs: COMPILE_TIMEOUT_MS,
      memoryBytes: COMPILE_MEMORY_BYTES,
      // No seccomp for compiler containers — they need broader syscall access
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return {
      success: result.exitCode === 0 && !result.timedOut,
      output,
      runtimeMs: Date.now() - startMs,
    };
  }

  private buildResult(index: number, verdict: Verdict, raw: RunResult): TestCaseResult {
    return {
      index,
      verdict,
      runtimeMs: raw.runtimeMs,
      // Memory usage is tracked via OOMKilled; exact MB is best-effort
      memoryMb: raw.oomKilled ? Infinity : 0,
      stdout: raw.stdout,
      stderr: raw.stderr,
    };
  }
}
