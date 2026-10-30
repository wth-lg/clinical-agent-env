// Task overlays (design section 2, "One shared world"): deterministic builders that patch
// chosen base patients and add each task's hand-written resources. fixtures:build applies
// every tasks/<id>/overlay.ts to the base cohort plus the setting (packages/env/world.ts).
//
// Isolation, enforced by applyOverlays so no task can break another:
//   - each task owns a fixed set of base patients (its slots) and may replace or remove only
//     those Patients and the base resources that reference them and no other patient;
//   - every resource a task adds is declared in the task's id registry (below) under a key
//     with the task's reserved tag as its second segment (T1 declares obs-t1-scr-1020, never
//     obs-scr-1020), and every world id the registry maps a key to is claimed by one task and is
//     not a base id (obs-00012) or a setting id (pr-okafor), so two tasks never collide;
//   - every Patient an added or replaced resource references is one of the task's slots or
//     a Patient the task adds itself;
//   - each overlay reads base plus setting only, never another overlay's output, so the
//     world does not depend on the order overlays run in.
//
// Planted ids (builder-189): no id the agent can see says which task planted a resource or what
// it is for. An overlay writes its resources under registry keys (obs-t1-scr-1020, the
// designers' names), and tasks/<id>/ids.ts maps each key to a neutral world id: <prefix>-<5
// digits> numbered on from the base cohort's last id of that type, as the Synthea ids are
// (obs-03458), or, for a Practitioner, Organization or Group, a name like the setting's
// (pr-raman, org-lakeshore). applyOverlays rewrites every id, reference and lint entry from key to
// world id and fails on a key left anywhere in what the overlay writes, so the world carries no
// key; graders, solutions and tests name a planted resource by its key through the task's ids.ts.
import type { Resource } from '@medplum/fhirtypes';
import type { LintSource, LintSpec } from './lint/index.ts';
import type { PlantedIds } from './planted.ts';
import { Store } from './store.ts';

// Slots are picked so a task's patients can keep their Synthea charts with only a name and
// birth date patched: T1 an elderly man, T2 its inbox patients (one a teenager), T3 a
// 12-patient screening panel aged 46-75, T4 and T5 older men, T6 the message senders.
export const TASKS = {
  T1: { slug: 'renal-dose-review', slots: ['pt-0002', 'pt-0003'] },
  T2: { slug: 'results-inbox', slots: ['pt-0006', 'pt-0007', 'pt-0008', 'pt-0010', 'pt-0013', 'pt-0016', 'pt-0033', 'pt-0053'] },
  T3: {
    slug: 'crc-care-gap',
    slots: ['pt-0009', 'pt-0011', 'pt-0014', 'pt-0017', 'pt-0018', 'pt-0019', 'pt-0020', 'pt-0021', 'pt-0022', 'pt-0023', 'pt-0024', 'pt-0025', 'pt-0034', 'pt-0035'],
  },
  T4: { slug: 'discharge-medrec', slots: ['pt-0004', 'pt-0005'] },
  T5: { slug: 'contrast-ct-prep', slots: ['pt-0012', 'pt-0015'] },
  T6: { slug: 'message-queue', slots: ['pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031'] },
} as const satisfies Record<string, { slug: string; slots: readonly string[] }>;

export type TaskId = keyof typeof TASKS;

// The reserved id tag: an added resource's id is <type prefix>-<tag>-<rest>.
export const idTag = (task: TaskId): string => `t${task.slice(1)}`;

export type WorldReader = Pick<Store, 'get' | 'search' | 'resources' | 'size'>;

export interface OverlayEdits {
  // Added or replaced resources.
  put?: readonly Resource[];
  remove?: ReadonlyArray<{ resourceType: string; id: string }>;
  // The task's margins, windows, answers and prompts for the fixture lint.
  lint?: LintSpec;
}

export interface Overlay {
  task: TaskId;
  ids: PlantedIds;
  build(world: WorldReader): OverlayEdits;
}

