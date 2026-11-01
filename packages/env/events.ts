// Mid-trial events (plan-amendment-w4, "Event mechanism"). An event is a realistic arrival, a new
// or amended result, an outside faxed report or a message, that enters the trial's store after
// the agent has acted on that patient (after_write) or seen given records (after_exposed). A task
// authors its specs in tasks/<id>/events.ts (SPECS, and ACTIVE, the ids that fire); an inactive
// spec never fires. The file is an env file (packages/core/tasks.ts isEnvFile).
//
// Firing is one post-call hook in callTool (tools/registry.ts deliver): after any successful call
// of a trial with active specs, each spec that has not fired and whose trigger now holds fires,
// in SPECS order. It is a pure function of the active specs and the ordered calls and their
// results, so replay on a fresh store and session re-fires identically. A fire:
//   - takes the next session.arrivalSeq k, never session.writeSeq, and is stamped
//     clock.arrivalStamp(writeSeq, k): strictly between the last write's stamp and the next
//     write's, so the agent's -t<n> ids and stamps stay as they would be without it (C2);
//   - puts the spec's resources, the stampFields set to that stamp, and one inbox Task
//     (inbox-a<k>, status requested, owned by the signed-in user, authoredOn the stamp, focus the
//     spec's first resource, a generic summary that names no deciding fact, R29). list_inbox sorts
//     by received, so arrivals list last;
//   - reports nothing in any tool result, and none of its keys in written_ids (C3): the agent
//     learns of it only as a clinician would, from the inbox and the chart;
//   - is recorded in session.fired; the loop emits each as an env_event.
// A resource may replace one already in the store (an amended result, class B). An arrival the
// store would refuse (invalid FHIR, a dangling reference) is the environment's fault: the hook
// throws, and the loop records INTERNAL.
//
// finish answers CONFLICT with FINISH_GUARD_MESSAGE when an event fired in the same model turn
// (tools/write/finish.ts), so the model always gets a turn after an arrival.
import type { Resource, Task } from '@medplum/fhirtypes';
import { Store } from './store.ts';
import { INBOX_QUEUE_SYSTEM, USER } from './tools/read/context.ts';
import type { ToolResult } from './tools/registry.ts';
import type { WriteContext, WriteSession } from './tools/write/context.ts';
import { validate } from './validate.ts';
import { RESOURCE_TYPES } from './world.ts';

// A threshold-cross, a correction, a cross-item arrival, an outside record, a lure.
export const EVENT_CLASSES = ['A', 'B', 'C', 'O', 'D'] as const;
export type EventClass = (typeof EVENT_CLASSES)[number];

export type EventTrigger =
  // After a committed write whose resources (Provenance aside) are about Patient/<patient>.
  | { kind: 'after_write'; patient: string }
  // After the call by which every listed Type/id has been exposed (tools/registry.ts exposure).
  | { kind: 'after_exposed'; ids: readonly string[] };

export interface EventSpec {
  id: string;
  // The item of the task's list the event bears on.
  item: string;
  class: EventClass;
  trigger: EventTrigger;
  // What arrives; the first is the inbox Task's focus, of a type ARRIVAL_SUMMARY names, with a
  // Patient subject.
  resources: readonly Resource[];
  // '<Type>/<id>.<path>': a field of one of the resources set to the arrival stamp, e.g.
  // 'Observation/obs-x.issued' or 'DocumentReference/doc-x.date'.
  stampFields: readonly string[];
}

// One fire, as session.fired keeps it and the env_event trajectory event carries it.
export interface Arrival {
  spec: string;
  turn: number;
  arrival_seq: number;
  stamp: string;
  // Every resource it put, the inbox Task included, as Type/id, sorted.
  keys: string[];
}

// The inbox summary per focus type: generic, never a deciding fact (R29).
export const ARRIVAL_SUMMARY = {
  Observation: 'New result',
  DiagnosticReport: 'New result',
  DocumentReference: 'Outside document received',
  Communication: 'New message',
} as const;
type FocusType = keyof typeof ARRIVAL_SUMMARY;
const QUEUE: Record<FocusType, 'results' | 'messages'> = { Observation: 'results', DiagnosticReport: 'results', DocumentReference: 'results', Communication: 'messages' };

