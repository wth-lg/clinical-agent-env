// The typical cost the Live trial launcher shows next to its "at most" amounts (P17j JU6): the
// nearest-rank median of agent plus judge cost over one task's trials in the latest committed
// pilot run that holds the task, or null when no pilot holds it.
import { describe, expect, it } from 'vitest';
import { typicalCost, type PilotCosts } from '../src/live/typical.ts';

const run = (runId: string, trials: Array<[string, number, number | null]>) =>
  ({ runId, trials: trials.map(([task, cost_usd, judge_cost_usd]) => ({ task, record: { cost_usd, judge_cost_usd } })) }) satisfies PilotCosts;

describe('typicalCost', () => {
  it('is the nearest-rank median of agent plus judge cost', () => {
    expect(typicalCost([run('pilot-0', [['t', 0.2, 0], ['t', 0.5, 0.1], ['t', 0.9, null]])], 't')).toEqual({ usd: 0.6, n: 3, run: 'pilot-0' });
    expect(typicalCost([run('pilot-0', [['t', 0.2, null], ['t', 0.4, null]])], 't')).toEqual({ usd: 0.2, n: 2, run: 'pilot-0' });
  });

  it('reads the latest pilot that holds the task and only that task', () => {
    const pilots = [run('pilot-0', [['t', 1, null]]), run('pilot-1', [['t', 0.3, null], ['u', 5, null]]), run('pilot-2', [['u', 9, null]])];
    expect(typicalCost(pilots, 't')).toEqual({ usd: 0.3, n: 1, run: 'pilot-1' });
  });

  it('is null when no pilot holds the task', () => {
    expect(typicalCost([], 't')).toBeNull();
    expect(typicalCost([run('pilot-0', [['u', 1, null]])], 't')).toBeNull();
  });
});
