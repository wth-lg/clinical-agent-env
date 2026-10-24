// P11f (9), run.md 2026-10-25 07:40: the runner keeps the world and the tasks' checks for as long
// as the fixture manifest is the same, keyed on its hash, so a fixture rebuild (pnpm
// fixtures:build) reaches the next trial without a restart. It never runs batches on two
// manifests at once (review-phase-P11f-1 m1): run() indexes the FHIR definitions process-wide, so a
// batch on a rebuilt manifest waits with 409 fixtures_changed until the earlier batch is done.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRunsList, parseTrialsRefused, parseTrialView } from '../../../packages/core/runner-api.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { launch, readSse, stallAnswer, tempDir, toyTrial, until, type Launched } from './helpers.ts';

// A copy of the repo's fixtures, and a rebuild of it: the same files under a new manifest.
function fixtureCopy(): { dir: string; hash: string; rebuild: (hash: string) => void } {
  const dir = tempDir('runner-fixtures');
  for (const f of ['world.ndjson.gz', 'manifest.json', 'definitions-pruned.json']) cpSync(join(repoRoot, 'fixtures', f), join(dir, f));
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { world: { state_hash: string } };
  const rebuild = (hash: string) => writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify({ ...manifest, world: { ...manifest.world, state_hash: hash } }, null, 2)}\n`);
  return { dir, hash: manifest.world.state_hash, rebuild };
}

async function fixtureHash(l: Launched): Promise<string> {
  const a = (await l.http('POST', '/api/trials', { body: toyTrial() })).json() as { trial_ids: string[] };
  const s = await readSse(l.port, `/api/trials/${a.trial_ids[0]}/events`, { token: l.runner.token });
  expect(['graded', 'end']).toContain(s.frames.at(-1)?.event);
  return (parseTrialView((await l.http('GET', `/api/trials/${a.trial_ids[0]}`)).json()).record as { fixture_hash: string }).fixture_hash;
}

describe('a fixture rebuild under a running runner', () => {
  it('the next trial runs on the rebuilt manifest, without a restart', async () => {
    const fixtures = fixtureCopy();
    const l = await launch({ mock: true, transport: null, fixturesDir: fixtures.dir });
    try {
      expect(await fixtureHash(l)).toBe(fixtures.hash);
      const rebuilt = 'f'.repeat(64);
      fixtures.rebuild(rebuilt);
      expect(await fixtureHash(l)).toBe(rebuilt);
    } finally {
      await l.runner.shutdown();
    }
  });

  it('a batch on a rebuilt manifest gets 409 fixtures_changed while a batch on the earlier one runs, and starts once it is done', async () => {
    const fixtures = fixtureCopy();
    const l = await launch({ answer: stallAnswer(), fixturesDir: fixtures.dir });
    try {
      await l.http('POST', '/api/key', { body: { key: 'fixture-rebuild-test-key-0123456789' } });
      const a = (await l.http('POST', '/api/trials', { body: toyTrial() })).json() as { run_id: string; trial_ids: string[] };
      await until('batch A\'s trial call', () => l.calls.some((c) => c.label.includes(`${a.run_id}:`)));
      fixtures.rebuild('f'.repeat(64));
      const b = await l.http('POST', '/api/trials', { body: toyTrial() });
      expect(b.status).toBe(409);
      expect(parseTrialsRefused(b.json()).error.type).toBe('fixtures_changed');
      expect(parseRunsList((await l.http('GET', '/api/runs')).json()).runs.map((r) => r.run_id)).toEqual([a.run_id]);
      // The same manifest as a running batch is no change: the rebuild back to A's runs beside it.
      fixtures.rebuild(fixtures.hash);
      const same = await l.http('POST', '/api/trials', { body: toyTrial() });
      expect(same.status, same.text).toBe(202);
      const sameRun = (same.json() as { run_id: string }).run_id;
      fixtures.rebuild('f'.repeat(64));
      for (const id of [a.trial_ids[0], (same.json() as { trial_ids: string[] }).trial_ids[0]]) expect((await l.http('DELETE', `/api/trials/${id}`)).status).toBe(200);
      const runs = async () => parseRunsList((await l.http('GET', '/api/runs')).json()).runs;
      await until('batches A and A2 to be done', async () => (await runs()).filter((r) => [a.run_id, sameRun].includes(r.run_id)).every((r) => r.done));
      const c = await l.http('POST', '/api/trials', { body: toyTrial() });
      expect(c.status, c.text).toBe(202);
    } finally {
      await l.runner.shutdown();
    }
  });
});
