// The Frozen worlds table on Environment (P25u J3): each task's freezes from results/tasks-final.json
// (data/results.ts Freezes), one row per freeze, against today's build (fixtures/manifest.json).
// Apart from the components and from data/results.ts (whose import.meta.glob the root typecheck
// cannot read), so apps/web/test and the e2e specs reach it without Vite; the input type is the
// shape of FrozenTask that the rows need, as trial/world.ts frozenWorlds takes it.

export interface FrozenRow {
  task: string;
  // current: the task's freeze; previous: the one it kept before a re-freeze; superseded: an
  // earlier version's (R42).
  role: 'current' | 'previous' | 'superseded';
  // The superseded version (v1); null otherwise.
  version: string | null;
  hash: string;
  tag: string;
  // The world hash equals today's build, so a trial on it matches the manifest too.
  today: boolean;
}

type Freeze = { role: FrozenRow['role']; version?: string | undefined; world_hash: string; frozen_at: { tag: string } };

const ROLE_ORDER: Record<FrozenRow['role'], number> = { current: 0, previous: 1, superseded: 2 };

// Rows in task order, each task's current freeze first, then the previous, then a superseded one.
export function frozenRows(frozen: Readonly<Record<string, readonly Freeze[]>>, manifest: string): FrozenRow[] {
  return Object.keys(frozen).sort().flatMap((task) =>
    [...(frozen[task] ?? [])]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
      .map((f) => ({ task, role: f.role, version: f.version ?? null, hash: f.world_hash, tag: f.frozen_at.tag, today: f.world_hash === manifest })),
  );
}

// The freeze in words: "current", "before its re-freeze", "v1, superseded".
export const roleWords = (r: Pick<FrozenRow, 'role' | 'version'>): string =>
  r.role === 'current' ? 'current' : r.role === 'previous' ? 'before its re-freeze' : `${r.version ?? 'earlier version'}, superseded`;

// Which world the hash is: today's build, or an earlier one the build has moved on from.
export const worldWords = (today: boolean): string => (today ? "today's build" : 'an earlier world');
