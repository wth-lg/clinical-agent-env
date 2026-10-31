// What the Tasks view says each check requires (apps/web/src/tasks/check-text.ts), on the real
// tasks: every check's traces_to names text in the task (a policy section, a policy's preamble or
// a prompt line), judged items give their question with no model call (an item that asks only when
// the trial wrote the text it judges gives none), and the oracle lists its tool calls in order.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { hybrid, type Check } from '../../../packages/grader/check.ts';
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { rubricQuestion, solutionSteps, sourceText } from '../src/tasks/check-text.ts';

const tasks = await nodeTaskSource({ testMode: false }).all();

describe.each(tasks.map((t) => [t.id, t] as const))('%s', (id, task) => {
  it('each check names text in the task, and judged items their question', async () => {
    const { checks } = (await import(`../../../tasks/${id}/tests/grader.ts`)) as { checks: Check[] };
    for (const c of checks) expect(sourceText(task, c.traces_to), `${c.id} ${c.traces_to}`).not.toBeNull();
    const judged = checks.filter((x) => x.kind === 'rubric' && x.method === 'judge');
    const asked = (await Promise.all(judged.map(rubricQuestion))).filter((q) => q !== null);
    for (const q of asked) expect(q).toMatch(/\w{3,}/);
  });

  it('the oracle reads as numbered tool calls', async () => {
    const { oracle } = (await import(`../../../tasks/${id}/solution/solve.ts`)) as { oracle: Script };
    const steps = solutionSteps(oracle);
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    expect(steps.length).toBe(oracle.reduce((n, t) => n + t.calls.length, 0));
    for (const s of steps) expect(s.input).not.toMatch(/[{}"]/);
  });
});

// Since the W1 probes no task has a hybrid item and T1 none judged (builder-249): the judged item
// is T5's driver question, and the hybrid one is built here as a task would build it.
it("reads a judged item's criterion and a hybrid item's field", async () => {
  const { checks } = (await import('../../../tasks/contrast-ct-prep/tests/grader.ts')) as { checks: Check[] };
  expect(await rubricQuestion(checks.find((c) => c.id === 'message_driver')!)).toMatch(/^The text tells the patient to have someone else drive/);
  const crcl = hybrid({ id: 'note_states_crcl', category: 'documentation', points: 3, traces_to: 'RBC-PHARM-07 §1', decisive_ids: [], field: 'Cockcroft-Gault creatinine clearance (CrCl), mL/min', text: () => '', pattern: /\d+/, truth: 43.2, tolerance: { abs: 1 } });
  expect(await rubricQuestion(crcl)).toBe('the note states Cockcroft-Gault creatinine clearance (CrCl), mL/min, within tolerance of 43.2');
  expect(await rubricQuestion(checks.find((c) => c.kind === 'gate')!)).toBeNull();
});
