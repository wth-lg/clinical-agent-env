import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCAL_PREREQUISITES, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../../apps/web/src/surface/command.ts';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../packages/core/cost.ts';
import { WRITEUP_SECTIONS } from '../docs-lib.ts';
import { git, repoRoot, runScript, tempDir, write } from './helpers.ts';

const FIXTURES = join(repoRoot, 'scripts/fixtures/donewhen');
// README-pass.md plus the prerequisites line and both install links. They are added here, not
// written into the fixture, so the sentence's literal stays in command.ts, ui-contract.md and
// README.md alone.
const PREREQUISITES = `${LOCAL_PREREQUISITES} Install [Node.js](${NODE_INSTALL_URL}) and [pnpm](${PNPM_INSTALL_URL}).\n`;
const README_PASS = readFileSync(join(FIXTURES, 'README-pass.md'), 'utf8').replace('\n## Key handling', `${PREREQUISITES}\n## Key handling`);
// docs-check is clause (7)'s own command (DONEWHEN_DOCS_CHECK), stubbed through the same stub-cli
// and the same map, under the name docs-check.
const ALL_STUBS = { oracle: 'oracle-pass', summary: 'summary-pass', 'audit-check': 'audit-pass', spend: 'spend', 'runner-check': 'runner-check-pass', 'task-hash': 'task-hash-current', 'docs-check': 'docs-check-pass' };
const TASKS = ['t1', 't2', 't3', 't4', 't5'];
const FINAL_RUN = 'results/runs/final-1';
const WORLD = '9f2c';
// Clause (5)'s summary call: the frozen tasks, N and the band from the constants (P21).
const SUMMARY_CALL = `summary ${FINAL_RUN} --tasks ${TASKS.join(',')} --require valid=${FINAL_TRIALS_PER_TASK},band=${FINAL_PASS_BAND[0]}-${FINAL_PASS_BAND[1]},env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all,env_limit=0 --json`;
const GRADER_ERROR_CALL = `summary ${FINAL_RUN} --require grader_error=0 --json`;
const AUDIT_CALL = `audit-check ${FINAL_RUN} --final --json`;

// results/tasks-final.json as P21's freeze writes it, for the given tasks.
const freeze = (ids: string[], over: Record<string, Record<string, unknown>> = {}) =>
  JSON.stringify({
    schema_version: 1, trials_per_task: FINAL_TRIALS_PER_TASK, band: FINAL_PASS_BAND,
    tasks: Object.fromEntries(ids.map((id) => [id, { task_version: `v-${id}`, grader_task_version: `g-${id}`, env_version: `e-${id}`, world_hash: WORLD, oracle_final_hash: '0'.repeat(64), frozen_at: { tag: 'freeze-test' }, frozen_from_branch: 'a'.repeat(40), regrades: [], ...over[id] }])),
  });

function makeTask(root: string, id: string, omit: string[] = []) {
  const files: Record<string, string> = {
    'instruction.md': 'Do the thing.\n',
    'task.toml': '[task]\nid = "x"\n\n[[rubric]]\nkey = "r1"\n',
    'tests/grader.ts': 'export {};\n',
    'solution/solve.ts': 'export {};\n',
  };
  for (const [rel, content] of Object.entries(files)) if (!omit.includes(rel)) write(root, `tasks/${id}/${rel}`, content);
}

function completeRepo(): string {
  const root = tempDir('donewhen');
  write(root, 'README.md', README_PASS);
  write(root, 'apps/web/index.html', '<!doctype html>\n');
  write(root, 'packages/core/run.ts', 'export function run() {}\n');
  write(root, 'cli/run.ts', "import { runBatch } from '../packages/core/batch.ts';\n");
  write(root, 'packages/core/batch.ts', "import { run } from './run.ts';\nexport const runBatch = run;\n");
  write(root, 'cli/run-one.ts', "import { run } from '../packages/core/run.ts';\n");
  write(root, 'apps/runner/main.ts', "import { startRunner } from './server.ts';\n");
  write(root, 'apps/runner/server.ts', "import {\n  runBatch,\n} from '../../packages/core/batch.ts';\nexport const startRunner = runBatch;\n");
  write(root, 'apps/web/src/worker.ts', "import { run } from '../../../packages/core/run.ts';\n");
  for (const id of TASKS) makeTask(root, id);
  makeTask(root, '_template');
  write(root, 'results/tasks-final.json', freeze(TASKS));
  return root;
}

