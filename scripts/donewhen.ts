// Prints one PASS/FAIL line per done-when clause (1)-(7) with the evidence it read,
// and exits 0 only on 7/7. Run from the repo root: `pnpm donewhen`.
//
// Where a CLI command exists for a clause, this script only runs it and reads its exit code
// and JSON; it computes nothing itself. A command that is not built yet (the dispatcher exits
// 127) is a FAIL with reason 'command not built'. The CLI contracts it relies on:
//   cli oracle --task all --json        exit 0 when every task passes; {tasks: [{id, score}]}
//   cli summary <run> --tasks ... --require ... --json
//                                       exit 0 when the requirements hold;
//                                       {tasks: {<id>: {passes, trials, task_versions, env_versions, grader_task_versions}},
//                                        initial_state_hashes: [...], totals: {grader_error, grader_error_history}}
//   cli task-hash --task ... --json     {tasks: [{id, env_version}]}: whether a frozen task's env side
//                                       has moved on this checkout (informational, R37)
//   cli audit-check <run> --final --json
//                                       exit 0 when every failure is labelled and none is
//                                       environment or grader; {failures, labelled, labelled_environment, labelled_grader}
//   cli spend --json                    {total_usd}, printed as an INFO line
//   cli runner-check --mock --json      exit 0 when the local runner passes every check;
//                                       {events_equal}: its streamed events equal run-one's
//
// Clause (1) passes when `runner-check --mock` exits 0 and README.md names LOCAL_START_COMMAND,
// LOCAL_PREREQUISITES, NODE_INSTALL_URL and PNPM_INSTALL_URL (apps/web/src/surface/command.ts)
// and the hosted URL. Clause (2) passes when cli/run-one.ts,
// cli/run.ts, apps/runner/main.ts and a Worker module under apps/web/src (a file named *worker*)
// each reach packages/core/run.ts through their relative value imports (`import type`, `export
// type` and imports inside comments do not count: none loads the module), and runner-check
// reports events_equal: the runner streams the trajectory run-one writes. runner-check --mock
// runs once; both clauses read its result.
//
// Clauses (4) and (5) read one summary of results/runs/final-1 (P21): N and the band come from
// packages/core/cost.ts FINAL_TRIALS_PER_TASK and FINAL_PASS_BAND, and the tasks from
// results/tasks-final.json, the per-task freeze (scripts/test/tasks-final.test.ts holds its shape).
// Both check the records against each task's freeze entry, never against the current checkout
// (R40: the shared world may be rebuilt after a task's final run, which moves its env_version on
// main while its records stay valid at the frozen versions). Clause (4): every trial started
// from a frozen task's world_hash (R14-37). Clause (5) passes only when every task of the
// checkout is frozen, each has N valid trials in the band, every record is at its frozen
// task_version and env_version, and every current grade at its frozen grader_task_version (the
// last regrades entry, else the freeze's); it names the tasks not frozen yet, still summarizes
// the frozen ones, and, when a frozen task's env_version has moved on this checkout, says the
// records are historical and names the reproduce commit: the tag in frozen_at, resolved with git
// when this checkout has it, else a warning (the coordinator tags the freeze's squash-merge
// commit after the merge), never a failure (R37). Clause (6) runs
// `audit-check --final` (R14-33) and `summary --require grader_error=0`, which reads each
// record's current grade after any offline regrade and prints grader_error_history for
// disclosure.
//
// Clause (7) runs `pnpm docs:check` (scripts/docs-check.ts) and reads its exit code.
//
// Test hooks, honored only when NODE_ENV=test: DONEWHEN_CLI replaces `node cli/index.ts`
// (space-separated command prefix); DONEWHEN_DOCS_CHECK replaces `node scripts/docs-check.ts`
// (a space-separated command line); DONEWHEN_MIN_TASKS replaces the minimum of 5 tasks;
// DONEWHEN_INCLUDE_UNDERSCORE=1 makes clause (3) count _-prefixed task directories (tasks/_toy),
// so the real oracle can be checked before any real task exists.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../apps/web/src/surface/command.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../packages/core/cost.ts';
import { WRITEUP_SECTIONS } from './docs-lib.ts';