export const FINISH_GUARD_MESSAGE = 'new items arrived in your queues during this turn; review them before finishing';

const keyOf = (r: Readonly<Resource>) => `${r.resourceType}/${r.id}`;
const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

// The Patient a resource is about: its subject, patient, for or beneficiary reference.
function patientOf(r: Readonly<Resource> | undefined): string | undefined {
  if (r === undefined) return undefined;
  for (const f of ['subject', 'patient', 'for', 'beneficiary']) {
    const ref = (r as unknown as Record<string, { reference?: unknown } | undefined>)[f]?.reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) return ref;
  }
  return undefined;
}

// The resource a stamp field names and the path inside it; the longest key wins, since an id
// may hold '.'.
function stampTarget(spec: EventSpec, field: string): [number, string[]] {
  let best: [number, number] | undefined;
  spec.resources.forEach((r, i) => {
    const k = keyOf(r);
    if (field.startsWith(`${k}.`) && (!best || k.length > best[1])) best = [i, k.length];
  });
  if (!best || field.length === best[1] + 1) throw new Error(`event ${spec.id}: stamp field ${field} names no resource of the spec and a path`);
  return [best[0], field.slice(best[1] + 1).split('.')];
}

// Throws naming the spec and the fault for a spec that cannot fire as written.
export function checkSpec(spec: EventSpec): void {
  const at = `event ${spec.id}`;
  if (!FHIR_ID.test(spec.id)) throw new Error(`${at}: id must match ${FHIR_ID}`);
  if (!(EVENT_CLASSES as readonly string[]).includes(spec.class)) throw new Error(`${at}: class must be one of ${EVENT_CLASSES.join(', ')}`);
  const t = spec.trigger;
  if (t.kind === 'after_write' ? !FHIR_ID.test(t.patient) : t.kind !== 'after_exposed' || t.ids.length === 0) throw new Error(`${at}: bad trigger ${JSON.stringify(t)}`);
  const focus = spec.resources[0];
  if (focus === undefined) throw new Error(`${at}: no resources`);
  if (!Object.hasOwn(ARRIVAL_SUMMARY, focus.resourceType)) throw new Error(`${at}: the first resource is a ${focus.resourceType}; it must be one of ${Object.keys(ARRIVAL_SUMMARY).join(', ')}`);
  if (patientOf(focus) === undefined) throw new Error(`${at}: the first resource has no Patient subject`);
  const keys = spec.resources.map(keyOf);
  if (new Set(keys).size !== keys.length) throw new Error(`${at}: a resource appears twice (${keys.join(', ')})`);
  for (const f of spec.stampFields) stampTarget(spec, f);
}

// The ACTIVE specs of a task's events module, in SPECS order. Throws on a duplicate spec id, an
// ACTIVE id with no spec, and any spec checkSpec refuses.
export function activeSpecs(mod: { SPECS: readonly EventSpec[]; ACTIVE: readonly string[] }): EventSpec[] {
  const ids = mod.SPECS.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) throw new Error(`events: duplicate spec id ${dup}`);
  for (const id of mod.ACTIVE) if (!ids.includes(id)) throw new Error(`events: ACTIVE names ${id}, which no spec has`);
  for (const s of mod.SPECS) checkSpec(s);
  return mod.SPECS.filter((s) => mod.ACTIVE.includes(s.id));
}

// Whether an event fired in the session's current turn: finish answers CONFLICT then.
export const firedThisTurn = (session: WriteSession): boolean => session.fired.some((f) => f.turn === session.turn);

