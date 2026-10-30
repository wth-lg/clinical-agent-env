// No committed record changes outcome under W0-A's attribution split (plan-amendment-worklist W0-A
// gate): for every record and trajectory in results/pilot-1 and results/pilot-2, trialOutcome
// (packages/grader/outcome.ts), from the record's status, its limit kind (detail) and its
// trajectory (rule P-L), gives the record's current outcome, or leaves it to the gates (null) when
// that outcome is FAIL or PASS. It needs no world, so a change to the world or the tools (W0-1)
// does not touch it; the offline regrade on a scratch copy is the other half of the gate.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrialEvent } from '../events.ts';
import { currentGrade } from '../summary.ts';
import { trialOutcome, type TrialFacts } from '../../grader/outcome.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';

const RUNS = ['results/pilot-1', 'results/pilot-2'];

function records(run: string) {
  const dir = join(repoRoot, run, 'trials');
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => {
      const file = join(e.parentPath, e.name);
      const r = JSON.parse(readFileSync(file, 'utf8')) as TrialFacts & Parameters<typeof currentGrade>[0] & { trajectory: string };
      return { name: file.slice(repoRoot.length + 1), record: r, trajectory: join(repoRoot, run, r.trajectory) };
    });
}

describe('outcome regression on the committed pilots', () => {
  const all = RUNS.flatMap(records);

  it('reads 66 records (18 pilot-1, 48 pilot-2), each with its trajectory', () => {
    expect(all).toHaveLength(66);
    expect(all.filter((x) => !existsSync(x.trajectory)).map((x) => x.name)).toEqual([]);
  });

  it("trialOutcome gives every record's current outcome", () => {
    const changed = all.flatMap(({ name, record, trajectory }) => {
      const events = readFileSync(trajectory, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as TrialEvent);
      const current = currentGrade(record).outcome;
      const early = trialOutcome(record, events);
      const now = early ?? (current === 'FAIL' || current === 'PASS' ? current : 'gates decide');
      return now === current ? [] : [`${name}: ${current} -> ${now}`];
    });
    expect(changed).toEqual([]);
  });
});