const FINAL_RUN = 'results/runs/final-1';
const TASKS_FINAL = 'results/tasks-final.json';
const MODEL = 'claude-opus-5-5';
const HOSTED_URL = 'https://wth-lg.github.io/clinical-agent-env/';
const MIN_TASKS = 5;
const TASK_FILES = ['instruction.md', 'task.toml', 'tests/grader.ts', 'solution/solve.ts'];
const CORE_RUN = 'packages/core/run.ts';
// The entry points clause (2) follows to packages/core/run.ts.
const RUN_ENTRIES = ['cli/run-one.ts', 'cli/run.ts', 'apps/runner/main.ts'];
// A relative module specifier in a static import or re-export that is not `type`-only, a
// dynamic import() or a side-effect import.
const RELATIVE_IMPORT = /\b(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
// Block comments, and line comments that start a line or follow whitespace (not the // of a URL).
const COMMENTS = /\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm;
const RUNNER_CHECK = ['runner-check', '--mock', '--json'];
const NOT_BUILT = 127;

const root = process.cwd();
const isTest = process.env.NODE_ENV === 'test';

type Verdict = { pass: boolean; evidence: string };
type CliResult = { exit: number | null; json: unknown };

const cliCache = new Map<string, CliResult>();

function cli(args: string[]): CliResult {
  const key = args.join(' ');
  const cached = cliCache.get(key);
  if (cached) return cached;
  const override = isTest ? process.env.DONEWHEN_CLI : undefined;
  const [cmd, ...prefix] = override ? override.split(' ') : [process.execPath, join(root, 'cli/index.ts')];
  const r = spawnSync(cmd!, [...prefix, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  let json: unknown;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const result = { exit: r.status, json };
  cliCache.set(key, result);
  return result;
}

function describeExit(name: string, r: CliResult): string {
  if (r.exit === NOT_BUILT) return `${name}: command not built`;
  return `${name}: exit ${r.exit}${r.json === undefined ? ', no JSON output' : ''}`;
}

function read(rel: string): string {
  const path = join(root, rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function walk(rel: string): string[] {
  const dir = join(root, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

function clause1(): Verdict {
  const readme = read('README.md');
  const url = readme.includes(HOSTED_URL);
  const command = readme.includes(LOCAL_START_COMMAND);
  const needs = Object.entries({ LOCAL_PREREQUISITES, NODE_INSTALL_URL, PNPM_INSTALL_URL }).map(([name, text]) => [name, readme.includes(text)] as const);
  const r = cli(RUNNER_CHECK);
  return {
    pass: url && command && needs.every(([, has]) => has) && r.exit === 0,
    evidence: `README names LOCAL_START_COMMAND: ${yesNo(command)}, ${needs.map(([name, has]) => `${name}: ${yesNo(has)}`).join(', ')}, hosted URL: ${yesNo(url)}; ${describeExit('runner-check --mock', r)}`,
  };
}

// Whether `rel` reaches packages/core/run.ts through relative imports (itself included).
function reachesCoreRun(rel: string): boolean {
  const target = join(root, CORE_RUN);
  const seen = new Set<string>();
  const todo = [join(root, rel)];
  while (todo.length > 0) {
    const file = todo.pop() as string;
    if (file === target) return existsSync(file);
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').replace(COMMENTS, '$1').matchAll(RELATIVE_IMPORT)) {
      const next = resolve(dirname(file), (m[1] ?? m[2]) as string);
      if (/\.tsx?$/.test(next)) todo.push(next);
    }
  }
  return false;
}

function clause2(): Verdict {
  const entries = RUN_ENTRIES.map((rel) => [rel, reachesCoreRun(rel)] as const);
  const workers = walk('apps/web/src').filter((f) => /worker[^/]*\.tsx?$/i.test(f)).map((f) => f.slice(root.length + 1));
  const worker = workers.some(reachesCoreRun);
  const r = cli(RUNNER_CHECK);
  const equal = (r.json as { events_equal?: unknown } | undefined)?.events_equal === true;
  return {
    pass: existsSync(join(root, CORE_RUN)) && entries.every(([, ok]) => ok) && worker && equal,
    evidence: `${[...entries.map(([rel, ok]) => `${rel}: ${yesNo(ok)}`), `apps/web/src worker: ${yesNo(worker)}`].join(', ')} reach ${CORE_RUN}; runner-check events equal run-one: ${r.exit === NOT_BUILT ? 'command not built' : yesNo(equal)}`,
  };
}

function hasRubric(taskDir: string): boolean {
  if (/^\s*\[\[?rubric\b/m.test(read(`${taskDir}/task.toml`))) return true;
  return walk(taskDir).some((f) => /(^|\/)rubric\.[^/]+$/.test(f));
}

// The checkout's task ids: each directory under tasks/, _-prefixed ones only when the test hook
// says so.
function taskIds(): string[] {
  const underscore = isTest && process.env.DONEWHEN_INCLUDE_UNDERSCORE === '1';
  const tasksDir = join(root, 'tasks');
  return existsSync(tasksDir)
    ? readdirSync(tasksDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && (underscore || !e.name.startsWith('_')) && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort()
    : [];
}

function clause3(): Verdict {
  const min = isTest && process.env.DONEWHEN_MIN_TASKS ? Number(process.env.DONEWHEN_MIN_TASKS) : MIN_TASKS;
  const tasksDir = join(root, 'tasks');
  const ids = taskIds();
  if (ids.length < min) return { pass: false, evidence: `${ids.length} task(s), need ${min}` };
  const gaps: string[] = [];
  for (const id of ids) {
    const missing = TASK_FILES.filter((f) => !existsSync(join(tasksDir, id, f)));
    if (!hasRubric(`tasks/${id}`)) missing.push('rubric');
    if (missing.length) gaps.push(`${id} lacks ${missing.join(', ')}`);
  }
  if (gaps.length) return { pass: false, evidence: `${ids.length} task(s); ${gaps.join('; ')}` };
  const r = cli(['oracle', '--task', 'all', '--json']);
  const scores = new Map(
    ((r.json as { tasks?: Array<{ id: string; score: number }> } | undefined)?.tasks ?? []).map((t) => [t.id, t.score]),
  );
  const below = ids.filter((id) => scores.get(id) !== 1);
  const pass = r.exit === 0 && below.length === 0;
  const detail = r.exit === NOT_BUILT || r.json === undefined ? '' : `, ${ids.length - below.length}/${ids.length} at 1.0`;
  return {
    pass,
    evidence: `${ids.length} complete task(s); ${describeExit('oracle', r)}${detail}${below.length && detail ? ` (not 1.0: ${below.join(', ')})` : ''}`,
  };
}

// The per-task freeze, results/tasks-final.json: each frozen task's versions. Read once per run.
type FrozenTask = { task_version: string; grader_task_version: string; env_version: string; world_hash: string; frozen_at: { tag: string }; frozen_from_branch: string; replay_at?: { tag: string; commit: string }; regrades?: Array<{ grader_task_version: string }> };
type Frozen = { tasks: Record<string, FrozenTask> };
const STRING_FIELDS = ['task_version', 'grader_task_version', 'env_version', 'world_hash', 'frozen_from_branch'] as const;
// The commit a freeze tag names on this checkout, or null when the tag is not here yet.
function resolveTag(tag: string): string | null {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
// The grader_task_version a frozen task's current grades are held to: its last regrade's, else the freeze's.
const heldGrader = (t: FrozenTask) => t.regrades?.at(-1)?.grader_task_version ?? t.grader_task_version;
let frozenRead: { frozen: Frozen | null; problem: string } | undefined;
function readFrozen(): { frozen: Frozen | null; problem: string } {
  if (frozenRead) return frozenRead;
  const file = join(root, TASKS_FINAL);
  if (!existsSync(file)) return (frozenRead = { frozen: null, problem: `${TASKS_FINAL}: missing` });
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Frozen;
    if (doc === null || typeof doc !== 'object' || doc.tasks === null || typeof doc.tasks !== 'object' || Array.isArray(doc.tasks)) throw new Error('tasks must be an object keyed by task id');
    for (const [id, t] of Object.entries(doc.tasks)) {
      for (const k of STRING_FIELDS) if (typeof t?.[k] !== 'string') throw new Error(`tasks.${id}.${k} must be a string`);
      if (typeof t?.frozen_at?.tag !== 'string') throw new Error(`tasks.${id}.frozen_at.tag must be a string`);
      if (t.replay_at !== undefined && (typeof t.replay_at?.tag !== 'string' || typeof t.replay_at?.commit !== 'string')) throw new Error(`tasks.${id}.replay_at must hold a tag and a commit`);
    }
    return (frozenRead = { frozen: doc, problem: '' });
  } catch (e) {
    return (frozenRead = { frozen: null, problem: `${TASKS_FINAL}: ${(e as Error).message}` });
  }
}

// Clause (5)'s summary call: the frozen tasks held to N valid trials in the band (the constants),
// no raw ENV_ERROR, no current GRADER_ERROR, the model, replay=all (the replay.json P22 writes).
// env_limit=0: an ENV_LIMIT is never rerun and a human reviews it first, so the final run passes
// only with none (verifier-phase-P17i-W0-A-r3-1 M4). Clause (4) reads the same call.
const summaryArgs = (frozenIds: string[]) => [
  'summary',
  FINAL_RUN,
  ...(frozenIds.length > 0 ? ['--tasks', frozenIds.join(',')] : []),
  '--require',
  `valid=${FINAL_TRIALS_PER_TASK},band=${FINAL_PASS_BAND[0]}-${FINAL_PASS_BAND[1]},env_error_raw=0,grader_error=0,model=${MODEL},replay=all,env_limit=0`,
  '--json',
];
const frozenIds = () => Object.keys(readFrozen().frozen?.tasks ?? {}).sort();

type SummaryTaskJson = { passes: number; trials: number; task_versions?: string[]; env_versions?: string[]; grader_task_versions?: string[] };
type SummaryJson = { tasks?: Record<string, SummaryTaskJson>; initial_state_hashes?: unknown; totals?: { grader_error?: number; grader_error_history?: number } };

// R14-37, per R40: every trial started from a frozen task's world (its world_hash in the freeze),
// not from whatever world the checkout has now.
function worldCheck(frozen: Frozen, j: SummaryJson | undefined): { pass: boolean; evidence: string } {
  const worlds = [...new Set(Object.values(frozen.tasks).map((t) => t.world_hash))];
  const hashes = Array.isArray(j?.initial_state_hashes) ? (j!.initial_state_hashes as unknown[]).filter((h): h is string => typeof h === 'string') : [];
  if (hashes.length === 0) return { pass: false, evidence: 'no initial state hash' };
  const other = hashes.filter((h) => !worlds.includes(h));
  if (other.length > 0) return { pass: false, evidence: `initial state hash ${other.join(', ')} is not a frozen world (${worlds.map((w) => w.slice(0, 12)).join(', ')})` };
  return { pass: true, evidence: `${hashes.length} initial state hash(es), every one a frozen task's world` };
}

function clause4(): Verdict {
  const { frozen, problem } = readFrozen();
  if (frozen === null) return { pass: false, evidence: problem };
  const r = cli(summaryArgs(frozenIds()));
  const j = r.json as SummaryJson | undefined;
  if (!Array.isArray(j?.initial_state_hashes)) return { pass: false, evidence: `${describeExit('summary', r)}, no initial_state_hashes` };
  const w = worldCheck(frozen, j);
  return { pass: w.pass, evidence: `summary: ${w.evidence}` };
}

function clause5(): Verdict {
  const { frozen, problem } = readFrozen();
  if (frozen === null) return { pass: false, evidence: problem };
  const ids = taskIds();
  const frozenList = frozenIds();
  const notFrozen = ids.filter((id) => !(id in frozen.tasks));
  const notTasks = frozenList.filter((id) => !ids.includes(id));
  const parts = [`frozen ${frozenList.length - notTasks.length}/${ids.length}${notFrozen.length ? `, not frozen: ${notFrozen.join(', ')}` : ''}${notTasks.length ? `, frozen but not a task: ${notTasks.join(', ')}` : ''}`];
  let pass = notFrozen.length === 0 && notTasks.length === 0;
  const r = cli(summaryArgs(frozenList));
  const j = r.json as SummaryJson | undefined;
  parts.push(describeExit('summary', r));
  if (r.exit !== 0) pass = false;
  const tasks = j?.tasks ?? {};
  const rates = Object.entries(tasks).map(([id, t]) => `${id} ${t.passes}/${t.trials}`).join(', ');
  if (rates) parts.push(rates);
  // Every record of a frozen task at its frozen task_version and env_version, and every current
  // grade at the grader_task_version the freeze holds it to (summary lists the versions seen).
  for (const id of frozenList) {
    const f = frozen.tasks[id]!;
    const t = tasks[id];
    for (const [field, want, seen] of [['task_version', f.task_version, t?.task_versions], ['env_version', f.env_version, t?.env_versions], ['grader_task_version', heldGrader(f), t?.grader_task_versions]] as const) {
      const other = (seen ?? []).filter((v) => v !== want);
      if (other.length > 0) {
        pass = false;
        parts.push(`${id} at ${field} ${other.join(', ')}, frozen ${want}`);
      }
    }
  }
  // W5S-232 F1: a frozen task whose final-1 records exist must name replay_at (R37: the tag and
  // commit that reproduce them); one frozen before its final run has none to point at yet.
  for (const id of frozenList) {
    const dir = join(root, FINAL_RUN, 'trials', id);
    const n = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0;
    if (n > 0 && frozen.tasks[id]!.replay_at === undefined) {
      pass = false;
      parts.push(`${id} has ${n} final-1 record${n === 1 ? '' : 's'} and names no replay_at (R37)`);
    }
  }
  const w = worldCheck(frozen, j);
  if (!w.pass) pass = false;
  parts.push(w.evidence);
  // R37, R40: a frozen task whose env_version has moved on this checkout (the world was rebuilt
  // after its final run) keeps its records; they are reproduced at the commit replay_at names
  // (its tag and commit: the run, the frozen world and the grader of the current grade, set after
  // a regrade), else at the freeze commit, the tag in frozen_at. A freeze tag this checkout lacks
  // is a warning (it is set after the merge).
  const tags = [...new Set(frozenList.map((id) => frozen.tasks[id]!.frozen_at.tag))];
  const resolved = new Map(tags.map((tag) => [tag, resolveTag(tag)]));
  const where = (t: FrozenTask) => (t.replay_at ? `tag ${t.replay_at.tag} (${t.replay_at.commit.slice(0, 12)}, replay_at)` : `tag ${t.frozen_at.tag}${resolved.get(t.frozen_at.tag) ? ` (${resolved.get(t.frozen_at.tag)!.slice(0, 12)})` : ' (not on this checkout yet)'}`);
  for (const tag of tags) if (resolved.get(tag) === null) parts.push(`warning: freeze tag ${tag} is not on this checkout (the coordinator sets it on the merge commit)`);
  if (frozenList.length > 0) {
    const h = cli(['task-hash', '--task', frozenList.join(','), '--json']);
    const now = new Map(((h.json as { tasks?: Array<{ id: string; env_version: string }> } | undefined)?.tasks ?? []).map((t) => [t.id, t.env_version]));
    if (h.exit !== 0 || h.json === undefined) parts.push(describeExit('task-hash', h));
    else {
      const moved = frozenList.filter((id) => now.get(id) !== frozen.tasks[id]!.env_version);
      if (moved.length > 0) parts.push(`historical (env_version moved on this checkout since the freeze, R37): ${moved.map((id) => `${id} reproduce at ${where(frozen.tasks[id]!)}`).join(', ')}`);
    }
  }
  return { pass, evidence: parts.join('; ') };
}

function clause6(): Verdict {
  const r = cli(['audit-check', FINAL_RUN, '--final', '--json']);
  const j = r.json as { failures?: number; labelled?: number; labelled_environment?: number; labelled_grader?: number } | undefined;
  const counts =
    j && typeof j.failures === 'number'
      ? `; labelled ${j.labelled}/${j.failures} failures, environment ${j.labelled_environment}, grader ${j.labelled_grader}`
      : '';
  // grader_error=0 reads each record's current grade; the history is disclosed, never required.
  const g = cli(['summary', FINAL_RUN, '--require', 'grader_error=0', '--json']);
  const totals = (g.json as SummaryJson | undefined)?.totals;
  const graderError = totals && typeof totals.grader_error === 'number' ? `, GRADER_ERROR ${totals.grader_error} at the current grade, history ${totals.grader_error_history ?? 0}` : '';
  return {
    pass: r.exit === 0 && g.exit === 0,
    evidence: `${describeExit('audit-check --final', r)}${counts}; ${describeExit('summary grader_error=0', g)}${graderError}`,
  };
}

// Clause (7) is `pnpm docs:check` (scripts/docs-check.ts): docs/writeup.html with its sections,
// dated references and generated blocks equal to a fresh regeneration, and README.md with its
// Quick start, LOCAL_START_COMMAND and the writeup link, both under the ASD-STE 100 rules. The
// clause reads its exit code and counts its error and warning lines. Test hook, honored only
// when NODE_ENV=test: DONEWHEN_DOCS_CHECK replaces `node scripts/docs-check.ts` (a space-separated
// command line).
function clause7(): Verdict {
  const override = isTest ? process.env.DONEWHEN_DOCS_CHECK : undefined;
  const [cmd, ...args] = override ? override.split(' ') : [process.execPath, join(root, 'scripts/docs-check.ts')];
  const r = spawnSync(cmd!, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = (r.stdout ?? '').split('\n').filter((l) => l !== '');
  const warnings = lines.filter((l) => l.startsWith('warning:')).length;
  const errors = lines.filter((l) => !l.startsWith('warning:') && !l.startsWith('info:')).length;
  const exit = r.status === NOT_BUILT ? 'command not built' : `exit ${r.status}`;
  return { pass: r.status === 0, evidence: `docs:check: ${exit}; ${errors} error line(s), ${warnings} warning(s)` };
}

const CLAUSES: Array<[string, () => Verdict]> = [
  ['UI starts from one command (local runner) and the hosted URL', clause1],
  ['CLI, local runner and Worker share run()', clause2],
  ['>= 5 complete tasks, oracle scores 1.0', clause3],
  ["every trial starts from its task's frozen world", clause4],
  [`every task frozen in ${TASKS_FINAL} has ${FINAL_TRIALS_PER_TASK} valid trials, pass rate ${FINAL_PASS_BAND[0]} to ${FINAL_PASS_BAND[1]}, at its frozen versions`, clause5],
  ['every failure attributed, none to environment or grader, no current GRADER_ERROR', clause6],
  [`docs/writeup.html (${WRITEUP_SECTIONS.join(', ')}) and README.md pass pnpm docs:check`, clause7],
];

let passed = 0;
CLAUSES.forEach(([name, check], i) => {
  let v: Verdict;
  try {
    v = check();
  } catch (err) {
    v = { pass: false, evidence: `error: ${(err as Error).message}` };
  }
  if (v.pass) passed++;
  process.stdout.write(`${v.pass ? 'PASS' : 'FAIL'} (${i + 1}) ${name}: ${v.evidence}\n`);
});

const spend = cli(['spend', '--json']);
const total = (spend.json as { total_usd?: number } | undefined)?.total_usd;
process.stdout.write(`INFO spend: ${typeof total === 'number' ? `$${total.toFixed(2)} recorded` : describeExit('spend', spend)}\n`);
process.stdout.write(`donewhen: ${passed}/${CLAUSES.length} PASS\n`);
process.exit(passed === CLAUSES.length ? 0 : 1);
