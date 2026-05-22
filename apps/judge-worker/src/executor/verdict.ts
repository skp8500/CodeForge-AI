import { Verdict } from '@codeforge/shared';

import { MAX_OUTPUT_BYTES } from '../constants.js';
import type { RunResult } from './docker.client.js';

// ─── Per-test-case verdict ────────────────────────────────────────────────────

export function computeTestVerdict(result: RunResult, expectedOutput: string): Verdict {
  if (result.timedOut) return Verdict.TLE;
  if (result.oomKilled) return Verdict.MLE;
  if (result.exitCode !== 0) return Verdict.RE;
  if (result.stdout.length > MAX_OUTPUT_BYTES) return Verdict.OLE;
  if (result.stdout.trim() !== expectedOutput.trim()) return Verdict.WA;
  return Verdict.AC;
}

// ─── Aggregate verdict (worst-case across test cases) ────────────────────────

const VERDICT_PRIORITY: Record<Verdict, number> = {
  [Verdict.CE]: 0,
  [Verdict.IE]: 1,
  [Verdict.TLE]: 2,
  [Verdict.MLE]: 3,
  [Verdict.RE]: 4,
  [Verdict.OLE]: 5,
  [Verdict.WA]: 6,
  [Verdict.AC]: 7,
};

export function worstVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.length === 0) return Verdict.AC;
  return verdicts.reduce((worst, v) =>
    VERDICT_PRIORITY[v] < VERDICT_PRIORITY[worst] ? v : worst,
  );
}
