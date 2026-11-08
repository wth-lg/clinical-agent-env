// The trial header's World line (src/trial/world.ts, P25c fix builder-326, trace row N13; gate
// P25CFIX-242 F2 and F3): which world a trial started from, compared with every frozen world of
// its task (current, previous, superseded) whatever the run kind, and the words
// docs/requirements/ui-contract.md lists for it (`matches the manifest`, `matches the frozen
// world of`); never a false "matches the manifest", and never "nor a frozen world" on a hash
// that is one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shortHash, worldLine, worldStatus, type FrozenWorld } from '../src/trial/world.ts';

const contract = readFileSync(new URL('../../../docs/requirements/ui-contract.md', import.meta.url), 'utf8');
const MANIFEST = 'a'.repeat(64);
const EARLIER = 'b'.repeat(64);
const OLDER = 'c'.repeat(64);
const SUP = 'd'.repeat(64);
const current: FrozenWorld = { role: 'current', world_hash: EARLIER, tag: 'freeze-t3t5' };
const previous: FrozenWorld = { role: 'previous', world_hash: OLDER, tag: 'freeze-t1' };
const superseded: FrozenWorld = { role: 'superseded', world_hash: SUP, tag: 'freeze-t3t5', version: 'v1' };
const all = [current, previous, superseded];

describe('worldStatus and worldLine', () => {
  it("names today's manifest, the task's frozen world (which one), another world, or none, for every run kind", () => {
    for (const official of [true, false]) {
      expect(worldStatus(MANIFEST, MANIFEST, [], official)).toEqual({ kind: 'manifest', hash: MANIFEST, match: null, missesFrozen: false });
      expect(worldStatus(EARLIER, MANIFEST, all, official)).toEqual({ kind: 'frozen', hash: EARLIER, match: current, missesFrozen: false });
      expect(worldStatus(OLDER, MANIFEST, all, official)).toEqual({ kind: 'frozen', hash: OLDER, match: previous, missesFrozen: false });
      expect(worldStatus(SUP, MANIFEST, all, official)).toEqual({ kind: 'frozen', hash: SUP, match: superseded, missesFrozen: false });
      expect(worldStatus('e'.repeat(64), MANIFEST, all, official)).toEqual({ kind: 'other', hash: 'e'.repeat(64), match: null, missesFrozen: false });
      expect(worldStatus(null, MANIFEST, all, official)).toEqual({ kind: 'none', hash: null, match: null, missesFrozen: false });
      expect(worldStatus(undefined, MANIFEST, [], official)).toEqual({ kind: 'none', hash: null, match: null, missesFrozen: false });
    }
    // A freeze on today's world is today's world, not a separate match.
    expect(worldStatus(MANIFEST, MANIFEST, [{ role: 'current', world_hash: MANIFEST }], true).kind).toBe('manifest');
  });

  it('F3: an official trial on the manifest whose task is frozen on another world says it misses the frozen world; a pilot does not', () => {
    expect(worldStatus(MANIFEST, MANIFEST, all, true)).toEqual({ kind: 'manifest', hash: MANIFEST, match: null, missesFrozen: true });
    expect(worldStatus(MANIFEST, MANIFEST, all, false).missesFrozen).toBe(false);
    expect(worldStatus(MANIFEST, MANIFEST, [previous, superseded], true).missesFrozen).toBe(false);
  });

  it('writes the line with the short hash and the words the UI contract lists', () => {
    const task = 'contrast-ct-prep';
    // P25u J3: today's manifest world is "today's build" on every screen, with the contract's
    // `matches the manifest` kept (S5, builder-333, chose the words).
    expect(worldLine(worldStatus(MANIFEST, MANIFEST, [], true), task)).toBe(`World ${shortHash(MANIFEST)}: matches the manifest, today's build.`);
    expect(worldLine(worldStatus(MANIFEST, MANIFEST, all, true), task, all)).toBe(`World ${shortHash(MANIFEST)}: matches the manifest, today's build, not the frozen world of ${task} (${shortHash(EARLIER)}).`);
    // eval-p25u-2 S12: every trial that matches its task's frozen world says so in the same words,
    // whether or not that world is today's build, and then says which.
    const today: FrozenWorld = { role: 'current', world_hash: MANIFEST, tag: 'freeze-t1' };
    expect(worldLine(worldStatus(MANIFEST, MANIFEST, [today], true), task, [today])).toBe(`World ${shortHash(MANIFEST)}: matches the frozen world of ${task} and the manifest, today's build.`);
    expect(worldLine(worldStatus(EARLIER, MANIFEST, all, false), task)).toBe(`World ${shortHash(EARLIER)}: matches the frozen world of ${task}, not today's build.`);
    expect(worldLine(worldStatus(SUP, MANIFEST, all, false), task)).toBe(`World ${shortHash(SUP)}: matches the frozen world of ${task} v1 (superseded), not today's build.`);
    expect(worldLine(worldStatus(OLDER, MANIFEST, all, true), task)).toBe(`World ${shortHash(OLDER)}: matches the frozen world of ${task} before its re-freeze (tag freeze-t1), not today's build.`);
    expect(worldLine(worldStatus('e'.repeat(64), MANIFEST, all, true), task)).toBe(`World ${shortHash('e'.repeat(64))}: matches neither today's build nor a frozen world of ${task}.`);
    expect(worldLine(worldStatus(null, MANIFEST, all, true), task)).toBe('World not recorded.');
    expect(shortHash(EARLIER)).toBe(`${'b'.repeat(12)}…`);
    for (const s of ['matches the manifest', 'matches the frozen world of']) expect(contract, s).toContain(`\`${s}\``);
  });
});
