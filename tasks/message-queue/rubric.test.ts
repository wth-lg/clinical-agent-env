// What the matrix does not show for T6: every scripted case runs without a rejected tool call, so
// a mutant fails on the item it names and not on a write the tools refused; except the
// alternatives that try a forbidden write on purpose (tests/alternatives.ts REJECTING), each of
// which has exactly one rejected call, an order the tools refused, so nothing forbidden is committed.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, trial } from '../../packages/grader/matrix/matrix.ts';
import { REJECTING } from './tests/alternatives.ts';

const task = await loadMatrixTask('message-queue');
const env = matrixEnv();
const rejecting = new Set<string>(REJECTING);

describe('message-queue scripts', () => {
  it.each(cases(task).map((c) => [c.id, c] as const))('%s: no tool call is rejected but the declared one', async (id, c) => {
    const { events } = await trial(env, task, c);
    const errors = events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, code: e.error_code }] : []));
    if (c.kind === 'alternative' && rejecting.has(id)) expect(errors).toEqual([{ name: expect.stringMatching(/^order_(medication|service)$/), code: expect.stringMatching(/^(INVALID_INPUT|NOT_FOUND)$/) }]);
    else expect(errors).toEqual([]);
  });
});
