// run=session on the trial page (docs/requirements/ui-contract.md, "Tokens"; trace row N10): the
// runs this surface started, as the Live trial view's Your runs lists them through the surface's
// TrialTransport (the local runner's GET api/runs and each trial's record, or this tab's IndexedDB
// on the hosted site), become runs the TrialPage layout can show, one RunData per live run, of
// kind session. ?trial= names a trial id (run.task.index) in any of them, or first-nonpass: the
// first valid trial whose outcome is not PASS, in run start order then trial index, the one
// definition resolve.ts gives published runs. A row without a record is still running, or ended
// with no grade; an id no run holds is missing, and the message says why in the surface's words.
// Pure: no Vite API, so the unit tests and the e2e specs can load it in Node.
import { explainTrial } from '../../../../packages/core/explain.ts';
import { isValid } from '../../../../packages/core/outcomes.ts';
import type { RunData, Trial, TrialRecord } from '../data/run-types.ts';
import type { LiveRun, LiveTrialRow } from '../live/types.ts';
import { FIRST_NONPASS } from './resolve.ts';

// The ?run= token for this session's runs.
export const SESSION_RUN = 'session';

export type SessionResolved =
  | { kind: 'trial'; run: RunData; trial: Trial }
  | { kind: 'no-runs' }
  | { kind: 'none-nonpass'; message: string }
  | { kind: 'running'; id: string }
  | { kind: 'ended'; id: string; state: LiveTrialRow['state']; error: string | null }
  | { kind: 'missing'; message: string };

// Why a trial id is not in this session, for the surface: the runner holds its trials in memory
// for its own lifetime; the hosted site keeps a trial only in the tab that ran it.
export const missingText = (id: string, hosted: boolean): string =>
  `No trial ${id} in this session. ${hosted
    ? 'A trial run on the hosted site is kept only in the browser tab that ran it, and this tab has no record of it.'
    : 'The local runner keeps the trials it started only while it runs: after a restart they are gone, and another runner\'s trials are not here.'}`;

// A live row's trial as the TrialPage reads one: its id is its name, it has no audit row and no
// trajectory file (the transport keeps its events), and its explanation reads the record alone,
// as the Your runs row does before the events load; the page replaces it with the full one.
function sessionTrial(row: LiveTrialRow, record: NonNullable<LiveTrialRow['record']>): Trial {
  const r = record as Partial<TrialRecord>;
  const rec: TrialRecord = { ...record, task_id: r.task_id ?? row.taskId, index: typeof r.index === 'number' ? r.index : row.index, cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0 };
  return { name: row.trialId, file: '', task: row.taskId, record: rec, audit: null, trajectoryUrl: null, explanation: explainTrial(rec, null, { events: [] }) };
}

// One live run as a run of the session: not counted, no summary, no manifest, its graded rows as trials.
export function sessionRun(run: LiveRun): RunData {
  const trials = run.rows.flatMap((row) => (row.record === null ? [] : [sessionTrial(row, row.record)]));
  const graders = [...new Set(trials.flatMap((t) => (typeof t.record.grader_version === 'string' ? [t.record.grader_version] : [])))].sort();
  return { runId: run.runId, dir: `${SESSION_RUN}/${run.runId}`, official: false, kind: 'session', superseded: null, manifest: null, grading: { graders, olderWorld: 0, frozenWorld: 0, regrade: null }, summary: null, trials, bad: [], warnings: [] };
}

export function resolveSessionTrial(runs: readonly LiveRun[], trial: string, hosted: boolean): SessionResolved {
  if (runs.length === 0) return { kind: 'no-runs' };
  const session = runs.map(sessionRun);
  if (trial === FIRST_NONPASS) {
    for (const run of session) {
      const t = [...run.trials].sort((a, b) => (a.record.index ?? 0) - (b.record.index ?? 0)).find((x) => isValid(x.explanation.outcome) && x.explanation.outcome !== 'PASS');
      if (t !== undefined) return { kind: 'trial', run, trial: t };
    }
    return { kind: 'none-nonpass', message: 'No non-pass trial in this session' };
  }
  for (const run of session) {
    const t = run.trials.find((x) => x.name === trial);
    if (t !== undefined) return { kind: 'trial', run, trial: t };
  }
  for (const run of runs) {
    const row = run.rows.find((x) => x.trialId === trial);
    if (row === undefined) continue;
    if (row.state === 'queued' || row.state === 'running') return { kind: 'running', id: row.trialId };
    return { kind: 'ended', id: row.trialId, state: row.state, error: row.error };
  }
  return { kind: 'missing', message: missingText(trial, hosted) };
}
