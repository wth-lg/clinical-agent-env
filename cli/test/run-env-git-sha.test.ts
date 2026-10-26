// env_git_sha on every batch and trial record (plan phase P17i C8, R14-39): cli run reads the
// checkout's HEAD and the batch stores it in its BatchEntry and in every trial record it writes
// (the record and the graded event in the trajectory), so a resumed run names the commit each
// trial ran on: a resume at a later commit adds a batch with the new sha and leaves the settled
// records' sha as it was. A batch with no sha (the local runner) records null.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL } from '../../packages/core/anthropic.ts';
import { commitFile, git, tempDir, tempRepo } from '../../scripts/test/helpers.ts';
import { main, type Deps } from '../run.ts';

function deps(repo: string): Deps {
  const home = tempDir('sha-home');
  return { env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') }, out: () => {}, fetch: async () => { throw new Error('test: no live call'); }, mock: (name) => scenarioTransport(name).transport, repo };
}
const runArgs = (out: string, trials: number) => ['--task', '_toy', '--model', MODEL, '--out', out, '--trials', String(trials), '--mock', 'toy'];
const record = (dir: string, i: number) => JSON.parse(readFileSync(join(dir, 'trials/_toy', `${i}.json`), 'utf8')) as { env_git_sha?: unknown; trajectory: string };
const gradedSha = (dir: string, i: number) => {
  const lines = readFileSync(join(dir, record(dir, i).trajectory), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { type: string; record?: { env_git_sha?: unknown } });
  return lines.findLast((e) => e.type === 'graded')!.record!.env_git_sha;
};

describe('env_git_sha', { timeout: 120_000 }, () => {
  it('each batch entry and trial record names the commit it ran on, and a resume at a later commit keeps the earlier records\' sha', async () => {
    const repo = tempRepo();
    commitFile(repo, 'packages/core/a.ts', 'export const a = 1;\n');
    const first = git(repo, 'rev-parse', 'HEAD');
    const dir = join(tempDir('run-sha'), 'run-sha');
    expect(await main(runArgs(dir, 1), deps(repo))).toBe(0);
    commitFile(repo, 'packages/core/a.ts', 'export const a = 2;\n');
    const second = git(repo, 'rev-parse', 'HEAD');
    expect(second).not.toBe(first);
    expect(await main(runArgs(dir, 2), deps(repo))).toBe(0);

    expect(readdirSync(join(dir, 'trials/_toy')).sort()).toEqual(['0.json', '1.json']);
    expect(record(dir, 0).env_git_sha).toBe(first);
    expect(record(dir, 1).env_git_sha).toBe(second);
    expect(gradedSha(dir, 0)).toBe(first);
    expect(gradedSha(dir, 1)).toBe(second);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { batches: Array<{ env_git_sha?: unknown }> };
    expect(manifest.batches.map((b) => b.env_git_sha)).toEqual([first, second]);
  });

  it('outside git the batch and its records carry null', async () => {
    const dir = join(tempDir('run-nogit'), 'run-nogit');
    expect(await main(runArgs(dir, 1), deps(tempDir('not-a-repo')))).toBe(0);
    expect(record(dir, 0).env_git_sha).toBeNull();
    expect((JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { batches: Array<{ env_git_sha?: unknown }> }).batches[0]!.env_git_sha).toBeNull();
  });
});
