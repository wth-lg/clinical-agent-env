// T4's mid-trial events (events.ts; plan-amendment-w4 PW4-E3; W5-E), tested beyond the 5 the matrix
// runs with events.ts ACTIVE:
//   1. The spec list keeps the plan's shape: 11 specs, ACTIVE 4 (3 amend events, class O among them,
//      and 1 lure) plus the A lever item's event while A is in LEVER, at most one amend event per
//      item among the active specs (the A-twin shares its item and never runs with it, EXCLUSIVE),
//      every trigger a write on the item's patient.
//   2. No arrival is in the world before its trigger (an arrival id is new, or, for kim-k2, the
//      record it amends differs from it), and its inbox Task says nothing that decides it (R29).
//   3. Delivered double derivation: policy.ts applied to the world with the arrival added gives the
//      action tests/grader.ts grades as delivered (R16), and for a lure the item it gave before (R19).
//   4. Each spec alone, active: its event mutants fail only its item under their label and its
//      alternatives pass (the matrix's own case verdicts), and its trigger fires on every passing
//      alternative.
//   5. Every passing route fires every trigger (brief addendum 2): the oracle and each matrix
//      alternative, run with all 9 specs active, fire all 9.
//   6. The null agent passes no item (R32), and a reviewer who skips a patient fires none of that
//      patient's events (patient_skipped_roberts).
//   (R38(b)'s inbox cases are in the matrix: alternatives arrival_items_completed and
//   arrival_item_cancelled_blind_then_read, mutant arrival_item_cancelled_blind.)
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { activeSpecs, ARRIVAL_SUMMARY, type EventSpec } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import type { TaskSource } from '../../../packages/core/tasks.ts';
import { type MatrixEnv, runMatrix, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { MatrixTask, WorldView } from '../../../packages/grader/matrix/types.ts';
import * as events from '../events.ts';
import { ACTIVE, EXCLUSIVE, leverSpecs, SPECS } from '../events.ts';
import { expected, type Item } from '../expected.ts';
import { LEVER } from '../lever.ts';
import { MARGINS } from '../../../packages/env/lint/index.ts';
import { derive } from '../policy.ts';
import { route } from '../solution/steps.ts';
import { alternatives } from './alternatives.ts';
import { eventAlternatives, eventMutants } from './event-cases.ts';
import { checksFor } from './grader.ts';
import { mutants } from './mutants.ts';

const ID = 'discharge-medrec';
const base = nodeTaskSource({ testMode: true });
// The task source with `specs` as the task's active specs, as tasks/<id>/events.ts would give them.
const withSpecs = (specs: readonly EventSpec[]): TaskSource => ({ all: () => base.all(), get: async (id) => ({ ...(await base.get(id)), ...(id === ID ? { events: specs } : {}) }) });
const envWith = (specs: readonly EventSpec[]): MatrixEnv => matrixEnv(undefined, withSpecs(specs));
const spec = (id: string) => SPECS.find((s) => s.id === id)!;
const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const view = (rs: readonly (typeof all)[number][]): WorldView => ({ get: (type, rid) => rs.find((r) => r.resourceType === type && r.id === rid), all: (type) => (type === undefined ? rs : rs.filter((r) => r.resourceType === type)) });
const itemOf = (key: string) => expected.items.find((x) => x.key === key)!;
const JUDGED = new Set(['flag_outside_drug', 'flag_fill_gap']);

describe('discharge-medrec events', () => {
  it('11 specs; ACTIVE is 3 amend events, one of class O, 1 lure and the A lever event while A is active, one event per item; each trigger is a write on its patient', () => {
    expect(SPECS).toHaveLength(11);
    const active = activeSpecs(events);
    expect(active.map((s) => s.id)).toEqual(['kim-k1', 'kim-d2', 'stark-s1', 'roberts-r1', ...leverSpecs(LEVER)]);
    expect(leverSpecs(LEVER)).toEqual(LEVER.includes('A') ? ['whitcomb-a1'] : []);
    expect(active.filter((s) => s.class !== 'D')).toHaveLength(3 + leverSpecs(LEVER).length);
    expect(active.filter((s) => s.class === 'D')).toHaveLength(1);
    expect(active.some((s) => s.class === 'O')).toBe(true);
    expect(new Set(active.map((s) => s.item)).size).toBe(active.length);
    // One amend event per item in SPECS, except the A-twin, which shares the A event's item and is
    // never active with it.
    for (const item of new Set(SPECS.map((s) => s.item))) expect(SPECS.filter((s) => s.item === item && s.class !== 'D' && s.id !== 'whitcomb-a1-twin').length, item).toBeLessThanOrEqual(1);
    expect(EXCLUSIVE).toEqual([['whitcomb-a1', 'whitcomb-a1-twin']]);
    for (const [a, b] of EXCLUSIVE) expect(ACTIVE.includes(a) && ACTIVE.includes(b), `${a} with ${b}`).toBe(false);
    // The batch's values clear §7's 5.0 by the lint margin, in both specs (the margins lint reads
    // the world, not events.ts).
    for (const id of ['whitcomb-a1', 'whitcomb-a1-twin']) for (const r of spec(id).resources as unknown as Array<{ valueQuantity?: { value?: number } }>) expect(Math.abs(r.valueQuantity!.value! - 5.0), id).toBeGreaterThanOrEqual(MARGINS.potassium);
    for (const s of SPECS) {
      const x = itemOf(s.item);
      expect(x, s.id).toBeDefined();
      expect(s.trigger, s.id).toEqual({ kind: 'after_write', patient: x.patient.slice('Patient/'.length) });
    }
  });

  it('no arrival is in the world before its trigger; kim-k2 amends the addendum in place; every inbox summary is generic', () => {
    for (const s of SPECS) {
      for (const r of s.resources) {
        const there = store.get(r.resourceType, r.id!);
        if (s.id === 'kim-k2') {
          expect(there, s.id).toBeDefined();
          expect(JSON.stringify(there)).not.toEqual(JSON.stringify(r));
        } else expect(there, `${s.id}: ${r.resourceType}/${r.id}`).toBeUndefined();
      }
    }
    // The summaries name no fact (R29); the Task text is the core's, per focus type.
    expect(Object.values(ARRIVAL_SUMMARY)).toEqual(['New result', 'New result', 'Outside document received', 'New message']);
  });

  describe('delivered double derivation (R16, R19)', () => {
    // The world with `s`'s resources put, each stamp field set to a time after NOW.
    const delivered = (s: EventSpec) => {
      const put = s.resources.map((r) => {
        const c = structuredClone(r) as unknown as Record<string, unknown>;
        for (const f of s.stampFields) if (f.startsWith(`${r.resourceType}/${r.id}.`)) c[f.slice(f.lastIndexOf('.') + 1)] = '2026-10-23T08:00:03.001-04:00';
        return c as unknown as (typeof all)[number];
      });
      const keys = new Set(put.map((r) => `${r.resourceType}/${r.id}`));
      return view([...all.filter((r) => !keys.has(`${r.resourceType}/${r.id}`)), ...put]);
    };
    const derived = (s: EventSpec, key: string) => (derive(delivered(s)) as unknown as { items: Item[] }).items.find((x) => x.key === key);
    const pick = (x: Item | undefined) => (x === undefined ? undefined : { kind: x.kind, daily_mg: x.daily_mg, per_day: x.per_day, due: x.due });

    it('kim-k1: the repeat panel resumes lisinopril at 10 mg daily (§2, §7)', () => expect(pick(derived(spec('kim-k1'), 'kim-lisinopril'))).toEqual({ kind: 'resume', daily_mg: 10, per_day: 1, due: undefined }));
    it('kim-k2: the amended addendum makes furosemide 40 mg once daily (§1)', () => expect(pick(derived(spec('kim-k2'), 'kim-furosemide'))).toEqual({ kind: 'dose', daily_mg: 40, per_day: 1, due: undefined }));
    it('stark-s1: the signed addendum continues carvedilol at his home 6.25 mg twice daily, so no change is left to make (§1, §4)', () => expect(derived(spec('stark-s1'), 'stark-carvedilol')).toBeUndefined());
    it('stark-s2: with the mail-order fills, atorvastatin is no longer a fill gap (§5b)', () => expect(derived(spec('stark-s2'), 'stark-atorvastatin')).toBeUndefined());
    it('roberts-r1: the 10/23 potassium of 5.5 holds lisinopril, with a Task due 10/25 to 10/30 (§7)', () => expect(pick(derived(spec('roberts-r1'), 'roberts-lisinopril'))).toEqual({ kind: 'hold', daily_mg: undefined, per_day: undefined, due: { from: '2026-10-25', to: '2026-10-30' } }));
    // W5-E: the batch leaves the resume (its most recent potassium is the silent 4.6); the twin, whose
    // notified 5.4 is the newest, holds it with a Task due 10/24 to 10/29.
    it('whitcomb-a1: the batch leaves the resume as it was, its silent 4.6 now the potassium the resume rests on (§7, §8; R38(d))', () => {
      const base = itemOf('whitcomb-lisinopril');
      const [summary, _k, scr] = base.decisive;
      expect(derived(spec('whitcomb-a1'), 'whitcomb-lisinopril')).toEqual(JSON.parse(JSON.stringify({ ...base, decisive: [summary, 'Observation/obs-09004', scr] })));
    });
    it('whitcomb-a1-twin: the notified 5.4 at 16:30 holds lisinopril, with a Task due 10/24 to 10/29 (§7)', () => expect(pick(derived(spec('whitcomb-a1-twin'), 'whitcomb-lisinopril'))).toEqual({ kind: 'hold', daily_mg: undefined, per_day: undefined, due: { from: '2026-10-24', to: '2026-10-29' } }));
    for (const id of ['kim-d1', 'kim-d2', 'kim-d4', 'stark-d5']) {
      it(`${id}: a lure leaves its item as it was`, () => {
        const s = spec(id);
        expect(derived(s, s.item)).toEqual(JSON.parse(JSON.stringify(itemOf(s.item))));
        expect((derive(delivered(s)) as unknown as { items: Item[] }).items).toEqual(JSON.parse(JSON.stringify(expected.items)));
      });
    }
  });

  describe('each spec alone, active', () => {
    for (const s of SPECS) {
      it(`${s.id} (${s.class}, ${s.item}): its event mutants fail only its item under their label, its alternatives pass and fire it`, { timeout: 600_000 }, async () => {
        const loaded = await loadMatrixTask(ID);
        const muts = eventMutants(s.id, [s.id]).map((m) => ({ ...m, loses: m.loses.filter((l) => !JUDGED.has(l)) }));
        const alts = eventAlternatives(s.id, [s.id]);
        // The lever declarations follow the one active spec: the A item (and its agents) is active
        // only when its event is the spec under test.
        const leverActive = (loaded.lever?.active ?? []).filter((l) => l !== 'A' || s.id === 'whitcomb-a1');
        const task: MatrixTask = {
          ...loaded,
          events: [s],
          checks: checksFor([s]).filter((c) => !JUDGED.has(c.id)),
          oracle: route({ active: [s.id] }),
          alternatives: alts,
          mutants: muts,
          declares: { ...loaded.declares, traps: [...new Set(muts.map((m) => m.trap))] },
          ...(loaded.lever ? { lever: { ...loaded.lever, active: leverActive } } : {}),
          agents: { ...loaded.agents, ...(s.id === 'whitcomb-a1' && loaded.agents.lever ? { lever: loaded.agents.lever } : { lever: {} }) },
        };
        const res = await runMatrix(envWith([s]), task, { cases: ['oracle', ...alts.map((a) => a.id), ...muts.map((m) => m.id)], trials: 1, regrades: 1 });
        expect(res.results.length, res.lines.join('\n')).toBe(1 + alts.length + muts.length);
        for (const r of res.results) expect(r.problems, `${r.case.kind} ${r.case.id}\n${res.lines.join('\n')}`).toEqual([]);
        for (const r of res.results.filter((x) => x.case.kind !== 'mutant')) {
          const fired = r.grade.checks.find((c) => c.id === 'event_delivered')?.items?.find((i) => i.item === s.item)?.evidence.fired;
          expect(fired, `${r.case.id} fires ${s.id}`).toContain(s.id);
        }
      });
    }
  });

  it('the oracle and every matrix alternative fire all 11 triggers', { timeout: 600_000 }, async () => {
    const env = envWith(SPECS);
    const task = await loadMatrixTask(ID);
    for (const c of [{ id: 'oracle', script: route() }, ...alternatives]) {
      const run = await trial(env, { ...task, events: SPECS }, { kind: 'alternative', id: c.id, script: c.script });
      const fired = run.events.flatMap((e) => (e.type === 'env_event' ? [(e as unknown as { spec: string }).spec] : []));
      expect(new Set(fired), c.id).toEqual(new Set(SPECS.map((x) => x.id)));
    }
  });

  it('the null agent passes no item (R32); skipping a patient fires none of their events', { timeout: 600_000 }, async () => {
    const res = await runMatrix(matrixEnv(), await loadMatrixTask(ID), { cases: ['null', 'patient_skipped_roberts'], trials: 1, regrades: 1 });
    const nul = res.results.find((r) => r.case.kind === 'null')!;
    expect(new Set((nul.grade.attribution?.items ?? []).map((i) => i.item))).toEqual(new Set(expected.items.map((x) => x.key)));
    const skipped = res.results.find((r) => r.case.id === 'patient_skipped_roberts')!;
    const delivered = skipped.grade.checks.find((c) => c.id === 'event_delivered')!.items!.find((i) => i.item === 'roberts-lisinopril')!;
    expect(delivered.evidence.fired).toEqual([]);
    expect(mutants.some((m) => m.id === 'patient_skipped_roberts')).toBe(true);
    expect(ACTIVE).toContain('roberts-r1');
  });
});
