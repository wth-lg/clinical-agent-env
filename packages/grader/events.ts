// The event gates (plan-amendment-w4, "Gates per event-bearing item"; PW4-E1 stage 2). A task with
// active mid-trial event specs (tasks/<id>/events.ts, packages/env/events.ts) adds eventGates(...)
// to its checks; a task with none adds nothing, so its grades do not change. Each gate is an item
// gate (items.ts) over the items the active specs bear on, and each failed item names its spec
// (ItemResult.event), so cli classes attributes it. In order:
//
//   event_delivered  an active spec's trigger held in the trial (re-derived from the steps) and its
//                    arrival is not in the final store, or it arrived with no trigger: the
//                    environment's fault (E9). grade.ts grades the trial ENV_ERROR, re-run.
//   had_turn         an arrival had no model turn after it: only possible when a cap stopped the
//                    trial right after it (E10).
//   event_seen       the arrival was never seen after it arrived: by default a later step exposed
//                    its first resource (R2 places), or the task's own rule (EventExpectation.seenAt:
//                    a snippet that shows its atoms, R29). Labelled retrieval (missed_arrival).
//   amended          (A, B, C, O) the final state lacks the policy's action on the chart as
//                    delivered (C1: a self-correction passes, R34), labelled reasoning; or the action
//                    was written before the arrival was seen (R14, R18), marked process.
//   amend_form       (A, B, C, O, where the task declares it) conflicting state remains where the
//                    policy states one active order (R24): marked action_form.
//   kept             (D, a lure) the agent made a change the policy forbids on account of it (R3,
//                    R34): over_action on this item only (R9). A repeat test or a note passes.
//
// An event that did not fire leaves every gate of its item met: its trigger never held, so the
// chart the agent finished on is the one without it and the item's base gates grade it. The
// evidence says which specs fired. Attribution counts an arrival as seen only by the seen rule
// (seen_at_only): a class B correction replaces a record the trial may have read before it arrived.
import { AMEND_CLASSES, type EventSpec } from '../env/events.ts';
import type { GateCheck, GateCtx, Json, Step } from './check.ts';
import { sameId, seenBefore } from './exposure.ts';
import { itemGate, type ItemVerdict } from './items.ts';

export const EVENT_GATE_IDS = ['event_delivered', 'had_turn', 'event_seen', 'amended', 'amend_form', 'kept'] as const;
const isAmend = (s: EventSpec) => AMEND_CLASSES.has(s.class);
const isLure = (s: EventSpec) => s.class === 'D';

// What a task's grader says about one spec: the policy's action on the chart as delivered.
export interface EventExpectation {
  // A, B, C, O: whether the final state holds the policy's action given the arrival, and the
  // writes that make it up (each must come after the arrival was seen). `ids` names what is wrong.
  amended?: (ctx: GateCtx) => { met: boolean; writes: readonly string[]; why?: string; ids?: readonly string[] };
  // Optional, A, B, C, O: whether the action's form is the one the policy states (R24).
  amend_form?: (ctx: GateCtx) => { met: boolean; why?: string; ids?: readonly string[] };
  // D: whether the trial made no change the policy forbids on account of the lure; `ids` names the
  // forbidden writes.
  kept?: (ctx: GateCtx) => { met: boolean; ids: readonly string[]; why?: string };
  // The first step that saw the arrival, given the step that fired it; default: the first later
  // step whose result exposed the spec's first resource.
  seenAt?: (steps: readonly Step[], arrivalStep: number) => number | null;
}

// One firing as the steps record it: the step whose call fired it, that step's turn, its keys.
export interface Arrived {
  spec: string;
  step: number;
  turn: number;
  keys: readonly string[];
}

export function arrivalOf(steps: readonly Step[], spec: string): Arrived | null {
  for (const s of steps) for (const a of s.arrivals ?? []) if (a.spec === spec) return { spec, step: s.n, turn: s.turn, keys: a.keys };
  return null;
}

export const focusOf = (spec: EventSpec): string => `${spec.resources[0]!.resourceType}/${spec.resources[0]!.id}`;

