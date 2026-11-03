// Prints one PASS/FAIL line per done-when clause (1)-(7) with the evidence it read,
// and exits 0 only on 7/7. Run from the repo root: `pnpm donewhen`.
//
// Where a CLI command exists for a clause, this script only runs it and reads its exit code
// and JSON; it computes nothing itself. A command that is not built yet (the dispatcher exits
// 127) is a FAIL with reason 'command not built'. The CLI contracts it relies on:
//   cli oracle --task all --json        exit 0 when every task passes; {tasks: [{id, score}]}
//   cli summary <run> --tasks ... --require ... --json
//                                       exit 0 when the requirements hold;
//                                       {tasks: {<id>: {passes, trials, task_versions}}, initial_state_hashes: [...],
//                                        totals: {grader_error, grader_error_history}}
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
// Clause (5) passes only when every task of the checkout is frozen there, each has N valid trials
// in the band at its frozen task_version, and every trial started from the world in
// fixtures/manifest.json (R14-37); it names the tasks not frozen yet, and still summarizes the
// frozen ones. Clause (6) runs `audit-check --final` (R14-33) and `summary --require
// grader_error=0`, which reads each record's current grade after any offline regrade and prints
// grader_error_history for disclosure.
//
// Test hooks, honored only when NODE_ENV=test: DONEWHEN_CLI replaces `node cli/index.ts`
// (space-separated command prefix); DONEWHEN_MIN_TASKS replaces the minimum of 5 tasks;
// DONEWHEN_INCLUDE_UNDERSCORE=1 makes clause (3) count _-prefixed task directories (tasks/_toy),
// so the real oracle can be checked before any real task exists.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../apps/web/src/surface/command.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../packages/core/cost.ts';

const FINAL_RUN = 'results/runs/final-1';
const TASKS_FINAL = 'results/tasks-final.json';
const WORLD_MANIFEST = 'fixtures/manifest.json';
const MODEL = 'claude-opus-5-5';
const HOSTED_URL = 'https://wth-lg.github.io/clinical-agent-env/';
const MIN_TASKS = 5;
const TASK_FILES = ['instruction.md', 'task.toml', 'tests/grader.ts', 'solution/solve.ts'];
const README_SECTIONS = ['findings', 'surprises', 'changes', 'next steps'];
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
type Frozen = { tasks: Record<string, { task_version: string }> };
let frozenRead: { frozen: Frozen | null; problem: string } | undefined;
function readFrozen(): { frozen: Frozen | null; problem: string } {
  if (frozenRead) return frozenRead;
  const file = join(root, TASKS_FINAL);
  if (!existsSync(file)) return (frozenRead = { frozen: null, problem: `${TASKS_FINAL}: missing` });
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Frozen;
    if (doc === null || typeof doc !== 'object' || doc.tasks === null || typeof doc.tasks !== 'object' || Array.isArray(doc.tasks)) throw new Error('tasks must be an object keyed by task id');
    for (const [id, t] of Object.entries(doc.tasks)) if (typeof t?.task_version !== 'string') throw new Error(`tasks.${id}.task_version must be a string`);
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

type SummaryJson = { tasks?: Record<string, { passes: number; trials: number; task_versions?: string[] }>; initial_state_hashes?: unknown; totals?: { grader_error?: number; grader_error_history?: number } };

function clause4(): Verdict {
  const r = cli(summaryArgs(frozenIds()));
  const hashes = (r.json as SummaryJson | undefined)?.initial_state_hashes;
  if (!Array.isArray(hashes)) return { pass: false, evidence: `${describeExit('summary', r)}, no initial_state_hashes` };
  return {
    pass: hashes.length === 1,
    evidence: `summary: ${hashes.length} distinct initial state hash(es) across trials`,
  };
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
  // Every record of a frozen task at its frozen task_version (summary lists the versions seen).
  for (const id of frozenList) {
    const want = frozen.tasks[id]!.task_version;
    const seen = tasks[id]?.task_versions ?? [];
    const other = seen.filter((v) => v !== want);
    if (other.length > 0) {
      pass = false;
      parts.push(`${id} at task_version ${other.join(', ')}, frozen ${want}`);
    }
  }
  // R14-37: every trial started from the world in fixtures/manifest.json.
  const manifest = read(WORLD_MANIFEST);
  let world: string | undefined;
  try {
    world = (JSON.parse(manifest) as { world?: { state_hash?: unknown } }).world?.state_hash as string | undefined;
  } catch {
    world = undefined;
  }
  const hashes = Array.isArray(j?.initial_state_hashes) ? (j!.initial_state_hashes as unknown[]).filter((h): h is string => typeof h === 'string') : [];
  if (typeof world !== 'string') {
    pass = false;
    parts.push(`${WORLD_MANIFEST}: no world.state_hash`);
  } else {
    const other = hashes.filter((h) => h !== world);
    if (other.length > 0 || hashes.length === 0) {
      pass = false;
      parts.push(hashes.length === 0 ? 'no initial state hash' : `initial state hash ${other.join(', ')} is not the world's ${world}`);
    } else parts.push(`every trial started from the world ${world.slice(0, 12)}`);
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

function clause7(): Verdict {
  const readme = read('README.md');
  const missing = README_SECTIONS.filter((s) => !new RegExp(`^#{1,6}\\s+.*\\b${s}\\b`, 'im').test(readme));
  const refs = /^(#{1,6})\s+.*\b(references|sources|bibliography)\b.*$/im.exec(readme);
  let dated = 0;
  if (refs) {
    const after = readme.slice(refs.index + refs[0].length);
    const next = new RegExp(`^#{1,${refs[1]!.length}}\\s`, 'm').exec(after);
    const body = next ? after.slice(0, next.index) : after;
    dated = body.split('\n').filter((l) => /\b(19|20)\d{2}-\d{2}(-\d{2})?\b/.test(l)).length;
  }
  const parts = [
    missing.length ? `missing section(s): ${missing.join(', ')}` : 'all writeup sections present',
    refs ? `${dated} dated reference line(s)` : 'no references section',
  ];
  return { pass: missing.length === 0 && dated > 0, evidence: `README: ${parts.join('; ')}` };
}

const CLAUSES: Array<[string, () => Verdict]> = [
  ['UI starts from one command (local runner) and the hosted URL', clause1],
  ['CLI, local runner and Worker share run()', clause2],
  ['>= 5 complete tasks, oracle scores 1.0', clause3],
  ['every trial starts from the same state hash', clause4],
  [`every task frozen in ${TASKS_FINAL} has ${FINAL_TRIALS_PER_TASK} valid trials, pass rate ${FINAL_PASS_BAND[0]} to ${FINAL_PASS_BAND[1]}, from the world`, clause5],
  ['every failure attributed, none to environment or grader, no current GRADER_ERROR', clause6],
  ['README writeup and dated references', clause7],
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
