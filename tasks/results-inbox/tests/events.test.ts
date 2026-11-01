// T2's mid-trial events (plan-amendment-w4 PW4-E3; packages/env/events.ts, packages/grader/events.ts).
// events.ts authors e_max = 8 specs; ACTIVE holds pilot-4a's 4 (a class A, B and O amend and a class
// D lure). Here, for every spec, not only the active ones, with that spec made the only active one (a
// TaskSource that hands the parsed task those specs, and the checks, oracle, alternatives and mutants
// built for them):
//   - the oracle passes with full score, and so does every alternative, and each of them fires the
//     spec (coordinator Addendum 2: the trigger holds on every route that passes the item);
//   - each event mutant fails only the spec's item, on the gate and under the label its kind needs
//     (packages/grader/matrix/types.ts EVENT_MUTANTS);
//   - the null agent passes no item (R32), and a review that skips the item's patient never fires
//     the spec and fails that patient's items only.
// And for the spec table itself: every trigger is after_write on the item's patient (every passing
// route completes the patient's inbox items, a write about the patient), at most one amend per item,
// the arrivals' ids clear of the world's (a class B correction replaces its record and keeps every
// field but the corrected ones), the inbox summaries generic, and the numbers clear their lines.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { NOW_DATE } from '../../../packages/env/clock.ts';
import { activeSpecs, AMEND_CLASSES, type EventSpec } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import type { Task, TaskSource } from '../../../packages/core/tasks.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { gradeRun, NULL_AGENT, trial, type MatrixEnv } from '../../../packages/grader/matrix/matrix.ts';
import { EVENT_MUTANTS, type MatrixTask, type Script } from '../../../packages/grader/matrix/types.ts';
import { EVENTS, expected } from '../expected.ts';
import { ACTIVE, EXCLUSIVE, SPECS } from '../events.ts';
import { checksFor } from './grader.ts';
import { alternativesFor } from './alternatives.ts';
import { mutantsFor } from './mutants.ts';
import { oracleFor, skipPatient } from '../solution/solve.ts';

const base = matrixEnv();
const world = await loadStore(base.world);
const baseTask = await loadMatrixTask('results-inbox');
const ITEMS = expected.items.map((x) => x.key);
const itemOf = (key: string) => expected.items.find((x) => x.key === key)!;

