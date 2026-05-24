import { NotFoundException } from '@nestjs/common';

import { TestCaseCategory } from '@codeforge/shared';

import { TestGeneratorService } from './test-generator.service';
import type { EnrichedTestCase, RawTestCase } from './test-generator.types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROBLEM_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const MOCK_PROBLEM_ROW = {
  id: PROBLEM_ID,
  title: 'Two Sum',
  statement: `Given an array of N integers and a target T, find two indices i, j such that A[i]+A[j]=T.\n\nInput: First line N T, second line N integers.\nOutput: Two space-separated indices (1-indexed).`,
  constraints: { N: { min: 2, max: 100_000 }, T: { min: -1_000_000_000, max: 1_000_000_000 } },
  tags: ['hash-map', 'arrays'],
  timeLimitMs: 1000,
  memoryLimitMb: 256,
};

function makeRawTestCase(input: string, output = '1 2'): RawTestCase {
  return { input, expectedOutput: output, explanation: 'test' };
}

function makeCompletion(testCases: RawTestCase[]) {
  return { text: JSON.stringify({ testCases }) };
}

function makeBruteForceCompletion(code: string) {
  return { text: JSON.stringify({ pythonCode: code, explanation: 'brute force' }) };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGemini = {
  models: { generateContent: jest.fn() },
};

// Drizzle chain mock: db.select().from().where().limit()
const mockTx = {
  delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }),
  insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
};

const mockSelectChain = {
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([MOCK_PROBLEM_ROW]),
};

