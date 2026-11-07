// Which world a trial started from, for the trial header's World line and the State diff tab's
// first line (P25c fix, builder-326, trace row N13): today's manifest, its task's frozen world
// (results/tasks-final.json, R37: an official trial frozen on an earlier world is historical and
// is reproduced at its replay tag, never here), another world, or none recorded. Apart from the
// components, and from data/results.ts (whose import.meta.glob the root typecheck cannot read),
// so the unit tests and the root typecheck reach it without Vite.

// The part of a task's freeze (data/results.ts FrozenTask) this reads.
export interface FrozenWorld {
  world_hash: string;
}

export type WorldKind = 'manifest' | 'frozen' | 'other' | 'none';

export interface WorldStatus {
  kind: WorldKind;
  // The trial's initial state hash; null when the record has none.
  hash: string | null;
}

// official: the trial is of the official run; only its trials are held to a frozen world.
export function worldStatus(initial: string | null | undefined, manifest: string, frozen: FrozenWorld | null, official: boolean): WorldStatus {
  const hash = initial ?? null;
  if (hash === null) return { kind: 'none', hash };
  if (hash === manifest) return { kind: 'manifest', hash };
  if (official && frozen !== null && frozen.world_hash !== manifest && hash === frozen.world_hash) return { kind: 'frozen', hash };
  return { kind: 'other', hash };
}

export const shortHash = (hash: string): string => `${hash.slice(0, 12)}…`;

// "World ba0b02069ab4…: matches the frozen world of contrast-ct-prep." The strings are in
// docs/requirements/ui-contract.md (`matches the manifest`, `matches the frozen world of`).
export function worldLine(w: WorldStatus, task: string): string {
  if (w.kind === 'none') return 'World not recorded.';
  const what = w.kind === 'manifest' ? 'matches the manifest' : w.kind === 'frozen' ? `matches the frozen world of ${task}` : `matches neither today's manifest nor a frozen world of ${task}`;
  return `World ${shortHash(w.hash!)}: ${what}.`;
}
