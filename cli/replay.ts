// pnpm cli replay <run> [--json]
// Re-executes every settled trial's tool log against a fresh store and grades it again from the
// record's judge cache (packages/core/run.ts gradeTrajectory), with no model call and no client:
// a judge cache miss is an error, named with its trial and cache key. Whether a trial matches is
// packages/core/replay.ts, the rule the browser's grader validation Worker applies too: the
// record's env_version is the checkout's and the grade has the outcome, score and check results
// of the record's current grade (its last cli regrade, else its recorded grade). A trial run in
// another environment is not replayed and does not match (regrade still grades it, and refuses
// it when its trajectory does not reach the record's state). A change to the task's grader-side
// files or the grader (its grader_task_version) does not stop a replay: after a grader fix and a
// regrade (the GRADER_ERROR policy, packages/grader/grade.ts), replay compares the trajectory
// against the regraded current grade, so `summary --require replay=all` can pass on that run.
// Writes <run>/replay.json, {trials: {"<trialName>": {match, outcome,
// recorded_outcome, current_outcome, error?}}}, which `summary --require replay=all` reads. Exit 0 when every trial
// matches; 1 otherwise; 2 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { gradeTrajectory } from '../packages/core/run.ts';
import { envChanged, judgeMissed, replayEnvVerdict, replayVerdict, type ReplayVerdict } from '../packages/core/replay.ts';
import { trialName } from '../packages/core/summary.ts';
import { taskVersions, type TaskSource, type TaskVersions } from '../packages/core/tasks.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import type { Grade } from '../packages/grader/grade.ts';
import { JudgeCacheMiss } from '../packages/grader/judge.ts';
import { settledRecords, trajectoryOf, writeJson, type StoredRecord } from './adapters/result-sink-node.ts';
import { nodeTaskSource } from './adapters/tasks-node.ts';
import { repoWorld, taskChecks } from './run.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  tasks?: TaskSource;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };

export type Regraded = { stored: StoredRecord; grade: Grade } | { stored: StoredRecord; miss: string } | { stored: StoredRecord; error: string };

// Grades each settled record of a run again from its trajectory and judge cache.
export async function regradeRun(dir: string, tasks: TaskSource, records = settledRecords(dir)): Promise<Regraded[]> {
  const { world, definitions } = repoWorld();
  const out: Regraded[] = [];
  for (const stored of records) {
    const r = stored.record;
    try {
      const events = parseTrajectory(readFileSync(trajectoryOf(dir, r), 'utf8'));
      out.push({ stored, grade: await gradeTrajectory(r.task_id, { tasks, world, checks: await taskChecks(r.task_id), events, record: r, definitions }) });
    } catch (e) {
      if (e instanceof JudgeCacheMiss) out.push({ stored, miss: e.message });
      else out.push({ stored, error: (e as Error).message });
    }
  }
  return out;
}

// The checkout's versions of each task, looked up once.
export function checkoutVersions(tasks: TaskSource): (id: string) => Promise<TaskVersions> {
  const { worldHash } = repoWorld();
  const versions = new Map<string, Promise<TaskVersions>>();
  return (id) => {
    if (!versions.has(id)) versions.set(id, tasks.get(id).then((t) => taskVersions(t, worldHash)));
    return versions.get(id) as Promise<TaskVersions>;
  };
}

// audit-check names trials through replay; the one definition is packages/core/summary.ts.
export { trialName };
// regrade prints the same environment and judge-miss reasons; the match rule is packages/core/replay.ts.
export { envChanged, judgeMissed };

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  const json = args.includes('--json');
  const rest = args.filter((a) => a !== '--json');
  if (rest.length !== 1 || rest[0]!.startsWith('--')) {
    deps.err('usage: pnpm cli replay <run> [--json]');
    return 2;
  }
  const dir = rest[0] as string;
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`replay: ${dir} has no trials/ directory`);
    return 1;
  }
  const tasks = deps.tasks ?? nodeTaskSource({ testMode: false });
  const trials: Record<string, ReplayVerdict> = {};
  const notes: string[] = [];
  const current = checkoutVersions(tasks);
  const same: StoredRecord[] = [];
  for (const stored of settledRecords(dir)) {
    const r = stored.record;
    let now: TaskVersions;
    try {
      now = await current(r.task_id);
    } catch (e) {
      trials[trialName(r)] = replayVerdict(r, { error: (e as Error).message });
      continue;
    }
    const changed = replayEnvVerdict(r, now.env_version);
    if (changed === null) same.push(stored);
    else trials[trialName(r)] = changed;
  }
  for (const res of await regradeRun(dir, tasks, same)) {
    const name = trialName(res.stored.record);
    const { note, ...v } = replayVerdict(res.stored.record, res);
    if (note !== undefined) notes.push(`replay: ${name}: ${note}`);
    trials[name] = v;
  }
  writeJson(join(dir, 'replay.json'), { trials });
  const bad = Object.entries(trials).filter(([, t]) => !t.match);
  const say = json ? deps.err : deps.out;
  for (const n of notes) say(n);
  for (const [name, t] of bad) say(`replay: ${name}: ${t.error}`);
  say(`replay: ${Object.keys(trials).length - bad.length} of ${Object.keys(trials).length} trials reproduced; wrote ${join(dir, 'replay.json')}`);
  if (json) deps.out(JSON.stringify({ trials }));
  return bad.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
