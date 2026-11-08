// run=session on the trial page (trace row N10, builder-330): the runs this surface started, as
// the Live trial view lists them, become runs the TrialPage layout can show. Pure: what the
// transport's runs() gave, to a run per live run and the trial ?trial= names, or why there is none.
import { describe, expect, it } from 'vitest';
import type { ExplainRecord } from '../../../packages/core/explain.ts';
import type { LiveRun, LiveTrialRow } from '../src/live/types.ts';
import { FIRST_NONPASS } from '../src/trial/resolve.ts';
import { missingText, resolveSessionTrial, SESSION_RUN, sessionRun } from '../src/trial/session.ts';

const hashes = { initial: 'a', final: 'b', replay_final: 'b' };
const record = (task: string, outcome: string, over: Partial<ExplainRecord> = {}): ExplainRecord => ({
  task_id: task, task_version: null, outcome, valid: outcome === 'PASS' || outcome === 'FAIL', score: 1, cost_usd: 0.1, checks: [{ id: 'g', kind: 'gate', met: outcome === 'PASS' }], state_hash: hashes, ...over,
});
const row = (run: string, task: string, index: number, state: LiveTrialRow['state'], rec: ExplainRecord | null, error: string | null = null): LiveTrialRow => ({ trialId: `${run}.${task}.${index}`, taskId: task, index, state, record: rec, error });
const live = (runId: string, rows: LiveTrialRow[], started = '2026-11-06T10:00:00.000Z'): LiveRun => ({ runId, started, tasks: [...new Set(rows.map((r) => r.taskId))], trials: rows.length, done: rows.every((r) => r.state !== 'queued' && r.state !== 'running'), stopped: null, rows });

const toyPass = live('ui-1', [row('ui-1', '_toy', 0, 'graded', record('_toy', 'PASS'))]);
const renal = live('ui-2', [
  row('ui-2', 'renal-dose-review', 0, 'graded', record('renal-dose-review', 'INFRA_API', { valid: false })),
  row('ui-2', 'renal-dose-review', 1, 'graded', record('renal-dose-review', 'FAIL')),
  row('ui-2', 'renal-dose-review', 2, 'running', null),
], '2026-11-06T10:05:00.000Z');
const cut = live('ui-3', [row('ui-3', '_toy', 0, 'error', null, 'the runner stopped it')]);

describe('sessionRun', () => {
  it('is a run of kind session with one trial per row that holds a record', () => {
    const r = sessionRun(renal);
    expect(r.runId).toBe('ui-2');
    expect(r.kind).toBe('session');
    expect(r.official).toBe(false);
    expect(r.summary).toBeNull();
    expect(r.trials.map((t) => t.name)).toEqual(['ui-2.renal-dose-review.0', 'ui-2.renal-dose-review.1']);
    const t = r.trials[1]!;
    expect(t.task).toBe('renal-dose-review');
    expect(t.audit).toBeNull();
    expect(t.trajectoryUrl).toBeNull();
    expect(t.record.index).toBe(1);
    expect(t.explanation.outcome).toBe('FAIL');
    expect(t.explanation.audited).toBe(false);
  });
});

describe('resolveSessionTrial', () => {
  const runs = [toyPass, renal, cut];
  it('finds a trial by its id in any run of the session', () => {
    const r = resolveSessionTrial(runs, 'ui-2.renal-dose-review.1', false);
    expect(r.kind).toBe('trial');
    if (r.kind === 'trial') {
      expect(r.run.runId).toBe('ui-2');
      expect(r.trial.name).toBe('ui-2.renal-dose-review.1');
    }
  });
  it('resolves first-nonpass to the first valid non-pass trial in start order, skipping PASS and invalid records', () => {
    const r = resolveSessionTrial(runs, FIRST_NONPASS, false);
    expect(r.kind).toBe('trial');
    if (r.kind === 'trial') expect(r.trial.name).toBe('ui-2.renal-dose-review.1');
    const none = resolveSessionTrial([toyPass], FIRST_NONPASS, false);
    expect(none).toEqual({ kind: 'none-nonpass', message: 'No non-pass trial in this session' });
  });
  it('says a trial is still running, or ended without a grade, instead of showing a page', () => {
    expect(resolveSessionTrial(runs, 'ui-2.renal-dose-review.2', false)).toEqual({ kind: 'running', id: 'ui-2.renal-dose-review.2' });
    expect(resolveSessionTrial(runs, 'ui-3._toy.0', false)).toEqual({ kind: 'ended', id: 'ui-3._toy.0', state: 'error', error: 'the runner stopped it' });
  });
  it('says why a trial is not here, in the words of the surface', () => {
    const local = resolveSessionTrial(runs, 'ui-9._toy.0', false);
    expect(local).toEqual({ kind: 'missing', message: missingText('ui-9._toy.0', false) });
    // Claim audit: the runner writes each record to its runs directory, so a restart drops the list, not the records.
    expect(missingText('ui-9._toy.0', false)).toBe('No trial ui-9._toy.0 in this session. The local runner lists the trials it started only while it runs: after a restart this page no longer shows them, and another runner\'s trials are not here. Their records stay in the runner\'s runs directory (~/.clinenv/runs by default).');
    expect(missingText('ui-9._toy.0', true)).toBe('No trial ui-9._toy.0 in this session. A trial run on the hosted site is kept only in the browser tab that ran it, and this tab has no record of it.');
    expect(resolveSessionTrial(runs, 'ui-9._toy.0', true)).toEqual({ kind: 'missing', message: missingText('ui-9._toy.0', true) });
  });
  it('is no-runs when the session holds none, whatever the trial token', () => {
    expect(resolveSessionTrial([], FIRST_NONPASS, true)).toEqual({ kind: 'no-runs' });
    expect(resolveSessionTrial([], 'ui-1._toy.0', false)).toEqual({ kind: 'no-runs' });
  });
  it('names the session run token the URL uses', () => {
    expect(SESSION_RUN).toBe('session');
  });
});
