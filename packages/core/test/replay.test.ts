// The one replay match rule (packages/core/replay.ts), which `pnpm cli replay` and the browser's
// grader validation Worker both use: a replayed trial matches when its environment is the
// checkout's and the regrade has the outcome, score and check results of the record's current
// grade; a judge cache miss or a thrown regrade never matches.
import { describe, expect, it } from 'vitest';
import { envChanged, isVerdictOf, judgeMissed, replayEnvVerdict, replayStateOf, replayVerdict, type ReplayRecord } from '../replay.ts';

const ENV = 'e'.repeat(64);
const checks = [{ id: 'G1', met: true }, { id: 'G2', met: false }];
const record = (over: Partial<ReplayRecord> = {}): ReplayRecord => ({ task_id: 't', task_version: 'v1', env_version: ENV, model_requested: 'm', outcome: 'FAIL', score: 0.5, checks, ...over });
const graded = (over: Partial<{ outcome: string; score: number | null; checks: Array<{ id: string; met: unknown }>; error: { message: string } | null }> = {}) => ({ grade: { outcome: 'FAIL', score: 0.5, checks, error: null, ...over } });

describe('replayEnvVerdict', () => {
  it('passes a record run at the checkout environment on to the regrade', () => {
    expect(replayEnvVerdict(record(), ENV)).toBeNull();
  });

  it('gives a record of another environment, or one with none, the named verdict world_mismatch', () => {
    // S1 (verifier-phase-P17i-TWOW-229-1): the verdict is named; no match field, which would read as a plain mismatch.
    expect(replayEnvVerdict(record({ env_version: 'old' }), ENV)).toEqual({ verdict: 'world_mismatch', outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: `${envChanged({ env_version: 'old', task_version: 'v1' }, ENV)}; reproduce at the commit in results/<run>/README.md` });
    expect(replayEnvVerdict(record({ env_version: null }), ENV)?.error).toMatch(/^environment changed: run at env_version \(none: recorded before env_version, task_version v1\)/);
    const { env_version: _, ...none } = record();
    expect(replayEnvVerdict(none, ENV)).toMatchObject({ verdict: 'world_mismatch' });
    expect(replayEnvVerdict(none, ENV)).not.toHaveProperty('match');
  });

  it('R37: points at the commit the run directory\'s README.md names, or at the reproduce pointer the caller gives', () => {
    expect(replayEnvVerdict(record({ env_version: 'old', run_id: 'probe-1' }), ENV)?.error).toMatch(/^environment changed: run at env_version old, checkout at e{64}; reproduce at the commit in results\/probe-1\/README\.md$/);
    expect(replayEnvVerdict(record({ env_version: 'old', run_id: 'final-1' }), ENV, 'replay it at tag final-1-t3t5 (e8ef8c4d): pnpm cli replay <copy> --tasks t')?.error)
      .toBe(`${envChanged({ env_version: 'old', task_version: 'v1' }, ENV)}; replay it at tag final-1-t3t5 (e8ef8c4d): pnpm cli replay <copy> --tasks t`);
  });
});

