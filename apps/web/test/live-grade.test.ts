// The graded live card's score line and its link to the session trial page (trace row N10,
// builder-330): the rubric score under the Score card's own title, from the record's current grade,
// and a URL patch that opens the trial page of run=session with nothing else carried over.
import { describe, expect, it } from 'vitest';
import type { ExplainRecord } from '../../../packages/core/explain.ts';
import { SESSION_RUN } from '../src/trial/session.ts';
import { liveGrade, sessionTrialPatch } from '../src/live/grade.ts';
import { VIEW_STATE } from '../src/shell/views.ts';
import { SCORE_TITLE } from '../src/trial/rubric.ts';

const hashes = { initial: 'a', final: 'b', replay_final: 'b' };
const record = (over: Partial<ExplainRecord>): ExplainRecord => ({ task_id: '_toy', task_version: null, outcome: 'PASS', valid: true, state_hash: hashes, ...over });
const checks = [{ id: 'gate', kind: 'gate', met: true }, { id: 'item', kind: 'rubric', met: true, points: 2 }];

describe('liveGrade', () => {
  it('gives the Score card title with the score to two decimals', () => {
    expect(liveGrade(record({ score: 1, checks }))).toEqual({ title: SCORE_TITLE, value: '1.00' });
    expect(liveGrade(record({ score: 0.5, checks, outcome: 'FAIL' }))).toEqual({ title: 'Rubric score (does not decide pass)', value: '0.50' });
  });
  it('reads the last regrade, as the Grading tab does', () => {
    const r = record({ score: 0.2, checks, regrades: [{ outcome: 'PASS', score: 0.75, checks } as never] });
    expect(liveGrade(r)).toEqual({ title: SCORE_TITLE, value: '0.75' });
  });
  it('is null without a record, without checks (a cancelled or errored trial) or without a score', () => {
    expect(liveGrade(null)).toBeNull();
    expect(liveGrade(record({ outcome: 'CANCELLED', valid: false, checks: null, score: null }))).toBeNull();
    expect(liveGrade(record({ checks: [] }))).toBeNull();
    expect(liveGrade(record({ checks, score: null }))).toBeNull();
  });
});

describe('sessionTrialPatch', () => {
  it('opens Runs at run=session with the trial, every other view key cleared', () => {
    const patch = sessionTrialPatch('ui-1._toy.0');
    expect(patch.view).toBe('runs');
    expect(patch.run).toBe(SESSION_RUN);
    expect(patch.trial).toBe('ui-1._toy.0');
    for (const k of VIEW_STATE.filter((x) => x !== 'run' && x !== 'trial')) expect(patch[k]).toBeNull();
  });
});
