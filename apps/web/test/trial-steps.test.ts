// The trial detail's ENV_ERROR Where (apps/web/src/trial/steps.ts internalErrorRow): the first tool
// call that failed with an internal error, at the step the grader numbers it, on the committed
// ENV_ERROR trajectory (its third tool call that ran failed, verifier-ui-copy-1 m4) and on that
// trajectory with the failure served as an ordinary result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrajectory } from '../../../packages/core/trajectory.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { internalErrorRow, trajectoryOf } from '../src/trial/steps.ts';

const FILE = join(repoRoot, 'apps/web/e2e/fixtures/trial/results/runs/trial-1/trajectories/discharge-medrec/12.jsonl');
const text = readFileSync(FILE, 'utf8');

describe('internalErrorRow', () => {
  it('is null when no tool call failed with an internal error', () => {
    const ok = text.split('\n').filter((l) => l.trim() !== '').map((l) => {
      const e = JSON.parse(l) as { type: string; error_code?: string | null };
      return e.type === 'tool_result' && e.error_code === 'INTERNAL' ? JSON.stringify({ ...e, is_error: false, error_code: null }) : l;
    }).join('\n');
    expect(internalErrorRow(trajectoryOf(parseTrajectory(ok)).rows)).toBeNull();
  });

  it('finds the first tool call that failed with an internal error, at its step', () => {
    const row = internalErrorRow(trajectoryOf(parseTrajectory(text)).rows);
    // The T4 worklist oracle's third call is a patient search (W1 train, builder-249).
    expect(row).toMatchObject({ kind: 'tool', step: 3, error: 'INTERNAL', name: 'search_patients' });
  });
});
