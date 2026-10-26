// pnpm cli matrix and the pinned oracle final hashes (plan phase P17i B5, R14-38). When
// results/tasks-v1.json exists, cli/matrix.ts reads each task's oracle_final_hash from it and
// runMatrix fails, naming the task, when the oracle's final state hash differs; with no expected
// hash the matrix prints the oracle's final hash, the value P21's freeze PR writes. The tasks here
// are the toy task under other ids, narrowed to the oracle, so the test stays offline and fast.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installEgressGuard } from '../../packages/core/egress.ts';
import { runMatrix, trial, type MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import { loadMatrixTask, main, matrixEnv } from '../matrix.ts';

installEgressGuard(globalThis);

const TOY = await loadMatrixTask('_toy');
const ONE: MatrixOptions = { trials: 1, regrades: 1, isolation: false, cases: ['oracle'] };
const HASH = (await trial(matrixEnv(), TOY, { kind: 'oracle', id: 'oracle', script: TOY.oracle! })).record.state_hash.final!;
const WRONG = '0'.repeat(64);

function tasksV1(content: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), 'tasks-v1-')), 'tasks-v1.json');
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

async function matrix(args: string[], file: string, ids: string[] = ['a', 'b']) {
  const lines: string[] = [];
  const code = await main(args, { env: process.env, out: (l) => lines.push(l), tasks: () => ids, load: async () => TOY, options: ONE, tasksV1: file });
  return { code, text: lines.join('\n') };
}

describe('matrix oracle final hash', () => {
  it('the toy oracle ends in a sha256 state hash', () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prints the oracle final hash when results/tasks-v1.json does not exist', async () => {
    const { code, text } = await matrix(['--task', 'a'], join(tmpdir(), 'no-such-dir', 'tasks-v1.json'));
    expect(code).toBe(0);
    expect(text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
  });

  it('exits 0 when every pinned hash matches', async () => {
    const file = tasksV1({ tasks: [{ id: 'a', oracle_final_hash: HASH }, { id: 'b', oracle_final_hash: HASH }] });
    const { code, text } = await matrix(['--task', 'all'], file);
    expect(code).toBe(0);
    expect(text.match(new RegExp(`^oracle final hash: ${HASH} matches results/tasks-v1\\.json$`, 'gm'))).toHaveLength(2);
  });

  it('exits 1 naming the task whose pinned hash differs', async () => {
    const file = tasksV1({ tasks: [{ id: 'a', oracle_final_hash: HASH }, { id: 'b', oracle_final_hash: WRONG }] });
    const { code, text } = await matrix(['--task', 'all'], file);
    expect(code).toBe(1);
    // b is the toy task loaded under another id, so the matrix's own lines name _toy.
    expect(text).toContain(`  - oracle final hash of task _toy is ${HASH}, results/tasks-v1.json pins ${WRONG}`);
    expect(text).toMatch(/^matrix all: 2 tasks, 1 PASS, 1 FAIL$/m);
    expect(text).toMatch(/^ {2}a: PASS$/m);
    expect(text).toMatch(/^ {2}b: FAIL$/m);
  });

  it('prints the hash of a task the file does not list, unchecked', async () => {
    const { code, text } = await matrix(['--task', 'b'], tasksV1({ tasks: [{ id: 'a', oracle_final_hash: WRONG }] }));
    expect(code).toBe(0);
    expect(text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
  });

  it('exits 2 on a tasks-v1.json it cannot read', async () => {
    for (const bad of ['{', { tasks: {} }, { tasks: [{ id: 'a' }] }, { tasks: [{ id: 'a', oracle_final_hash: 'abc' }] }, { tasks: [{ id: 'a', oracle_final_hash: HASH }, { id: 'a', oracle_final_hash: HASH }] }]) {
      const { code, text } = await matrix(['--task', 'a'], tasksV1(bad));
      expect(code).toBe(2);
      expect(text).toMatch(/^matrix: .*tasks-v1\.json/m);
    }
  });

  it('exits 2 naming a pinned id that is not a task, and on a file that pins no task (verifier-phase-P17i-B5-1 F1)', async () => {
    const stray = await matrix(['--task', 'a'], tasksV1({ tasks: [{ id: 'a', oracle_final_hash: HASH }, { id: 'renamed', oracle_final_hash: HASH }] }));
    expect(stray.code).toBe(2);
    expect(stray.text).toMatch(/^matrix: .*tasks-v1\.json pins renamed, which is not a task \(tasks: a, b\)$/m);
    const none = await matrix(['--task', 'all'], tasksV1({ tasks: [] }));
    expect(none.code).toBe(2);
    expect(none.text).toMatch(/^matrix: .*tasks-v1\.json: tasks lists no task$/m);
  });

  it('runMatrix fails naming the task when a hash is pinned but the oracle case did not run (F2)', async () => {
    const narrowed: MatrixOptions = { ...ONE, cases: ['null'] };
    expect((await runMatrix(matrixEnv(), TOY, narrowed)).pass).toBe(true);
    const pinned = await runMatrix(matrixEnv(), TOY, { ...narrowed, oracleFinalHash: HASH });
    expect(pinned.pass).toBe(false);
    expect(pinned.lines).toContain('  - oracle final hash of task _toy is pinned, but the oracle case did not run');
  });

  it('runMatrix fails naming the task on a mismatch, and passes on a match', async () => {
    const bad = await runMatrix(matrixEnv(), TOY, { ...ONE, oracleFinalHash: WRONG });
    expect(bad.pass).toBe(false);
    expect(bad.lines).toContain(`  - oracle final hash of task _toy is ${HASH}, results/tasks-v1.json pins ${WRONG}`);
    const good = await runMatrix(matrixEnv(), TOY, { ...ONE, oracleFinalHash: HASH });
    expect(good.pass).toBe(true);
  });

  it('keeps packages/grader/matrix/matrix.ts free of node: imports (the browser Worker imports it)', () => {
    const src = readFileSync(new URL('../../packages/grader/matrix/matrix.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from\s+['"]node:|import\(\s*['"]node:/);
  });
});