// World ids a registry may map to. A Practitioner, Organization or Group may take a name; any
// other type takes a number, as every base id has.
const NUMBERED = /^([a-z]+)-(\d{5})$/;
const NAMED = /^([a-z]+)-[a-z]+(?:-[a-z]+)*$/;
const NAME_SHAPED = new Set(['Practitioner', 'Organization', 'Group']);
// A registry key inside any string.
const KEY_IN_TEXT = /(?:^|[^A-Za-z0-9])([a-z]+-t\d+-[a-z0-9][a-z0-9-]*)/;

// The key -> world id map of a registry as a function over one string: a key, or Type/key.
function renamer(ids: PlantedIds): (s: string) => string {
  return (s) => {
    if (Object.hasOwn(ids, s)) return ids[s]!;
    const slash = s.indexOf('/');
    return slash > 0 && Object.hasOwn(ids, s.slice(slash + 1)) ? `${s.slice(0, slash)}/${ids[s.slice(slash + 1)]}` : s;
  };
}

function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === 'string') return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [f(k), mapStrings(v, f)])) as T;
  return value;
}

function firstKey(value: unknown): string | null {
  if (typeof value === 'string') return KEY_IN_TEXT.exec(value)?.[1] ?? null;
  if (Array.isArray(value)) for (const v of value) { const k = firstKey(v); if (k !== null) return k; }
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) { const f = firstKey(k) ?? firstKey(v); if (f !== null) return f; }
  return null;
}

const key = (r: { resourceType: string; id?: string }) => `${r.resourceType}/${r.id}`;

// Every Patient id a resource references, at any depth.
export function patientRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) patientRefs(v, out);
  else if (value !== null && typeof value === 'object') {
    const ref = (value as { reference?: unknown }).reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) out.add(ref.slice(8));
    for (const v of Object.values(value)) patientRefs(v, out);
  }
  return out;
}

export interface World {
  resources: Resource[];
  lint: LintSource[];
}

