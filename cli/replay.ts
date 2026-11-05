// pnpm cli replay <run> [--tasks <id,...>] [--overwrite] [--json]
// pnpm cli replay <run> --stamp <commit>
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
// Writes <run>/replay.json, {trials: {"<trialName>": {match?, verdict, outcome, recorded_outcome,
// current_outcome, error?, replayed_at}}}, which `summary --require replay=all` reads. verdict is
// match, mismatch or world_mismatch (that one without match: it is neither); replayed_at is the
// checkout that made the verdict (its commit, whether it was dirty, its world and its
// env_version of the task).
//
// A record of another world than this checkout's is not replayed here. Its entry in the file, when
// it is a verdict of the record as it is now (packages/core/replay.ts isVerdictOf) made where the
// record could be replayed (match or mismatch, at the record's env_version), is kept as it is:
// the committed verdicts of a frozen task, made at its own commit, survive a replay at any later
// checkout, --tasks or not (verifier-phase-P17i-TWOW-229-1 S1). A stale entry (not that record's
// verdict: the record was rewritten under the same name, R42) or a prior world_mismatch is
// replaced by this checkout's world_mismatch, which says where to replay it. --overwrite replaces
// every chosen record's entry, a kept verdict included. A kept entry counts toward the exit code
// as it is.
//
// An entry with no replayed_at is stale whatever its outcomes (verifier-phase-P17i-TWOW-229-2-1
// S1: a record rewritten under the same name with the same outcomes would inherit it).
// `--stamp <commit>` stamps a file written before verdicts were stamped (the replay of tag
// final-1-t3t5 writes one): each unstamped entry of a settled record whose outcomes are the
// record's gets its named verdict and replayed_at {that commit, dirty null, the manifest's
// world for the task, the record's env_version}; an entry whose outcomes differ stops the
// command with nothing written; a stamped entry and an entry of no settled record are left as
// they are. No trial is replayed; --stamp takes no --tasks or --overwrite.
//
// --tasks <id,...> replays only those tasks' settled records (each must have some) and merges
// into replay.json: their entries are made or kept as above, every other entry is kept as it is,
// verdict or not, an entry's task told by the settled record it names (an entry of no record is
// kept and named, whatever its name starts with). Without --tasks the file holds the run's
// records' entries alone. So a run
// whose tasks ran on two worlds (pre-audit-2 B4: T3/T5 frozen on world ba0b0206 at
// results/tasks-final.json, the other tasks appended on a later world, R40) is replayed in two
// steps that no single commit could do in one:
//   1. at the frozen tasks' replay commit (tasks-final.json replay_at: a temp worktree at that
//      tag), on a copy of the run: pnpm cli replay <copy> (that commit's replay has no --tasks
//      and stamps nothing; the copy holds only the frozen tasks' records, as the run did there)
//   2. at the head: copy step 1's replay.json into a copy of the run as it is now, stamp it with
//      pnpm cli replay <copy> --stamp <that commit>, then pnpm cli replay <copy> --tasks <the
//      tasks this checkout's world has>: their entries are made here, the frozen tasks' kept from
//      step 1, and summary --require replay=all reads one file. results/runs/final-1/README.md
//      Reproduce has the commands.
// Exit 0 when every trial replayed here matches and every kept verdict is a match; 1 otherwise
// (a world_mismatch too); 2 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { gradeTrajectory } from '../packages/core/run.ts';
import { runWorldHash } from '../packages/core/explain-context.ts';
import { envChanged, judgeMissed, replayEnvVerdict, replayStateOf, replayVerdict, whyOutcomesDiffer, whyStale, type ReplayedAt, type ReplayVerdict } from '../packages/core/replay.ts';
import { trialName } from '../packages/core/summary.ts';
import { taskVersions, type TaskSource, type TaskVersions } from '../packages/core/tasks.ts';
import { parseTrajectory } from '../packages/core/trajectory.ts';
import type { Grade } from '../packages/grader/grade.ts';
import { JudgeCacheMiss } from '../packages/grader/judge.ts';
import { readManifest, settledRecords, trajectoryOf, writeJson, type StoredRecord } from './adapters/result-sink-node.ts';
import { nodeTaskSource } from './adapters/tasks-node.ts';
import { gitState, REPO, repoWorld, taskChecks } from './run.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
  tasks?: TaskSource;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli replay <run> [--tasks <id,...>] [--overwrite] [--json] | pnpm cli replay <run> --stamp <commit>';

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