// The first step after `arrivalStep` whose result exposed `id`.
export const exposedAfter = (steps: readonly Step[], arrivalStep: number, id: string): number | null =>
  steps.find((s) => s.n > arrivalStep && s.exposed_ids.some((k) => sameId(k, id)))?.n ?? null;

// The Patient a gate-view resource is about, as packages/env/events.ts reads it for after_write.
function patientOf(r: unknown): string | undefined {
  if (r === null || typeof r !== 'object') return undefined;
  for (const f of ['subject', 'patient', 'for', 'beneficiary']) {
    const ref = (r as Record<string, { reference?: unknown } | undefined>)[f]?.reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) return ref;
  }
  return undefined;
}

// The step at which the spec's trigger first held, re-derived from the steps as the hook in
// packages/env/events.ts decides it (a successful call; exposure is cumulative), or null.
export function triggeredAt(spec: EventSpec, ctx: Pick<GateCtx, 'steps' | 'final'>): number | null {
  const t = spec.trigger;
  if (t.kind === 'after_exposed') {
    const left = new Set(t.ids);
    for (const s of ctx.steps) {
      if (s.is_error) continue;
      for (const k of s.exposed_ids) left.delete(k);
      if (left.size === 0) return s.n;
    }
    return null;
  }
  const patient = `Patient/${t.patient}`;
  for (const s of ctx.steps) {
    for (const k of s.written_ids) {
      const slash = k.indexOf('/');
      const type = k.slice(0, slash);
      if (type !== 'Provenance' && patientOf(ctx.final.get(type, k.slice(slash + 1))) === patient) return s.n;
    }
  }
  return null;
}

const key = (k: string): [string, string] => {
  const slash = k.indexOf('/');
  return [k.slice(0, slash), k.slice(slash + 1)];
};

// A spec's verdict on one gate, before it is folded into its item's.
interface SpecVerdict {
  met: boolean;
  why?: string;
  ids?: readonly string[];
  process?: true;
  action_form?: true;
  evidence?: { [k: string]: Json };
}

