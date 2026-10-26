// pnpm cli matrix --task <id> --out <dir> (plan phase P11f (2), verifier-phase-regrade-3 N4):
// writes <dir>/matrix.json with each probe's verdict and failed checks under the task's
// grader_task_version, the key audit-check looks a current grade up by. The toy task, narrowed
// to a few cases, keeps the test offline and fast.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installEgressGuard } from '../../packages/core/egress.ts';
import { taskVersions } from '../../packages/core/tasks.ts';
import type { MatrixOptions } from '../../packages/grader/matrix/matrix.ts';
import { nodeTaskSource, TASKS_DIR } from '../adapters/tasks-node.ts';
import { loadMatrixTask, main, matrixEnv } from '../matrix.ts';
import { tempDir } from '../../scripts/test/helpers.ts';

installEgressGuard(globalThis);

const TOY = await loadMatrixTask('_toy');
const OPTIONS: MatrixOptions = { trials: 1, regrades: 1, isolation: false, cases: ['oracle', ...TOY.alternatives.map((a) => a.id), TOY.mutants[0]!.id] };
const versions = await taskVersions(await nodeTaskSource({ root: TASKS_DIR, testMode: true }).get('_toy'), matrixEnv().worldHash);

async function matrix(args: string[]) {
  const lines: string[] = [];
  const code = await main(args, { env: process.env, out: (l) => lines.push(l), load: async () => TOY, options: OPTIONS });
  return { code, text: lines.join('\n') };
}

interface Entry {
  task_id: string;
  env_version: string;
  task_version: string;
  pass: boolean;
  oracle_pass: boolean;
  alternatives_pass: boolean;
  failed_checks: string[];
  world_hash: string;
  probes: Array<{ kind: string; id: string; outcome: string; as_expected: boolean; failed_checks: string[]; exposed_ids: string[] }>;
}
const read = (dir: string) => JSON.parse(readFileSync(join(dir, 'matrix.json'), 'utf8')) as { grader_task_versions: Record<string, Entry> };

describe('matrix --out', () => {
  it('writes matrix.json keyed by the grader_task_version, with each probe\'s verdict and failed checks', async () => {
    const dir = tempDir('matrix-json');
    const r = await matrix(['--task', '_toy', '--out', dir]);
    expect(r.text).toContain(`matrix.json: _toy at grader_task_version ${versions.grader_task_version}`);
    const { grader_task_versions } = read(dir);
    expect(Object.keys(grader_task_versions)).toEqual([versions.grader_task_version]);
    const e = grader_task_versions[versions.grader_task_version]!;
    expect(e).toMatchObject({ task_id: '_toy', env_version: versions.env_version, task_version: versions.task_version, oracle_pass: true, alternatives_pass: true, failed_checks: [] });
    expect(e.probes.map((p) => p.id)).toEqual(OPTIONS.cases);
    const mutant = e.probes.find((p) => p.kind === 'mutant')!;
    expect(mutant).toMatchObject({ outcome: 'FAIL', as_expected: true, failed_checks: TOY.mutants[0]!.fails });
    expect(e.probes.filter((p) => p.kind !== 'mutant').every((p) => p.outcome === 'PASS' && p.as_expected && p.failed_checks.length === 0)).toBe(true);
  });

  it('records the world the matrix ran on and the ids each probe was shown, which audit-check reads as reachable (R14-30)', async () => {
    const dir = tempDir('matrix-json-exposed');
    await matrix(['--task', '_toy', '--out', dir]);
    const e = read(dir).grader_task_versions[versions.grader_task_version]!;
    expect(e.world_hash).toBe(matrixEnv().worldHash);
    expect(e.probes.find((p) => p.kind === 'oracle')!.exposed_ids).toContain('Patient/pt-0001');
    for (const p of e.probes) expect(p.exposed_ids).toEqual([...new Set(p.exposed_ids)].sort());
  });

  it('keeps other versions\' entries, and a second run leaves the file byte for byte', async () => {
    const dir = tempDir('matrix-json-merge');
    writeFileSync(join(dir, 'matrix.json'), `${JSON.stringify({ grader_task_versions: { 'g-older': { task_id: '_toy', oracle_pass: false, alternatives_pass: true, failed_checks: ['G1'] } } }, null, 2)}\n`);
    await matrix(['--task', '_toy', '--out', dir]);
    const first = readFileSync(join(dir, 'matrix.json'), 'utf8');
    expect(Object.keys(read(dir).grader_task_versions).sort()).toEqual(['g-older', versions.grader_task_version].sort());
    await matrix(['--out', dir, '--task', '_toy']);
    expect(readFileSync(join(dir, 'matrix.json'), 'utf8')).toBe(first);
  });

  it('without --out writes nothing; --out with no directory is a usage error', async () => {
    const dir = tempDir('matrix-json-none');
    await matrix(['--task', '_toy']);
    expect(existsSync(join(dir, 'matrix.json'))).toBe(false);
    expect((await matrix(['--task', '_toy', '--out'])).code).toBe(2);
  });
});
