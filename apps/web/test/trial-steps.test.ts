// The trial detail's ENV_ERROR Where (apps/web/src/trial/steps.ts internalErrorRow): the first tool
// call that failed with an internal error, at the step the grader numbers it, on the committed
// ENV_ERROR trajectory with one tool call served as the one that failed.
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
    expect(internalErrorRow(trajectoryOf(parseTrajectory(text)).rows)).toBeNull();
  });

  it('finds the first tool call that failed with an internal error, at its step', () => {
    let ran = 0;
    const failed = text.split('\n').filter((l) => l.trim() !== '').map((l) => {
      const e = JSON.parse(l) as { type: string; executed?: boolean };
      return e.type === 'tool_result' && e.executed && ++ran === 3 ? JSON.stringify({ ...e, is_error: true, error_code: 'INTERNAL' }) : l;
    }).join('\n');
    const row = internalErrorRow(trajectoryOf(parseTrajectory(failed)).rows);
    expect(row).toMatchObject({ kind: 'tool', step: 3, error: 'INTERNAL', name: 'fhir_search' });
  });
});
