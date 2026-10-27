// The committed sample run the browse specs build against (apps/web/e2e/fixtures/sample-results):
// its summary.json validates against packages/core/summary.ts and equals summarize() over its
// records, every task has 12 valid trials (so N is read from the run, not a constant), and the run
// holds at least one FAIL, ENV_ERROR, GRADER_ERROR, REFUSAL, LIMIT and INFRA record.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditLabelOf, type AuditRow } from '../../../packages/core/explain.ts';
import { summarize, validateSummary, type Summary, type SummaryTrial } from '../../../packages/core/summary.ts';

const SAMPLE = join(import.meta.dirname, '../e2e/fixtures/sample-results');
const run = (JSON.parse(readFileSync(join(SAMPLE, 'results/official.json'), 'utf8')) as { run: string }).run;
const RUN = join(SAMPLE, 'results', run);
const summary = JSON.parse(readFileSync(join(RUN, 'summary.json'), 'utf8')) as Summary;
const records = readdirSync(join(RUN, 'trials'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as SummaryTrial & { trajectory: string; index: number })
  // generate.ts's order, so the floating-point means add up in the same order.
  .sort((a, b) => (a.task_id === b.task_id ? a.index - b.index : a.task_id < b.task_id ? -1 : 1));

describe('sample summary.json', () => {
  it('validates against packages/core/summary.ts', () => {
    expect(validateSummary(summary)).toEqual([]);
  });

  it('equals summarize() over the committed records', () => {
    // fault_counts.label reads the run's audit labels, as cli summary does (P17j JG7).
    const audit = Object.fromEntries(readFileSync(join(RUN, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as AuditRow).filter((a) => typeof a.trial === 'string').map((a) => [a.trial, auditLabelOf(a)]));
    const again = summarize({ run_id: summary.run_id, trials: records, requeued: [], replay: null, mode: summary.mode, ...(summary.expected_tasks ? { expected: summary.expected_tasks } : {}), audit });
    expect(again).toEqual(summary);
  });

  it('has six tasks, 12 valid trials each, and every outcome the Runs view must show', () => {
    expect(Object.keys(summary.tasks)).toHaveLength(6);
    for (const [id, t] of Object.entries(summary.tasks)) expect(t.trials, id).toBe(12);
    const outcomes = new Set(records.map((r) => r.outcome));
    for (const o of ['PASS', 'FAIL', 'ENV_ERROR', 'GRADER_ERROR', 'REFUSAL', 'LIMIT']) expect(outcomes, o).toContain(o);
    expect([...outcomes].some((o) => o.startsWith('INFRA_'))).toBe(true);
  });

  it('every record has its trajectory, and matrix.json has an entry per task', () => {
    for (const r of records) expect(existsSync(join(RUN, r.trajectory)), r.trajectory).toBe(true);
    const matrix = JSON.parse(readFileSync(join(RUN, 'matrix.json'), 'utf8')) as { grader_task_versions: Record<string, { task_id: string }> };
    expect(Object.values(matrix.grader_task_versions).map((e) => e.task_id).sort()).toEqual(Object.keys(summary.tasks));
  });

  // browse.spec.ts compares the browser's probes with cliMatrix's by toEqual, so cliMatrix gives
  // exactly the fields the probe elements carry (verifier-phase-P17i-C4-1 F2).
  it("cliMatrix gives each probe the five fields browse.spec.ts reads from the page, and no more", async () => {
    const { cliMatrix, TASK_IDS } = await import('../e2e/fixtures/sample-results/sample.ts');
    for (const id of TASK_IDS) for (const p of (await cliMatrix(id)).probes) expect(Object.keys(p).sort(), id).toEqual(['as_expected', 'failed_checks', 'id', 'kind', 'outcome']);
  });
});
