// Done-when clauses (5) and (6) against the real summary and audit-check (plan phases P12 and
// P21). scripts/donewhen.ts reads results/runs/final-1, results/tasks-final.json and
// fixtures/manifest.json under its working directory, so each case is a temp root holding a
// fixture run of FINAL_TRIALS_PER_TASK trials per task there, a freeze of the two fixture tasks, a
// world manifest at the records' initial hash, the two tasks as directories under tasks/, and the
// repo's cli/, packages/ and node_modules linked in; DONEWHEN_CLI is the real `node cli/index.ts`.
// The clauses must flip PASS/FAIL exactly with the exit codes those commands give on the same
// fixture (P21 gate: 19 trials, 15/20, a current GRADER_ERROR, replay.json removed, a record on
// another world hash or task_version; and PASS with one GRADER_ERROR regraded to FAIL).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../packages/core/cost.ts';
import { TASKS, writeFixtureRun, type Fixture } from '../../cli/test/run-fixtures.ts';
import { repoRoot, runScript, tempDir, write } from './helpers.ts';

const N = FINAL_TRIALS_PER_TASK;
const RUN = 'results/runs/final-1';

function rootWith(fixture: Fixture): string {
  const root = tempDir(`donewhen-cli-${fixture}`);
  for (const link of ['cli', 'packages', 'node_modules', 'apps', 'package.json']) symlinkSync(join(repoRoot, link), join(root, link));
  for (const id of TASKS) write(root, `tasks/${id}/task.toml`, `[task]\nid = "${id}"\n`);
  write(root, 'fixtures/manifest.json', JSON.stringify({ world: { state_hash: 'h-initial' } }));
  write(root, 'results/tasks-final.json', JSON.stringify({
    schema_version: 1, trials_per_task: N, band: FINAL_PASS_BAND,
    tasks: Object.fromEntries(TASKS.map((id) => [id, { task_version: `v-${id}`, grader_task_version: `g-${id}`, env_version: `e-${id}`, world_hash: 'h-initial', oracle_final_hash: '0'.repeat(64), frozen_at: 'a'.repeat(40), regrades: [] }])),
  }));
  writeFixtureRun(join(root, RUN), fixture, { trials: N });
  return root;
}

function clauses(root: string) {
  const home = tempDir('donewhen-cli-home');
  const env = { NODE_ENV: 'test', DONEWHEN_CLI: `${process.execPath} ${join(repoRoot, 'cli/index.ts')}`, HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), CLINENV_CANONICAL_LEDGER: undefined };
  const r = runScript('scripts/donewhen.ts', [], { cwd: root, env });
  const line = (n: number) => r.stdout.split('\n').find((l) => new RegExp(`^(PASS|FAIL) \\(${n}\\)`).test(l)) ?? `no clause ${n} line in:\n${r.stdout}\n${r.stderr}`;
  return { four: line(4), five: line(5), six: line(6) };
}

// The exit code of a real command on the fixture, run as donewhen runs it.
function exit(root: string, args: string[]): number | null {
  const home = tempDir('donewhen-cli-home');
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), ANTHROPIC_API_KEY: undefined, CLINENV_CANONICAL_LEDGER: undefined };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return spawnSync(process.execPath, [join(repoRoot, 'cli/index.ts'), ...args], { cwd: root, env, encoding: 'utf8' }).status;
}

const SUMMARY = ['summary', RUN, '--tasks', TASKS.join(','), '--require', `valid=${N},band=${FINAL_PASS_BAND[0]}-${FINAL_PASS_BAND[1]},env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all,env_limit=0`, '--json'];
const GRADER_ERROR = ['summary', RUN, '--require', 'grader_error=0', '--json'];
const AUDIT = ['audit-check', RUN, '--final', '--json'];

const record = (root: string, task: string, i: number) => JSON.parse(readFileSync(join(root, RUN, `trials/${task}/${i}.json`), 'utf8')) as Record<string, unknown>;
const putRecord = (root: string, task: string, i: number, r: Record<string, unknown>) => writeFileSync(join(root, RUN, `trials/${task}/${i}.json`), JSON.stringify(r, null, 2));
// A record's PASS turned into a FAIL, with the audit row the FAIL needs.
function failTrial(root: string, task: string, i: number): void {
  const r = record(root, task, i);
  putRecord(root, task, i, { ...r, outcome: 'FAIL', score: 0, checks: [{ id: 'G1', kind: 'gate', met: false }], attribution: { auto: 'reasoning', first_failed: 'G1', decisive_step: 2, exposure: [{ id: 'Patient/pt-0001', first_exposed_step: 1 }] } });
  const row = { trial: `${task}/${i}`, outcome: 'FAIL', taxonomy: 'reasoning', model_fault: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, note: 'chose the wrong value with the evidence in view' };
  writeFileSync(join(root, RUN, 'audit.jsonl'), readFileSync(join(root, RUN, 'audit.jsonl'), 'utf8') + JSON.stringify(row) + '\n');
}

