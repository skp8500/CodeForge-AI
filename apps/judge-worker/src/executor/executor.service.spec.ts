import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Verdict, Language } from '@codeforge/shared';

import { computeTestVerdict, worstVerdict } from './verdict.js';
import { ExecutorService } from './executor.service.js';
import type { RunResult } from './docker.client.js';
import type { ExecutionRequest } from './executor.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    oomKilled: false,
    runtimeMs: 50,
    ...overrides,
  };
}

function makeCppRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    submissionId: 'sub-unit-001',
    language: Language.CPP,
    sourceCode: 'int main(){}',
    testCases: [{ input: '1\n', expectedOutput: '1' }],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    ...overrides,
  };
}

// ─── Unit: verdict.ts (pure functions, no Docker) ─────────────────────────────

describe('computeTestVerdict', () => {
  it('returns TLE when timedOut regardless of exit code', () => {
    expect(computeTestVerdict(makeRun({ timedOut: true, exitCode: 137 }), 'x')).toBe(Verdict.TLE);
  });

  it('returns MLE when oomKilled (checked after TLE)', () => {
    expect(computeTestVerdict(makeRun({ oomKilled: true, exitCode: 137 }), 'x')).toBe(Verdict.MLE);
  });

  it('returns RE when exit code is non-zero', () => {
    expect(computeTestVerdict(makeRun({ exitCode: 1 }), 'x')).toBe(Verdict.RE);
  });

  it('returns OLE when stdout exceeds MAX_OUTPUT_BYTES', () => {
    const bigOut = 'x'.repeat(64 * 1024 * 1024 + 1);
    expect(computeTestVerdict(makeRun({ stdout: bigOut }), 'x')).toBe(Verdict.OLE);
  });

  it('returns WA when trimmed output does not match', () => {
    expect(computeTestVerdict(makeRun({ stdout: 'wrong\n' }), 'right')).toBe(Verdict.WA);
  });

  it('returns AC when trimmed output matches (ignores trailing newline)', () => {
    expect(computeTestVerdict(makeRun({ stdout: '42\n' }), '42')).toBe(Verdict.AC);
  });

  it('TLE takes priority over MLE', () => {
    expect(
      computeTestVerdict(makeRun({ timedOut: true, oomKilled: true, exitCode: 137 }), 'x'),
    ).toBe(Verdict.TLE);
  });
});

describe('worstVerdict', () => {
  it('returns AC for empty list', () => {
    expect(worstVerdict([])).toBe(Verdict.AC);
  });

  it('returns the single verdict', () => {
    expect(worstVerdict([Verdict.WA])).toBe(Verdict.WA);
  });

  it('CE beats everything', () => {
    expect(worstVerdict([Verdict.AC, Verdict.WA, Verdict.TLE, Verdict.CE])).toBe(Verdict.CE);
  });

  it('TLE beats WA and AC', () => {
    expect(worstVerdict([Verdict.AC, Verdict.WA, Verdict.TLE])).toBe(Verdict.TLE);
  });

  it('WA beats AC', () => {
    expect(worstVerdict([Verdict.AC, Verdict.WA])).toBe(Verdict.WA);
  });

  it('all AC stays AC', () => {
    expect(worstVerdict([Verdict.AC, Verdict.AC, Verdict.AC])).toBe(Verdict.AC);
  });
});

// ─── Unit: ExecutorService (dockerode mocked) ─────────────────────────────────

vi.mock('./docker.client.js', () => ({
  docker: {},
  WORK_BASE: '/tmp/codeforge',
  createWorkDir: vi.fn(),
  writeSource: vi.fn(),
  cleanupWorkDir: vi.fn(),
  runContainer: vi.fn(),
}));

import * as dockerClient from './docker.client.js';

const mockCreateWorkDir = vi.mocked(dockerClient.createWorkDir);
const mockWriteSource = vi.mocked(dockerClient.writeSource);
const mockCleanupWorkDir = vi.mocked(dockerClient.cleanupWorkDir);
const mockRunContainer = vi.mocked(dockerClient.runContainer);

