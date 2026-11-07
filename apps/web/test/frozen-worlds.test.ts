// The Frozen worlds table on Environment (P25u J3): one row per freeze of each task in
// results/tasks-final.json, the current freeze first, then the one kept before a re-freeze, then a
// superseded version's, tasks in name order; each row says whether its world hash is today's build
// (fixtures/manifest.json) or an earlier world. Pure (src/environment/frozen.ts), so the root
// typecheck and this test read it without Vite.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frozenRows, roleWords, worldWords } from '../src/environment/frozen.ts';

const TODAY = 'a'.repeat(64);
const OLDER = 'b'.repeat(64);
const V1 = 'c'.repeat(64);
const FREEZES = {
  'crc-care-gap': [
    { role: 'current' as const, world_hash: TODAY, frozen_at: { tag: 'freeze-w5h5' } },
    { role: 'superseded' as const, version: 'v1', world_hash: V1, frozen_at: { tag: 'freeze-t3t5' } },
  ],
  'contrast-ct-prep': [{ role: 'current' as const, world_hash: OLDER, frozen_at: { tag: 'freeze-t3t5' } }],
};

describe('frozenRows', () => {
  it('one row per freeze, tasks in name order, current before superseded, each flagged against today\'s build', () => {
    expect(frozenRows(FREEZES, TODAY)).toEqual([
      { task: 'contrast-ct-prep', role: 'current', version: null, hash: OLDER, tag: 'freeze-t3t5', today: false },
      { task: 'crc-care-gap', role: 'current', version: null, hash: TODAY, tag: 'freeze-w5h5', today: true },
      { task: 'crc-care-gap', role: 'superseded', version: 'v1', hash: V1, tag: 'freeze-t3t5', today: false },
    ]);
  });

  it('a re-freeze keeps its previous world between the current and a superseded one', () => {
    const rows = frozenRows({ t: [
      { role: 'superseded', version: 'v1', world_hash: V1, frozen_at: { tag: 's' } },
      { role: 'previous', world_hash: OLDER, frozen_at: { tag: 'p' } },
      { role: 'current', world_hash: TODAY, frozen_at: { tag: 'c' } },
    ] }, TODAY);
    expect(rows.map((r) => r.role)).toEqual(['current', 'previous', 'superseded']);
  });

  it('no freezes: no rows', () => {
    expect(frozenRows({}, TODAY)).toEqual([]);
  });

  it('the words beside a row name the freeze and the world in plain terms', () => {
    expect(roleWords({ role: 'current', version: null })).toBe('current');
    expect(roleWords({ role: 'previous', version: null })).toBe('before its re-freeze');
    expect(roleWords({ role: 'superseded', version: 'v1' })).toBe('v1, superseded');
    expect(worldWords(true)).toBe("today's build");
    expect(worldWords(false)).toBe('an earlier world');
  });

  it('every task of the committed results/tasks-final.json gets a current row', () => {
    const repo = join(import.meta.dirname, '../../..');
    const doc = JSON.parse(readFileSync(join(repo, 'results/tasks-final.json'), 'utf8')) as { tasks: Record<string, { world_hash: string; frozen_at: { tag: string } }> };
    const manifest = (JSON.parse(readFileSync(join(repo, 'fixtures/manifest.json'), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
    const freezes = Object.fromEntries(Object.entries(doc.tasks).map(([id, t]) => [id, [{ role: 'current' as const, world_hash: t.world_hash, frozen_at: { tag: t.frozen_at.tag } }]]));
    const rows = frozenRows(freezes, manifest);
    expect(rows.map((r) => r.task)).toEqual(Object.keys(doc.tasks).sort());
    for (const r of rows) expect(r.today).toBe(r.hash === manifest);
  });
});
