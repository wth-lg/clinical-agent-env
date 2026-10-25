// The cross-trial consistency flag (plan phase P17i C3, R14-32): a task whose valid failures
// mostly share their first failed check and found value (>= 80%, counted from 5 valid failures,
// or at any count under --final), or that has 0 passes in >= 10 valid trials, is flagged in
// summary.json, and audit-check exits 1 until audit.jsonl holds a task-validity review line for
// it: {task, kind: "task-validity", reviewer, verdict: "fair-trap" | "check-defect", note}.
// The runs are P12's clean fixture (two tasks, 5 PASS and 5 FAIL each) with t-alpha's and
// t-beta's failures rewritten.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consistencyOf, currentGrade, summarize, type SummaryTrial } from '../../packages/core/summary.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
const writeJson = (file: string, x: unknown) => writeFileSync(file, `${JSON.stringify(x, null, 2)}\n`);
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
const writeRows = (dir: string, xs: object[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');
const review = (task: string, verdict = 'fair-trap') => ({ task, kind: 'task-validity', reviewer: 'auditor-1', verdict, note: 'the shared failure is a fair trap' });

// The found value of each FAIL of a task, by index 5-9: a string shares it with every other FAIL
// that has the same string. null turns that index into a PASS (its label becomes a PASS label).
function failures(dir: string, task: string, found: ReadonlyArray<string | null>): void {
  found.forEach((f, i) => {
    const index = 5 + i;
    const file = join(dir, `trials/${task}/${index}.json`);
    const r = readJson(file);
    if (f === null) writeJson(file, { ...r, outcome: 'PASS', valid: true, score: 1, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null });
    else writeJson(file, { ...r, checks: [{ id: 'G1', kind: 'gate', met: false, evidence: { expected: 'held', found: f } }] });
  });
  const turned = new Set(found.flatMap((f, i) => (f === null ? [`${task}/${5 + i}`] : [])));
  writeRows(dir, rows(dir).filter((l) => !turned.has(l.trial as string)));
}

// The clean fixture with its task-validity reviews taken out and t-beta's failures all distinct.
function fixture(name: string): string {
  const dir = tempDir(`consistency-${name}`);
  writeFixtureRun(dir, 'clean');
  writeRows(dir, rows(dir).filter((l) => l.kind !== 'task-validity'));
  failures(dir, 't-beta', ['b5', 'b6', 'b7', 'b8', 'b9']);
  return dir;
}

async function check(dir: string, ...flags: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await auditCheck([dir, '--json', ...flags], { out: (l) => out.push(l), err: (l) => err.push(l), checks: fixtureChecks });
  return { code, json: JSON.parse(out.join('\n')) as { violations: string[]; task_validity: Record<string, unknown> }, text: err.join('\n') };
}

async function summaryOf(dir: string) {
  const out: string[] = [];
  const err: string[] = [];
  expect(await summary([dir, '--json'], { out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(0);
  return { json: JSON.parse(out.join('\n')) as { tasks: Record<string, { consistency: unknown }> }, text: err.join('\n') };
}

describe('the consistency flag', () => {
  it('4 valid failures sharing one check and value: not flagged without --final, flagged with it', async () => {
    const dir = fixture('four');
    failures(dir, 't-alpha', ['same', 'same', 'same', 'same', null]);
    const s = await summaryOf(dir);
    expect(s.json.tasks['t-alpha']!.consistency).toEqual({ failures: 4, passes: 6, valid: 10, shared: { check: 'G1', found: '"same"', count: 4 }, flags: [] });
    const plain = await check(dir);
    expect(plain.code, plain.text).toBe(0);
    const final = await check(dir, '--final');
    expect(final.code).toBe(1);
    expect(final.json.violations).toContainEqual(expect.stringMatching(/^t-alpha: 4 of 4 valid failures share G1 found "same".*no task-validity review/));
    expect(final.json.violations.filter((v) => v.startsWith('t-beta'))).toEqual([]);
    writeRows(dir, [...rows(dir), review('t-alpha')]);
    const reviewed = await check(dir, '--final');
    expect(reviewed.code, reviewed.json.violations.join('\n')).toBe(0);
    expect(reviewed.json.task_validity).toEqual({ 't-alpha': { flags: ['shared_failure'], verdict: 'fair-trap', reviewer: 'auditor-1' } });
  });

  it('5 valid failures of which 4 share: flagged, and audit-check exits 1 until the task has a review line', async () => {
    const dir = fixture('five');
    failures(dir, 't-alpha', ['same', 'same', 'same', 'same', 'other']);
    const s = await summaryOf(dir);
    expect(s.json.tasks['t-alpha']!.consistency).toEqual({ failures: 5, passes: 5, valid: 10, shared: { check: 'G1', found: '"same"', count: 4 }, flags: ['shared_failure'] });
    expect(s.text).toMatch(/\n\s+consistency flagged: 4 of 5 valid failures share G1 found "same"/);
    const unreviewed = await check(dir);
    expect(unreviewed.code).toBe(1);
    expect(unreviewed.json.violations).toEqual([expect.stringMatching(/^t-alpha: 4 of 5 valid failures share G1 found "same"; no task-validity review line in audit.jsonl/)]);
    writeRows(dir, [...rows(dir), review('t-alpha', 'check-defect')]);
    const reviewed = await check(dir);
    expect(reviewed.code, reviewed.json.violations.join('\n')).toBe(0);
    expect(reviewed.text).toMatch(/t-alpha: task-validity review check-defect by auditor-1: a grader finding/);
  });

  it('3 of 5 sharing is not flagged; neither is a run whose shared failures differ in found value', async () => {
    const dir = fixture('three');
    failures(dir, 't-alpha', ['same', 'same', 'same', 'x', 'y']);
    expect((await summaryOf(dir)).json.tasks['t-alpha']!.consistency).toMatchObject({ shared: { count: 3 }, flags: [] });
    expect((await check(dir)).code).toBe(0);
    expect((await check(dir, '--final')).code).toBe(0);
  });

  it('a malformed review line is a violation; an unflagged task may carry a review', async () => {
    const dir = fixture('malformed');
    writeRows(dir, [...rows(dir), { task: 't-alpha', kind: 'task-validity', reviewer: 'auditor-1', verdict: 'fine', note: 'x' }, review('t-beta')]);
    const r = await check(dir);
    expect(r.code).toBe(1);
    // The malformed line is no review, so the flagged t-alpha has none; t-beta is not flagged.
    expect(r.json.violations).toEqual(['audit.jsonl line 15: task-validity verdict must be fair-trap or check-defect', expect.stringMatching(/^t-alpha: 5 of 5 valid failures share G1 found null; no task-validity review/)]);
  });

  it('0 passes in 10 valid trials is flagged; in 9 it is not', () => {
    const t = (i: number, found: string): SummaryTrial => ({
      task_id: 't', task_version: 'v', index: i, outcome: 'FAIL', model_requested: 'm', models_returned: [], tool_errors: {}, cost_usd: 0, score: 0,
      state_hash: { initial: null, final: null, replay_final: null }, checks: [{ id: `G${i % 4}`, kind: 'gate', met: false, evidence: { found } }],
    });
    const ten = Array.from({ length: 10 }, (_, i) => t(i, `v${i}`));
    expect(consistencyOf(ten.map(currentGrade)).flags).toEqual(['no_passes']);
    expect(consistencyOf(ten.slice(0, 9).map(currentGrade)).flags).toEqual([]);
    expect(consistencyOf(ten.slice(0, 9).map(currentGrade), { final: true }).flags).toEqual([]);
    expect(summarize({ run_id: 'r', trials: ten, requeued: [], replay: null }).tasks.t!.consistency.flags).toEqual(['no_passes']);
  });

  it('--final parses before or after the run directory', async () => {
    const dir = fixture('order');
    failures(dir, 't-alpha', ['same', null, null, null, null]);
    const out: string[] = [];
    const io = { out: (l: string) => out.push(l), err: () => {}, checks: fixtureChecks };
    expect(await auditCheck(['--final', dir], io)).toBe(1);
    expect(await auditCheck([dir, '--final'], io)).toBe(1);
    expect(await auditCheck([dir], io)).toBe(0);
  });
});