describe('replayVerdict', () => {
  it('matches when outcome, score and check results equal the current grade', () => {
    expect(replayVerdict(record(), graded())).toEqual({ match: true, verdict: 'match', outcome: 'FAIL', recorded_outcome: 'FAIL', current_outcome: 'FAIL' });
  });

  it('does not match on another outcome, score or check result, and says what the grade was', () => {
    expect(replayVerdict(record({ outcome: 'GRADER_ERROR', score: null, checks: null }), graded({ score: 1 }))).toEqual({
      match: false, verdict: 'mismatch', outcome: 'FAIL', recorded_outcome: 'GRADER_ERROR', current_outcome: 'GRADER_ERROR', error: 'regrade gives FAIL score 1, the record GRADER_ERROR score null',
    });
    expect(replayVerdict(record(), graded({ score: 1 })).match).toBe(false);
    expect(replayVerdict(record(), graded({ checks: [{ id: 'G1', met: true }, { id: 'G2', met: true }] })).match).toBe(false);
  });

  it("names a regrade's own error, such as a final state hash that differs", () => {
    const v = replayVerdict(record(), graded({ outcome: 'GRADER_ERROR', score: null, checks: [], error: { message: 'regrade: replayed state hash x is not the record\'s final y' } }));
    expect(v).toMatchObject({ match: false, outcome: 'GRADER_ERROR', error: "regrade: replayed state hash x is not the record's final y" });
  });

  it('compares against the last regrade, and on outcome and score only when it stored no checks', () => {
    const regrades = [{ outcome: 'PASS', score: 1, checks: [{ id: 'G1', met: true }, { id: 'G2', met: true }] }];
    expect(replayVerdict(record({ regrades }), graded({ outcome: 'PASS', score: 1, checks: regrades[0]!.checks })).match).toBe(true);
    expect(replayVerdict(record({ regrades }), graded()).error).toBe('regrade gives FAIL score 0.5, the current grade PASS score 1');
    const old = replayVerdict(record({ regrades: [{ outcome: 'FAIL', score: 0.5 }] }), graded({ checks: [] }));
    expect(old).toMatchObject({ match: true, note: 'its last regrade recorded no check results; compared outcome and score only' });
  });

  it('matches an excluded record whose regrade gives the same excluded outcome', () => {
    expect(replayVerdict(record({ outcome: 'ENV_ERROR', score: null, checks: [] }), graded({ outcome: 'ENV_ERROR', score: null, checks: [] })).match).toBe(true);
    expect(replayVerdict(record({ outcome: 'INFRA_API', score: null, checks: [] }), graded({ outcome: 'INFRA_API', score: null, checks: [] })).match).toBe(true);
  });

  it('never matches a judge cache miss or a regrade that threw', () => {
    const miss = replayVerdict(record(), { miss: 'judge cache miss abc123 for G3' });
    expect(miss).toEqual({ match: false, verdict: 'mismatch', outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: judgeMissed('judge cache miss abc123 for G3', record()) });
    expect(miss.error).toMatch(/^judge cache miss abc123: /);
    expect(replayVerdict(record(), { error: 'boom' })).toEqual({ match: false, verdict: 'mismatch', outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: 'boom' });
  });
});

// S2 (verifier-phase-P17i-TWOW-229-1): whether a replay.json entry is a verdict of the record as it
// is now, the rule summary, audit-check and replay's keep share.
describe('isVerdictOf', () => {
  const at = (env: string) => ({ commit: 'c'.repeat(40), dirty: false, world_hash: 'w'.repeat(64), env_version: env });
  const entry = { match: true, verdict: 'match' as const, outcome: 'PASS', recorded_outcome: 'FAIL', current_outcome: 'PASS' };
  const r = record({ outcome: 'FAIL', regrades: [{ grader_task_version: 'g2', outcome: 'PASS', score: 1, valid: true, checks: [], changed: true }] });

  it('holds when the recorded and current outcomes are the record\'s, stamped at its env_version or not stamped', () => {
    expect(isVerdictOf(entry, r)).toBe(true);
    expect(isVerdictOf({ ...entry, replayed_at: at(ENV) }, r)).toBe(true);
  });

  it('fails on another recorded or current outcome, or a match or mismatch stamped at another env_version', () => {
    expect(isVerdictOf({ ...entry, recorded_outcome: 'PASS' }, r)).toBe(false);
    expect(isVerdictOf({ ...entry, current_outcome: 'FAIL' }, r)).toBe(false);
    expect(isVerdictOf({ ...entry, replayed_at: at('other') }, r)).toBe(false);
    expect(isVerdictOf({ ...entry, verdict: 'mismatch', match: false, replayed_at: at('other') }, r)).toBe(false);
  });

  it('a world_mismatch entry is stamped with the replaying checkout\'s env_version, so only its outcomes are checked', () => {
    expect(isVerdictOf({ verdict: 'world_mismatch', outcome: null, recorded_outcome: 'FAIL', current_outcome: 'PASS', replayed_at: at('head') }, r)).toBe(true);
    expect(isVerdictOf({ verdict: 'world_mismatch', outcome: null, recorded_outcome: 'PASS', current_outcome: 'PASS', replayed_at: at('head') }, r)).toBe(false);
  });

  it('an entry with no outcomes (not written by replay) is no verdict', () => {
    expect(isVerdictOf({ match: true }, r)).toBe(false);
  });
});

describe('replayStateOf', () => {
  it('reads the named verdict, else match or mismatch from the match field of an older file', () => {
    expect(replayStateOf({ verdict: 'world_mismatch' })).toBe('world_mismatch');
    expect(replayStateOf({ verdict: 'mismatch', match: true })).toBe('mismatch');
    expect(replayStateOf({ match: true })).toBe('match');
    expect(replayStateOf({ match: false })).toBe('mismatch');
    expect(replayStateOf({})).toBe('mismatch');
  });
});
