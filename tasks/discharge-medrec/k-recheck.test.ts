// P19 lever (RBC-TOC-02 §7): with potassium 5.4 after discharge, spironolactone is not started,
// lisinopril stays held, and the PCP gets a Task due 2 to 7 days after that potassium result (§7
// says so: 2026-10-23 to 2026-10-28 for the 10/21 report). The gate k_recheck_task takes any Task
// the trial created for the PCP due in those days, whatever its focus (builder-186, ruling
// 2026-10-30T01:12Z T4 D2: a tartrate flag Task falls out only by its due date), or an order the
// trial created that measures potassium and starts in those days. It replaces the +1
// k_creatinine_recheck credit (P17j JG9), which paid only for a BMP order.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

const task = await loadMatrixTask('discharge-medrec');
const env = matrixEnv();
const run = async (id: string) => trial(env, task, cases(task).find((x) => x.id === id)!);
const check = async (id: string, check: string) => (await gradeRun(env, task, task.checks, await run(id))).checks.find((r) => r.id === check);
// The oracle with its Task due on another day.
const dueOn = async (due: string) => {
  const oracle = cases(task).find((x) => x.id === 'oracle')!;
  const script = oracle.script.map((turn) => ({ ...turn, calls: turn.calls.map((c) => (c.name === 'create_task' ? { ...c, input: { ...(c.input as object), due } } : c)) }));
  const r = await trial(env, task, { ...oracle, id: `oracle_due_${due}`, script });
  return (await gradeRun(env, task, task.checks, r)).checks.find((x) => x.id === 'k_recheck_task');
};

describe('discharge-medrec catalog', () => {
  it('order_service accepts the BMP 24321-2: the alternative k_bmp_order_only runs without a rejected call and creates it', async () => {
    const r = await run('k_bmp_order_only');
    const errors = r.events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, content: e.content }] : []));
    expect(errors).toEqual([]);
    expect(r.events.filter((e) => e.type === 'tool_call' && e.name === 'order_service' && (e.input as { code?: string }).code === '24321-2')).toHaveLength(1);
  });
});

describe('discharge-medrec k_recheck_task', () => {
  it.each(['oracle', 'k_bmp_order_only', 'k_task_and_bmp', 'k_two_tasks', 'k_task_no_focus_due_1023', 'k_task_plus_potassium_message', 'k_single_task_focus_tartrate'])('is met by %s', async (id) => {
    expect(await check(id, 'k_recheck_task')).toMatchObject({ kind: 'gate', met: true });
  });
  it.each(['k_no_task', 'k_message_only', 'k_task_tartrate_only', 'k_task_late'])('is not met by %s', async (id) => {
    expect(await check(id, 'k_recheck_task')).toMatchObject({ kind: 'gate', met: false });
  });
  it('§7 states the window the gate enforces: 2 to 7 days after the potassium result', async () => {
    const policy = (await nodeTaskSource({ testMode: false }).get('discharge-medrec')).policies.find((p) => p.id === 'RBC-TOC-02')!.text;
    expect(policy).toMatch(/create a Task for the PCP due 2 to 7 days after that potassium result/);
  });
  it.each([['2026-10-22', false], ['2026-10-23', true], ['2026-10-28', true], ['2026-10-29', false]] as const)('a Task due %s, 2 to 7 days after the 10/21 potassium: met %s', async (due, met) => {
    expect(await dueOn(due)).toMatchObject({ kind: 'gate', met });
  });
  it('is no longer the +1 k_creatinine_recheck credit', () => {
    expect(task.checks.map((c) => c.id)).not.toContain('k_creatinine_recheck');
  });
});