// --stamp <commit> (header): stamps the unstamped entries of the run's settled records.
function stampFile(dir: string, commit: string, deps: Deps): number {
  const file = join(dir, 'replay.json');
  if (!existsSync(file)) {
    deps.err(`replay: ${file} is missing; nothing to stamp`);
    return 1;
  }
  const manifest = readManifest(dir);
  const prior = priorEntries(dir);
  const records = new Map(settledRecords(dir).map((s) => [trialName(s.record), s.record]));
  const stamped: string[] = [];
  const already: string[] = [];
  const orphans: string[] = [];
  const refused: string[] = [];
  const next: Record<string, ReplayVerdict> = {};
  for (const [name, entry] of Object.entries(prior)) {
    const r = records.get(name);
    if (r === undefined) {
      orphans.push(name);
      next[name] = entry;
      continue;
    }
    if (typeof entry.replayed_at === 'object' && entry.replayed_at !== null) {
      already.push(name);
      next[name] = entry;
      continue;
    }
    const why = whyOutcomesDiffer(entry, r);
    if (why !== null) {
      refused.push(`replay: ${name}: not stamped: its entry is not this record's verdict (${why})`);
      continue;
    }
    const world = runWorldHash(manifest, r.task_id);
    if (world === null) {
      refused.push(`replay: ${name}: not stamped: the run manifest names no world for ${r.task_id}`);
      continue;
    }
    if (typeof r.env_version !== 'string') {
      refused.push(`replay: ${name}: not stamped: the record has no env_version`);
      continue;
    }
    stamped.push(name);
    next[name] = { ...entry, verdict: replayStateOf(entry), replayed_at: { commit, dirty: null, world_hash: world, env_version: r.env_version } };
  }
  if (refused.length > 0) {
    for (const line of refused) deps.err(line);
    deps.err(`replay: ${refused.length} ${refused.length === 1 ? 'entry' : 'entries'} not stamped; nothing written`);
    return 1;
  }
  writeJson(file, { trials: next });
  const parts = [
    `stamped ${stamped.length} ${stamped.length === 1 ? 'entry' : 'entries'} with commit ${commit.slice(0, 12)}${stamped.length === 0 ? '' : ` (${stamped.join(', ')})`}`,
    ...(already.length === 0 ? [] : [`${already.length} ${already.length === 1 ? 'entry' : 'entries'} already stamped`]),
    ...(orphans.length === 0 ? [] : [`${orphans.length} ${orphans.length === 1 ? 'entry' : 'entries'} of no settled record left as ${orphans.length === 1 ? 'it is' : 'they are'} (${orphans.join(', ')})`]),
    `wrote ${file}`,
  ];
  deps.out(`replay: ${parts.join('; ')}`);
  return 0;
}

