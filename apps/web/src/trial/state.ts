// The State diff of a replayed trial: packages/grader/diff.ts diff() between the world and the
// state the replay left (packages/core/run.ts replayState, run in the validation Worker), with the
// top-level fields each created or changed resource differs in. Pure.
import { canonicalJson } from '../../../../packages/env/hash.ts';
import type { Resource } from '../../../../packages/env/store.ts';
import { diff, keyOf, type Diff } from '../../../../packages/grader/diff.ts';

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}
export interface Change {
  id: string;
  kind: 'created' | 'updated';
  status: { from: string | null; to: string | null } | null;
  fields: FieldChange[];
}

function fieldsOf(before: Readonly<Resource> | undefined, after: Readonly<Resource>): FieldChange[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()
    .filter((k) => k !== 'resourceType' && k !== 'id' && canonicalJson(b[k] ?? null) !== canonicalJson(a[k] ?? null))
    .map((key) => ({ key, before: b[key], after: a[key] }));
}

export function stateChanges(initial: readonly Resource[], final: readonly Resource[]): { diff: Diff; changes: Change[] } {
  const d = diff(initial, final);
  const before = new Map(initial.map((r) => [keyOf(r), r]));
  const after = new Map(final.map((r) => [keyOf(r), r]));
  const changes: Change[] = [
    ...d.created.map((id): Change => ({ id, kind: 'created', status: null, fields: fieldsOf(undefined, after.get(id)!) })),
    ...d.updated.map((id): Change => {
      const s = d.status_changed.find((x) => x.id === id);
      return { id, kind: 'updated', status: s ? { from: s.from, to: s.to } : null, fields: fieldsOf(before.get(id), after.get(id)!) };
    }),
  ];
  return { diff: d, changes };
}