// The task with exactly `ids` active: the run and replay read the specs from the source, the grade
// from the checks built for them.
function withActive(ids: readonly string[]): { env: MatrixEnv; task: MatrixTask } {
  const specs = activeSpecs({ SPECS, ACTIVE: ids });
  const tasks: TaskSource = {
    all: async () => (await base.tasks.all()).map((t: Task) => (t.id === 'results-inbox' ? { ...t, events: specs } : t)),
    get: async (id: string) => {
      const t = await base.tasks.get(id);
      return id === 'results-inbox' ? { ...t, events: specs } : t;
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
  const failedGates = grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id);
  return { grade, fired, items, failedItems, failedGates, steps };
}

describe('T2 event specs', () => {
  it('authors e_max = 8 specs; ACTIVE is one class A, B and O amend and one class D lure', () => {
    expect(SPECS).toHaveLength(8);
    const active = activeSpecs({ SPECS, ACTIVE });
    expect(active.map((s) => s.class).sort()).toEqual(['A', 'B', 'D', 'O']);
  });

  it('each spec bears on a list item; at most one amend event per item (a lure may be a second event)', () => {
    for (const s of SPECS) expect(ITEMS, s.id).toContain(s.item);
    const amends = SPECS.filter((s) => AMEND_CLASSES.has(s.class)).map((s) => s.item);
    expect(new Set(amends).size).toBe(amends.length);
    const lures = SPECS.filter((s) => s.class === 'D').map((s) => s.item);
    expect(new Set(lures).size).toBe(lures.length);
  });

  it('ACTIVE holds no mutually exclusive pair; each pair is an amend and a lure on one item', () => {
    for (const [a, b] of EXCLUSIVE) {
      expect([a, b].every((id) => ACTIVE.includes(id)), `${a} with ${b}`).toBe(false);
      const [sa, sb] = [SPECS.find((s) => s.id === a)!, SPECS.find((s) => s.id === b)!];
      expect(sa.item).toBe(sb.item);
      expect([AMEND_CLASSES.has(sa.class), sb.class]).toEqual([true, 'D']);
    }
  });

  it("Addendum 2: every trigger is after_write on the item's own patient, whose inbox items every passing route completes", () => {
    for (const s of SPECS) {
      expect(s.trigger.kind, s.id).toBe('after_write');
      if (s.trigger.kind === 'after_write') expect(`Patient/${s.trigger.patient}`, s.id).toBe(itemOf(s.item).patient);
    }
  });

  it('every arrival id is new to the world, except a class B correction, which replaces its record and changes only status, value, issued, note, conclusion and text', () => {
    const CORRECTABLE = ['status', 'valueQuantity', 'issued', 'note', 'meta', 'conclusion', 'presentedForm'];
    for (const s of SPECS) {
      for (const r of s.resources) {
        const was = world.get(r.resourceType, r.id!) as Record<string, unknown> | undefined;
        if (s.class !== 'B' || r !== s.resources[0]) {
          expect(was, `${s.id} ${r.resourceType}/${r.id}`).toBeUndefined();
          continue;
        }
        expect(was, `${s.id} corrects ${r.resourceType}/${r.id}`).toBeDefined();
        const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !CORRECTABLE.includes(k)));
        expect(strip(r as unknown as Record<string, unknown>)).toEqual(strip(was!));
        expect((r as { status?: string }).status, s.id).toBe('corrected');
      }
    }
  });

  it('each amend event names what changes on the chart as delivered; a lure names nothing', () => {
    for (const s of SPECS) {
      const e = EVENTS[s.id];
      expect(e, s.id).toBeDefined();
      if (AMEND_CLASSES.has(s.class)) expect(e!.action, s.id).not.toBe('unchanged');
      else expect(e!.action, s.id).toBe('unchanged');
    }
  });

  it('arrivals are dated on or before today, and an arriving creatinine or potassium clears its line by the lint margin (R7)', () => {
    for (const s of SPECS) {
      const r = s.resources[0] as { effectiveDateTime?: string; date?: string };
      const when = r.effectiveDateTime ?? r.date;
      expect(when, s.id).toBeDefined();
      expect(when!.slice(0, 10) <= NOW_DATE, s.id).toBe(true);
    }
    for (const [id, e] of Object.entries(EVENTS)) for (const m of e.margins ?? []) expect(Math.abs(m.value - m.line), `${id}: ${m.what}`).toBeGreaterThanOrEqual(m.margin);
  });
});

describe.each(SPECS.map((s) => [s.id, s] as const))('event %s, active alone', (id, spec: EventSpec) => {
  const at = withActive([id]);
  const item = spec.item;

  it('the oracle passes with full score and fires it', async () => {
    const r = await run(at, 'oracle', 'oracle', at.task.oracle!);
    expect(r.failedGates).toEqual([]);
    expect(r.grade.outcome).toBe('PASS');
    expect(r.grade.score).toBe(1);
    expect(r.fired).toEqual([id]);
  });

  it.each(at.task.alternatives.map((a) => [a.id, a] as const))('alternative %s passes and fires it (Addendum 2)', async (aid, a) => {
    const r = await run(at, 'alternative', aid, a.script);
    expect(r.failedGates).toEqual([]);
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
    expect([...r.failedGates].sort()).toEqual([...m.fails].sort());
  });

  it("a review that skips the item's patient never fires it and fails only that patient's items; the null agent passes no item (R32)", async () => {
    const patient = itemOf(item).patient;
    const r = await run(at, 'mutant', `${id}_skipped`, skipPatient(patient, [id]));
    expect(r.fired).toEqual([]);
    expect(r.grade.outcome).toBe('FAIL');
    const mine = expected.items.filter((x) => x.patient === patient).map((x) => x.key);
    expect(Object.keys(r.items)).toContain(item);
    for (const k of Object.keys(r.items)) expect(mine, k).toContain(k);
    const n = await run(at, 'null', 'null', NULL_AGENT);
    const failed = new Set(n.grade.checks.flatMap((c) => c.items ?? []).filter((i) => !i.met).map((i) => i.item));
    for (const k of ITEMS) expect(failed.has(k), k).toBe(true);
  });
});
