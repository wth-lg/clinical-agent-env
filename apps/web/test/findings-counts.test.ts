// The numbers behind the Findings "Why tasks fail" card (P25u V3, J8c), pure in
// src/findings/counts.ts: the kind bar's track is the task's failures over its valid trials, with
// each kind as a share of that track; the confirmation count is the failures the record confirms
// (M1-M4, packages/core/explain.ts m1ToM4Met) and the failures the human audit agrees with (M5).
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { FAILURE_KINDS, type FaultCounts } from '../../../packages/core/summary.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { confirmation, graderFixes, kindSegments, whyFailParts } from '../src/findings/counts.ts';

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

// F3 (verifier-phase-P17i-P25U-S5-1): a task with no failures but reruns keeps its reruns line.
describe('whyFailParts', () => {
  it('with failures: the fault box, which holds the reruns line', () => {
    expect(whyFailParts({ failures: 3, infra_reruns: 2 })).toEqual({ faultBox: true, reruns: false });
  });

  it('no failures but reruns: the reruns line on its own', () => {
    expect(whyFailParts({ failures: 0, infra_reruns: 1 })).toEqual({ faultBox: false, reruns: true });
  });

  it('no failures and no reruns: nothing under the bar', () => {
    expect(whyFailParts({ failures: 0, infra_reruns: 0 })).toEqual({ faultBox: false, reruns: false });
  });
});

// eval-p25u-2 S10: beside "0 grader", the trials an offline regrade moved from FAIL to PASS after
// a grader fix, read from the records' regrades. The official run is counted apart from its
// superseded versions (verifier-phase-P25u-decisive-1 claim 2): results/runs/final-1 has
// message-queue/10 under grader 22 counted, and 12 trials of crc-care-gap v1 under grader 22 in a
// superseded version that is not counted.
describe('graderFixes', () => {
  const rec = (outcome: string, regrades?: Array<{ outcome: string; grader_version: string }>, name?: string) => ({ ...(name ? { name } : {}), record: { outcome, ...(regrades ? { regrades } : {}) } });
  it('counts the FAIL records whose last regrade passes, with the regrade graders and trial names', () => {
    expect(graderFixes([{ trials: [rec('FAIL', [{ outcome: 'PASS', grader_version: '22' }], 'a/1'), rec('FAIL', [{ outcome: 'FAIL', grader_version: '22' }], 'a/2'), rec('PASS', undefined, 'a/3')] }])).toEqual({ trials: 1, graders: ['22'], names: ['a/1'] });
    expect(graderFixes([{ trials: [rec('FAIL')] }])).toEqual({ trials: 0, graders: [], names: [] });
  });

  it('on final-1: 1 counted trial (message-queue/10), 12 in the superseded crc-care-gap v1, grader 22', () => {
    const dir = new URL('../../../results/runs/final-1/', import.meta.url);
    const read = (sub: string) => ({ trials: readdirSync(new URL(sub, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => ({ name: `${basename(e.parentPath)}/${e.name.replace(/\.json$/, '')}`, record: JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as { outcome: string } })) });
    expect(graderFixes([read('trials/')])).toEqual({ trials: 1, graders: ['22'], names: ['message-queue/10'] });
    const sup = graderFixes([read('superseded/crc-care-gap-v1/trials/')]);
    expect({ trials: sup.trials, graders: sup.graders }).toEqual({ trials: 12, graders: ['22'] });
  });
});
