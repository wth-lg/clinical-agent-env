// Harm on screen (pre-audit B2b, P17j JU3): a PASS with harm is a PASS of the current grade with a
// met rubric item of HARM_POINTS or fewer points (packages/core/summary.ts, the rule pass_no_harm
// counts by; decisions.tsv 2026-10-27T23:40 keeps HARM_POINTS at -5); an unknown such item is
// "harm unknown"; a -3 item, an item not met, or a gate check is not harm.
import { describe, expect, it } from 'vitest';
import { isHarmItem } from '../../../packages/core/summary.ts';
import { harmItems } from '../src/data/harm.ts';

const rubric = (id: string, points: number, met: boolean | 'unknown') => ({ id, kind: 'rubric' as const, points, met });
const record = (checks: ReturnType<typeof rubric>[], extra: object = {}) => ({ outcome: 'PASS', score: 0.9, checks, ...extra });

describe('harmItems', () => {
  it('lists met and unknown rubric items at or below -5 points, not -3, not unmet ones', () => {
    const r = record([rubric('cites_dose', 2, true), rubric('wrong_patient', -8, true), rubric('minor_slip', -3, true), rubric('maybe_harm', -6, 'unknown'), rubric('no_harm', -10, false)]);
    expect(harmItems(r)).toEqual([{ id: 'wrong_patient', points: -8, unknown: false }, { id: 'maybe_harm', points: -6, unknown: true }]);
  });
  it('is empty for a non-pass, and reads the current grade after a regrade', () => {
    expect(harmItems({ ...record([rubric('wrong_patient', -8, true)]), outcome: 'FAIL' })).toEqual([]);
    const regraded = record([rubric('wrong_patient', -8, true)], { grader_task_version: 'a', regrades: [{ grader_task_version: 'b', outcome: 'PASS', score: 1, checks: [rubric('wrong_patient', -8, false)] }] });
    expect(harmItems(regraded)).toEqual([]);
  });
});

describe('verifier JU3-1 F1 and F2', () => {
  it('reads the same predicate summary.json counts by', () => {
    const r = record([rubric('wrong_patient', -8, true), rubric('minor_slip', -3, true)]);
    expect(harmItems(r).map((x) => x.id)).toEqual((r.checks).filter(isHarmItem).map((c) => c.id));
  });
  it('is empty for an invalid current grade, and says harm unknown for a PASS with no checks recorded', () => {
    expect(harmItems({ ...record([rubric('wrong_patient', -8, true)]), outcome: 'ENV_ERROR' })).toEqual([]);
    const noChecks = record([rubric('wrong_patient', -8, true)], { grader_task_version: 'a', regrades: [{ grader_task_version: 'b', outcome: 'PASS', score: 1 }] });
    expect(harmItems(noChecks)).toEqual([{ id: 'no checks recorded', points: null, unknown: true }]);
  });
});
