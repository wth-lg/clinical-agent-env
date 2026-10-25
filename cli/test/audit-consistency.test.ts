// The cross-trial consistency flag (plan phase P17i C3, R14-32; grouping ruled in decisions.tsv
// 2026-10-27T00:30): a task whose valid failures mostly fail the same check first (>= 80%,
// counted from 5 valid failures, or at any count under --final), or that has 0 passes in >= 10
// valid trials, is flagged in summary.json, and audit-check exits 1 until audit.jsonl holds a
// task-validity review line for it: {task, kind: "task-validity", reviewer, verdict:
// "fair-trap" | "check-defect", note}. The found values within the group are information only:
// real evidence carries per-trial write ids and step numbers. The runs are P12's clean fixture
// (two tasks, 5 PASS and 5 FAIL each) with t-alpha's failures rewritten.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consistencyOf, currentGrade, summarize, type SummaryCheck, type SummaryTrial } from '../../packages/core/summary.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';
import { main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
const writeJson = (file: string, x: unknown) => writeFileSync(file, `${JSON.stringify(x, null, 2)}\n`);
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
const writeRows = (dir: string, xs: object[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');
const review = (task: string, verdict = 'fair-trap') => ({ task, kind: 'task-validity', reviewer: 'auditor-1', verdict, note: 'the shared failure is a fair trap' });

// The evidence_before_writes evidence of message-queue's m1_visit_unseen and visit_id_only
// (verifier-P17i-C3-1 P4a): the same unexposed Encounter, at step numbers that differ per trial.
const visitUnseen = (step: number) => ({
  checks: [
    { evidence: 'DocumentReference/doc-t6-park-240309', write: 25 + step, exposed: 14 + step },
    { evidence: 'Encounter/enc-t6-hayes-0317', write: step, exposed: null, accepts: ['Encounter/enc-00152', 'Encounter/enc-t6-hayes-0317'] },
  ],
});

// t-alpha's FAILs, by index 5-9: an object is the evidence of its failed G1, null turns that
// index into a PASS (its FAIL label goes).
function failures(dir: string, evidence: ReadonlyArray<object | null>): void {
  evidence.forEach((ev, i) => {
    const file = join(dir, `trials/t-alpha/${5 + i}.json`);
    const r = readJson(file);
    if (ev === null) writeJson(file, { ...r, outcome: 'PASS', valid: true, score: 1, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null });
    else writeJson(file, { ...r, checks: [{ id: 'G1', kind: 'gate', met: false, evidence: ev }] });
  });
  const turned = new Set(evidence.flatMap((ev, i) => (ev === null ? [`t-alpha/${5 + i}`] : [])));
  writeRows(dir, rows(dir).filter((l) => !turned.has(l.trial as string)));
}

// The clean fixture without t-alpha's task-validity review (t-beta keeps its own).
function fixture(name: string): string {
  const dir = tempDir(`consistency-${name}`);
  writeFixtureRun(dir, 'clean');
  writeRows(dir, rows(dir).filter((l) => !(l.kind === 'task-validity' && l.task === 't-alpha')));
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

// A FAIL whose first failed check is `check`, with that evidence.
const fail = (i: number, check: string, evidence: unknown = {}): SummaryTrial => ({
  task_id: 't', task_version: 'v', index: i, outcome: 'FAIL', model_requested: 'm', models_returned: [], tool_errors: {}, cost_usd: 0, score: 0,
  state_hash: { initial: null, final: null, replay_final: null }, checks: [{ id: check, kind: 'gate', met: false, evidence }],
});

describe('the consistency flag', () => {
  it('4 valid failures failing one check first: not flagged without --final, flagged with it', async () => {
    const dir = fixture('four');
    failures(dir, [{ found: 'same' }, { found: 'same' }, { found: 'same' }, { found: 'same' }, null]);
    const s = await summaryOf(dir);
    expect(s.json.tasks['t-alpha']!.consistency).toEqual({ failures: 4, passes: 6, valid: 10, shared: { check: 'G1', count: 4, found: '"same"', found_count: 4, found_values: 1 }, flags: [] });
    const plain = await check(dir);
    expect(plain.code, plain.text).toBe(0);
    const final = await check(dir, '--final');
    expect(final.code).toBe(1);
    expect(final.json.violations).toEqual([expect.stringMatching(/^t-alpha: 4 of 4 valid failures fail G1 first \(1 distinct found value; 4 give "same"\); no task-validity review line in audit.jsonl/)]);
    writeRows(dir, [...rows(dir), review('t-alpha')]);
    const reviewed = await check(dir, '--final');
    expect(reviewed.code, reviewed.json.violations.join('\n')).toBe(0);
    expect(reviewed.json.task_validity).toMatchObject({ 't-alpha': { flags: ['shared_failure'], verdict: 'fair-trap', reviewer: 'auditor-1' } });
  });

  it('5 failures with one defect at different step numbers (P4a) are flagged, and audit-check exits 1 until the task has a review line', async () => {
    const dir = fixture('p4a');
    failures(dir, [9, 10, 11, 12, 13].map(visitUnseen));
    const s = await summaryOf(dir);
    expect(s.json.tasks['t-alpha']!.consistency).toMatchObject({ failures: 5, shared: { check: 'G1', count: 5, found_count: 1, found_values: 5 }, flags: ['shared_failure'] });
    expect(s.text).toMatch(/\n\s+consistency flagged: 5 of 5 valid failures fail G1 first \(5 distinct found values; 1 give \{"checks":/);
    const unreviewed = await check(dir);
    expect(unreviewed.code).toBe(1);
    expect(unreviewed.json.violations).toEqual([expect.stringMatching(/^t-alpha: 5 of 5 valid failures fail G1 first .*; no task-validity review line in audit.jsonl/)]);
    writeRows(dir, [...rows(dir), review('t-alpha', 'check-defect')]);
    const reviewed = await check(dir);
    expect(reviewed.code, reviewed.json.violations.join('\n')).toBe(0);
    expect(reviewed.text).toMatch(/t-alpha: task-validity review check-defect by auditor-1: a grader finding/);
  });

  it('5 failures of which 4 fail one check first are flagged; 3 of 5 are not, with or without final', () => {
    const four = [fail(0, 'G1', { found: 'a' }), fail(1, 'G1', { found: 'b' }), fail(2, 'G1', { found: 'a' }), fail(3, 'G1', { found: 'c' }), fail(4, 'G2')];
    expect(consistencyOf(four.map(currentGrade))).toEqual({ valid: 5, passes: 0, failures: 5, shared: { check: 'G1', count: 4, found: '"a"', found_count: 2, found_values: 3 }, flags: ['shared_failure'] });
    expect(summarize({ run_id: 'r', trials: four, requeued: [], replay: null }).tasks.t!.consistency.flags).toEqual(['shared_failure']);
    const three = [fail(0, 'G1'), fail(1, 'G1'), fail(2, 'G1'), fail(3, 'G2'), fail(4, 'G3')];
    expect(consistencyOf(three.map(currentGrade)).flags).toEqual([]);
    expect(consistencyOf(three.map(currentGrade), { final: true }).flags).toEqual([]);
  });

  // Only the mutants declared to fail fit_orders run, to keep the test short.
  it('the crc-care-gap mutant failures whose first failed check is fit_orders group as one check', async () => {
    const env = matrixEnv();
    const task = await loadMatrixTask('crc-care-gap');
    const grades: Array<{ outcome: string; valid: boolean; checks: SummaryCheck[] }> = [];
    for (const c of cases(task).filter((x) => x.mutant?.fails.includes('fit_orders') === true)) {
      const g = await gradeRun(env, task, task.checks, await trial(env, task, c));
      const checks = g.checks as unknown as SummaryCheck[];
      if (g.outcome !== 'PASS' && checks.find((x) => x.kind === 'gate' && x.met === false)?.id === 'fit_orders') grades.push({ outcome: g.outcome, valid: true, checks });
    }
    expect(grades.length).toBeGreaterThanOrEqual(5);
    const c = consistencyOf(grades);
    expect(c.shared).toMatchObject({ check: 'fit_orders', count: grades.length });
    expect(c.shared!.found_values).toBeGreaterThan(1);
    expect(c.flags).toContain('shared_failure');
  }, 180_000);

  it('a malformed review line is a violation and counts as no review', async () => {
    const dir = fixture('malformed');
    writeRows(dir, [...rows(dir), { task: 't-alpha', kind: 'task-validity', reviewer: 'auditor-1', verdict: 'fine', note: 'x' }]);
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.json.violations).toEqual([
      expect.stringMatching(/^audit\.jsonl line \d+: task-validity verdict must be fair-trap or check-defect$/),
      expect.stringMatching(/^t-alpha: 5 of 5 valid failures fail G1 first \(1 distinct found value; 5 give null\); no task-validity review/),
    ]);
  });

  it('0 passes in 10 valid trials is flagged; in 9 it is not', () => {
    const ten = Array.from({ length: 10 }, (_, i) => fail(i, `G${i % 4}`));
    expect(consistencyOf(ten.map(currentGrade)).flags).toEqual(['no_passes']);
    expect(consistencyOf(ten.slice(0, 9).map(currentGrade)).flags).toEqual([]);
    expect(consistencyOf(ten.slice(0, 9).map(currentGrade), { final: true }).flags).toEqual([]);
    expect(summarize({ run_id: 'r', trials: ten, requeued: [], replay: null }).tasks.t!.consistency.flags).toEqual(['no_passes']);
  });

  it('--final parses before or after the run directory', async () => {
    const dir = fixture('order');
    failures(dir, [{ found: 'same' }, null, null, null, null]);
    const out: string[] = [];
    const io = { out: (l: string) => out.push(l), err: () => {}, checks: fixtureChecks };
    expect(await auditCheck(['--final', dir], io)).toBe(1);
    expect(await auditCheck([dir, '--final'], io)).toBe(1);
    expect(await auditCheck([dir], io)).toBe(0);
  });
});
