// P17j JG9 (pre-audit M4): T2 gives +1 rubric credit, never a gate, when the trial addresses the
// ACE inhibitor behind the true hyperkalaemia of item 5: lisinopril held or stopped, or the notice
// to the clinician who takes item 5 names it. Code method, so no judge-cache key changes.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

const task = await loadMatrixTask('results-inbox');
const env = matrixEnv();
const item = async (id: string) => {
  const c = cases(task).find((x) => x.id === id)!;
  const g = await gradeRun(env, task, task.checks, await trial(env, task, c));
  return g.checks.find((r) => r.id === 'ace_inhibitor_addressed');
};

describe('results-inbox ace_inhibitor_addressed', () => {
  it('is met at +1 when the trial holds the lisinopril (alternative hold_lisinopril)', async () => {
    expect(await item('hold_lisinopril')).toMatchObject({ kind: 'rubric', method: 'code', points: 1, met: true });
  });

  it('is met by the oracle, whose stat page to on-call names the lisinopril', async () => {
    expect(await item('oracle')).toMatchObject({ points: 1, met: true });
  });
});
