// The state diff (design section 5): the resources a trial created, the ones it changed, and
// among those the status changes, keyed <Type>/<id> and compared as canonical JSON, so member
// order never makes a difference. Provenance is listed like any other resource.
// A key an env_event put in the store (PW4-E1, C3) is in `arrived`, never created, updated or
// status_changed: an arrived note is not the agent's (notesOf reads created), nor an amended result
// its update. What the agent then wrote to one is in written_ids.
import type { Resource } from '../env/store.ts';
import { canonicalJson } from '../env/hash.ts';

export interface Diff {
  created: readonly string[];
  updated: readonly string[];
  status_changed: ReadonlyArray<{ id: string; from: string | null; to: string | null }>;
  // The keys the trial's env_events put into the store, in arrival order, each once.
  arrived: readonly string[];
}

export const keyOf = (r: Readonly<Resource>): string => `${r.resourceType}/${r.id}`;

const statusOf = (r: Readonly<Resource>): string | null => {
  const s = (r as { status?: unknown }).status;
  return typeof s === 'string' ? s : null;
};

export function diff(initial: Iterable<Readonly<Resource>>, final: Iterable<Readonly<Resource>>, arrivals: readonly string[] = []): Diff {
  const arrived = [...new Set(arrivals)];
  const fromEnv = new Set(arrived);
  const before = new Map<string, Readonly<Resource>>();
  for (const r of initial) before.set(keyOf(r), r);
  const created: string[] = [];
  const updated: string[] = [];
  const status_changed: Diff['status_changed'][number][] = [];
  for (const r of final) {
    const k = keyOf(r);
    if (fromEnv.has(k)) continue;
    const old = before.get(k);
    if (old === undefined) created.push(k);
    // The store hands out the same frozen object until a write replaces it.
    else if (old !== r && canonicalJson(old) !== canonicalJson(r)) {
      updated.push(k);
      if (statusOf(old) !== statusOf(r)) status_changed.push({ id: k, from: statusOf(old), to: statusOf(r) });
    }
  }
  return { created, updated, status_changed, arrived };
}