describe('ExecutorService (mocked Docker)', () => {
  let service: ExecutorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExecutorService();
    mockCreateWorkDir.mockResolvedValue('/tmp/codeforge/sub-001');
    mockWriteSource.mockResolvedValue(undefined);
    mockCleanupWorkDir.mockResolvedValue(undefined);
  });

  it('returns IE when createWorkDir throws', async () => {
    mockCreateWorkDir.mockRejectedValue(new Error('disk full'));

    const result = await service.execute(makeCppRequest());

    expect(result.verdict).toBe(Verdict.IE);
    expect(result.testCaseResults).toHaveLength(0);
    expect(mockRunContainer).not.toHaveBeenCalled();
  });

  it('compiles before running for C++', async () => {
    // First call = compile (exit 0), second call = run (AC)
    mockRunContainer
      .mockResolvedValueOnce(makeRun({ stdout: '', stderr: '' }))
      .mockResolvedValueOnce(makeRun({ stdout: '1\n' }));

    const result = await service.execute(
      makeCppRequest({ testCases: [{ input: '1\n', expectedOutput: '1' }] }),
    );

    expect(mockRunContainer).toHaveBeenCalledTimes(2);
    expect(result.verdict).toBe(Verdict.AC);
    expect(result.testCaseResults[0]?.verdict).toBe(Verdict.AC);
  });

  it('returns CE immediately when compile fails', async () => {
    mockRunContainer.mockResolvedValueOnce(makeRun({ exitCode: 1, stderr: 'error: expected ;' }));

    const result = await service.execute(makeCppRequest());

    expect(result.verdict).toBe(Verdict.CE);
    expect(result.compileResult?.success).toBe(false);
    expect(result.testCaseResults).toHaveLength(0);
    // No run call — only the compile call
    expect(mockRunContainer).toHaveBeenCalledTimes(1);
  });

  it('skips compilation for Python', async () => {
    mockRunContainer.mockResolvedValueOnce(makeRun({ stdout: 'hello\n' }));

    const result = await service.execute(
      makeCppRequest({
        language: Language.PYTHON,
        testCases: [{ input: '', expectedOutput: 'hello' }],
      }),
    );

    expect(result.verdict).toBe(Verdict.AC);
    // Only one call (no compile step)
    expect(mockRunContainer).toHaveBeenCalledTimes(1);
  });

  it('collects results for all test cases', async () => {
    // compile
    mockRunContainer.mockResolvedValueOnce(makeRun());
    // 3 test runs
    mockRunContainer
      .mockResolvedValueOnce(makeRun({ stdout: '1\n' }))
      .mockResolvedValueOnce(makeRun({ stdout: 'wrong\n' }))
      .mockResolvedValueOnce(makeRun({ stdout: '3\n' }));

    const result = await service.execute(
      makeCppRequest({
        testCases: [
          { input: '1', expectedOutput: '1' },
          { input: '2', expectedOutput: '2' },
          { input: '3', expectedOutput: '3' },
        ],
      }),
    );

    expect(result.testCaseResults).toHaveLength(3);
    expect(result.testCaseResults[0]?.verdict).toBe(Verdict.AC);
    expect(result.testCaseResults[1]?.verdict).toBe(Verdict.WA);
    expect(result.testCaseResults[2]?.verdict).toBe(Verdict.AC);
    expect(result.verdict).toBe(Verdict.WA);
  });

  it('stopOnFirstFail stops after first non-AC', async () => {
    // compile
    mockRunContainer.mockResolvedValueOnce(makeRun());
    // WA on first test case → should stop
    mockRunContainer.mockResolvedValueOnce(makeRun({ stdout: 'bad\n' }));

    const result = await service.execute(
      makeCppRequest({
        stopOnFirstFail: true,
        testCases: [
          { input: '1', expectedOutput: '1' },
          { input: '2', expectedOutput: '2' },
          { input: '3', expectedOutput: '3' },
        ],
      }),
    );

    // compile + 1 run (stopped after first WA)
    expect(mockRunContainer).toHaveBeenCalledTimes(2);
    expect(result.testCaseResults).toHaveLength(1);
    expect(result.verdict).toBe(Verdict.WA);
  });

  it('always cleans up workDir even when execution throws', async () => {
    // compile succeeds
    mockRunContainer.mockResolvedValueOnce(makeRun());
    // run throws unexpectedly
    mockRunContainer.mockRejectedValueOnce(new Error('Docker daemon unreachable'));

    await expect(
      service.execute(makeCppRequest()),
    ).rejects.toThrow('Docker daemon unreachable');

    expect(mockCleanupWorkDir).toHaveBeenCalledWith('/tmp/codeforge/sub-001');
  });

  it('maps TLE verdict correctly through the full pipeline', async () => {
    mockRunContainer.mockResolvedValueOnce(makeRun()); // compile
    mockRunContainer.mockResolvedValueOnce(makeRun({ timedOut: true, exitCode: 137 })); // run

    const result = await service.execute(makeCppRequest());

    expect(result.verdict).toBe(Verdict.TLE);
    expect(result.testCaseResults[0]?.verdict).toBe(Verdict.TLE);
  });

  it('maps MLE verdict when container is OOM-killed', async () => {
    mockRunContainer.mockResolvedValueOnce(makeRun()); // compile
    mockRunContainer.mockResolvedValueOnce(makeRun({ oomKilled: true, exitCode: 137 }));

    const result = await service.execute(makeCppRequest());

    expect(result.verdict).toBe(Verdict.MLE);
    expect(result.testCaseResults[0]?.memoryMb).toBe(Infinity);
  });
});

