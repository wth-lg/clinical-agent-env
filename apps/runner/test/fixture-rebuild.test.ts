// P11f (9), run.md 2026-10-25 07:40: the runner keeps the world and the tasks' checks for as long
// as the fixture manifest is the same, keyed on its hash, so a fixture rebuild (pnpm
// fixtures:build) reaches the next trial without a restart.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrialView } from '../../../packages/core/runner-api.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { launch, readSse, tempDir, toyTrial, type Launched } from './helpers.ts';

async function fixtureHash(l: Launched): Promise<string> {
  const a = (await l.http('POST', '/api/trials', { body: toyTrial() })).json() as { trial_ids: string[] };
  const s = await readSse(l.port, `/api/trials/${a.trial_ids[0]}/events`, { token: l.runner.token });
  expect(['graded', 'end']).toContain(s.frames.at(-1)?.event);
  return (parseTrialView((await l.http('GET', `/api/trials/${a.trial_ids[0]}`)).json()).record as { fixture_hash: string }).fixture_hash;
}

describe('a fixture rebuild under a running runner', () => {
  it('the next trial runs on the rebuilt manifest, without a restart', async () => {
    const fixtures = tempDir('runner-fixtures');
    for (const f of ['world.ndjson.gz', 'manifest.json', 'definitions-pruned.json']) cpSync(join(repoRoot, 'fixtures', f), join(fixtures, f));
    const manifest = JSON.parse(readFileSync(join(fixtures, 'manifest.json'), 'utf8')) as { world: { state_hash: string } };
    const l = await launch({ mock: true, transport: null, fixturesDir: fixtures });
    try {
      expect(await fixtureHash(l)).toBe(manifest.world.state_hash);
      const rebuilt = 'f'.repeat(64);
      writeFileSync(join(fixtures, 'manifest.json'), `${JSON.stringify({ ...manifest, world: { ...manifest.world, state_hash: rebuilt } }, null, 2)}\n`);
      expect(await fixtureHash(l)).toBe(rebuilt);
    } finally {
      await l.runner.shutdown();
    }
  });
});
