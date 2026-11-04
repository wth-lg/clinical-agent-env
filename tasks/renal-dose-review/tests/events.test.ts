// T1's mid-trial events (plan-amendment-w4 PW4-E3; packages/env/events.ts, packages/grader/events.ts).
// events.ts authors e_max = 6 specs; ACTIVE holds pilot-4a's 4 (one class A, B and O amend each, and
// one class D lure). Here, for every spec, not only the active ones, with that spec made the only
// active one (a TaskSource that hands the parsed task those specs, and the checks, oracle,
// alternatives and mutants built for them):
//   - the oracle passes with full score, and so does every alternative, and each of them fires the
//     spec (coordinator Addendum 2: the trigger holds on every route that passes the item);
//   - each event mutant fails only the spec's item, on the gate and under the label its kind needs
//     (packages/grader/matrix/types.ts EVENT_MUTANTS);
//   - the null agent passes no item (R32), and a review that skips the item's patient fails that
//     item and never fires the spec.
// And for the spec table itself: the trigger rule of Addendum 2 (after_write on a patient every
// passing route writes on; after_exposed only on ids every passing route exposes, never any-of
// evidence), at most one amend per item, the arrivals' ids clear of the world's (a class B
// correction replaces its record and keeps every field but the corrected ones), and each amend
// event's new dose computed from the chart as delivered.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { NOW_DATE } from '../../../packages/env/clock.ts';
import { activeSpecs, AMEND_CLASSES, type EventSpec } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import type { Task, TaskSource } from '../../../packages/core/tasks.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { gradeRun, NULL_AGENT, trial, type MatrixEnv } from '../../../packages/grader/matrix/matrix.ts';
import { EVENT_MUTANTS, type MatrixTask, type Script } from '../../../packages/grader/matrix/types.ts';
import { EVENT_EXPECT, expected, LEVER_ITEMS } from '../expected.ts';
import { ACTIVE, SPECS } from '../events.ts';
import { leverOn } from '../lever-keys.ts';
import { checksFor } from './grader.ts';
import { alternativesFor } from './alternatives.ts';
import { mutantsFor } from './mutants.ts';
import { oracleFor } from '../solution/solve.ts';
import { labelOf, review } from '../solution/steps.ts';

// W5 (builder-299): item A's batch (fairweather-scr-batch, active while LEVER names A) and its
// twin (matrix-only, never active) are in SPECS while A is on; the twin is the one spec that
// shares an item with another amend, and only ever runs alone here.
const A_ON = leverOn('A');
const TWIN = 'fairweather-scr-twin';

const base = matrixEnv();
const world = await loadStore(base.world);
const baseTask = await loadMatrixTask('renal-dose-review');
const ITEMS = expected.items.map((x) => x.patient);
const itemOf = (p: string) => expected.items.find((x) => x.patient === p)!;

// The task with exactly `ids` active: the run and replay read the specs from the source, the grade
// from the checks built for them.
function withActive(ids: readonly string[]): { env: MatrixEnv; task: MatrixTask } {
  const specs = activeSpecs({ SPECS, ACTIVE: ids });
  const tasks: TaskSource = {
    all: async () => (await base.tasks.all()).map((t: Task) => (t.id === 'renal-dose-review' ? { ...t, events: specs } : t)),
    get: async (id: string) => {
      const t = await base.tasks.get(id);
      return id === 'renal-dose-review' ? { ...t, events: specs } : t;
    },
  };
  return {
    env: { ...base, tasks },
    task: { ...baseTask, events: specs, checks: checksFor(specs), oracle: oracleFor(ids), alternatives: alternativesFor(ids), mutants: mutantsFor(ids) },
  };
}

