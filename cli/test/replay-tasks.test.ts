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
import { main as replay, reproducePointer } from '../replay.ts';
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
    expect(j.trials['_toy/0']).toMatchObject({ verdict: 'world_mismatch', outcome: null, replayed_at: { world_hash: repoWorld().worldHash } });
    // S1: a named verdict, not a plain match:false.
    expect(j.trials['_toy/0']).not.toHaveProperty('match');
    // m1: the pointer names the run directory (repo-relative inside the checkout; this copy is outside it).
    expect(j.trials['_toy/0']!.error).toBe(`environment changed: run at env_version v-frozen, checkout at ${record(copy, 1).env_version}; reproduce at the commit in ${copy}/README.md`);
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

// verifier-phase-P17i-TWOW-229-1 S1: a verdict made where the record could be replayed (its own
// commit, step 1 of the two-step replay) is kept by a later replay at a checkout of another world,
// --tasks or not, so a plain replay at the head never rewrites the committed verdicts of the
// frozen tasks. Only a verdict of the record as it is now is kept (S2, isVerdictOf): a stale entry
// is replaced by world_mismatch; --overwrite replaces every entry.
describe('replay keeps a prior verdict of a record of another world', () => {
  const frozen = (copy: string) => {
    const file = join(copy, 'trials', '_toy', '0.json');
    const rec = record(copy, 0);
    delete rec.regrades;
    const r = { ...rec, env_version: 'v-frozen' } as { env_version: string; outcome: string };
    writeFileSync(file, JSON.stringify(r, null, 2));
    return r;
  };
  const own = (r: { outcome: string }): ReplayVerdict => ({ match: true, verdict: 'match', outcome: r.outcome, recorded_outcome: r.outcome, current_outcome: r.outcome, replayed_at: { commit: 'a'.repeat(40), dirty: false, world_hash: 'w'.repeat(64), env_version: 'v-frozen' } });

  it.each([['without --tasks', []], ['with --tasks', ['--tasks', '_toy']]])('%s: the entry made at the record\'s own commit is kept, counted, and the replay exits 0', async (_, extra) => {
    const copy = join(tempDir('replay-keep'), 'run');
    cpSync(dir, copy, { recursive: true });
    const r = frozen(copy);
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { '_toy/0': own(r) } }, null, 2));
    const res = await cli([copy, ...extra]);
    expect(res.code, res.text).toBe(0);
    const j = readFile(copy);
    expect(j.trials['_toy/0']).toEqual(own(r));
    expect(j.trials['_toy/1']).toMatchObject({ match: true, verdict: 'match' });
    expect(res.text).toContain(`replay: 1 of 1 ${extra.length === 0 ? 'trials' : 'replayed trials'} reproduced${extra.length === 0 ? '' : ' (_toy)'}; 1 entry of a record of another world kept as made at its own commit (_toy/0)`);
  });

  it('a kept entry that did not reproduce at its own commit is named and the replay exits 1', async () => {
    const copy = join(tempDir('replay-keep-mismatch'), 'run');
    cpSync(dir, copy, { recursive: true });
    const r = frozen(copy);
    const bad: ReplayVerdict = { ...own(r), match: false, verdict: 'mismatch', error: 'regrade gives FAIL score 0, the record PASS score 1' };
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { '_toy/0': bad } }, null, 2));
    const res = await cli([copy]);
    expect(res.code).toBe(1);
    expect(readFile(copy).trials['_toy/0']).toEqual(bad);
    expect(res.text).toContain('replay: _toy/0: kept as made at its own commit, where it did not reproduce: regrade gives FAIL score 0, the record PASS score 1');
  });

  it('a stale entry (not a verdict of the record as it is now) is replaced by world_mismatch and said so', async () => {
    const copy = join(tempDir('replay-keep-stale'), 'run');
    cpSync(dir, copy, { recursive: true });
    const r = frozen(copy);
    const other = r.outcome === 'PASS' ? 'FAIL' : 'PASS';
    for (const stale of [{ ...own(r), recorded_outcome: other, current_outcome: other }, { ...own(r), replayed_at: { ...own(r).replayed_at!, env_version: 'v-older' } }]) {
      writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { '_toy/0': stale } }, null, 2));
      const res = await cli([copy]);
      expect(res.code).toBe(1);
      expect(readFile(copy).trials['_toy/0']).toMatchObject({ verdict: 'world_mismatch', outcome: null });
      expect(res.text).toContain('replay: _toy/0: its replay.json entry was not a verdict of this record (stale), so it is replaced');
      expect(res.text).toContain('1 ran on another world (_toy/0)');
    }
  });

  it('a prior world_mismatch entry is made again, and --overwrite replaces a kept verdict too', async () => {
    const copy = join(tempDir('replay-keep-overwrite'), 'run');
    cpSync(dir, copy, { recursive: true });
    const r = frozen(copy);
    const prior: ReplayVerdict = { verdict: 'world_mismatch', outcome: null, recorded_outcome: r.outcome, current_outcome: r.outcome, error: 'old text', replayed_at: { commit: 'b'.repeat(40), dirty: false, world_hash: 'x'.repeat(64), env_version: 'v-other' } };
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { '_toy/0': prior } }, null, 2));
    expect((await cli([copy])).code).toBe(1);
    expect(readFile(copy).trials['_toy/0']).toMatchObject({ verdict: 'world_mismatch', replayed_at: { world_hash: repoWorld().worldHash } });
    expect(readFile(copy).trials['_toy/0']!.error).not.toBe('old text');
    writeFileSync(join(copy, 'replay.json'), JSON.stringify({ trials: { '_toy/0': own(r) } }, null, 2));
    const res = await cli([copy, '--overwrite']);
    expect(res.code).toBe(1);
    expect(readFile(copy).trials['_toy/0']).toMatchObject({ verdict: 'world_mismatch' });
    expect(res.text).not.toContain('kept as made at its own commit');
  });
});

// verifier-phase-P17i-TWOW-229-1 m1: the default reproduce pointer names the run directory as the
// repository holds it (results/runs/final-1, not results/final-1), or the directory as given when
// it is outside the checkout.
describe('reproducePointer', () => {
  it('names the run directory repo-relative inside the checkout, else as given', () => {
    expect(reproducePointer(join(repoRoot, 'results/runs/final-1'))).toBe('reproduce at the commit in results/runs/final-1/README.md');
    expect(reproducePointer('results/pilot-4a')).toBe('reproduce at the commit in results/pilot-4a/README.md');
    expect(reproducePointer('./results/pilot-4a/')).toBe('reproduce at the commit in results/pilot-4a/README.md');
    expect(reproducePointer('/tmp/final-1-copy')).toBe('reproduce at the commit in /tmp/final-1-copy/README.md');
  });
});