describe('done-when clauses (5) and (6) with the real summary and audit-check', () => {
  it(`PASS on the clean run of ${N} per task, where both commands exit 0`, () => {
    const root = rootWith('clean');
    expect(exit(root, SUMMARY)).toBe(0);
    expect(exit(root, AUDIT)).toBe(0);
    expect(exit(root, GRADER_ERROR)).toBe(0);
    const c = clauses(root);
    expect(c.four).toMatch(/^PASS \(4\)/);
    expect(c.five).toMatch(new RegExp(`^PASS \\(5\\).*frozen 2/2; summary: exit 0; t-alpha ${N / 2}/${N}, t-beta ${N / 2}/${N}; every trial started from the world h-initial`));
    expect(c.six).toMatch(new RegExp(`^PASS \\(6\\).*audit-check --final: exit 0; labelled ${N}/${N} failures, environment 0, grader 0; summary grader_error=0: exit 0, GRADER_ERROR 0 at the current grade, history 0`));
  });

  it(`clause (5) FAILs with ${N - 1} trials for one task, where summary exits 1; clause (6) still PASSes`, () => {
    const root = rootWith('nine-trials');
    expect(exit(root, SUMMARY)).toBe(1);
    expect(exit(root, AUDIT)).toBe(0);
    const c = clauses(root);
    expect(c.five).toMatch(new RegExp(`^FAIL \\(5\\).*summary: exit 1; t-alpha ${N / 2}/${N - 1}`));
    expect(c.six).toMatch(/^PASS \(6\)/);
  });

  it(`clause (5) FAILs on a task at 15/${N}, outside the band, where summary exits 1`, () => {
    const root = rootWith('clean');
    const r = record(root, 't-alpha', N - 1);
    for (let i = N / 2; i < 15; i++) putRecord(root, 't-alpha', i, { ...record(root, 't-alpha', i), outcome: 'PASS', score: 1, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null });
    expect(r.outcome).toBe('FAIL');
    expect(exit(root, SUMMARY)).toBe(1);
    expect(clauses(root).five).toMatch(new RegExp(`^FAIL \\(5\\).*summary: exit 1; t-alpha 15/${N}`));
  });

  it('clause (5) FAILs at 3/20, and holds at 4/20 and 14/20 (the band is inclusive)', () => {
    for (const [passes, ok] of [[3, false], [4, true], [14, true]] as const) {
      const root = rootWith('clean');
      for (let i = 0; i < N; i++) {
        const r = record(root, 't-beta', i);
        const pass = i < passes;
        if (pass !== (r.outcome === 'PASS')) {
          if (pass) putRecord(root, 't-beta', i, { ...r, outcome: 'PASS', score: 1, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null });
          else failTrial(root, 't-beta', i);
        }
      }
      expect(exit(root, SUMMARY), `${passes}/${N}`).toBe(ok ? 0 : 1);
      expect(clauses(root).five, `${passes}/${N}`).toMatch(new RegExp(`^${ok ? 'PASS' : 'FAIL'} \\(5\\).*t-beta ${passes}/${N}`));
    }
  });

  it('clauses (5) and (6) FAIL on one record whose current grade is GRADER_ERROR; both PASS once a regrade grades it FAIL, with history 1', () => {
    const root = rootWith('clean');
    const r = record(root, 't-alpha', N - 1);
    putRecord(root, 't-alpha', N - 1, { ...r, outcome: 'GRADER_ERROR', valid: false, score: null, attribution: null });
    expect(exit(root, SUMMARY)).toBe(1);
    expect(exit(root, GRADER_ERROR)).toBe(1);
    const c = clauses(root);
    expect(c.five).toMatch(new RegExp(`^FAIL \\(5\\).*summary: exit 1; t-alpha ${N / 2}/${N - 1}`));
    expect(c.six).toMatch(/^FAIL \(6\).*summary grader_error=0: exit 1, GRADER_ERROR 1 at the current grade, history 0/);
    // The offline regrade (cli regrade appends regrades[]; the recorded outcome stays).
    putRecord(root, 't-alpha', N - 1, { ...record(root, 't-alpha', N - 1), regrades: [{ grader_version: 'g-next', grader_task_version: 'g-t-alpha-next', outcome: 'FAIL', score: 0, valid: true, changed: true, checks: [{ id: 'G1', kind: 'gate', met: false }], attribution: r.attribution, at: '2026-10-24T00:00:00.000Z' }] });
    expect(exit(root, SUMMARY)).toBe(0);
    expect(exit(root, GRADER_ERROR)).toBe(0);
    expect(exit(root, AUDIT)).toBe(0);
    const after = clauses(root);
    expect(after.five).toMatch(new RegExp(`^PASS \\(5\\).*t-alpha ${N / 2}/${N}`));
    expect(after.six).toMatch(/^PASS \(6\).*summary grader_error=0: exit 0, GRADER_ERROR 0 at the current grade, history 1/);
  });

  it('clause (5) FAILs with replay.json removed (replay=all), where summary exits 1', () => {
    const root = rootWith('clean');
    rmSync(join(root, RUN, 'replay.json'));
    expect(exit(root, SUMMARY)).toBe(1);
    expect(clauses(root).five).toMatch(/^FAIL \(5\).*summary: exit 1/);
  });

  it('clause (5) FAILs on one record that started from another world hash (R14-37), and clause (4) with it', () => {
    const root = rootWith('clean');
    const r = record(root, 't-beta', 0);
    putRecord(root, 't-beta', 0, { ...r, state_hash: { ...(r.state_hash as object), initial: 'h-other' } });
    const c = clauses(root);
    expect(c.four).toMatch(/^FAIL \(4\).*2 distinct initial state hash/);
    expect(c.five).toMatch(/^FAIL \(5\).*initial state hash h-other is not the world's h-initial/);
  });

  it('clause (5) FAILs on one record at another task_version than the frozen one', () => {
    const root = rootWith('clean');
    putRecord(root, 't-beta', 1, { ...record(root, 't-beta', 1), task_version: 'v-t-beta-tuned' });
    expect(exit(root, SUMMARY)).toBe(0);
    expect(clauses(root).five).toMatch(/^FAIL \(5\).*t-beta at task_version v-t-beta-tuned, frozen v-t-beta/);
  });

  // An ENV_LIMIT is never rerun, so the batch leaves it as an unsettled attempt; the final run
  // requires env_limit=0, so a human reviews it before done-when can pass (verifier-phase-P17i-W0-A-r3-1 M4).
  it('clause (5) FAILs on a run with one ENV_LIMIT attempt, where summary exits 1', () => {
    const root = rootWith('clean');
    const run = join(root, RUN);
    const r = record(root, 't-alpha', 5);
    mkdirSync(join(run, 'requeued/t-alpha'), { recursive: true });
    writeFileSync(join(run, 'requeued/t-alpha/5.a-0.json'), JSON.stringify({ ...r, outcome: 'ENV_LIMIT', valid: false, fault: 'env', status: 'LIMIT', detail: 'turns', score: null, checks: [], attribution: null, attempt: 'a-0', settled: false, requeue_reason: 'ENV_LIMIT' }));
    expect(exit(root, SUMMARY)).toBe(1);
    expect(clauses(root).five).toMatch(new RegExp(`^FAIL \\(5\\).*summary: exit 1; t-alpha ${N / 2}/${N}, t-beta ${N / 2}/${N}`));
  });

  it('clause (6) FAILs on a missing label and on an environment label, where audit-check exits 1; clause (5) still PASSes', () => {
    const missing = rootWith('missing-label');
    expect(exit(missing, SUMMARY)).toBe(0);
    expect(exit(missing, AUDIT)).toBe(1);
    const c = clauses(missing);
    expect(c.five).toMatch(/^PASS \(5\)/);
    expect(c.six).toMatch(new RegExp(`^FAIL \\(6\\).*audit-check --final: exit 1; labelled ${N - 1}/${N} failures`));
    const environment = rootWith('environment-label');
    expect(exit(environment, AUDIT)).toBe(1);
    expect(clauses(environment).six).toMatch(/^FAIL \(6\).*environment 1, grader 0/);
  });
});