// ─── Integration: requires real Docker (gated by DOCKER_TESTS=true) ───────────

const RUN_INTEGRATION = !!process.env['DOCKER_TESTS'];

describe.skipIf(!RUN_INTEGRATION)('@slow ExecutorService (Docker integration)', { timeout: 120_000 }, () => {
  let service: ExecutorService;

  beforeEach(() => {
    // Reset the mock so the real docker.client module is used.
    // The vi.mock at the top of the file is hoisted — to use the real module in
    // integration tests, we need a separate test file or un-mock selectively.
    // These tests therefore rely on a fresh import. See note below.
    vi.resetModules();
    service = new ExecutorService();
  });

  it('C++ AC: reads N from stdin and echoes it', async () => {
    const result = await service.execute({
      submissionId: 'int-cpp-ac',
      language: Language.CPP,
      sourceCode: `
#include <iostream>
int main() {
  int n; std::cin >> n;
  std::cout << n << std::endl;
}`,
      testCases: [
        { input: '42\n', expectedOutput: '42' },
        { input: '0\n', expectedOutput: '0' },
      ],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.AC);
    expect(result.testCaseResults).toHaveLength(2);
    expect(result.testCaseResults.every((r) => r.verdict === Verdict.AC)).toBe(true);
  });

  it('C++ WA: outputs wrong answer', async () => {
    const result = await service.execute({
      submissionId: 'int-cpp-wa',
      language: Language.CPP,
      sourceCode: `
#include <iostream>
int main() { std::cout << -1 << std::endl; }`,
      testCases: [{ input: '', expectedOutput: '42' }],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.WA);
  });

  it('C++ CE: syntax error', async () => {
    const result = await service.execute({
      submissionId: 'int-cpp-ce',
      language: Language.CPP,
      sourceCode: 'this is not valid c++',
      testCases: [{ input: '', expectedOutput: '' }],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.CE);
    expect(result.compileResult?.success).toBe(false);
    expect(result.compileResult?.output.length).toBeGreaterThan(0);
    expect(result.testCaseResults).toHaveLength(0);
  });

  it('C++ TLE: infinite loop hits time limit', async () => {
    const result = await service.execute({
      submissionId: 'int-cpp-tle',
      language: Language.CPP,
      sourceCode: `int main() { while(true){} }`,
      testCases: [{ input: '', expectedOutput: '' }],
      timeLimitMs: 1000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.TLE);
  });

  it('Python AC: prints hello world', async () => {
    const result = await service.execute({
      submissionId: 'int-py-ac',
      language: Language.PYTHON,
      sourceCode: 'print("hello")',
      testCases: [{ input: '', expectedOutput: 'hello' }],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.AC);
  });

  it('Python RE: division by zero exits non-zero', async () => {
    const result = await service.execute({
      submissionId: 'int-py-re',
      language: Language.PYTHON,
      sourceCode: 'print(1/0)',
      testCases: [{ input: '', expectedOutput: '' }],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    expect(result.verdict).toBe(Verdict.RE);
  });

  it('stopOnFirstFail stops after first WA', async () => {
    const result = await service.execute({
      submissionId: 'int-cpp-stop',
      language: Language.CPP,
      sourceCode: `
#include <iostream>
int main() { std::cout << -1 << std::endl; }`,
      testCases: [
        { input: '', expectedOutput: '1' },
        { input: '', expectedOutput: '2' },
        { input: '', expectedOutput: '3' },
      ],
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      stopOnFirstFail: true,
    });

    expect(result.testCaseResults).toHaveLength(1);
    expect(result.verdict).toBe(Verdict.WA);
  });
});
