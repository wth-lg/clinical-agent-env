// pnpm cli replay <run> [--tasks <id,...>] [--json]
// Re-executes every settled trial's tool log against a fresh store and grades it again from the
// record's judge cache (packages/core/run.ts gradeTrajectory), with no model call and no client:
// a judge cache miss is an error, named with its trial and cache key. Whether a trial matches is
// packages/core/replay.ts, the rule the browser's grader validation Worker applies too: the
// record's env_version is the checkout's and the grade has the outcome, score and check results
// of the record's current grade (its last cli regrade, else its recorded grade). A trial run in
// another environment is not replayed here: its verdict is world_mismatch, named apart from a
// regrade that differs (R37: a run directory is historical data, reproduced at its own commit;
// regrade still grades it, and refuses it when its trajectory does not reach the record's
// state). A change to the task's grader-side files or the grader (its grader_task_version) does
// not stop a replay: after a grader fix and a regrade (the GRADER_ERROR policy,
// packages/grader/grade.ts), replay compares the trajectory against the regraded current grade,
// so `summary --require replay=all` can pass on that run.
//
// Writes <run>/replay.json, {trials: {"<trialName>": {match, verdict, outcome, recorded_outcome,
// current_outcome, error?, replayed_at}}}, which `summary --require replay=all` reads. verdict is
// match, mismatch or world_mismatch; replayed_at is the checkout that made the verdict (its
// commit, whether it was dirty, its world and its env_version of the task).
//
// --tasks <id,...> replays only those tasks' settled records (each must have some) and merges
// into replay.json: their entries are replaced, every other task's entry is kept as it is.
// Without --tasks the file is written from the run's records alone. So a run whose tasks ran on
// two worlds (pre-audit-2 B4: T3/T5 frozen on world ba0b0206 at results/tasks-final.json, the
// other tasks appended on a later world, R40) is replayed in two steps that no single commit
// could do in one:
//   1. at the frozen tasks' replay commit (tasks-final.json replay_at: a temp worktree at that
//      tag), on a copy of the run: pnpm cli replay <copy> (that commit's replay has no --tasks;
//      the copy holds only the frozen tasks' records, as the run did at that commit)
//   2. at the head: copy step 1's replay.json into a copy of the run as it is now, then
//      pnpm cli replay <copy> --tasks <the tasks this checkout's world has>: their entries are
//      made here, the frozen tasks' kept from step 1, and summary --require replay=all reads
//      one file. results/runs/final-1/README.md Reproduce has the commands.
// A plain `pnpm cli replay <run>` at the head rewrites the frozen tasks' entries as
// world_mismatch, so a merged file is made again by the two steps, never by one.
// Exit 0 when every replayed trial matches; 1 otherwise (a world_mismatch too); 2 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { gradeTrajectory } from '../packages/core/run.ts';
import { envChanged, judgeMissed, replayEnvVerdict, replayVerdict, type ReplayedAt, type ReplayVerdict } from '../packages/core/replay.ts';
import { trialName } from '../packages/core/summary.ts';
import { taskVersions, type TaskSource, type TaskVersions } from '../packages/core/tasks.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import type { Grade } from '../packages/grader/grade.ts';
import { JudgeCacheMiss } from '../packages/grader/judge.ts';
import { settledRecords, trajectoryOf, writeJson, type StoredRecord } from './adapters/result-sink-node.ts';
import { nodeTaskSource } from './adapters/tasks-node.ts';
import { gitState, REPO, repoWorld, taskChecks } from './run.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  tasks?: TaskSource;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli replay <run> [--tasks <id,...>] [--json]';

export type Regraded = { stored: StoredRecord; grade: Grade } | { stored: StoredRecord; miss: string } | { stored: StoredRecord; error: string };