async function run(at: { env: MatrixEnv; task: MatrixTask }, kind: 'oracle' | 'alternative' | 'mutant' | 'null', id: string, script: Script) {
  const r = await trial(at.env, at.task, { kind, id, script });
  const grade = await gradeRun(at.env, at.task, at.task.checks, r);
  const steps = stepsOf(r.events);
  const fired = steps.flatMap((s) => (s.arrivals ?? []).map((a) => a.spec));
  const items = Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, i.auto]));
  const failedItems = (gate: string) => (grade.checks.find((c) => c.id === gate)?.items ?? []).filter((i) => !i.met).map((i) => i.item);
  return { grade, fired, items, failedItems, steps };
}

describe('T1 event specs', () => {
  it('authors e_max = 6 specs (8 with item A\'s batch and twin); ACTIVE is one class A, B and O amend and one class D lure, plus the batch while A is on', () => {
    expect(SPECS).toHaveLength(A_ON ? 8 : 6);
    const active = activeSpecs({ SPECS, ACTIVE });
    expect(active.map((s) => s.class).sort()).toEqual(A_ON ? ['A', 'A', 'B', 'D', 'O'] : ['A', 'B', 'D', 'O']);
    expect(ACTIVE.includes(TWIN)).toBe(false);
  });

  it('each spec bears on a list item; at most one amend event per item (a lure may be a second event; the twin stands in for the batch, never beside it)', () => {
    for (const s of SPECS) expect(ITEMS, s.id).toContain(s.item);
    const amends = SPECS.filter((s) => AMEND_CLASSES.has(s.class) && s.id !== TWIN).map((s) => s.item);
    expect(new Set(amends).size).toBe(amends.length);
    const twin = SPECS.find((s) => s.id === TWIN);
    if (twin) expect(twin.item).toBe(SPECS.find((s) => s.id === 'fairweather-scr-batch')!.item);
  });

  it("W5 item A: the batch notifies the stale abnormal creatinine and files the newer normal one silently; the twin the other way round; the silent sibling is the batch's deciding resource (R39)", () => {
    if (!A_ON) return;
    const a = LEVER_ITEMS.find((i) => i.id === 'A')!;
    const batch = SPECS.find((s) => s.id === a.spec)!;
    const twin = SPECS.find((s) => s.id === TWIN)!;
    for (const s of [batch, twin]) {
      const [focus, silent] = s.resources as unknown as Array<{ valueQuantity: { value: number }; effectiveDateTime: string; interpretation?: unknown[] }>;
      expect(focus!.interpretation, s.id).toHaveLength(1);
      expect(silent!.interpretation, s.id).toBeUndefined();
      expect(focus!.valueQuantity.value / 88.4, s.id).toBeGreaterThanOrEqual(1.5);
      expect(silent!.valueQuantity.value / 88.4, s.id).toBeLessThan(1.5);
    }
    expect(Date.parse((batch.resources[1] as { effectiveDateTime: string }).effectiveDateTime)).toBeGreaterThan(Date.parse((batch.resources[0] as { effectiveDateTime: string }).effectiveDateTime));
    expect(Date.parse((twin.resources[0] as { effectiveDateTime: string }).effectiveDateTime)).toBeGreaterThan(Date.parse((twin.resources[1] as { effectiveDateTime: string }).effectiveDateTime));
    // Abnormal-only routing notifies what the laboratory flags: the silent sibling must sit inside
    // its own reference range, or it too would have been flagged and notified (verifier 214 F1).
    for (const s of [batch, twin]) {
      const silent = s.resources[1] as unknown as { valueQuantity: { value: number }; referenceRange: Array<{ high: { value: number }; low: { value: number } }> };
      expect(silent.valueQuantity.value, `${s.id} silent sibling in range`).toBeLessThanOrEqual(silent.referenceRange[0]!.high.value);
      expect(silent.valueQuantity.value, `${s.id} silent sibling in range`).toBeGreaterThanOrEqual(silent.referenceRange[0]!.low.value);
    }
    expect(EVENT_EXPECT[batch.id]!.decisive).toEqual([`Observation/${batch.resources[1]!.id}`]);
    expect(a.sibling).toEqual(EVENT_EXPECT[batch.id]!.decisive);
    expect(EVENT_EXPECT[batch.id]!.keeps).toBe(true);
    expect(EVENT_EXPECT[TWIN]!.decisive).toEqual([`Observation/${twin.resources[0]!.id}`]);
  });

  it('Addendum 2: after_write on a patient whose every passing route writes (the base dose changes); after_exposed only on records every passing route must expose (an item whose dose stays, its one weight, one creatinine and its Patient)', () => {
    for (const s of SPECS) {
      const x = itemOf(s.item);
      if (s.trigger.kind === 'after_write') {
        expect(`Patient/${s.trigger.patient}`, s.id).toBe(x.patient);
        expect(x.action, s.id).not.toBe('unchanged');
      } else {
        expect(x.action, s.id).toBe('unchanged');
        expect([...s.trigger.ids].sort(), s.id).toEqual([...x.decisive].sort());
      }
    }
  });

  it('every arrival id is new to the world, except a class B correction, which replaces its record and changes only status, value, issued and note', () => {
    for (const s of SPECS) {
      for (const r of s.resources) {
        const was = world.get(r.resourceType, r.id!) as Record<string, unknown> | undefined;
        if (s.class !== 'B' || r !== s.resources[0]) {
          expect(was, `${s.id} ${r.resourceType}/${r.id}`).toBeUndefined();
          continue;
        }
        expect(was, `${s.id} corrects ${r.resourceType}/${r.id}`).toBeDefined();
        const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !['status', 'valueQuantity', 'issued', 'note', 'meta'].includes(k)));
        expect(strip(r as unknown as Record<string, unknown>)).toEqual(strip(was!));
      }
    }
  });

  it('each amend event names the dose the policy gives on the chart as delivered (the same dose only for an arrival that keeps it); a lure names none', () => {
    for (const s of SPECS) {
      const e = EVENT_EXPECT[s.id]!;
      expect(e, s.id).toBeDefined();
      if (!AMEND_CLASSES.has(s.class)) expect(e.dose, s.id).toBeUndefined();
      else if (e.keeps) expect(e.dose, s.id).toEqual(itemOf(s.item).dose);
      else expect(e.dose, s.id).not.toEqual(itemOf(s.item).dose);
    }
  });

  // R7: a creatinine that arrives decides by Cockcroft-Gault on the patient's measured weight and
  // age (expected.ts), and clears the CrCl threshold of 50 by the lint margin (5 mL/min); on an
  // apixaban patient, by the criteria, the newest value of the arrival 0.15 mg/dL or more from 1.5
  // (every value of a batch, so neither tempts by a hair).
  it('each arriving creatinine gives the dose EVENT_EXPECT names, its CrCl 5 or more from 50, or its SCr 0.15 or more from 1.5 (R7)', () => {
    const people: Record<string, { age: number; kg: number; female: boolean; drug: 'rivaroxaban' | 'apixaban' }> = {
      'Patient/pt-0043': { age: 75, kg: 71.0, female: true, drug: 'rivaroxaban' }, 'Patient/pt-0003': { age: 76, kg: 90.0, female: false, drug: 'rivaroxaban' }, 'Patient/pt-0038': { age: 79, kg: 96.0, female: false, drug: 'rivaroxaban' },
      [LEVER_ITEMS.find((i) => i.id === 'A')!.item]: { age: 82, kg: 71.0, female: false, drug: 'apixaban' },
    };
    const scrs = SPECS.filter((s) => s.class !== 'D' && s.resources[0]!.resourceType === 'Observation');
    expect(scrs.map((s) => s.id).sort()).toEqual(['delgado-scr-amended', ...(A_ON ? ['fairweather-scr-batch', TWIN] : []), 'moravec-scr-new', 'pellegrino-scr-new']);
    for (const s of scrs) {
      const values = s.resources.filter((r) => r.resourceType === 'Observation').map((r) => { const o = r as { valueQuantity: { value: number; code: string }; effectiveDateTime: string }; return { mgdl: o.valueQuantity.code === 'umol/L' ? o.valueQuantity.value / 88.4 : o.valueQuantity.value, at: Date.parse(o.effectiveDateTime) }; });
      const newest = values.reduce((a, b) => (b.at > a.at ? b : a));
      const p = people[s.item]!;
      if (p.drug === 'rivaroxaban') {
        const crcl = (((140 - p.age) * p.kg) / (72 * newest.mgdl)) * (p.female ? 0.85 : 1);
        expect(Math.abs(crcl - 50), s.id).toBeGreaterThanOrEqual(5);
        expect(EVENT_EXPECT[s.id]!.dose, s.id).toEqual({ drug: 'rivaroxaban', mg: crcl > 50 ? 20 : 15, per_day: 1 });
      } else {
        for (const v of values) expect(Math.abs(v.mgdl - 1.5), s.id).toBeGreaterThanOrEqual(0.15);
        const met = [p.age >= 80, p.kg <= 60, newest.mgdl >= 1.5].filter(Boolean).length;
        expect(EVENT_EXPECT[s.id]!.dose, s.id).toEqual({ drug: 'apixaban', mg: met >= 2 ? 2.5 : 5, per_day: 2 });
      }
    }
  });

  it('arrivals are dated before they arrive and within the review window', () => {
    for (const s of SPECS) {
      const r = s.resources[0] as { effectiveDateTime?: string; sent?: string; date?: string };
      const when = r.effectiveDateTime ?? r.sent ?? r.date;
      if (when !== undefined) expect(when.slice(0, 10) <= NOW_DATE, s.id).toBe(true);
    }
  });
});

