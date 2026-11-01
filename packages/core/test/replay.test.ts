// The one replay match rule (packages/core/replay.ts), which `pnpm cli replay` and the browser's
// grader validation Worker both use: a replayed trial matches when its environment is the
// checkout's and the regrade has the outcome, score and check results of the record's current
// grade; a judge cache miss or a thrown regrade never matches.
import { describe, expect, it } from 'vitest';
import { envChanged, judgeMissed, replayEnvVerdict, replayVerdict, type ReplayRecord } from '../replay.ts';

const ENV = 'e'.repeat(64);
const checks = [{ id: 'G1', met: true }, { id: 'G2', met: false }];
const record = (over: Partial<ReplayRecord> = {}): ReplayRecord => ({ task_id: 't', task_version: 'v1', env_version: ENV, model_requested: 'm', outcome: 'FAIL', score: 0.5, checks, ...over });
const graded = (over: Partial<{ outcome: string; score: number | null; checks: Array<{ id: string; met: unknown }>; error: { message: string } | null }> = {}) => ({ grade: { outcome: 'FAIL', score: 0.5, checks, error: null, ...over } });

describe('replayEnvVerdict', () => {
  it('passes a record run at the checkout environment on to the regrade', () => {
    expect(replayEnvVerdict(record(), ENV)).toBeNull();
  });

  it('does not match a record of another environment, or one with none', () => {
    expect(replayEnvVerdict(record({ env_version: 'old' }), ENV)).toEqual({ match: false, outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: `${envChanged({ env_version: 'old', task_version: 'v1' }, ENV)}; reproduce at the commit in results/<run>/README.md` });
    expect(replayEnvVerdict(record({ env_version: null }), ENV)?.error).toMatch(/^environment changed: run at env_version \(none: recorded before env_version, task_version v1\)/);
    const { env_version: _, ...none } = record();
    expect(replayEnvVerdict(none, ENV)?.match).toBe(false);
  });

  it('R37: points at the commit the run directory\'s README.md names', () => {
    expect(replayEnvVerdict(record({ env_version: 'old', run_id: 'probe-1' }), ENV)?.error).toMatch(/^environment changed: run at env_version old, checkout at e{64}; reproduce at the commit in results\/probe-1\/README\.md$/);
  });
});

describe('replayVerdict', () => {
  it('matches when outcome, score and check results equal the current grade', () => {
    expect(replayVerdict(record(), graded())).toEqual({ match: true, outcome: 'FAIL', recorded_outcome: 'FAIL', current_outcome: 'FAIL' });
  });

  it('does not match on another outcome, score or check result, and says what the grade was', () => {
    expect(replayVerdict(record({ outcome: 'GRADER_ERROR', score: null, checks: null }), graded({ score: 1 }))).toEqual({
      match: false, outcome: 'FAIL', recorded_outcome: 'GRADER_ERROR', current_outcome: 'GRADER_ERROR', error: 'regrade gives FAIL score 1, the record GRADER_ERROR score null',
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
    expect(miss).toEqual({ match: false, outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: judgeMissed('judge cache miss abc123 for G3', record()) });
    expect(miss.error).toMatch(/^judge cache miss abc123: /);
    expect(replayVerdict(record(), { error: 'boom' })).toEqual({ match: false, outcome: null, recorded_outcome: 'FAIL', current_outcome: 'FAIL', error: 'boom' });
  });
});