function donewhen(root: string, stubs: Record<string, string>, env: Record<string, string> = {}) {
  const log = join(root, 'stub.log');
  const r = runScript('scripts/donewhen.ts', [], {
    cwd: root,
    env: {
      NODE_ENV: 'test',
      DONEWHEN_CLI: `${process.execPath} ${join(FIXTURES, 'stub-cli.ts')}`,
      DONEWHEN_DOCS_CHECK: `${process.execPath} ${join(FIXTURES, 'stub-cli.ts')} docs-check`,
      DONEWHEN_STUB: JSON.stringify(stubs),
      DONEWHEN_STUB_LOG: log,
      ...env,
    },
  });
  const lines = r.stdout.split('\n');
  const clause = (n: number) => {
    const line = lines.find((l) => new RegExp(`^(PASS|FAIL) \\(${n}\\)`).test(l));
    if (!line) throw new Error(`no line for clause ${n} in:\n${r.stdout}\n${r.stderr}`);
    return line;
  };
  const calls = existsSync(log) ? readFileSync(log, 'utf8') : '';
  return { ...r, clause, calls };
}

describe('donewhen', () => {
  it('passes 7/7 and exits 0 when every clause holds', () => {
    const r = donewhen(completeRepo(), ALL_STUBS);
    for (let n = 1; n <= 7; n++) expect(r.clause(n)).toMatch(/^PASS/);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('INFO spend');
  });

  it('prints 7 FAIL lines, exits 1 and does not crash on an empty repo with no commands built', () => {
    const root = tempDir('donewhen-empty');
    const r = donewhen(root, {});
    for (let n = 1; n <= 7; n++) expect(r.clause(n)).toMatch(/^FAIL/);
    expect(r.stdout.match(/^FAIL /gm)).toHaveLength(7);
    expect(r.stdout).toContain('command not built');
    expect(r.status).toBe(1);
  });

  it('shells out to the CLI commands the plan names', () => {
    const r = donewhen(completeRepo(), ALL_STUBS);
    expect(r.calls).toContain('oracle --task all --json');
    expect(r.calls).toContain(SUMMARY_CALL);
    expect(r.calls).toContain(GRADER_ERROR_CALL);
    expect(r.calls).toContain(AUDIT_CALL);
    expect(r.calls).toContain(`task-hash --task ${TASKS.join(',')} --json`);
    expect(r.calls).not.toContain('trials=10');
    expect(r.calls).toContain('spend --json');
    expect(r.calls).toContain('runner-check --mock --json');
  });

  it('clause 1 fails when README documents no start command or URL', () => {
    const root = completeRepo();
    write(root, 'README.md', '# Riverbend\n');
    expect(donewhen(root, ALL_STUBS).clause(1)).toMatch(/^FAIL/);
  });

  it('clause 1 fails when runner-check --mock exits 1, passes with it and the README, and fails without LOCAL_START_COMMAND', () => {
    expect(donewhen(completeRepo(), ALL_STUBS).clause(1)).toMatch(/^PASS/);
    const failed = donewhen(completeRepo(), { ...ALL_STUBS, 'runner-check': 'runner-check-fail' }).clause(1);
    expect(failed).toMatch(/^FAIL/);
    expect(failed).toContain('runner-check --mock: exit 1');
    const root = completeRepo();
    write(root, 'README.md', README_PASS.replace(/`git clone[^`]*pnpm start`/, '`pnpm start`'));
    const line = donewhen(root, ALL_STUBS).clause(1);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('LOCAL_START_COMMAND: no');
  });

  for (const [name, text] of [['LOCAL_PREREQUISITES', LOCAL_PREREQUISITES], ['NODE_INSTALL_URL', NODE_INSTALL_URL], ['PNPM_INSTALL_URL', PNPM_INSTALL_URL]] as const) {
    it(`clause 1 fails when README.md lacks ${name}`, () => {
      const root = completeRepo();
      expect(README_PASS).toContain(text);
      write(root, 'README.md', README_PASS.replaceAll(text, ''));
      const line = donewhen(root, ALL_STUBS).clause(1);
      expect(line).toMatch(/^FAIL/);
      expect(line).toContain(`${name}: no`);
    });
  }

  it('clause 1 names the prerequisites line and both install links when they pass', () => {
    const line = donewhen(completeRepo(), ALL_STUBS).clause(1);
    expect(line).toMatch(/^PASS/);
    expect(line).toContain('LOCAL_PREREQUISITES: yes, NODE_INSTALL_URL: yes, PNPM_INSTALL_URL: yes');
  });

  it('clause 1 fails with command not built when runner-check is missing', () => {
    const { 'runner-check': _r, ...rest } = ALL_STUBS;
    const line = donewhen(completeRepo(), rest).clause(1);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('command not built');
  });

  it('clause 2 fails when the runner\'s events differ from run-one\'s', () => {
    const line = donewhen(completeRepo(), { ...ALL_STUBS, 'runner-check': 'runner-check-differ' }).clause(2);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('events equal run-one: no');
  });

  it.each(['cli/run-one.ts', 'apps/runner/main.ts', 'apps/runner/server.ts', 'packages/core/batch.ts'])('clause 2 fails when %s is missing from the import path', (rel) => {
    const root = completeRepo();
    rmSync(join(root, rel));
    expect(donewhen(root, ALL_STUBS).clause(2)).toMatch(/^FAIL/);
  });

  it('clause 2 follows imports only: a comment naming packages/core/run.ts does not count', () => {
    const root = completeRepo();
    write(root, 'apps/runner/main.ts', '// see packages/core/run.ts\nexport {};\n');
    expect(donewhen(root, ALL_STUBS).clause(2)).toMatch(/^FAIL/);
  });

  it.each([
    ['a type-only import', "import type { Run } from '../../packages/core/run.ts';\nexport {};\n"],
    ['an export type', "export type { Run } from '../../packages/core/run.ts';\n"],
    ['a line comment', "// import { run } from '../../packages/core/run.ts';\nexport {};\n"],
    ['a block comment', "/* import { run } from '../../packages/core/run.ts'; */\nexport {};\n"],
  ])('clause 2 counts value imports only: %s of packages/core/run.ts does not count', (_what, text) => {
    const root = completeRepo();
    write(root, 'apps/runner/main.ts', text);
    expect(donewhen(root, ALL_STUBS).clause(2)).toMatch(/^FAIL/);
  });

  it('clause 2 counts a value import, a re-export and a dynamic import', () => {
    for (const text of [
      "import { type Run, run } from '../../packages/core/run.ts';\n",
      "export { run } from '../../packages/core/run.ts';\n",
      "const m = await import('../../packages/core/run.ts');\n",
      "import {\n  run, // the loop\n} from '../../packages/core/run.ts';\n",
    ]) {
      const root = completeRepo();
      write(root, 'apps/runner/main.ts', text);
      expect(donewhen(root, ALL_STUBS).clause(2), text).toMatch(/^PASS/);
    }
  });

  it('runs runner-check --mock once for clauses 1 and 2', () => {
    const r = donewhen(completeRepo(), ALL_STUBS);
    expect(r.calls.split('\n').filter((l) => l === 'runner-check --mock --json')).toHaveLength(1);
  });

  it('clause 2 fails without a CLI run entry point', () => {
    const root = completeRepo();
    rmSync(join(root, 'cli/run.ts'));
    expect(donewhen(root, ALL_STUBS).clause(2)).toMatch(/^FAIL/);
  });

  it('clause 2 fails when the UI does not use packages/core/run.ts', () => {
    const root = completeRepo();
    rmSync(join(root, 'apps/web/src/worker.ts'));
    expect(donewhen(root, ALL_STUBS).clause(2)).toMatch(/^FAIL/);
  });

  it('clause 3 fails with 4 complete non-_ tasks', () => {
    const root = completeRepo();
    rmSync(join(root, 'tasks/t5'), { recursive: true });
    const line = donewhen(root, ALL_STUBS).clause(3);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('4 task(s), need 5');
  });

  it('clause 3 fails with 5 tasks when one lacks solve.ts', () => {
    const root = completeRepo();
    rmSync(join(root, 'tasks/t4/solution/solve.ts'));
    const line = donewhen(root, ALL_STUBS).clause(3);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('t4');
  });

  it.each(['instruction.md', 'task.toml', 'tests/grader.ts'])('clause 3 fails when a task lacks %s', (rel) => {
    const root = completeRepo();
    rmSync(join(root, 'tasks/t2', rel));
    expect(donewhen(root, ALL_STUBS).clause(3)).toMatch(/^FAIL/);
  });

  it('clause 3 fails when a task has no rubric', () => {
    const root = completeRepo();
    write(root, 'tasks/t2/task.toml', '[task]\nid = "x"\n');
    expect(donewhen(root, ALL_STUBS).clause(3)).toMatch(/^FAIL/);
  });

  it('clause 3 fails when the oracle scores a task below 1.0', () => {
    expect(donewhen(completeRepo(), { ...ALL_STUBS, oracle: 'oracle-fail' }).clause(3)).toMatch(/^FAIL/);
  });

  it('clause 3 fails with command not built when oracle is missing', () => {
    const { oracle: _o, ...rest } = ALL_STUBS;
    const line = donewhen(completeRepo(), rest).clause(3);
    expect(line).toMatch(/^FAIL/);
    expect(line).toContain('command not built');
  });

  it('clause 3 fails on output that is not JSON', () => {
    expect(donewhen(completeRepo(), { ...ALL_STUBS, oracle: 'garbage' }).clause(3)).toMatch(/^FAIL/);
  });

  it('DONEWHEN_MIN_TASKS is honored only when NODE_ENV=test', () => {
    const root = tempDir('donewhen-min');
    makeTask(root, 't1');
    const stubs = { ...ALL_STUBS, oracle: 'oracle-one' };
    expect(donewhen(root, stubs, { DONEWHEN_MIN_TASKS: '1' }).clause(3)).toMatch(/^PASS/);
    const prod = donewhen(root, stubs, { DONEWHEN_MIN_TASKS: '1', NODE_ENV: 'production' }).clause(3);
    expect(prod).toMatch(/^FAIL/);
    expect(prod).toContain('1 task(s), need 5');
  });

  it('clause 4 fails when a trial started from a state hash that is no frozen task\'s world', () => {
    const r = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-fail' });
    expect(r.clause(4)).toMatch(/^FAIL \(4\).*initial state hash a01b is not a frozen world \(9f2c\)/);
    expect(donewhen(completeRepo(), ALL_STUBS).clause(4)).toMatch(/^PASS \(4\).*1 initial state hash\(es\), every one a frozen task's world/);
  });

  // R40: tasks frozen under different worlds (the shared world rebuilt between freezes) each
  // start from their own frozen world; clause 4 holds every initial hash to one of them.
  it('clause 4 passes when each trial started from one of the frozen worlds', () => {
    const root = completeRepo();
    write(root, 'results/tasks-final.json', freeze(TASKS, { t2: { world_hash: 'a01b' } }));
    expect(donewhen(root, { ...ALL_STUBS, summary: 'summary-fail' }).clause(4)).toMatch(/^PASS \(4\).*2 initial state hash\(es\)/);
  });

  it('clause 4 reads N and the band from the constants, not a stale count', () => {
    const r = donewhen(completeRepo(), ALL_STUBS);
    expect(r.clause(4)).toMatch(/^PASS/);
    expect(r.calls.split('\n').filter((l) => l.startsWith('summary ') && /valid=|trials=/.test(l))).toEqual([SUMMARY_CALL]);
  });

  it('clause 5 passes on summary exit 0 with every task frozen, and fails on summary exit 1 naming the shortfall', () => {
    const pass = donewhen(completeRepo(), ALL_STUBS).clause(5);
    expect(pass).toMatch(/^PASS \(5\)/);
    expect(pass).toContain('frozen 5/5');
    expect(pass).toContain('t1 4/20');
    const fail = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-fail' }).clause(5);
    expect(fail).toMatch(/^FAIL \(5\)/);
    expect(fail).toContain('summary: exit 1');
    expect(fail).toContain('t5 3/19');
  });

  it('clause 5 fails until every task is frozen, and names the tasks results/tasks-final.json lacks', () => {
    const root = completeRepo();
    write(root, 'results/tasks-final.json', freeze(['t1', 't2', 't3']));
    const line = donewhen(root, { ...ALL_STUBS, [SUMMARY_CALL]: 'summary-pass', [`summary ${FINAL_RUN} --tasks t1,t2,t3 --require valid=${FINAL_TRIALS_PER_TASK},band=${FINAL_PASS_BAND[0]}-${FINAL_PASS_BAND[1]},env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all,env_limit=0 --json`]: 'summary-pass' }).clause(5);
    expect(line).toMatch(/^FAIL \(5\)/);
    expect(line).toContain('frozen 3/5, not frozen: t4, t5');
    // The frozen tasks are still summarized, so progress shows while the rest are redesigned.
    expect(line).toContain('t1 4/20');
  });

  // R42: a task whose v1 freeze a new version superseded is listed with status v2-pending and its
  // freeze kept under `superseded`; clause 5 counts it as not frozen, names it so, and holds no
  // records to it.
  it('clause 5 names a v2-pending task as not frozen and holds no records to its superseded freeze', () => {
    const root = completeRepo();
    const all = JSON.parse(freeze(TASKS)) as { tasks: Record<string, Record<string, unknown>> };
    all.tasks.t3 = { status: 'v2-pending', reason: 'R42', superseded: { version: 'v1', ...all.tasks.t3 } };
    write(root, 'results/tasks-final.json', JSON.stringify(all));
    const line = donewhen(root, { ...ALL_STUBS, [SUMMARY_CALL]: 'summary-pass', [`summary ${FINAL_RUN} --tasks t1,t2,t4,t5 --require valid=${FINAL_TRIALS_PER_TASK},band=${FINAL_PASS_BAND[0]}-${FINAL_PASS_BAND[1]},env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all,env_limit=0 --json`]: 'summary-pass' }).clause(5);
    expect(line).toMatch(/^FAIL \(5\)/);
    expect(line).toContain('frozen 4/5, not frozen: t3 (v2 pending, its v1 freeze superseded)');
    expect(line).not.toContain('t3 at ');
  });

  it('clause 5 fails without results/tasks-final.json, and when it freezes a task the checkout does not have', () => {
    const root = completeRepo();
    rmSync(join(root, 'results/tasks-final.json'));
    expect(donewhen(root, ALL_STUBS).clause(5)).toMatch(/^FAIL \(5\).*results\/tasks-final\.json: missing/);
    const stale = completeRepo();
    write(stale, 'results/tasks-final.json', freeze([...TASKS, 't6']));
    const line = donewhen(stale, ALL_STUBS).clause(5);
    expect(line).toMatch(/^FAIL \(5\)/);
    expect(line).toContain('frozen but not a task: t6');
  });

  it('clause 5 checks records against the freeze entry: another task_version, env_version or grader_task_version fails', () => {
    const version = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-other-version' }).clause(5);
    expect(version).toMatch(/^FAIL \(5\)/);
    expect(version).toContain('t1 at task_version v-t1-other, frozen v-t1');
    const env = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-other-env' }).clause(5);
    expect(env).toMatch(/^FAIL \(5\)/);
    expect(env).toContain('t2 at env_version e-t2-rebuilt, frozen e-t2');
    const grader = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-other-grader' }).clause(5);
    expect(grader).toMatch(/^FAIL \(5\)/);
    expect(grader).toContain('t3 at grader_task_version g-t3-next, frozen g-t3');
  });

  it('clause 5 holds current grades to the last regrade entry of the freeze (a grader bug fix, regraded offline)', () => {
    const root = completeRepo();
    write(root, 'results/tasks-final.json', freeze(TASKS, { t3: { regrades: [{ grader_version: '22', grader_task_version: 'g-t3-next', task_version: 'v-t3-next', at: 'b'.repeat(40), reason: 'fix' }] } }));
    expect(donewhen(root, { ...ALL_STUBS, summary: 'summary-other-grader' }).clause(5)).toMatch(/^PASS \(5\)/);
    expect(donewhen(root, ALL_STUBS).clause(5)).toMatch(/^FAIL \(5\).*t3 at grader_task_version g-t3, frozen g-t3-next/);
  });

  it('clause 5 fails when a trial did not start from a frozen world (R14-37, per R40)', () => {
    const line = donewhen(completeRepo(), { ...ALL_STUBS, summary: 'summary-other-world' }).clause(5);
    expect(line).toMatch(/^FAIL \(5\)/);
    expect(line).toContain('initial state hash a01b is not a frozen world (9f2c)');
  });

  // R40, R37: after the world is rebuilt, a frozen task's env_version moves on main; its records
  // stay valid at the frozen versions and are reproduced at the freeze commit.
  it('clause 5 still passes when the checkout\'s env_version has moved since the freeze, and names the reproduce tag; a tag not on the checkout is a warning', () => {
    const line = donewhen(completeRepo(), { ...ALL_STUBS, 'task-hash': 'task-hash-moved' }).clause(5);
    expect(line).toMatch(/^PASS \(5\)/);
    expect(line).toContain('warning: freeze tag freeze-test is not on this checkout (the coordinator sets it on the merge commit)');
    expect(line).toContain('historical (env_version moved on this checkout since the freeze, R37): t1 reproduce at tag freeze-test (not on this checkout yet), t2 reproduce at');
    expect(donewhen(completeRepo(), ALL_STUBS).clause(5)).not.toContain('historical');
  });

  // W5S-232 F1: a frozen task with records under results/runs/final-1/trials/<id>/ must name its
  // replay_at (the pointer R37 reproduces them at); one frozen before its final run need not.
  it('clause 5 fails when a frozen task has final-1 records and names no replay_at, and passes once it does or while it has none', () => {
    const root = completeRepo();
    write(root, `${FINAL_RUN}/trials/t1/0.json`, '{}\n');
    write(root, `${FINAL_RUN}/trials/t1/1.json`, '{}\n');
    const bare = donewhen(root, ALL_STUBS).clause(5);
    expect(bare).toMatch(/^FAIL \(5\)/);
    expect(bare).toContain('t1 has 2 final-1 records and names no replay_at (R37)');
    write(root, 'results/tasks-final.json', freeze(TASKS, { t1: { replay_at: { tag: 'final-1-test', commit: 'b'.repeat(40) } } }));
    const named = donewhen(root, ALL_STUBS).clause(5);
    expect(named).toMatch(/^PASS \(5\)/);
    expect(named).not.toContain('names no replay_at');
    // t2 has no final-1 records and no replay_at: nothing to point at yet.
    expect(named).not.toContain('t2 has');
  });

  // R42: a task frozen on a new version keeps the earlier freeze under `superseded`; while final-1
  // still holds the earlier version's records (every record at that freeze's held task_version),
  // that freeze's replay_at covers them, and clause 5 still fails on the version until W5-F lands
  // the new version's records. Records of the new version need the entry's own replay_at
  // (W5H5-235 S1: the earlier version's commit cannot reproduce them).
  it("clause 5 lets a superseded freeze's replay_at cover final-1 records at that version only, and names the missing pointer otherwise", () => {
    const root = completeRepo();
    write(root, `${FINAL_RUN}/trials/t1/0.json`, '{}\n');
    const at = { tag: 'final-1-v1', commit: 'c'.repeat(40) };
    const v1 = { version: 'v1', task_version: 'v-t1', grader_task_version: 'g-t1-v1', env_version: 'e-t1-v1', world_hash: WORLD, oracle_final_hash: '0'.repeat(64), frozen_at: { tag: 'freeze-v1' }, frozen_from_branch: 'a'.repeat(40), regrades: [] };
    // The records (the stub's v-t1) are the superseded version's: covered by its pointer; the
    // clause still fails on the new version v-t1-v2.
    write(root, 'results/tasks-final.json', freeze(TASKS, { t1: { task_version: 'v-t1-v2', superseded: { ...v1, replay_at: at } } }));
    const covered = donewhen(root, ALL_STUBS).clause(5);
    expect(covered).toMatch(/^FAIL \(5\)/);
    expect(covered).toContain('t1 at task_version v-t1, frozen v-t1-v2');
    expect(covered).not.toContain('names no replay_at');
    // The records are the new version's (the entry's v-t1): the superseded pointer does not cover them.
    write(root, 'results/tasks-final.json', freeze(TASKS, { t1: { superseded: { ...v1, task_version: 'v-t1-v1', replay_at: at } } }));
    const newer = donewhen(root, ALL_STUBS).clause(5);
    expect(newer).toMatch(/^FAIL \(5\)/);
    expect(newer).toContain('t1 has 1 final-1 record and names no replay_at (R37)');
    // Neither names a pointer.
    write(root, 'results/tasks-final.json', freeze(TASKS, { t1: { superseded: v1 } }));
    expect(donewhen(root, ALL_STUBS).clause(5)).toContain('t1 has 1 final-1 record and names no replay_at (R37)');
  });

  // Pre-audit-2 S14: once a frozen task names a replay_at (the commit that reproduces its records,
  // after a regrade moved them off the freeze's grader), the historical line points there.
  it('clause 5 points a moved task at its replay_at tag and commit when the freeze names one', () => {
    const root = completeRepo();
    write(root, 'results/tasks-final.json', freeze(TASKS, { t1: { replay_at: { tag: 'final-1-test', commit: 'b'.repeat(40) } } }));
    const line = donewhen(root, { ...ALL_STUBS, 'task-hash': 'task-hash-moved' }).clause(5);
    expect(line).toMatch(/^PASS \(5\)/);
    expect(line).toContain(`t1 reproduce at tag final-1-test (${'b'.repeat(12)}, replay_at), t2 reproduce at tag freeze-test (not on this checkout yet)`);
  });

  it('clause 5 resolves the freeze tag to its commit when the checkout has it', () => {
    const root = completeRepo();
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'test');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'freeze');
    git(root, 'tag', 'freeze-test');
    const sha = git(root, 'rev-parse', 'HEAD');
    const line = donewhen(root, { ...ALL_STUBS, 'task-hash': 'task-hash-moved' }).clause(5);
    expect(line).toMatch(/^PASS \(5\)/);
    expect(line).not.toContain('warning');
    expect(line).toContain(`t1 reproduce at tag freeze-test (${sha.slice(0, 12)})`);
  });

  it('clause 6 fails on audit-check exit 1, and on a record whose current grade is GRADER_ERROR; a regraded one passes with its history printed', () => {
    expect(donewhen(completeRepo(), { ...ALL_STUBS, 'audit-check': 'audit-fail' }).clause(6)).toMatch(/^FAIL \(6\).*audit-check --final: exit 1/);
    const graderError = donewhen(completeRepo(), { ...ALL_STUBS, [GRADER_ERROR_CALL]: 'summary-grader-error' }).clause(6);
    expect(graderError).toMatch(/^FAIL \(6\)/);
    expect(graderError).toContain('summary grader_error=0: exit 1, GRADER_ERROR 1 at the current grade, history 1');
    const regraded = donewhen(completeRepo(), { ...ALL_STUBS, [GRADER_ERROR_CALL]: 'summary-regraded' }).clause(6);
    expect(regraded).toMatch(/^PASS \(6\)/);
    expect(regraded).toContain('summary grader_error=0: exit 0, GRADER_ERROR 0 at the current grade, history 1');
  });

  it('clause 7 reads the exit code of docs:check and counts its lines', () => {
    const pass = donewhen(completeRepo(), ALL_STUBS);
    expect(pass.calls).toContain('docs-check');
    // The clause names the sections docs:check requires, from the one WRITEUP_SECTIONS constant.
    expect(pass.clause(7)).toBe(`PASS (7) docs/writeup.html (${WRITEUP_SECTIONS.join(', ')}) and README.md pass pnpm docs:check: docs:check: exit 0; 0 error line(s), 2 warning(s)`);
    const fail = donewhen(completeRepo(), { ...ALL_STUBS, 'docs-check': 'docs-check-fail' }).clause(7);
    expect(fail).toMatch(/^FAIL \(7\)/);
    expect(fail).toContain('docs:check: exit 1; 2 error line(s), 1 warning(s)');
    expect(donewhen(completeRepo(), { ...ALL_STUBS, 'docs-check': undefined } as unknown as Record<string, string>).clause(7)).toContain('command not built');
  });

  it('ignores DONEWHEN_CLI outside NODE_ENV=test', () => {
    const r = donewhen(completeRepo(), ALL_STUBS, { NODE_ENV: 'production' });
    expect(r.calls).toBe('');
    expect(r.clause(5)).toMatch(/^FAIL/);
  });
});
