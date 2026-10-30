// T6's M1 branch after the P19 gate (verifier-phase-P19-T6-1 D3, D4, builder-186): RBC-RX-05 §1
// says the request is neither refilled nor changed (no new ACE inhibitor or ARB order) pending
// prescriber review, the bar m1_hyperk_hold enforces; and the spray agent also refills the
// lisinopril, so it exercises m1_hyperk_hold. D1 and D2 (the report's author, the threshold
// wording) are checked in cli/test/p19-gate-fixes.test.ts, which reads files.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

describe('message-queue M1 hyperkalaemia branch', () => {
  it('RBC-RX-05 §1 says the request is not refilled or changed pending prescriber review', async () => {
    const policy = (await nodeTaskSource({ testMode: false }).get('message-queue')).policies.find((p) => p.id === 'RBC-RX-05')!.text;
    expect(policy).toMatch(/potassium 5\.5 mmol\/L or higher: do not refill or change the request \(no new ACE inhibitor or ARB order\) pending prescriber review;/);
  });

  it('the spray agent refills the lisinopril too, so it fails m1_hyperk_hold', async () => {
    const task = await loadMatrixTask('message-queue');
    const env = matrixEnv();
    const spray = cases(task).find((c) => c.kind === 'spray')!;
    const g = await gradeRun(env, task, task.checks, await trial(env, task, spray));
    expect(g.checks.find((c) => c.id === 'm1_hyperk_hold')).toMatchObject({ met: false });
  });
});
