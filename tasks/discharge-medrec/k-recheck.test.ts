// P19 lever (RBC-TOC-02 §7): with potassium 5.4 after discharge, spironolactone is not started,
// lisinopril stays held, and the PCP gets a Task due when the next potassium is expected. The gate
// k_recheck_task takes a Task the trial created for the PCP, due 2026-10-23 to 2026-10-28, whose
// focus is not the duplicate-tartrate order (§5's flag), or an order the trial created that
// measures potassium and starts in those days. It replaces the +1 k_creatinine_recheck credit (P17j
// JG9), which paid only for a BMP order.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

const task = await loadMatrixTask('discharge-medrec');
const env = matrixEnv();
const run = async (id: string) => trial(env, task, cases(task).find((x) => x.id === id)!);
const check = async (id: string, check: string) => (await gradeRun(env, task, task.checks, await run(id))).checks.find((r) => r.id === check);

describe('discharge-medrec catalog', () => {
  it('order_service accepts the BMP 24321-2: the alternative k_bmp_order_only runs without a rejected call and creates it', async () => {
    const r = await run('k_bmp_order_only');
    const errors = r.events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, content: e.content }] : []));
    expect(errors).toEqual([]);
    expect(r.events.filter((e) => e.type === 'tool_call' && e.name === 'order_service' && (e.input as { code?: string }).code === '24321-2')).toHaveLength(1);
  });
});

describe('discharge-medrec k_recheck_task', () => {
  it.each(['oracle', 'k_bmp_order_only', 'k_task_and_bmp', 'k_two_tasks', 'k_task_no_focus_due_1023', 'k_task_plus_potassium_message'])('is met by %s', async (id) => {
    expect(await check(id, 'k_recheck_task')).toMatchObject({ kind: 'gate', met: true });
  });
  it.each(['k_no_task', 'k_message_only', 'k_task_tartrate_only', 'k_task_late'])('is not met by %s', async (id) => {
    expect(await check(id, 'k_recheck_task')).toMatchObject({ kind: 'gate', met: false });
  });
  it('is no longer the +1 k_creatinine_recheck credit', () => {
    expect(task.checks.map((c) => c.id)).not.toContain('k_creatinine_recheck');
  });
});
