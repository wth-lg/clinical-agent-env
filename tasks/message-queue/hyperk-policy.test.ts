// T6's M1 branch after the P19 gate (verifier-phase-P19-T6-1 D3, D4, builder-186; T6-2 N1,
// builder-187): RBC-RX-05 §1 forbids a refill and any new or changed ACE inhibitor or ARB order
// pending prescriber review, the bar m1_hyperk_hold enforces, and says holding or stopping the
// current order is allowed, as the grader credits both; and the spray agent also refills the
// lisinopril, so it exercises m1_hyperk_hold. D1 and D2 (the report's author, the threshold
// wording) are checked in cli/test/p19-gate-fixes.test.ts, which reads files.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';

describe('message-queue M1 hyperkalaemia branch', () => {
  it('RBC-RX-05 §1 forbids a refill or any new or changed ACE inhibitor or ARB order pending prescriber review, and allows a hold or stop', async () => {
    const policy = (await nodeTaskSource({ testMode: false }).get('message-queue')).policies.find((p) => p.id === 'RBC-RX-05')!.text;
    const line = policy.split('\n').find((l) => l.includes('5.5 mmol/L or higher'))!;
    expect(line).toMatch(/do not refill, and place no new or changed ACE inhibitor or ARB order, pending prescriber review;/);
    expect(line).toMatch(/Holding or stopping the current order is allowed\./);
    expect(line).not.toMatch(/change the request/);
  });

  it('the spray agent refills the lisinopril too, so it fails m1_hyperk_hold', async () => {
    const task = await loadMatrixTask('message-queue');
    const env = matrixEnv();
    const spray = cases(task).find((c) => c.kind === 'spray')!;
    const g = await gradeRun(env, task, task.checks, await trial(env, task, spray));
    expect(g.checks.find((c) => c.id === 'm1_hyperk_hold')).toMatchObject({ met: false });
  });
});
