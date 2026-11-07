// The graded live card's and Your runs row's score line and their link to the session trial page
// (trace row N10, builder-330): the rubric score as the Score card shows it (rubric.ts scoreText
// over the record's current grade), and a URL patch that opens the trial page of run=session with
// nothing else carried over.
import { describe, expect, it } from 'vitest';
import type { ExplainRecord } from '../../../packages/core/explain.ts';
import { SESSION_RUN } from '../src/trial/session.ts';
import { liveScore, sessionTrialPatch } from '../src/live/grade.ts';
import { VIEW_STATE } from '../src/shell/views.ts';
import { scoreText } from '../src/trial/rubric.ts';

const hashes = { initial: 'a', final: 'b', replay_final: 'b' };
const record = (over: Partial<ExplainRecord>): ExplainRecord => ({ task_id: '_toy', task_version: null, outcome: 'PASS', valid: true, state_hash: hashes, ...over });
const checks = [{ id: 'gate', kind: 'gate', met: true }, { id: 'item', kind: 'rubric', met: true, points: 2 }];

describe('scoreText', () => {
  it('is the score to two decimals when the grade has checks and a score', () => {
    expect(scoreText({ checks, score: 1 })).toBe('1.00');
    expect(scoreText({ checks, score: 0.5 })).toBe('0.50');
    expect(scoreText({ checks, score: 0.333 })).toBe('0.33');
  });
  it('is null without checks (not graded) or without a score', () => {
    expect(scoreText({ checks: null, score: null })).toBeNull();
    expect(scoreText({ checks: [], score: 1 })).toBeNull();
    expect(scoreText({ checks, score: null })).toBeNull();
    expect(scoreText({ checks })).toBeNull();
  });
});

describe('liveScore', () => {
  it('reads the record as the Grading tab does: the current grade, the last regrade first', () => {
    expect(liveScore(record({ score: 1, checks }))).toBe('1.00');
    expect(liveScore(record({ score: 0.5, checks, outcome: 'FAIL' }))).toBe('0.50');
    expect(liveScore(record({ score: 0.2, checks, regrades: [{ outcome: 'PASS', score: 0.75, checks } as never] }))).toBe('0.75');
  });
  it('is null without a record or a grade', () => {
    expect(liveScore(null)).toBeNull();
    expect(liveScore(record({ outcome: 'CANCELLED', valid: false, checks: null, score: null }))).toBeNull();
    expect(liveScore(record({ checks: [] }))).toBeNull();
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