function triggered(spec: EventSpec, ctx: WriteContext, result: ToolResult): boolean {
  const t = spec.trigger;
  if (t.kind === 'after_exposed') return t.ids.every((id) => ctx.session.exposed.has(id));
  const patient = `Patient/${t.patient}`;
  return (result.written_ids ?? []).some((k) => {
    const slash = k.indexOf('/');
    const type = k.slice(0, slash);
    return type !== 'Provenance' && patientOf(ctx.world.get(type, k.slice(slash + 1))) === patient;
  });
}

// Every reference string in a value, at any depth.
function references(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) references(v, out);
  else if (value !== null && typeof value === 'object') {
    const r = (value as { reference?: unknown }).reference;
    if (typeof r === 'string') out.push(r);
    for (const v of Object.values(value)) references(v, out);
  }
  return out;
}

function fire(ctx: WriteContext, spec: EventSpec): void {
  const { session } = ctx;
  const k = session.arrivalSeq + 1;
  const stamp = ctx.clock.arrivalStamp(session.writeSeq, k);
  const resources = spec.resources.map((r) => structuredClone(r) as Resource);
  for (const f of spec.stampFields) {
    const [i, path] = stampTarget(spec, f);
    let at = resources[i] as unknown as Record<string, unknown>;
    for (const p of path.slice(0, -1)) {
      if (at[p] === null || typeof at[p] !== 'object') throw new Error(`event ${spec.id}: stamp field ${f}: ${p} is not an object`);
      at = at[p] as Record<string, unknown>;
    }
    at[path.at(-1)!] = stamp;
  }
  const focus = resources[0]!;
  const type = focus.resourceType as FocusType;
  const inbox: Task = {
    resourceType: 'Task',
    id: `inbox-a${String(k).padStart(4, '0')}`,
    status: 'requested',
    intent: 'order',
    code: { coding: [{ system: INBOX_QUEUE_SYSTEM, code: QUEUE[type] }] },
    focus: { reference: keyOf(focus) },
    for: { reference: patientOf(focus)! },
    authoredOn: stamp,
    owner: { reference: USER },
    description: ARRIVAL_SUMMARY[type],
  };
  const all = [...resources, inbox];
  const keys = all.map(keyOf);
  for (const r of all) {
    const invalid = validate(r);
    if (invalid) throw new Error(`event ${spec.id}: ${keyOf(r)} is not valid FHIR: ${invalid.message} (${invalid.path})`);
  }
  if (ctx.world.get('Task', inbox.id!) !== undefined) throw new Error(`event ${spec.id}: Task/${inbox.id} is already in the store`);
  for (const r of all) {
    for (const ref of references(r)) {
      const [t, id, more] = ref.split('/');
      const known = (RESOURCE_TYPES as readonly string[]).includes(t!) && id !== undefined && more === undefined;
      if (!known || (!keys.includes(ref) && ctx.world.get(t!, id!) === undefined)) throw new Error(`event ${spec.id}: dangling reference ${ref} in ${keyOf(r)}`);
    }
  }
  // A scratch store admits them first, so the puts below cannot fail halfway.
  new Store(all);
  for (const r of all) ctx.world.put(r);
  session.arrivalSeq = k;
  session.fired.push({ spec: spec.id, turn: session.turn, arrival_seq: k, stamp, keys: [...keys].sort() });
}

const hasEvents = (ctx: unknown): ctx is WriteContext & { events: readonly EventSpec[] } => {
  const c = ctx as Partial<WriteContext> | null;
  return typeof c === 'object' && c !== null && c.session !== undefined && (c.events?.length ?? 0) > 0;
};

// The post-call hook (tools/registry.ts callTool): after a successful call, fires every active
// spec whose trigger now holds. Nothing happens once the episode has finished, or in a context
// with no active specs (a read-only context included).
export function deliver(ctx: unknown, result: ToolResult): void {
  if (!hasEvents(ctx) || result.is_error || ctx.session.summary !== undefined) return;
  for (const id of result.exposed_ids) ctx.session.exposed.add(id);
  for (const spec of ctx.events) {
    if (ctx.session.fired.some((f) => f.spec === spec.id)) continue;
    if (triggered(spec, ctx, result)) fire(ctx, spec);
  }
}