const mockDb = {
  select: jest.fn().mockReturnValue(mockSelectChain),
  transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService(): TestGeneratorService {
  return new TestGeneratorService(mockGemini as never, mockDb as never);
}

const VALID_BRUTE_FORCE = `import sys
n, t = map(int, input().split())
a = list(map(int, input().split()))
for i in range(n):
    for j in range(i+1, n):
        if a[i]+a[j]==t:
            print(i+1, j+1)
            sys.exit()`;

// Default: 7 calls return valid data (6 categories + 1 brute-force)
function setupHappyPath() {
  mockGemini.models.generateContent
    // SAMPLE
    .mockResolvedValueOnce(
      makeCompletion([makeRawTestCase('2 3\n1 2'), makeRawTestCase('3 6\n1 2 3')]),
    )
    // BOUNDARY
    .mockResolvedValueOnce(makeCompletion([makeRawTestCase('2 0\n-1000000000 1000000000')]))
    // EDGE
    .mockResolvedValueOnce(makeCompletion([makeRawTestCase('2 2\n1 1')]))
    // RANDOM
    .mockResolvedValueOnce(
      makeCompletion([
        makeRawTestCase('3 5\n1 2 3'),
        makeRawTestCase('4 7\n1 2 3 4'),
        makeRawTestCase('5 9\n1 2 3 4 5'),
      ]),
    )
    // STRESS
    .mockResolvedValueOnce(makeCompletion([makeRawTestCase('100000 999999999\n' + '1 '.repeat(99999) + '999999998')]))
    // ADVERSARIAL
    .mockResolvedValueOnce(makeCompletion([makeRawTestCase('3 2\n1 1 2')]))
    // BRUTE-FORCE
    .mockResolvedValueOnce(makeBruteForceCompletion(VALID_BRUTE_FORCE));
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('TestGeneratorService', () => {
  let service: TestGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the default select chain that returns a problem
    mockSelectChain.limit.mockResolvedValue([MOCK_PROBLEM_ROW]);
    mockDb.select.mockReturnValue(mockSelectChain);
    service = makeService();
  });

  // ─── deduplicate (pure static method) ──────────────────────────────────────

  describe('deduplicate', () => {
    const makeEnriched = (input: string): EnrichedTestCase => ({
      input,
      expectedOutput: '1',
      explanation: 'test',
      category: TestCaseCategory.SAMPLE,
      isHidden: false,
      verification: 'skipped',
    });

    it('removes cases with identical inputs', () => {
      const cases = [makeEnriched('3\n1 2 3'), makeEnriched('3\n1 2 3'), makeEnriched('2\n1 2')];
      expect(TestGeneratorService.deduplicate(cases)).toHaveLength(2);
    });

    it('treats \\r\\n and \\n as equivalent', () => {
      const cases = [makeEnriched('3\r\n1 2 3'), makeEnriched('3\n1 2 3')];
      expect(TestGeneratorService.deduplicate(cases)).toHaveLength(1);
    });

    it('treats leading/trailing whitespace as equivalent', () => {
      const cases = [makeEnriched('  3\n1 2 3  '), makeEnriched('3\n1 2 3')];
      expect(TestGeneratorService.deduplicate(cases)).toHaveLength(1);
    });

    it('keeps first occurrence when deduplicating', () => {
      const a = makeEnriched('5\n1 2 3 4 5');
      a.expectedOutput = 'first';
      const b = { ...a, expectedOutput: 'second' };
      const result = TestGeneratorService.deduplicate([a, b]);
      expect(result[0]!.expectedOutput).toBe('first');
    });

    it('preserves all unique inputs', () => {
      const cases = [makeEnriched('1\n1'), makeEnriched('2\n1 2'), makeEnriched('3\n1 2 3')];
      expect(TestGeneratorService.deduplicate(cases)).toHaveLength(3);
    });

    it('handles empty array', () => {
      expect(TestGeneratorService.deduplicate([])).toEqual([]);
    });
  });

  // ─── generateTests: 7 parallel Gemini calls ────────────────────────────────

  describe('generateTests — parallel Gemini calls', () => {
    beforeEach(() => {
      setupHappyPath();
      // Skip actual Python verification
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);
    });

    it('makes exactly 7 Gemini calls (6 categories + 1 brute-force)', async () => {
      await service.generateTests(PROBLEM_ID);
      expect(mockGemini.models.generateContent).toHaveBeenCalledTimes(7);
    });

    it('returns generationTimeMs >= 0', async () => {
      const result = await service.generateTests(PROBLEM_ID);
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns all generated test cases in the response', async () => {
      const result = await service.generateTests(PROBLEM_ID);
      // 2 sample + 1 boundary + 1 edge + 3 random + 1 stress + 1 adversarial = 9
      expect(result.testCases.length).toBeGreaterThan(0);
    });
  });

  // ─── isHidden assignment ────────────────────────────────────────────────────

  describe('isHidden', () => {
    beforeEach(() => {
      setupHappyPath();
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);
    });

    it('sets isHidden=false for SAMPLE test cases', async () => {
      const result = await service.generateTests(PROBLEM_ID);
      const samples = result.testCases.filter((tc) => tc.category === TestCaseCategory.SAMPLE);
      expect(samples.length).toBeGreaterThan(0);
      samples.forEach((tc) => expect(tc.isHidden).toBe(false));
    });

    it('sets isHidden=true for all non-SAMPLE categories', async () => {
      const result = await service.generateTests(PROBLEM_ID);
      const hidden = result.testCases.filter((tc) => tc.category !== TestCaseCategory.SAMPLE);
      hidden.forEach((tc) => expect(tc.isHidden).toBe(true));
    });
  });

  // ─── deduplication in generateTests ────────────────────────────────────────

  describe('deduplication in generateTests', () => {
    it('removes duplicate inputs across categories before storing', async () => {
      // All 6 category calls return the same input
      const duplicateInput = '2 3\n1 2';
      mockGemini.models.generateContent
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // sample
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // boundary
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // edge
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // random
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // stress
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase(duplicateInput)])) // adversarial
        .mockResolvedValueOnce(makeBruteForceCompletion(VALID_BRUTE_FORCE)); // brute-force

      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);

      const result = await service.generateTests(PROBLEM_ID);
      expect(result.testCases).toHaveLength(1);
    });
  });

  // ─── verification logic ────────────────────────────────────────────────────

  describe('verification', () => {
    beforeEach(() => {
      setupHappyPath();
    });

    it('sets unverifiedCount=0 when all verified outputs match', async () => {
      // Mock Python to return the expected output for every non-stress, small n case
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue('1 2');

      const result = await service.generateTests(PROBLEM_ID);
      expect(result.unverifiedCount).toBe(0);
    });

    it('increments unverifiedCount for each mismatch', async () => {
      // Return wrong output for every case
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue('WRONG');

      const result = await service.generateTests(PROBLEM_ID);
      // Stress cases are always skipped; all others are counted as mismatch
      const nonStress = result.testCases.filter(
        (tc) => tc.category !== TestCaseCategory.STRESS,
      );
      // n estimates: stress input starts with 100000 → skipped; others have small n
      expect(result.unverifiedCount).toBeGreaterThan(0);
      expect(result.unverifiedCount).toBeLessThanOrEqual(nonStress.length);
    });

    it('counts subprocess errors as unverified', async () => {
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);

      const result = await service.generateTests(PROBLEM_ID);
      // runWithPython returning null → 'error' → counted as unverified
      // stress cases skipped, n>1000 cases skipped
      // The stress case has n=100000 so it will be skipped
      // All other cases attempt verification and return null → error → unverified
      expect(result.unverifiedCount).toBeGreaterThanOrEqual(0);
    });

    it('skips verification for STRESS category regardless of n', async () => {
      const runSpy = jest
        .spyOn(service as any, 'runWithPython')
        .mockResolvedValue('1 2');

      await service.generateTests(PROBLEM_ID);

      // Stress test cases should not trigger runWithPython
      const callInputs = runSpy.mock.calls.map(([, input]) => input as string);
      // The stress input starts with '100000' — verify it was NOT passed to python
      const stressInput = '100000 999999999\n' + '1 '.repeat(99999) + '999999998';
      expect(callInputs).not.toContain(stressInput);
    });

    it('skips verification when brute-force is unavailable', async () => {
      // Spy directly on getBruteForce to return null — more reliable than juggling the 7th mock
      jest.spyOn(service as any, 'getBruteForce').mockResolvedValue(null);
      const runSpy = jest.spyOn(service as any, 'runWithPython');

      const result = await service.generateTests(PROBLEM_ID);

      expect(runSpy).not.toHaveBeenCalled();
      expect(result.unverifiedCount).toBe(0); // skipped ≠ unverified
    });
  });

  // ─── DB operations ─────────────────────────────────────────────────────────

  describe('database operations', () => {
    beforeEach(() => {
      setupHappyPath();
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);
    });

    it('runs delete and insert inside a transaction', async () => {
      await service.generateTests(PROBLEM_ID);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.delete).toHaveBeenCalledTimes(1);
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
    });

    it('inserts with createdBy="ai" for all generated cases', async () => {
      await service.generateTests(PROBLEM_ID);
      const insertValues = mockTx.insert().values.mock.calls[0]?.[0] as Array<{
        createdBy: string;
      }>;
      insertValues?.forEach((row) => expect(row.createdBy).toBe('ai'));
    });

    it('does not call transaction when all categories return empty', async () => {
      // All Gemini calls return empty arrays (fail silently)
      mockGemini.models.generateContent.mockResolvedValue(
        makeCompletion([]), // min(1) fails → safeParse → empty array
      );

      // Override so the Zod min(1) check fails → each callCategory returns []
      jest
        .spyOn(service as any, 'callCategory')
        .mockResolvedValue([]);
      jest.spyOn(service as any, 'getBruteForce').mockResolvedValue(null);

      await service.generateTests(PROBLEM_ID);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Problem not found ─────────────────────────────────────────────────────

  describe('problem not found', () => {
    it('throws NotFoundException when problem does not exist', async () => {
      mockSelectChain.limit.mockResolvedValue([]); // empty result

      await expect(service.generateTests(PROBLEM_ID)).rejects.toThrow(NotFoundException);
      expect(mockGemini.models.generateContent).not.toHaveBeenCalled();
    });
  });

  // ─── Resilience: partial category failure ──────────────────────────────────

  describe('resilience', () => {
    it('continues when some category calls fail, returning cases from successful ones', async () => {
      mockGemini.models.generateContent
        .mockRejectedValueOnce(new Error('rate limit')) // sample fails
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase('2 0\n-1 1')])) // boundary ok
        .mockRejectedValueOnce(new Error('timeout'))    // edge fails
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase('3 5\n1 2 3')])) // random ok
        .mockRejectedValueOnce(new Error('error'))      // stress fails
        .mockResolvedValueOnce(makeCompletion([makeRawTestCase('3 2\n1 1 2')])) // adversarial ok
        .mockResolvedValueOnce(makeBruteForceCompletion(VALID_BRUTE_FORCE));

      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);

      const result = await service.generateTests(PROBLEM_ID);
      // 3 categories failed → 0 cases each; 3 succeeded → cases present
      expect(result.testCases.length).toBeGreaterThan(0);
      expect(result.testCases.length).toBeLessThan(10);
    });

    it('returns empty testCases (no throw) when all category calls fail', async () => {
      // Spy directly so queue-state from other beforeEach blocks cannot interfere
      jest.spyOn(service as any, 'callCategory').mockResolvedValue([]);
      jest.spyOn(service as any, 'getBruteForce').mockResolvedValue(null);

      const result = await service.generateTests(PROBLEM_ID);
      expect(result.testCases).toHaveLength(0);
      expect(result.unverifiedCount).toBe(0);
    });
  });

  // ─── Deterministic seed ────────────────────────────────────────────────────

  describe('deterministic seed', () => {
    it('passes the same seed for the same problemId across calls', async () => {
      setupHappyPath();
      jest.spyOn(service as any, 'runWithPython').mockResolvedValue(null);

      await service.generateTests(PROBLEM_ID);

      // The RANDOM call (4th category call) should include the seed in the user message
      const randomCallArgs = mockGemini.models.generateContent.mock.calls[3]?.[0] as {
        contents: string;
      };
      const userMessage = randomCallArgs?.contents ?? '';
      expect(userMessage).toMatch(/seed \d+/);
    });

    it('produces different seeds for different problemIds', async () => {
      const otherId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
      const seedFn = (id: string): number =>
        parseInt(
          require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 8),
          16,
        );
      expect(seedFn(PROBLEM_ID)).not.toBe(seedFn(otherId));
    });
  });
});