export function applyOverlays(base: readonly Resource[], setting: readonly Resource[], settingLint: LintSpec, overlays: readonly Overlay[]): World {
  const start = new Map<string, Resource>();
  for (const r of [...base, ...setting]) {
    if (start.has(key(r))) throw new Error(`overlay: ${key(r)} is in the base cohort and the setting`);
    start.set(key(r), r);
  }
  const owner = new Map<string, TaskId>();
  for (const [task, { slots }] of Object.entries(TASKS) as Array<[TaskId, { slots: readonly string[] }]>) {
    for (const id of slots) {
      if (owner.has(id)) throw new Error(`overlay: ${id} is a slot of ${owner.get(id)} and ${task}`);
      if (!start.has(`Patient/${id}`)) throw new Error(`overlay: ${task} slot ${id} is not a base patient`);
      owner.set(id, task);
    }
  }

  // Read-only by construction, not by type: an overlay gets these four functions over a store
  // of frozen copies and never the Store itself, so no cast reaches put() and no overlay can
  // change what the next one reads.
  const snapshot = new Store(start.values());
  const reader: WorldReader = Object.freeze({
    get: snapshot.get.bind(snapshot),
    search: snapshot.search.bind(snapshot),
    resources: snapshot.resources.bind(snapshot),
    size: snapshot.size,
  });
  const world = new Map(start);
  const lint: LintSource[] = [{ source: 'world', spec: settingLint }];
  const sorted = [...overlays].sort((a, b) => (a.task < b.task ? -1 : a.task > b.task ? 1 : 0));
  const seen = new Set<TaskId>();
  for (const { task } of sorted) {
    if (!Object.hasOwn(TASKS, task)) throw new Error(`overlay: unknown task ${task}`);
    if (seen.has(task)) throw new Error(`overlay: two overlays for ${task}`);
    seen.add(task);
  }

  // The registries, before any overlay runs: each key in its task's namespace, each world id
  // neutral, of the key's type prefix, claimed once and new to the world.
  const startIds = new Set([...start.values()].map((r) => r.id!));
  const claimed = new Map<string, TaskId>();
  for (const { task, ids } of sorted) {
    const keyShape = new RegExp(`^([a-z]+)-${idTag(task)}-[a-z0-9][a-z0-9-]*$`);
    for (const [k, v] of Object.entries(ids)) {
      const prefix = keyShape.exec(k)?.[1];
      if (prefix === undefined) throw new Error(`overlay ${task}: registry key ${k} must look like <type>-${idTag(task)}-<rest>`);
      if ((NUMBERED.exec(v) ?? NAMED.exec(v))?.[1] !== prefix) throw new Error(`overlay ${task}: ${k} maps to ${v}, which is not a neutral id: ${prefix}-<5 digits>, or a name for a Practitioner, Organization or Group`);
      if (startIds.has(v)) throw new Error(`overlay ${task}: ${k} maps to ${v}, which the base or setting already has`);
      if (claimed.has(v)) throw new Error(`overlay: world id ${v} is claimed by ${claimed.get(v)} and ${task}`);
      claimed.set(v, task);
    }
  }
  // The next numbered id of a prefix no base, setting or registry entry has: what an error
  // proposes for an undeclared resource.
  const nextFree = (prefix: string) => {
    let n = 0;
    for (const id of [...startIds, ...claimed.keys()]) {
      const m = NUMBERED.exec(id);
      if (m?.[1] === prefix) n = Math.max(n, Number(m[2]));
    }
    return `${prefix}-${String(n + 1).padStart(5, '0')}`;
  };

  for (const overlay of sorted) {
    const { task, ids } = overlay;
    const at = (r: { resourceType: string; id?: string }) => `overlay ${task}: ${key(r)}`;
    const ownsPatients = (r: Resource) => [...patientRefs(r)].every((p) => owner.get(p) === task);
    // A base resource the task may change: one of its slot Patients, or a resource that
    // references at least one Patient, all of them its slots.
    const owns = (r: Resource) => (r.resourceType === 'Patient' ? owner.get(r.id!) === task : patientRefs(r).size > 0 && ownsPatients(r));
    const rename = renamer(ids);

    const edits = overlay.build(reader);
    // A Patient the task adds is its own, like a slot.
    for (const r of edits.put ?? []) if (r.resourceType === 'Patient' && !start.has(key(r)) && Object.hasOwn(ids, r.id ?? '')) owner.set(ids[r.id!]!, task);
    for (const r of edits.remove ?? []) {
      const existing = start.get(key(r));
      if (!existing) throw new Error(`${at(r)} removes a resource that is not in base or setting`);
      if (r.resourceType === 'Patient' || !owns(existing)) throw new Error(`${at(r)} may not be removed by ${task}`);
      world.delete(key(r));
    }
    const added = new Set<string>();
    for (const r of edits.put ?? []) {
      const existing = start.get(key(r));
      if (existing) {
        if (!owns(existing)) throw new Error(`${at(r)} is not ${task}'s to replace`);
      } else if (!Object.hasOwn(ids, r.id ?? '')) {
        const prefix = /^[a-z]+/.exec(r.id ?? '')?.[0] ?? 'x';
        throw new Error(`${at(r)} is not in tasks/${TASKS[task].slug}/ids.ts: declare it there, e.g. '${r.id}': '${nextFree(prefix)}'`);
      } else {
        if (!NAME_SHAPED.has(r.resourceType) && !NUMBERED.test(ids[r.id!]!)) throw new Error(`${at(r)}: a ${r.resourceType} takes a numbered world id (<prefix>-<5 digits>), not ${ids[r.id!]}`);
        added.add(r.id!);
      }
      const out = mapStrings(r, rename);
      const left = firstKey(out);
      if (left !== null) throw new Error(`${at(r)}: '${left}' is a registry key; what the agent can read takes its world id (tasks/${TASKS[task].slug}/ids.ts)`);
      if (!ownsPatients(out)) throw new Error(`${at(r)} references a patient that is not a ${task} slot`);
      world.set(key(out), out);
    }
    for (const k of Object.keys(ids)) if (!added.has(k)) throw new Error(`overlay ${task}: registry key ${k} is declared but the overlay never adds it`);
    if (edits.lint) lint.push({ source: task, spec: mapStrings(edits.lint, rename) });
  }
  return { resources: [...world.values()], lint };
}
