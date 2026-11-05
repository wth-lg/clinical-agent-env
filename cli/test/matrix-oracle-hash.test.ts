// pnpm cli matrix and the pinned oracle final hashes (plan phase P17i B5, R14-38). When
// results/tasks-final.json exists, cli/matrix.ts reads each frozen task's oracle_final_hash from
// it and runMatrix fails, naming the task, when the oracle's final state hash differs; with no
// expected hash the matrix prints the oracle's final hash, the value P21's freeze writes. The tasks here
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
const WORLD = matrixEnv().worldHash;

// {tasks: {<id>: {oracle_final_hash}}}, the freeze file's shape (scripts/test/tasks-final.test.ts).
const pins = (tasks: Array<{ id: string; oracle_final_hash: string }>) => ({ tasks: Object.fromEntries(tasks.map(({ id, ...rest }) => [id, rest])) });
function tasksFinal(content: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), 'tasks-final-')), 'tasks-final.json');
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

async function matrix(args: string[], file: string, ids: string[] = ['a', 'b']) {
  const lines: string[] = [];
  const code = await main(args, { env: process.env, out: (l) => lines.push(l), tasks: () => ids, load: async () => TOY, options: ONE, tasksFinal: file });
  return { code, text: lines.join('\n') };
}

describe('matrix oracle final hash', () => {
  it('the toy oracle ends in a sha256 state hash', () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prints the oracle final hash when results/tasks-final.json does not exist', async () => {
    const { code, text } = await matrix(['--task', 'a'], join(tmpdir(), 'no-such-dir', 'tasks-final.json'));
    expect(code).toBe(0);
    expect(text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
  });

  it('exits 0 when every pinned hash matches', async () => {
    const file = tasksFinal(pins([{ id: 'a', oracle_final_hash: HASH }, { id: 'b', oracle_final_hash: HASH }]));
    const { code, text } = await matrix(['--task', 'all'], file);
    expect(code).toBe(0);
    expect(text.match(new RegExp(`^oracle final hash: ${HASH} matches results/tasks-final\\.json$`, 'gm'))).toHaveLength(2);
  });

  it('exits 1 naming the task whose pinned hash differs', async () => {
    const file = tasksFinal(pins([{ id: 'a', oracle_final_hash: HASH }, { id: 'b', oracle_final_hash: WRONG }]));
    const { code, text } = await matrix(['--task', 'all'], file);
    expect(code).toBe(1);
    // b is the toy task loaded under another id, so the matrix's own lines name _toy.
    expect(text).toContain(`  - oracle final hash of task _toy is ${HASH}, results/tasks-final.json pins ${WRONG}`);
    expect(text).toMatch(/^matrix all: 2 tasks, 1 PASS, 1 FAIL$/m);
    expect(text).toMatch(/^ {2}a: PASS$/m);
    expect(text).toMatch(/^ {2}b: FAIL$/m);
  });

  it('prints the hash of a task the file does not list, unchecked', async () => {
    const { code, text } = await matrix(['--task', 'b'], tasksFinal(pins([{ id: 'a', oracle_final_hash: WRONG }])));
    expect(code).toBe(0);
    expect(text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
  });

  it('a pin made at this world is checked; one made at another world (the shared world rebuilt since the freeze, R40) is printed unchecked', async () => {
    const here = await matrix(['--task', 'a'], tasksFinal({ tasks: { a: { oracle_final_hash: WRONG, world_hash: WORLD } } }));
    expect(here.code).toBe(1);
    expect(here.text).toContain(`results/tasks-final.json pins ${WRONG}`);
    const elsewhere = await matrix(['--task', 'a'], tasksFinal({ tasks: { a: { oracle_final_hash: WRONG, world_hash: '1'.repeat(64) } } }));
    expect(elsewhere.code).toBe(0);
    expect(elsewhere.text).toMatch(new RegExp(`^oracle final hash of task a: .*tasks-final\\.json pins ${WRONG} at world 1{64}, not this checkout's world ${WORLD}; unchecked here \\(R40\\)$`, 'm'));
    expect(elsewhere.text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
    const bad = await matrix(['--task', 'a'], tasksFinal({ tasks: { a: { oracle_final_hash: HASH, world_hash: 'abc' } } }));
    expect(bad.code).toBe(2);
    expect(bad.text).toMatch(/^matrix: .*tasks-final\.json: tasks\.a world_hash must be 64 lowercase hex digits$/m);
  });

  // R42: a task whose freeze a new version superseded (status v2-pending, the freeze kept under
  // `superseded`) pins nothing until its new freeze is written.
  it('prints the hash of a v2-pending task unchecked, whatever its superseded freeze pinned', async () => {
    const file = tasksFinal({ tasks: { a: { status: 'v2-pending', reason: 'R42', superseded: { version: 'v1', oracle_final_hash: WRONG, world_hash: WORLD } }, b: { oracle_final_hash: HASH } } });
    const { code, text } = await matrix(['--task', 'all'], file);
    expect(code).toBe(0);
    expect(text).toContain(`oracle final hash: ${HASH} (no expected hash)`);
    expect(text).toContain(`oracle final hash: ${HASH} matches results/tasks-final.json`);
  });

  it('exits 2 on a tasks-final.json it cannot read', async () => {
    for (const bad of ['{', { tasks: [] }, { tasks: [{ id: 'a', oracle_final_hash: HASH }] }, { tasks: { a: {} } }, { tasks: { a: { oracle_final_hash: 'abc' } } }, { tasks: { 'not a task id': { oracle_final_hash: HASH } } }]) {
      const { code, text } = await matrix(['--task', 'a'], tasksFinal(bad));
      expect(code).toBe(2);
      expect(text).toMatch(/^matrix: .*tasks-final\.json/m);
    }
  });

  it('exits 2 naming a pinned id that is not a task, and on a file that pins no task (verifier-phase-P17i-B5-1 F1)', async () => {
    const stray = await matrix(['--task', 'a'], tasksFinal(pins([{ id: 'a', oracle_final_hash: HASH }, { id: 'renamed', oracle_final_hash: HASH }])));
    expect(stray.code).toBe(2);
    expect(stray.text).toMatch(/^matrix: .*tasks-final\.json pins renamed, which is not a task \(tasks: a, b\)$/m);
    const none = await matrix(['--task', 'all'], tasksFinal({ tasks: {} }));
    expect(none.code).toBe(2);
    expect(none.text).toMatch(/^matrix: .*tasks-final\.json: tasks lists no task$/m);
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
    expect(bad.lines).toContain(`  - oracle final hash of task _toy is ${HASH}, results/tasks-final.json pins ${WRONG}`);
    const good = await runMatrix(matrixEnv(), TOY, { ...ONE, oracleFinalHash: HASH });
    expect(good.pass).toBe(true);
  });

  it('keeps packages/grader/matrix/matrix.ts free of node: imports (the browser Worker imports it)', () => {
    const src = readFileSync(new URL('../../packages/grader/matrix/matrix.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from\s+['"]node:|import\(\s*['"]node:/);
  });
});
