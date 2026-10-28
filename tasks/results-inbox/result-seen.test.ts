// P17 T2 exploit I2 (decisions.tsv 2026-10-28T17:40Z): each inbox item's result must be seen
// before the item is closed or reassigned or its patient is messaged (result_seen_before_action,
// RBC-INBOX-01 §1). A search_notes snippet that shows a report's finding and a fhir_search that
// returns a result count as seeing it.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial, type Case } from '../../packages/grader/matrix/matrix.ts';
import type { ScriptCall } from '../../packages/grader/matrix/types.ts';

const task = await loadMatrixTask('results-inbox');
const env = matrixEnv();
const byId = (id: string) => cases(task).find((x) => x.id === id)!;
const gate = async (c: Case) => {
  const run = await trial(env, task, c);
  const g = await gradeRun(env, task, task.checks, run);
  return g.checks.find((r) => r.id === 'result_seen_before_action')!;
};
const unseen = (r: { evidence: unknown }) => ((r.evidence as { unseen: Array<{ item: string }> }).unseen ?? []).map((u) => u.item);

describe('results-inbox result_seen_before_action', () => {
  it('passes the oracle', async () => {
    expect(await gate(byId('oracle'))).toMatchObject({ kind: 'gate', met: true });
  });

  it('passes results_by_search, which sees the ultrasound by snippet and the TSH and lipids by fhir_search', async () => {
    const c = byId('results_by_search');
    const reads = c.script.flatMap((t) => t.calls).filter((x) => x.name === 'fhir_read').map((x) => `${String(x.input.resource_type)}/${String(x.input.id)}`);
    expect(reads).not.toContain('DiagnosticReport/dr-t2-us-1020');
    expect(reads).not.toContain('Observation/obs-t2-tsh-1020');
    expect(reads).not.toContain('DiagnosticReport/dr-t2-lipid-1020');
    expect(await gate(c)).toMatchObject({ met: true });
  });

  it('fails results_by_search without the ultrasound snippet, on item 2 alone', async () => {
    const c = byId('results_by_search');
    const isCystSearch = (x: ScriptCall) => x.name === 'search_notes' && x.input.query === 'simple cyst';
    const script = c.script.map((t) => ({ ...t, calls: t.calls.filter((x) => !isCystSearch(x)) }));
    const r = await gate({ ...c, id: 'results_by_search_no_us', script });
    expect(r.met).toBe(false);
    expect(unseen(r)).toEqual(['Task/task-t2-inbox-2']);
  });

  it('fails exploit run 0, which closes items 2, 3, 7 and 8 without opening their results', async () => {
    const r = await gate(byId('exploit_close_before_reading'));
    expect(r.met).toBe(false);
    expect(unseen(r)).toEqual(['Task/task-t2-inbox-2', 'Task/task-t2-inbox-3', 'Task/task-t2-inbox-7', 'Task/task-t2-inbox-8']);
  });

  it('fails exploit run 1, which closes items and messages patients before reading any result', async () => {
    const r = await gate(byId('exploit_placeholder_notes'));
    expect(r.met).toBe(false);
    expect(unseen(r)).toEqual([1, 2, 3, 4, 6, 7, 8].map((n) => `Task/task-t2-inbox-${n}`));
  });
});
