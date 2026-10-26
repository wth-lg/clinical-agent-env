// MatrixOptions.onCase (P17j JU12 part 2; decisions.tsv 2026-10-28T06:30, a named exception for
// lane U): runCases calls it after each selected case's runs with how many cases are done and how
// many there are, so the browser's grader check can show "case k of N"; it changes no result.
import { describe, expect, it } from 'vitest';
import { installEgressGuard } from '../../packages/core/egress.ts';
import { runMatrix, type MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';

installEgressGuard(globalThis);

const TOY = await loadMatrixTask('_toy');
const ONE: MatrixOptions = { trials: 1, regrades: 1, isolation: false, cases: ['oracle', 'null'] };

describe('MatrixOptions.onCase', () => {
  it('fires once per selected case, in order, with done and total', async () => {
    const calls: Array<[number, number]> = [];
    const result = await runMatrix(matrixEnv(), TOY, { ...ONE, onCase: (done, total) => calls.push([done, total]) });
    expect(calls).toEqual([[1, 2], [2, 2]]);
    // The same result as without the callback.
    const plain = await runMatrix(matrixEnv(), TOY, ONE);
    expect(result.lines).toEqual(plain.lines);
    expect(result.pass).toBe(plain.pass);
  });
});
