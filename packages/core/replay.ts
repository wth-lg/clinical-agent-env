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
import { currentGrade, type RegradeGrade } from './summary.ts';

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
}

// What regrading the trajectory gave: a grade, a judge cache miss (its message) or an error.
export type ReplayGraded =
  | { grade: { outcome: string; score: number | null; checks: ReadonlyArray<{ id: string; met: unknown }>; error: { message: string } | null } }
  | { miss: string }
  | { error: string };

// One trial's entry in replay.json, plus a note the CLI prints and does not write.
export interface ReplayVerdict {
  match: boolean;
  outcome: string | null;
  recorded_outcome: string;
  current_outcome: string;
  error?: string;
  note?: string;
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
// same one and the trajectory is to be regraded.
export function replayEnvVerdict(r: ReplayRecord, checkoutEnv: string): ReplayVerdict | null {
  return r.env_version === checkoutEnv ? null : { match: false, outcome: null, ...base(r), error: envChanged(r, checkoutEnv) };
}

const metOf = (checks: ReadonlyArray<{ id: string; met: unknown }> | null | undefined) => JSON.stringify((checks ?? []).map((c) => [c.id, c.met]));

// The verdict for a record whose trajectory was regraded (or failed to be).
export function replayVerdict(r: ReplayRecord, res: ReplayGraded): ReplayVerdict {
  if ('miss' in res) return { match: false, outcome: null, ...base(r), error: judgeMissed(res.miss, r) };
  if ('error' in res) return { match: false, outcome: null, ...base(r), error: res.error };
  const g = res.grade;
  const cur = currentGrade(r);
  const checksKnown = !cur.regraded || cur.checks !== null;
  const match = g.outcome === cur.outcome && g.score === cur.score && (!checksKnown || metOf(g.checks) === metOf(cur.checks));
  const was = `the ${cur.regraded ? 'current grade' : 'record'} ${cur.outcome} score ${cur.score}`;
  return {
    match,
    outcome: g.outcome,
    ...base(r),
    ...(match ? {} : { error: g.error?.message ?? `regrade gives ${g.outcome} score ${g.score}, ${was}` }),
    ...(checksKnown ? {} : { note: 'its last regrade recorded no check results; compared outcome and score only' }),
  };
}
