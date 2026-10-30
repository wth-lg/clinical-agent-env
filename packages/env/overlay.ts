// Task overlays (design section 2, "One shared world"): deterministic builders that patch
// chosen base patients and add each task's hand-written resources. fixtures:build applies
// every tasks/<id>/overlay.ts to the base cohort plus the setting (packages/env/world.ts).
//
// Isolation, enforced by applyOverlays so no task can break another:
//   - each task owns a fixed set of base patients (its slots) and may replace or remove only
//     those Patients and the base resources that reference them and no other patient;
//   - every resource a task adds carries a registry key with the task's reserved tag as its
//     second segment (T1 writes obs-t1-scr-1020, never obs-scr-1020), so two tasks never collide;
//   - every Patient an added or replaced resource references is one of the task's slots or
//     a Patient the task adds itself;
//   - each overlay reads base plus setting only, never another overlay's output, so the
//     world does not depend on the order overlays run in.
//
// Planted ids (builder-189, builder-196): no id the agent can see says which task planted a
// resource or what it is for, or that a task planted it at all. An overlay writes its resources
// under registry keys (obs-t1-scr-1020, the designers' names) and refers to base resources by
// their base.ndjson.gz ids. Once every overlay has run, packages/env/renumber.ts numbers the whole
// world by the Synthea cohort's own rule (per type, (patient, date, code) order), so a planted
// resource's id sits among its patient's generated ones. A Practitioner, Organization or Group
// takes the name the overlay gives its key in `names` (pr-raman, org-lakeshore), like the
// setting's. Every id, reference and lint entry is rewritten to its world id, and a key left
// anywhere in what an overlay writes (text attachments decoded) fails the build, so the world
// carries no key. The registries (key -> world id) and the base map (base id -> world id) are
// build outputs, fixtures/ids.ts and fixtures/synthea-ids.ts; graders, solutions and tests name a
// planted resource by key through tasks/<id>/ids.ts and a base one through
// packages/env/synthea-ids.ts.
import type { Resource } from '@medplum/fhirtypes';
import { dataBytes, dataText, textDefect } from './attachment.ts';
import type { LintSource, LintSpec } from './lint/index.ts';
import { NAME_SHAPED, numberedPrefix, worldIds } from './renumber.ts';
import { Store } from './store.ts';

// Slots are picked so a task's patients can keep their Synthea charts with only a name and
// birth date patched: T1 an elderly man, T2 its inbox patients (one a teenager), T3 a
// 12-patient screening panel aged 46-75, T4 and T5 older men, T6 the message senders.
// W1-0 (plan-amendment-worklist.md W1) sizes each set to its task's item-class probe, 51 of the
// 60 patients, every current slot kept: T1 9, T2 8, T3 17, T4 4, T5 7, T6 6. The added slots are
// adults (no child's chart), the ones with the most active orders and problems to the medication
// reviews (T1, T4), the oldest to the screening panel (T3); an overlay patches their name and birth
// date as it needs. pt-0051, pt-0052 and pt-0054..pt-0060 stay free.
export const TASKS = {
  T1: { slug: 'renal-dose-review', slots: ['pt-0001', 'pt-0002', 'pt-0003', 'pt-0038', 'pt-0039', 'pt-0040', 'pt-0041', 'pt-0043', 'pt-0045'] },
  T2: { slug: 'results-inbox', slots: ['pt-0006', 'pt-0007', 'pt-0008', 'pt-0010', 'pt-0013', 'pt-0016', 'pt-0033', 'pt-0053'] },
  T3: {
    slug: 'crc-care-gap',
    slots: ['pt-0009', 'pt-0011', 'pt-0014', 'pt-0017', 'pt-0018', 'pt-0019', 'pt-0020', 'pt-0021', 'pt-0022', 'pt-0023', 'pt-0024', 'pt-0025', 'pt-0032', 'pt-0034', 'pt-0035', 'pt-0036', 'pt-0037'],
  },
  T4: { slug: 'discharge-medrec', slots: ['pt-0004', 'pt-0005', 'pt-0042', 'pt-0044'] },
  T5: { slug: 'contrast-ct-prep', slots: ['pt-0012', 'pt-0015', 'pt-0046', 'pt-0047', 'pt-0048', 'pt-0049', 'pt-0050'] },
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
  // The world id of each Practitioner, Organization or Group the overlay adds, by key: a name
  // like the setting's (pr-raman). Every other added resource is numbered by fixtures:build.
  names?: Readonly<Record<string, string>>;
  build(world: WorldReader): OverlayEdits;
}

