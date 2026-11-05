// Whether a replayed trial reproduces its record: the one rule `pnpm cli replay` (cli/replay.ts)
// and the browser's grader validation Worker (apps/web/src/tasks/validation-thread.ts) both
// apply, so the two cannot give different verdicts on the same record.
//
// A trial matches when the record's env_version is the checkout's (what the agent sees: the
// task's env files, the world and the tools, packages/core/tasks.ts) and gradeTrajectory, run on
// its trajectory and judge cache, gives the outcome, score and check results of the record's
// current grade (packages/core/summary.ts currentGrade: its last regrade, else its recorded
// grade). A last regrade entry written before regrade stored check results is compared on
// outcome and score only, with a note. A record with no env_version, a judge cache miss and a
// regrade that threw never match. An excluded record (ENV_ERROR, INFRA) is not graded by
// gradeTrajectory, so it matches when its outcome comes back unchanged.
//
// Each verdict is named (ReplayState): match; mismatch, a regrade that differs, a judge cache
// miss or an error; and world_mismatch, a record of another environment than the checkout's,
// which this checkout cannot replay at all (R37: it is historical data, reproduced at its own
// commit). summary --require replay=all lists the last apart from the mismatches and says where
// to replay it (pre-audit-2 B4).
//
// An entry in replay.json is a verdict of a record only while the record is the one it was made
// on (isVerdictOf): its recorded and current outcomes are the record's, it is stamped with
// replayed_at, and a match or mismatch was made at the record's env_version. A record rewritten
// under the same trial name (a task's new version entering the run, R42) with no replay since
// leaves a stale entry, which summary and audit-check count as not replayed and replay replaces
// (verifier-phase-P17i-TWOW-229-1 S2). An unstamped entry says nothing about which record it was
// made on, so it is stale whatever its outcomes (verifier-phase-P17i-TWOW-229-2-1 S1); a file
// written before verdicts were stamped is stamped by `pnpm cli replay <run> --stamp <commit>`.
import { currentGrade, type RegradeGrade, type ReplayState } from './summary.ts';

export interface ReplayRecord {
  task_id: string;
  task_version: string | null;
  env_version?: string | null;
  model_requested?: string | null;
  outcome: string;
  score?: number | null;
  checks?: ReadonlyArray<{ id: string; met: unknown }> | null;
  grader_task_version?: string | null;
  regrades?: ReadonlyArray<RegradeGrade>;
  // The run the record belongs to (results/<run_id>): R37's reproduce pointer names it.
  run_id?: string | null;
}

// What regrading the trajectory gave: a grade, a judge cache miss (its message) or an error.
export type ReplayGraded =
  | { grade: { outcome: string; score: number | null; checks: ReadonlyArray<{ id: string; met: unknown }>; error: { message: string } | null } }
  | { miss: string }
  | { error: string };

// Where a verdict was made, as cli/replay.ts stamps it: the checkout's commit (null outside
// git) and whether its tracked paths were dirty, its world and its env_version of the record's
// task. A two-step replay (cli/replay.ts header) leaves each task's verdicts stamped with the
// commit that made them.
export interface ReplayedAt {
  commit: string | null;
  dirty: boolean | null;
  world_hash: string;
  env_version: string;
}

// One trial's entry in replay.json, plus a note the CLI prints and does not write.
export interface ReplayVerdict {
  // verdict === 'match', kept beside verdict so a reader of an older replay.json reads the same
  // field. Absent on world_mismatch: the checkout did not replay the trial, so it neither matched
  // nor mismatched, and no reader takes it for a plain mismatch (verifier-phase-P17i-TWOW-229-1 S1).
  match?: boolean;
  verdict: ReplayState;
  outcome: string | null;
  recorded_outcome: string;
  current_outcome: string;
  error?: string;
  note?: string;
  replayed_at?: ReplayedAt;
}

// Why a record's trial is not this checkout's environment. A record written before env_version
// existed has none, and never matches.
export const envChanged = (r: Pick<ReplayRecord, 'env_version' | 'task_version'>, now: string): string =>
  `environment changed: run at env_version ${r.env_version ?? `(none: recorded before env_version, task_version ${r.task_version})`}, checkout at ${now}`;

// A judge cache miss on replay, said plainly with every cause: the cache key holds the judge
// model, the [judge] effort, the judge prompt version, the judge question and the graded text
// (packages/grader/judge.ts), so a change to any of them since the run misses, as does a cache
// that never held the answer. No offline command asks the judge. cli/regrade.ts prints the same
// text, so the two cannot drift.
export const judgeMissed = (miss: string, r: Pick<ReplayRecord, 'task_id' | 'model_requested'>): string =>
  `judge cache miss ${/judge cache miss ([0-9a-f]+)/.exec(miss)?.[1] ?? miss}: the record's judge cache has no answer for this question. ` +
  'The judge cache key has five parts: the judge model, the [judge] effort, the judge prompt version, the judge question and the text the grader gives the judge. ' +
  'One of them may have changed since this run. ' +
  "Or the record's cache never held this answer, for example because the entry was removed. " +
  `Only a new run grades with the judge: pnpm cli run --task ${r.task_id} --model ${r.model_requested} --out <new run dir> (pnpm cli oracle --task ${r.task_id} --live-judge refreshes only the matrix cache).`;

