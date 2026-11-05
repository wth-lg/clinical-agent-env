// `pnpm cli replay <run> --tasks <ids>` (pre-audit-2 B4, R37): a run whose tasks ran on two
// worlds is replayed in two steps, each at its own commit, and the steps merge into one
// replay.json. --tasks replays only the named tasks' records and replaces only their entries;
// every entry carries the commit, world and env_version the verdict was made at; a record whose
// env_version is not the checkout's gets the named verdict world_mismatch (not a plain
// match:false) that says where to replay it. Without --tasks the file is written from the run's
// records alone, as before. No live call: the toy run is mocked.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL } from '../../packages/core/anthropic.ts';
import type { ReplayVerdict } from '../../packages/core/replay.ts';
import { repoRoot, tempDir } from '../../scripts/test/helpers.ts';
import { main as replay } from '../replay.ts';
import { gitState, repoWorld } from '../run.ts';
import { main as run } from '../run.ts';

let dir: string;

beforeAll(async () => {
  dir = join(tempDir('replay-tasks'), 'run');
  const home = tempDir('replay-tasks-home');
  const out: string[] = [];
  const code = await run(['--task', '_toy', '--model', MODEL, '--trials', '2', '--mock', 'toy', '--out', dir], {
    env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') },
    out: (l) => out.push(l),
    fetch: () => Promise.reject(new Error('no live call')),
    mock: (name) => scenarioTransport(name).transport,
  });
  if (code !== 0) throw new Error(out.join('\n'));
});

async function cli(args: string[]) {
  const lines: string[] = [];
  const code = await replay(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

type File = { trials: Record<string, ReplayVerdict> };
const readFile = (d: string): File => JSON.parse(readFileSync(join(d, 'replay.json'), 'utf8')) as File;
const foreign: ReplayVerdict = { match: true, verdict: 'match', outcome: 'PASS', recorded_outcome: 'PASS', current_outcome: 'PASS', replayed_at: { commit: 'c'.repeat(40), dirty: false, world_hash: 'w'.repeat(64), env_version: 'e'.repeat(64) } };
const record = (d: string, i: number) => JSON.parse(readFileSync(join(d, 'trials', '_toy', `${i}.json`), 'utf8')) as { env_version: string; regrades?: unknown };

describe('replay --tasks', () => {
  it('replays only the named tasks, merges into replay.json, and stamps each verdict with the commit, world and env_version it was made at', async () => {
    const copy = join(tempDir('replay-tasks-merge'), 'run');
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { 'other/0': foreign } }, null, 2));
    const r = await cli([copy, '--tasks', '_toy']);
    expect(r.code, r.text).toBe(0);
    const j = readFile(copy);
    expect(Object.keys(j.trials).sort()).toEqual(['_toy/0', '_toy/1', 'other/0']);
    expect(j.trials['other/0']).toEqual(foreign);
    const { sha, dirty } = gitState(repoRoot);
    for (const name of ['_toy/0', '_toy/1']) {
      expect(j.trials[name]).toMatchObject({ match: true, verdict: 'match', replayed_at: { commit: sha, dirty: dirty === null ? null : dirty.length > 0, world_hash: repoWorld().worldHash, env_version: record(copy, 0).env_version } });
    }
    expect(r.text).toContain('replay: 2 of 2 replayed trials reproduced (_toy); 1 entry of another task kept (other)');
  });

  it('without --tasks writes the file from the run\'s records alone, as before', async () => {
    const copy = join(tempDir('replay-tasks-all'), 'run');
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { 'other/0': foreign } }, null, 2));
    const r = await cli([copy]);
    expect(r.code, r.text).toBe(0);
    expect(Object.keys(readFile(copy).trials).sort()).toEqual(['_toy/0', '_toy/1']);
    expect(r.text).toContain('replay: 2 of 2 trials reproduced');
  });

  it('refuses a --tasks task the run has no settled records of, and writes nothing', async () => {
    const copy = join(tempDir('replay-tasks-none'), 'run');
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { 'other/0': foreign } }, null, 2));
    const before = readFileSync(join(copy, 'replay.json'), 'utf8');
    const r = await cli([copy, '--tasks', '_toy,nope']);
    expect(r.code).toBe(1);
    expect(r.text).toContain(`replay: no settled records of nope in ${copy}`);
    expect(readFileSync(join(copy, 'replay.json'), 'utf8')).toBe(before);
    expect((await cli([copy, '--tasks', ''])).code).toBe(2);
  });

  it('a record of another environment gets the named verdict world_mismatch, which says where to replay it, and exits 1', async () => {
    const copy = join(tempDir('replay-tasks-world'), 'run');
    cpSync(dir, copy, { recursive: true });
    const file = join(copy, 'trials', '_toy', '0.json');
    const rec = record(copy, 0);
    delete rec.regrades;
    writeFileSync(file, JSON.stringify({ ...rec, env_version: 'v-frozen' }, null, 2));
    const r = await cli([copy, '--tasks', '_toy']);
    expect(r.code).toBe(1);
    const j = readFile(copy);
    expect(j.trials['_toy/0']).toMatchObject({ match: false, verdict: 'world_mismatch', outcome: null, replayed_at: { world_hash: repoWorld().worldHash } });
    expect(j.trials['_toy/0']!.error).toMatch(/^environment changed: run at env_version v-frozen, checkout at [0-9a-f]{64}; reproduce at the commit in results\/[^/]+\/README\.md/);
    expect(j.trials['_toy/1']).toMatchObject({ match: true, verdict: 'match' });
    expect(r.text).toContain('replay: 1 of 2 replayed trials reproduced (_toy); 1 ran on another world (_toy/0): replay it at its own commit with --tasks, then this checkout\'s tasks here');
  });

  it('--json prints the merged file', async () => {
    const copy = join(tempDir('replay-tasks-json'), 'run');
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { 'other/0': foreign } }, null, 2));
    const r = await cli([copy, '--tasks', '_toy', '--json']);
    expect(r.code, r.text).toBe(0);
    const printed = JSON.parse(r.text.split('\n').at(-1) as string) as File;
    expect(Object.keys(printed.trials).sort()).toEqual(['_toy/0', '_toy/1', 'other/0']);
    expect(printed).toEqual(readFile(copy));
  });
});