// Grades each settled record of a run again from its trajectory and judge cache. compareResults:
// also compare each re-executed call with its recorded tool_result (replay, on records of this
// checkout's env_version; regrade leaves it off).
export async function regradeRun(dir: string, tasks: TaskSource, records = settledRecords(dir), compareResults = false): Promise<Regraded[]> {
  const { world, definitions } = repoWorld();
  const out: Regraded[] = [];
  for (const stored of records) {
    const r = stored.record;
    try {
      const events = parseTrajectory(readFileSync(trajectoryOf(dir, r), 'utf8'));
      out.push({ stored, grade: await gradeTrajectory(r.task_id, { tasks, world, checks: await taskChecks(r.task_id), events, record: r, definitions, compareResults }) });
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

// Where a frozen task's records are reproduced (results/tasks-final.json replay_at, R37), by
// task; {} without the file or the field.
function replayAtOf(): Record<string, { tag: string; commit: string }> {
  const file = join(REPO, 'results/tasks-final.json');
  if (!existsSync(file)) return {};
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { tasks?: Record<string, { replay_at?: { tag?: unknown; commit?: unknown } }> };
  return Object.fromEntries(Object.entries(doc.tasks ?? {}).flatMap(([id, t]) => (typeof t.replay_at?.tag === 'string' && typeof t.replay_at.commit === 'string' ? [[id, { tag: t.replay_at.tag, commit: t.replay_at.commit }]] : [])));
}

// replay.json's entries as the file holds them; {} without the file.
function priorEntries(dir: string): Record<string, ReplayVerdict> {
  const file = join(dir, 'replay.json');
  if (!existsSync(file)) return {};
  return (JSON.parse(readFileSync(file, 'utf8')) as { trials?: Record<string, ReplayVerdict> }).trials ?? {};
}

// The task a replay.json entry belongs to: its name starts with the task id (trialName).
const taskOf = (name: string) => (name.includes('/') ? name.slice(0, name.indexOf('/')) : name);

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  let json = false;
  let tasksArg: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--json') json = true;
    else if (a === '--tasks') {
      if (args[i + 1] === undefined) {
        deps.err(`replay: --tasks needs a list of task ids\n${USAGE}`);
        return 2;
      }
      tasksArg = args[++i] as string;
    } else rest.push(a);
  }
  if (rest.length !== 1 || rest[0]!.startsWith('--')) {
    deps.err(USAGE);
    return 2;
  }
  const held = tasksArg === undefined ? null : tasksArg.split(',').map((t) => t.trim()).filter((t) => t !== '');
  if (held !== null && held.length === 0) {
    deps.err(`replay: --tasks needs at least one task id\n${USAGE}`);
    return 2;
  }
  const dir = rest[0] as string;
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`replay: ${dir} has no trials/ directory`);
    return 1;
  }
  const records = settledRecords(dir);
  if (held !== null) {
    const have = new Set(records.map((s) => s.record.task_id));
    const none = held.filter((t) => !have.has(t));
    for (const t of none) deps.err(`replay: no settled records of ${t} in ${dir}`);
    if (none.length > 0) return 1;
  }
  const chosen = held === null ? records : records.filter((s) => held.includes(s.record.task_id));
  const tasks = deps.tasks ?? nodeTaskSource({ testMode: false });
  const trials: Record<string, ReplayVerdict> = {};
  const notes: string[] = [];
  const current = checkoutVersions(tasks);
  const git = gitState(REPO);
  const { worldHash } = repoWorld();
  const replayAt = replayAtOf();
  const stamp = (now: TaskVersions): ReplayedAt => ({ commit: git.sha, dirty: git.dirty === null ? null : git.dirty.length > 0, world_hash: worldHash, env_version: now.env_version });
  const same: StoredRecord[] = [];
  const stamps = new Map<string, ReplayedAt>();
  for (const stored of chosen) {
    const r = stored.record;
    let now: TaskVersions;
    try {
      now = await current(r.task_id);
    } catch (e) {
      trials[trialName(r)] = replayVerdict(r, { error: (e as Error).message });
      continue;
    }
    stamps.set(r.task_id, stamp(now));
    const at = replayAt[r.task_id];
    const reproduce = at === undefined ? undefined : `replay it at tag ${at.tag} (${at.commit.slice(0, 12)}, results/tasks-final.json replay_at): pnpm cli replay <copy of the run> at that commit, then --tasks the other tasks at this checkout (cli/replay.ts header)`;
    const changed = replayEnvVerdict(r, now.env_version, reproduce);
    if (changed === null) same.push(stored);
    else trials[trialName(r)] = { ...changed, replayed_at: stamp(now) };
  }
  for (const res of await regradeRun(dir, tasks, same, true)) {
    const name = trialName(res.stored.record);
    const { note, ...v } = replayVerdict(res.stored.record, res);
    if (note !== undefined) notes.push(`replay: ${name}: ${note}`);
    trials[name] = { ...v, replayed_at: stamps.get(res.stored.record.task_id)! };
  }
  // --tasks: every other task's entry is kept as it is; without it the file is the run's records alone.
  const kept = held === null ? {} : Object.fromEntries(Object.entries(priorEntries(dir)).filter(([name]) => !held.includes(taskOf(name))));
  const merged = Object.fromEntries([...Object.entries(kept), ...Object.entries(trials)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJson(join(dir, 'replay.json'), { trials: merged });
  const replayed = Object.entries(trials);
  const bad = replayed.filter(([, t]) => t.verdict === 'mismatch');
  const other = replayed.filter(([, t]) => t.verdict === 'world_mismatch');
  const say = json ? deps.err : deps.out;
  for (const n of notes) say(n);
  for (const [name, t] of [...bad, ...other]) say(`replay: ${name}: ${t.error}`);
  const keptTasks = [...new Set(Object.keys(kept).map(taskOf))].sort();
  const parts = [
    `${replayed.length - bad.length - other.length} of ${replayed.length} ${held === null ? 'trials' : `replayed trials`} reproduced${held === null ? '' : ` (${held.join(', ')})`}`,
    ...(other.length === 0 ? [] : [`${other.length} ran on another world (${other.map(([name]) => name).join(', ')}): replay ${other.length === 1 ? 'it at its own commit' : 'them at their own commits'} with --tasks, then this checkout's tasks here`]),
    ...(keptTasks.length === 0 ? [] : [`${Object.keys(kept).length} ${Object.keys(kept).length === 1 ? 'entry' : 'entries'} of another task kept (${keptTasks.join(', ')})`]),
    `wrote ${join(dir, 'replay.json')}`,
  ];
  say(`replay: ${parts.join('; ')}`);
  if (json) deps.out(JSON.stringify({ trials: merged }));
  return bad.length === 0 && other.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