const base = (r: ReplayRecord) => ({ recorded_outcome: r.outcome, current_outcome: currentGrade(r).outcome });

// The verdict for a record run in another environment than the checkout's; null when it is the
// same one and the trajectory is to be regraded. reproduce: where to replay it, after the
// reason; by default the commit the run's README.md names (R37). cli/replay.ts passes the task's
// replay_at from results/tasks-final.json when the freeze names one.
export function replayEnvVerdict(r: ReplayRecord, checkoutEnv: string, reproduce = `reproduce at the commit in results/${r.run_id || '<run>'}/README.md`): ReplayVerdict | null {
  return r.env_version === checkoutEnv ? null : { verdict: 'world_mismatch', outcome: null, ...base(r), error: `${envChanged(r, checkoutEnv)}; ${reproduce}` };
}

// A replay.json entry as a file holds it, before any check: a file written before verdicts were
// named has match alone; one written before the outcomes were recorded has neither outcome.
export type ReplayEntry = Partial<Record<'match' | 'verdict' | 'outcome' | 'recorded_outcome' | 'current_outcome' | 'error' | 'note' | 'replayed_at', unknown>>;

// An entry's verdict: the named one, else match or mismatch from its match field.
export function replayStateOf(entry: ReplayEntry): ReplayState {
  const states: readonly unknown[] = ['match', 'mismatch', 'world_mismatch'];
  return states.includes(entry.verdict) ? (entry.verdict as ReplayState) : entry.match === true ? 'match' : 'mismatch';
}

export const UNSTAMPED = 'no replayed_at: written before verdicts were stamped; pnpm cli replay <run> --stamp <commit> stamps it';

// Why an entry's outcomes are not this record's, or null when they are (the part of whyStale
// that --stamp checks before it stamps).
export function whyOutcomesDiffer(entry: ReplayEntry, r: ReplayRecord): string | null {
  const cur = currentGrade(r).outcome;
  if (entry.recorded_outcome === undefined && entry.current_outcome === undefined) return 'no recorded or current outcome in the entry';
  if (entry.recorded_outcome !== r.outcome) return `recorded ${String(entry.recorded_outcome)}, the record ${r.outcome}`;
  if (entry.current_outcome !== cur) return `current ${String(entry.current_outcome)}, the record's current grade ${cur}`;
  return null;
}

// Why an entry is not a verdict of this record as it is now (header), or null when it is. A
// world_mismatch entry is stamped with the replaying checkout's env_version, which is not the
// record's by definition, so only its outcomes and its stamp are checked.
export function whyStale(entry: ReplayEntry, r: ReplayRecord): string | null {
  const outcomes = whyOutcomesDiffer(entry, r);
  if (outcomes !== null) return outcomes;
  const at = entry.replayed_at;
  if (typeof at !== 'object' || at === null) return UNSTAMPED;
  if (replayStateOf(entry) === 'world_mismatch') return null;
  const env = (at as { env_version?: unknown }).env_version;
  return env === (r.env_version ?? null) ? null : `made at env_version ${String(env)}, the record's ${r.env_version ?? '(none)'}`;
}

export const isVerdictOf = (entry: ReplayEntry, r: ReplayRecord): boolean => whyStale(entry, r) === null;

const metOf = (checks: ReadonlyArray<{ id: string; met: unknown }> | null | undefined) => JSON.stringify((checks ?? []).map((c) => [c.id, c.met]));

// The verdict for a record whose trajectory was regraded (or failed to be).
export function replayVerdict(r: ReplayRecord, res: ReplayGraded): ReplayVerdict {
  if ('miss' in res) return { match: false, verdict: 'mismatch', outcome: null, ...base(r), error: judgeMissed(res.miss, r) };
  if ('error' in res) return { match: false, verdict: 'mismatch', outcome: null, ...base(r), error: res.error };
  const g = res.grade;
  const cur = currentGrade(r);
  const checksKnown = !cur.regraded || cur.checks !== null;
  const match = g.outcome === cur.outcome && g.score === cur.score && (!checksKnown || metOf(g.checks) === metOf(cur.checks));
  const was = `the ${cur.regraded ? 'current grade' : 'record'} ${cur.outcome} score ${cur.score}`;
  return {
    match,
    verdict: match ? 'match' : 'mismatch',
    outcome: g.outcome,
    ...base(r),
    ...(match ? {} : { error: g.error?.message ?? `regrade gives ${g.outcome} score ${g.score}, ${was}` }),
    ...(checksKnown ? {} : { note: 'its last regrade recorded no check results; compared outcome and score only' }),
  };
}
