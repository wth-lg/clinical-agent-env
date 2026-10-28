// P17j JG9 (pre-audit M4): T4 gives +1 rubric credit, never a gate, for a potassium and creatinine
// recheck ordered for 2026-10-26 to 2026-10-28, a week after spironolactone is started with
// lisinopril resumed; a Task does not count (JG9 r3, decisions 2026-10-28T09:40Z). Code method.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

const task = await loadMatrixTask('discharge-medrec');
const env = matrixEnv();
const item = async (id: string) => {
  const c = cases(task).find((x) => x.id === id)!;
  const g = await gradeRun(env, task, task.checks, await trial(env, task, c));
  return g.checks.find((r) => r.id === 'k_creatinine_recheck');
};

// The discharge summary asks for a BMP a week after starting spironolactone, so the catalog must
// let order_service place one (P17j JG9, decisions 2026-10-28T02:40Z: before, T4's catalog had
// creatinine alone and the order was refused).
describe('discharge-medrec catalog', () => {
  it('order_service accepts the BMP 24321-2: the oracle runs without a rejected call and creates it', async () => {
    const run = await trial(env, task, cases(task).find((x) => x.id === 'oracle')!);
    const errors = run.events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, content: e.content }] : []));
    expect(errors).toEqual([]);
    const bmp = run.events.filter((e) => e.type === 'tool_call' && e.name === 'order_service' && (e.input as { code?: string }).code === '24321-2');
    expect(bmp).toHaveLength(1);
  });
});

describe('discharge-medrec k_creatinine_recheck', () => {
  it.each(['recheck_bmp', 'bmp_task_mentions_kcl', 'bp_recheck_task', 'review_labs_task'])('is not met by a Task, whatever it says (%s)', async (id) => {
    expect(await item(id)).toMatchObject({ kind: 'rubric', method: 'code', points: 1, met: false });
  });

  it('is met by the oracle, which orders the BMP for 2026-10-26 to 2026-10-28', async () => {
    expect(await item('oracle')).toMatchObject({ points: 1, met: true });
  });
});
