// Which world a trial started from, for the trial header's World line and the State diff tab's
// first line (P25c fix, builder-326, trace row N13): today's manifest, one of its task's frozen
// worlds (results/tasks-final.json: the current freeze, the freeze before a re-freeze, or a
// superseded version's; R37: an official trial frozen on an earlier world is historical and is
// reproduced at its replay tag, never here), another world, or none recorded. The trial's hash is
// compared with every frozen world of the task whatever the run kind, and the line says which one
// it matches (gate P25CFIX-242 F2); an official trial on today's manifest whose task is frozen on
// another world says it misses that world (F3). Apart from the components, and from
// data/results.ts (whose import.meta.glob the root typecheck cannot read), so the unit tests and
// the root typecheck reach it without Vite.

// A frozen world of the task (data/results.ts FrozenTask): the entry's own (current), the one it
// kept under `previous` after a re-freeze, or a superseded version's.
export interface FrozenWorld {
  role: 'current' | 'previous' | 'superseded';
  world_hash: string;
  // The freeze tag; the version (v1) of a superseded freeze.
  tag?: string;
  version?: string;
}

// The task's freezes (data/results.ts FrozenTask) as the worlds worldStatus compares with: the one
// lookup the trial header's World line and the State diff tab share.
export const frozenWorlds = (freezes: ReadonlyArray<{ role: FrozenWorld['role']; world_hash: string; frozen_at: { tag: string }; version?: string | undefined }>): FrozenWorld[] =>
  freezes.map((f) => ({ role: f.role, world_hash: f.world_hash, tag: f.frozen_at.tag, ...(f.version !== undefined ? { version: f.version } : {}) }));

export type WorldKind = 'manifest' | 'frozen' | 'other' | 'none';

export interface WorldStatus {
  kind: WorldKind;
  // The trial's initial state hash; null when the record has none.
  hash: string | null;
  // The frozen world the hash equals, for kind frozen.
  match: FrozenWorld | null;
  // F3: an official trial on today's manifest while its task's current freeze is another world.
  missesFrozen: boolean;
}

// official: the trial is of the official run; only its trials are held to the current freeze.
export function worldStatus(initial: string | null | undefined, manifest: string, freezes: readonly FrozenWorld[], official: boolean): WorldStatus {
  const hash = initial ?? null;
  if (hash === null) return { kind: 'none', hash, match: null, missesFrozen: false };
  const current = freezes.find((f) => f.role === 'current') ?? null;
  if (hash === manifest) return { kind: 'manifest', hash, match: null, missesFrozen: official && current !== null && current.world_hash !== manifest };
  const match = freezes.find((f) => f.world_hash === hash) ?? null;
  if (match !== null) return { kind: 'frozen', hash, match, missesFrozen: false };
  return { kind: 'other', hash, match: null, missesFrozen: false };
}

export const shortHash = (hash: string): string => `${hash.slice(0, 12)}…`;

// "World ba0b02069ab4…: matches the frozen world of contrast-ct-prep." The strings are in
// docs/requirements/ui-contract.md (`matches the manifest`, `matches the frozen world of`). The
// manifest world is "today's build" on every screen (P25u J3, copy rule C3; the Environment view
// says the same), so the contract string reads "matches the manifest, today's build".
export function worldLine(w: WorldStatus, task: string, freezes: readonly FrozenWorld[] = []): string {
  if (w.kind === 'none') return 'World not recorded.';
  const current = freezes.find((f) => f.role === 'current');
  if (w.kind === 'manifest') return `World ${shortHash(w.hash!)}: matches the manifest, today's build${w.missesFrozen && current ? `, not the frozen world of ${task} (${shortHash(current.world_hash)})` : ''}.`;
  if (w.kind === 'frozen') {
    const m = w.match!;
    const which = m.role === 'superseded' ? ` ${m.version ?? 'superseded'} (superseded)` : m.role === 'previous' ? ` before its re-freeze${m.tag ? ` (tag ${m.tag})` : ''}` : '';
    return `World ${shortHash(w.hash!)}: matches the frozen world of ${task}${which}.`;
  }
  return `World ${shortHash(w.hash!)}: matches neither today's build nor a frozen world of ${task}.`;
}
