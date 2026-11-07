// The numbers behind the Findings "Why tasks fail" card (P25u V3, J8c), pure in
// src/findings/counts.ts: the kind bar's track is the task's failures over its valid trials, with
// each kind as a share of that track; the confirmation count is the failures the record confirms
// (M1-M4, packages/core/explain.ts m1ToM4Met) and the failures the human audit agrees with (M5).
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { FAILURE_KINDS, type FaultCounts } from '../../../packages/core/summary.ts';
import { confirmation, kindSegments } from '../src/findings/counts.ts';

const fc = (failures: number, taxonomy: Partial<FaultCounts['taxonomy']>): FaultCounts => ({ failures, taxonomy: { ...(Object.fromEntries(FAILURE_KINDS.map((k) => [k, 0])) as FaultCounts['taxonomy']), ...taxonomy }, label: null, infra_reruns: 0 });

describe('kindSegments', () => {
  it('the track is failures over valid trials; each kind is its share of the track, in FAILURE_KINDS order', () => {
    const s = kindSegments(fc(15, { retrieval: 12, reasoning: 3 }), 20);
    expect(s.track).toBe(75);
    expect(s.segments).toEqual([{ kind: 'retrieval', count: 12, width: 80 }, { kind: 'reasoning', count: 3, width: 20 }]);
  });

  it('no failures: an empty track and no segment', () => {
    expect(kindSegments(fc(0, {}), 20)).toEqual({ track: 0, segments: [] });
  });

  it('no valid trials: an empty track, whatever the counts say', () => {
    expect(kindSegments(fc(2, { reasoning: 2 }), 0).track).toBe(0);
  });

  it('the track never exceeds the full width', () => {
    expect(kindSegments(fc(20, { reasoning: 20 }), 20).track).toBe(100);
  });
});

const trial = (outcome: string, met: Record<string, boolean | 'n/a' | 'pending'>, valid = true): Explanation =>
  ({ valid, outcome, criteria: Object.entries(met).map(([id, m]) => ({ id, met: m })) } as unknown as Explanation);

describe('confirmation', () => {
  it('counts the failures, those the record confirms (M1-M4, n/a is met) and those the human audit agrees with (M5)', () => {
    const c = confirmation([
      trial('FAIL', { M1: true, M2: true, M3: 'n/a', M4: true, M5: true }),
      trial('FAIL', { M1: true, M2: true, M3: true, M4: true, M5: false }),
      trial('FAIL', { M1: false, M2: true, M3: true, M4: true, M5: true }),
      trial('FAIL', { M1: true, M2: true, M3: true, M4: true, M5: 'pending' }),
      trial('PASS', { M1: true, M2: true, M3: true, M4: true, M5: true }),
      trial('ENV_ERROR', { M1: true, M2: true, M3: true, M4: true, M5: true }, false),
    ]);
    expect(c).toEqual({ failures: 4, record: 3, audit: 2 });
  });

  it('no failures: zeros', () => {
    expect(confirmation([trial('PASS', { M5: true })])).toEqual({ failures: 0, record: 0, audit: 0 });
  });
});
