// What the matrix does not show for T6: every scripted case runs without a rejected tool call,
// so a mutant fails on the trap it names and not on a write the tools refused.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, trial } from '../../packages/grader/matrix/matrix.ts';

const task = await loadMatrixTask('message-queue');
const env = matrixEnv();

describe('message-queue scripts', () => {
  it.each(cases(task).map((c) => [c.id, c] as const))('%s: no tool call is rejected', async (_id, c) => {
    const { events } = await trial(env, task, c);
    const errors = events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, content: e.content }] : []));
    expect(errors).toEqual([]);
  });
});