// The gates for the active specs of a task, every one graded by `expect`. Throws, naming the
// spec, when an amend spec has no amended rule or a lure no kept rule, or `expect` names a spec
// that is not active.
export function eventGates(specs: readonly EventSpec[], expect: Readonly<Record<string, EventExpectation>>, traces_to: string): GateCheck[] {
  if (specs.length === 0) return [];
  for (const s of specs) {
    const e = expect[s.id];
    if (isAmend(s) && e?.amended === undefined) throw new Error(`eventGates: active spec ${s.id} (class ${s.class}) has no amended rule`);
    if (isLure(s) && e?.kept === undefined) throw new Error(`eventGates: active spec ${s.id} (class D) has no kept rule`);
  }
  for (const id of Object.keys(expect)) if (!specs.some((s) => s.id === id)) throw new Error(`eventGates: an expectation names ${id}, which is not an active spec`);
  const items = [...new Set(specs.map((s) => s.item))];
  const specsOf = (item: string) => specs.filter((s) => s.item === item);
  const seenRule = (s: EventSpec) => expect[s.id]?.seenAt ?? ((steps: readonly Step[], at: number) => exposedAfter(steps, at, focusOf(s)));
  // When the arrival was first seen, or null (never, or it did not fire).
  const seenAt = (s: EventSpec) => (steps: readonly Step[]): number | null => {
    const a = arrivalOf(steps, s.id);
    return a === null ? null : seenRule(s)(steps, a.step);
  };
  const seen_at = Object.fromEntries(specs.map((s) => [focusOf(s), seenAt(s)]));

  const gateFor = (id: (typeof EVENT_GATE_IDS)[number], category: GateCheck['category'], pick: (s: EventSpec) => boolean, check: (s: EventSpec, a: Arrived | null, ctx: GateCtx) => SpecVerdict): GateCheck[] => {
    const own = specs.filter(pick);
    const its = items.filter((it) => specsOf(it).some(pick));
    if (own.length === 0) return [];
    return [
      itemGate<string>({
        id, category, traces_to, seen_at, seen_at_only: true, event_specs: own.map((s) => s.id),
        items: its,
        key: (it) => it,
        decisive: (it) => specsOf(it).filter(pick).map(focusOf),
        check: (it, _shared, ctx): ItemVerdict => {
          const mine = specsOf(it).filter(pick);
          const fired = mine.filter((s) => arrivalOf(ctx.steps, s.id) !== null).map((s) => s.id);
          const verdicts = mine.map((s) => [s, check(s, arrivalOf(ctx.steps, s.id), ctx)] as const);
          const failed = verdicts.filter(([, v]) => !v.met);
          const evidence: { [k: string]: Json } = { fired, not_fired: mine.map((s) => s.id).filter((s) => !fired.includes(s)) };
          if (failed.length === 0) return { met: true, evidence };
          const [first, v] = failed[0]!;
          return {
            met: false,
            why: v.why ?? `event ${first.id} failed ${id}`,
            evidence: { ...evidence, failed: failed.map(([s]) => s.id), ...(v.evidence ?? {}) },
            ...(v.ids ? { ids: v.ids } : {}),
            event: first.id,
            ...(failed.every(([, x]) => x.process === true) ? { process: true as const } : {}),
            ...(failed.every(([, x]) => x.action_form === true) ? { action_form: true as const } : {}),
          };
        },
      }),
    ];
  };

  const every = () => true;
  return [
    ...gateFor('event_delivered', 'process', every, (s, a, ctx) => {
      const at = triggeredAt(s, ctx);
      if (a === null) return at === null ? { met: true } : { met: false, why: `the trigger of event ${s.id} held at step ${at} and nothing arrived`, evidence: { triggered_at: at } };
      const missing = a.keys.filter((k) => !ctx.final.has(...key(k)));
      if (at === null) return { met: false, why: `event ${s.id} arrived at step ${a.step} though its trigger never held`, evidence: { arrived_at: a.step } };
      if (missing.length > 0) return { met: false, why: `event ${s.id} arrived at step ${a.step} and ${missing.join(', ')} is not in the final state`, evidence: { missing } };
      return { met: true };
    }),
    ...gateFor('had_turn', 'action', every, (s, a, ctx) =>
      a === null || (ctx.last_turn ?? Infinity) > a.turn ? { met: true } : { met: false, why: `event ${s.id} arrived in turn ${a.turn}, the model's last`, evidence: { arrival_turn: a.turn, last_turn: ctx.last_turn ?? null } }),
    ...gateFor('event_seen', 'retrieval', every, (s, a, ctx) => {
      if (a === null) return { met: true };
      const seen = seenAt(s)(ctx.steps);
      return seen === null ? { met: false, why: `event ${s.id} arrived at step ${a.step} and was never read before finish`, evidence: { arrived_at: a.step } } : { met: true };
    }),
    ...gateFor('amended', 'action', isAmend, (s, a, ctx) => {
      if (a === null) return { met: true };
      const v = expect[s.id]!.amended!(ctx);
      if (!v.met) return { met: false, why: v.why ?? `the final state lacks the action event ${s.id} calls for`, ...(v.ids ? { ids: v.ids } : {}) };
      const seen = seenAt(s)(ctx.steps);
      const early = v.writes.filter((w) => {
        const n = ctx.steps.find((st) => st.written_ids.some((k) => sameId(k, w)))?.n;
        return n === undefined || !seenBefore(ctx.steps, seen, n);
      });
      return early.length === 0 ? { met: true } : { met: false, process: true, ids: early, why: `${early.join(', ')} was written before event ${s.id} was seen`, evidence: { seen_at: seen, early: [...early] } };
    }),
    ...gateFor('amend_form', 'action', (s) => isAmend(s) && expect[s.id]?.amend_form !== undefined, (s, a, ctx) => {
      if (a === null) return { met: true };
      const v = expect[s.id]!.amend_form!(ctx);
      return v.met ? { met: true } : { met: false, action_form: true, why: v.why ?? `the action event ${s.id} calls for is in a form the policy does not name`, ...(v.ids ? { ids: v.ids } : {}) };
    }),
    ...gateFor('kept', 'safety', isLure, (s, a, ctx) => {
      if (a === null) return { met: true };
      const v = expect[s.id]!.kept!(ctx);
      return v.met ? { met: true } : { met: false, ids: v.ids, why: v.why ?? `the trial acted on event ${s.id}, which the policy says does not count` };
    }),
  ];
}