// Where a record of another world is reproduced when results/tasks-final.json names no replay_at
// for its task (R37): the run directory's README.md, named as the repository holds the directory
// (results/runs/final-1, not results/<run_id>), or as given when it is outside the checkout.
export function reproducePointer(dir: string): string {
  const rel = relative(REPO, resolve(dir));
  return `reproduce at the commit in ${rel === '' || rel.startsWith('..') || isAbsolute(rel) ? dir : rel}/README.md`;
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  let json = false;
  let overwrite = false;
  let tasksArg: string | undefined;
  let stampArg: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--json') json = true;
    else if (a === '--overwrite') overwrite = true;
    else if (a === '--stamp') {
      if (args[i + 1] === undefined || !/^[0-9a-f]{40}$/.test(args[i + 1] as string)) {
        deps.err(`replay: --stamp needs a 40-hex commit\n${USAGE}`);
        return 2;
      }
      stampArg = args[++i] as string;
    } else if (a === '--tasks') {
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
  if (stampArg !== undefined) {
    if (held !== null || overwrite || json) {
      deps.err(`replay: --stamp takes no --tasks, --overwrite or --json\n${USAGE}`);
      return 2;
    }
    return stampFile(dir, stampArg, deps);
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
  const prior = priorEntries(dir);
  // Entries of chosen records of another world, kept as made at their own commit (header).
  const keptOwn: Record<string, ReplayVerdict> = {};
  const stale: string[] = [];
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
    const reproduce = at === undefined ? reproducePointer(dir) : `replay it at tag ${at.tag} (${at.commit.slice(0, 12)}, results/tasks-final.json replay_at): pnpm cli replay <copy of the run> at that commit, then --tasks the other tasks at this checkout (cli/replay.ts header)`;
    const changed = replayEnvVerdict(r, now.env_version, reproduce);
    if (changed === null) {
      same.push(stored);
      continue;
    }
    const name = trialName(r);
    const had = prior[name];
    if (had !== undefined) {
      const why = whyStale(had, r);
      if (why === null && !overwrite && replayStateOf(had) !== 'world_mismatch') {
        keptOwn[name] = had;
        continue;
      }
      if (why !== null) stale.push(name);
    }
    trials[name] = { ...changed, replayed_at: stamp(now) };
  }
  for (const res of await regradeRun(dir, tasks, same, true)) {
    const name = trialName(res.stored.record);
    const { note, ...v } = replayVerdict(res.stored.record, res);
    if (note !== undefined) notes.push(`replay: ${name}: ${note}`);
    trials[name] = { ...v, replayed_at: stamps.get(res.stored.record.task_id)! };
  }
  // --tasks: every entry that is not a chosen record's is kept as it is (an entry's task is the
  // settled record it names); without it the file is the run's records alone.
  const chosenNames = new Set(chosen.map((s) => trialName(s.record)));
  const taskByName = new Map(records.map((s) => [trialName(s.record), s.record.task_id]));
  const kept = held === null ? {} : Object.fromEntries(Object.entries(prior).filter(([name]) => !chosenNames.has(name)));
  const merged = Object.fromEntries([...Object.entries(kept), ...Object.entries(keptOwn), ...Object.entries(trials)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJson(join(dir, 'replay.json'), { trials: merged });
  const replayed = Object.entries(trials);
  const bad = replayed.filter(([, t]) => t.verdict === 'mismatch');
  const other = replayed.filter(([, t]) => t.verdict === 'world_mismatch');
  const keptBad = Object.entries(keptOwn).filter(([, t]) => replayStateOf(t) !== 'match');
  const say = json ? deps.err : deps.out;
  for (const n of notes) say(n);
  for (const n of stale) say(`replay: ${n}: its replay.json entry was not a verdict of this record (stale), so it is replaced`);
  for (const [name, t] of [...bad, ...other]) say(`replay: ${name}: ${t.error}`);
  for (const [name, t] of keptBad) say(`replay: ${name}: kept as made at its own commit, where it did not reproduce: ${t.error}`);
  const keptOfRecords = Object.keys(kept).filter((name) => taskByName.has(name));
  const keptTasks = [...new Set(keptOfRecords.map((name) => taskByName.get(name) as string))].sort();
  const keptOrphans = Object.keys(kept).filter((name) => !taskByName.has(name));
  const own = Object.keys(keptOwn).length;
  const parts = [
    `${replayed.length - bad.length - other.length} of ${replayed.length} ${held === null ? 'trials' : `replayed trials`} reproduced${held === null ? '' : ` (${held.join(', ')})`}`,
    ...(other.length === 0 ? [] : [`${other.length} ran on another world (${other.map(([name]) => name).join(', ')}): replay ${other.length === 1 ? 'it at its own commit' : 'them at their own commits'} with --tasks, then this checkout's tasks here`]),
    ...(own === 0 ? [] : [`${own} ${own === 1 ? 'entry of a record' : 'entries of records'} of another world kept as made at ${own === 1 ? 'its' : 'their'} own commit (${Object.keys(keptOwn).join(', ')})`]),
    ...(keptTasks.length === 0 ? [] : [`${keptOfRecords.length} ${keptOfRecords.length === 1 ? 'entry' : 'entries'} of another task kept (${keptTasks.join(', ')})`]),
    ...(keptOrphans.length === 0 ? [] : [`${keptOrphans.length} ${keptOrphans.length === 1 ? 'entry' : 'entries'} of no settled record kept (${keptOrphans.join(', ')})`]),
    `wrote ${join(dir, 'replay.json')}`,
  ];
  say(`replay: ${parts.join('; ')}`);
  if (json) deps.out(JSON.stringify({ trials: merged }));
  return bad.length === 0 && other.length === 0 && keptBad.length === 0 ? 0 : 1;
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