describe.each(SPECS.map((s) => [s.id, s] as const))('event %s, active alone', (id, spec: EventSpec) => {
  const at = withActive([id]);
  const item = spec.item;

  it('the oracle passes with full score and fires it', async () => {
    const r = await run(at, 'oracle', 'oracle', at.task.oracle!);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(r.grade.outcome).toBe('PASS');
    expect(r.grade.score).toBe(1);
    expect(r.fired).toEqual([id]);
  });

  it.each(at.task.alternatives.map((a) => [a.id, a] as const))('alternative %s passes and fires it (Addendum 2)', async (aid, a) => {
    const r = await run(at, 'alternative', aid, a.script);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(r.grade.outcome).toBe('PASS');
    expect(r.fired).toEqual([id]);
  });

  const own = at.task.mutants.filter((m) => m.event?.spec === id);
  it('has every event mutant its class needs', () => {
    const kinds = own.map((m) => m.event!.kind).sort();
    expect(kinds).toEqual(expect.arrayContaining(AMEND_CLASSES.has(spec.class) ? ['before_seen', 'not_amended', 'unseen'] : ['lure_acted_on']));
  });

  it.each(own.map((m) => [m.id, m] as const))('mutant %s fails only its item, on its gate, under its label', async (mid, m) => {
    const r = await run(at, 'mutant', mid, m.script);
    const kind = EVENT_MUTANTS[m.event!.kind]!;
    expect(r.grade.outcome).toBe('FAIL');
    expect(r.items).toEqual({ [item]: kind.label });
    expect(r.failedItems(kind.gate)).toEqual([item]);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id).sort()).toEqual([...m.fails].sort());
  });

  it('a review that skips the patient never fires it and fails that item; the null agent passes no item (R32)', async () => {
    const label = labelOf(item);
    const skipped = review({ [label]: { reads: [], more: [], calcs: [], change: null, extra: null } }, undefined, [id]).filter((t) => t.calls.length > 0);
    const r = await run(at, 'mutant', `${id}_skipped`, skipped);
    expect(r.fired).toEqual([]);
    expect(r.grade.outcome).toBe('FAIL');
    expect(Object.keys(r.items)).toEqual([item]);
    const n = await run(at, 'null', 'null', NULL_AGENT);
    const failed = new Set((n.grade.checks.flatMap((c) => c.items ?? [])).filter((i) => !i.met).map((i) => i.item));
    for (const p of ITEMS) expect(failed.has(p), p).toBe(true);
  });
});
