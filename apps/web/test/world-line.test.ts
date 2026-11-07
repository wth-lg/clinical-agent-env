// The trial header's World line (src/trial/world.ts, P25c fix builder-326, trace row N13): which
// world a trial started from, and the words docs/requirements/ui-contract.md lists for it
// (`matches the manifest`, `matches the frozen world of`), never a false "matches the manifest"
// on a trial frozen on an earlier world.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shortHash, worldLine, worldStatus, type FrozenWorld } from '../src/trial/world.ts';

const contract = readFileSync(new URL('../../../docs/requirements/ui-contract.md', import.meta.url), 'utf8');
const MANIFEST = 'a'.repeat(64);
const EARLIER = 'b'.repeat(64);
const frozen: FrozenWorld = { world_hash: EARLIER };

describe('worldStatus and worldLine', () => {
  it("names today's manifest, the task's frozen world, another world, or none", () => {
    expect(worldStatus(MANIFEST, MANIFEST, frozen, true)).toEqual({ kind: 'manifest', hash: MANIFEST });
    expect(worldStatus(EARLIER, MANIFEST, frozen, true)).toEqual({ kind: 'frozen', hash: EARLIER });
    // A pilot is never held to a frozen world; a frozen world equal to today's is today's.
    expect(worldStatus(EARLIER, MANIFEST, frozen, false)).toEqual({ kind: 'other', hash: EARLIER });
    expect(worldStatus(EARLIER, MANIFEST, { ...frozen, world_hash: MANIFEST }, true)).toEqual({ kind: 'other', hash: EARLIER });
    expect(worldStatus('c'.repeat(64), MANIFEST, frozen, true)).toEqual({ kind: 'other', hash: 'c'.repeat(64) });
    expect(worldStatus(null, MANIFEST, frozen, true)).toEqual({ kind: 'none', hash: null });
    expect(worldStatus(undefined, MANIFEST, null, true)).toEqual({ kind: 'none', hash: null });
  });

  it('writes the line with the short hash and the words the UI contract lists', () => {
    expect(worldLine(worldStatus(MANIFEST, MANIFEST, frozen, true), 'contrast-ct-prep')).toBe(`World ${shortHash(MANIFEST)}: matches the manifest.`);
    expect(worldLine(worldStatus(EARLIER, MANIFEST, frozen, true), 'contrast-ct-prep')).toBe(`World ${shortHash(EARLIER)}: matches the frozen world of contrast-ct-prep.`);
    expect(worldLine(worldStatus(EARLIER, MANIFEST, null, true), 'contrast-ct-prep')).toBe(`World ${shortHash(EARLIER)}: matches neither today's manifest nor a frozen world of contrast-ct-prep.`);
    expect(worldLine(worldStatus(null, MANIFEST, frozen, true), 'contrast-ct-prep')).toBe('World not recorded.');
    expect(shortHash(EARLIER)).toBe(`${'b'.repeat(12)}…`);
    for (const s of ['matches the manifest', 'matches the frozen world of']) expect(contract, s).toContain(`\`${s}\``);
  });
});