// A name a Practitioner, Organization or Group may take.
const NAMED = /^([a-z]+)-[a-z]+(?:-[a-z]+)*$/;
// A registry key inside any string.
const KEY_IN_TEXT = /(?:^|[^A-Za-z0-9])([a-z]+-t\d+-[a-z0-9][a-z0-9-]*)/;

// An id map as a function over one string: an id, or Type/id.
function renamer(ids: ReadonlyMap<string, string>): (s: string) => string {
  return (s) => {
    const whole = ids.get(s);
    if (whole !== undefined) return whole;
    const slash = s.indexOf('/');
    const tail = slash > 0 ? ids.get(s.slice(slash + 1)) : undefined;
    return tail !== undefined ? `${s.slice(0, slash)}/${tail}` : s;
  };
}

function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === 'string') return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [f(k), mapStrings(v, f)])) as T;
  return value;
}

// The first registry key in any string of value, an attachment's data decoded when it is base64 text,
// whatever its content type, and base64 text inside that too (verifier P17i W0 M1: a key hidden in
// base64 note text reached the world past the string check; W0-1b F3 and r2 F5). Data is also read
// byte for byte (Latin-1, W0-1b r3 F3) and with its NUL bytes dropped (UTF-16, W0-1c V4), at every
// depth and under any content type.
const bytesKey = (bytes: string | null) => (bytes === null ? null : (KEY_IN_TEXT.exec(bytes)?.[1] ?? KEY_IN_TEXT.exec(bytes.replace(/\0/g, ''))?.[1] ?? null));
function firstKey(value: unknown): string | null {
  if (typeof value === 'string') return KEY_IN_TEXT.exec(value)?.[1] ?? null;
  if (Array.isArray(value)) for (const v of value) { const k = firstKey(v); if (k !== null) return k; }
  else if (value !== null && typeof value === 'object') {
    const { data } = value as { data?: unknown };
    for (let text: string | null = typeof data === 'string' ? data : null, depth = 0; text !== null && depth < 5; text = dataText(text.trim()), depth++) {
      const k = (depth ? firstKey(text) : null) ?? bytesKey(dataBytes(text.trim())) ?? bytesKey(dataBytes(text.replace(/\s+/g, '')));
      if (k !== null) return k;
      // Base64 inside the text, on a line or after a label of its own.
      for (const m of text.match(/[A-Za-z0-9+/_-]{16,}={0,2}/g) ?? []) { const kk = bytesKey(dataBytes(m)); if (kk !== null) return kk; }
    }
    for (const [k, v] of Object.entries(value)) { const f = firstKey(k) ?? firstKey(v); if (f !== null) return f; }
  }
  return null;
}
// The first attachment in value whose data cannot be filed as text (attachment.ts textDefect).
function firstTextDefect(value: unknown, at = ''): string | null {
  if (Array.isArray(value)) for (const v of value) { const d = firstTextDefect(v, at); if (d !== null) return d; }
  else if (value !== null && typeof value === 'object') {
    const why = textDefect(value as { contentType?: unknown; data?: unknown });
    if (why !== null) return `the ${String((value as { contentType?: unknown }).contentType ?? 'untyped')} attachment at ${at || '(root)'} ${why}`;
    for (const [k, v] of Object.entries(value)) { const d = firstTextDefect(v, at ? `${at}.${k}` : k); if (d !== null) return d; }
  }
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
  // Each task's registry: key -> world id, for every resource its overlay added.
  ids: Record<TaskId, Record<string, string>>;
  // Base id (as base.ndjson.gz has it) -> world id, for every numbered base resource still in the world.
  synthea: Record<string, string>;
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

  // The names, before any overlay runs: each key in its task's namespace and of a name-shaped
  // type's prefix, each name new to the world and claimed once.
  const startIds = new Set([...start.values()].map((r) => r.id!));
  const claimed = new Map<string, TaskId>();
  for (const { task, names = {} } of sorted) {
    const keyShape = new RegExp(`^([a-z]+)-${idTag(task)}-[a-z0-9][a-z0-9-]*$`);
    for (const [k, v] of Object.entries(names)) {
      const prefix = keyShape.exec(k)?.[1];
      if (prefix === undefined) throw new Error(`overlay ${task}: name key ${k} must look like <type>-${idTag(task)}-<rest>`);
      if (NAMED.exec(v)?.[1] !== prefix) throw new Error(`overlay ${task}: ${k} is named ${v}, which is not a name of the form ${prefix}-<words>`);
      if (startIds.has(v)) throw new Error(`overlay ${task}: ${k} is named ${v}, which the base or setting already has`);
      if (claimed.has(v)) throw new Error(`overlay: name ${v} is claimed by ${claimed.get(v)} and ${task}`);
      claimed.set(v, task);
    }
  }

  const added = new Map<string, TaskId>(); // Type/key -> task, for every resource an overlay added
  const written = new Set<string>(); // Type/id of every resource an overlay added or replaced
  const lintByTask: Array<{ task: TaskId; spec: LintSpec }> = [];
  for (const overlay of sorted) {
    const { task, names = {} } = overlay;
    const at = (r: { resourceType: string; id?: string }) => `overlay ${task}: ${key(r)}`;
    const ownsPatients = (r: Resource) => [...patientRefs(r)].every((p) => owner.get(p) === task);
    // A base resource the task may change: one of its slot Patients, or a resource that
    // references at least one Patient, all of them its slots.
    const owns = (r: Resource) => (r.resourceType === 'Patient' ? owner.get(r.id!) === task : patientRefs(r).size > 0 && ownsPatients(r));
    const keyShape = new RegExp(`^[a-z]+-${idTag(task)}-[a-z0-9][a-z0-9-]*$`);

    const edits = overlay.build(reader);
    for (const r of edits.remove ?? []) {
      const existing = start.get(key(r));
      if (!existing) throw new Error(`${at(r)} removes a resource that is not in base or setting`);
      if (r.resourceType === 'Patient' || !owns(existing)) throw new Error(`${at(r)} may not be removed by ${task}`);
      world.delete(key(r));
    }
    for (const r of edits.put ?? []) {
      const existing = start.get(key(r));
      if (existing) {
        if (!owns(existing)) throw new Error(`${at(r)} is not ${task}'s to replace`);
      } else if (!keyShape.test(r.id ?? '')) {
        throw new Error(`${at(r)} is not a registry key of ${task}: an added resource's id is <type prefix>-${idTag(task)}-<rest>`);
      } else if (NAME_SHAPED.has(r.resourceType) !== Object.hasOwn(names, r.id!)) {
        throw new Error(NAME_SHAPED.has(r.resourceType) ? `${at(r)}: a ${r.resourceType} takes a name; give its key one in the overlay's names` : `${at(r)}: a ${r.resourceType} is numbered by fixtures:build; it takes no name`);
      } else if (r.resourceType === 'Patient' || (!NAME_SHAPED.has(r.resourceType) && numberedPrefix(r) === null)) {
        throw new Error(`${at(r)}: fixtures:build cannot number a ${r.resourceType}`);
      } else {
        added.set(key(r), task);
      }
      if (!ownsPatients(r)) throw new Error(`${at(r)} references a patient that is not a ${task} slot`);
      written.add(key(r));
      world.set(key(r), r);
    }
    for (const k of Object.keys(names)) if (!added.has(`Practitioner/${k}`) && !added.has(`Organization/${k}`) && !added.has(`Group/${k}`)) throw new Error(`overlay ${task}: name key ${k} is named but the overlay never adds it`);
    if (edits.lint) lintByTask.push({ task, spec: edits.lint });
  }

  // World ids: names for the name-shaped, Synthea's numbering for the rest.
  const numbered = worldIds([...world.values()]);
  const bare = new Map<string, string>();
  for (const { names = {} } of sorted) for (const [k, v] of Object.entries(names)) bare.set(k, v);
  for (const [ref, id] of numbered) bare.set(ref.slice(ref.indexOf('/') + 1), id);
  const rename = renamer(bare);
  const resources: Resource[] = [];
  for (const [k, r] of world) {
    const out = mapStrings(r, rename);
    if (written.has(k)) {
      const left = firstKey(out);
      if (left !== null) throw new Error(`overlay ${added.get(k) ?? 'task'}: ${k}: '${left}' is a registry key; what the agent can read takes a world id, so name the resource by its reference, not its key`);
    }
    // Text the read tools could not show (verifier P17i W0-1c V4), in any resource.
    const defect = firstTextDefect(out);
    if (defect !== null) throw new Error(`${written.has(k) ? `overlay ${added.get(k) ?? 'task'}: ` : ''}${k}: ${defect}; write a text attachment as base64 of UTF-8 text`);
    resources.push(out);
  }
  lint[0] = { source: 'world', spec: mapStrings(settingLint, rename) };
  for (const { task, spec } of lintByTask) lint.push({ source: task, spec: mapStrings(spec, rename) });

  const ids = Object.fromEntries(sorted.map(({ task }) => [task, {} as Record<string, string>])) as Record<TaskId, Record<string, string>>;
  for (const [k, task] of [...added].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) ids[task][k.slice(k.indexOf('/') + 1)] = bare.get(k.slice(k.indexOf('/') + 1))!;
  const synthea: Record<string, string> = {};
  for (const [k, id] of [...numbered].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (start.has(k)) synthea[k.slice(k.indexOf('/') + 1)] = id;
  return { resources, lint, ids, synthea };
}
