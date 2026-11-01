// T4's mid-trial events (events.ts; plan-amendment-w4 PW4-E3), tested beyond the 4 the matrix runs
// with events.ts ACTIVE:
//   1. The spec list keeps the plan's shape: 9 specs, ACTIVE 4 (3 amend events, class O among them,
//      and 1 lure), at most one amend event per item, every trigger a write on the item's patient.
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
//   7. R38(b): RBC-TOC-02 states no inbox rule, so an arrival's inbox status is ungraded: completing
//      every arrival's item, or cancelling one blind, changes no gate; a cancelled item whose arrival
//      is then never read still fails event_seen.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { activeSpecs, ARRIVAL_SUMMARY, type EventSpec } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import type { TaskSource } from '../../../packages/core/tasks.ts';
import { gradeRun, type MatrixEnv, runMatrix, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { MatrixTask, WorldView } from '../../../packages/grader/matrix/types.ts';
import * as events from '../events.ts';
import { ACTIVE, SPECS } from '../events.ts';
import { expected, type Item } from '../expected.ts';
import { derive } from '../policy.ts';
import { arrivalRead, inbox, route, W } from '../solution/steps.ts';
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
  it('9 specs; ACTIVE is 3 amend events, one of class O, and 1 lure, one event per item; each trigger is a write on its patient', () => {
    expect(SPECS).toHaveLength(9);
    const active = activeSpecs(events);
    expect(active.map((s) => s.id)).toEqual(['kim-k1', 'kim-d2', 'stark-s1', 'roberts-r1']);
    expect(active.filter((s) => s.class !== 'D')).toHaveLength(3);
    expect(active.filter((s) => s.class === 'D')).toHaveLength(1);
    expect(active.some((s) => s.class === 'O')).toBe(true);
    expect(new Set(active.map((s) => s.item)).size).toBe(4);
    for (const item of new Set(SPECS.map((s) => s.item))) expect(SPECS.filter((s) => s.item === item && s.class !== 'D').length, item).toBeLessThanOrEqual(1);
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
        const task: MatrixTask = {
          ...loaded,
          events: [s],
          checks: checksFor([s]).filter((c) => !JUDGED.has(c.id)),
          oracle: route({ active: [s.id] }),
          alternatives: alts,
          mutants: muts,
          declares: { ...loaded.declares, traps: [...new Set(muts.map((m) => m.trap))] },
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

  it('the oracle and every matrix alternative fire all 9 triggers', { timeout: 600_000 }, async () => {
    const env = envWith(SPECS);
    const task = await loadMatrixTask(ID);
    for (const c of [{ id: 'oracle', script: route() }, ...alternatives]) {
      const run = await trial(env, { ...task, events: SPECS }, { kind: 'alternative', id: c.id, script: c.script });
      const fired = run.events.flatMap((e) => (e.type === 'env_event' ? [(e as unknown as { spec: string }).spec] : []));
      expect(new Set(fired), c.id).toEqual(new Set(SPECS.map((x) => x.id)));
    }
  });

  describe('R38(b): inbox status is ungraded (no inbox rule in RBC-TOC-02)', () => {
    // The arrivals' inbox Tasks in firing order: Walter Kim's (kim-k1, kim-d2), then Terence Stark's
    // (stark-s1), then Earnest Roberts' (roberts-r1).
    const item = (n: number) => `inbox-a${String(n).padStart(4, '0')}`;
    const close = (n: number, action: 'complete' | 'cancel') => ({ name: 'update_inbox_item', input: { task_id: item(n), action, ...(action === 'cancel' ? { reason: 'Reviewed' } : {}) } });
    const grade = async (script: ReturnType<typeof route>) => {
      const env = matrixEnv();
      const task = await loadMatrixTask(ID);
      const run = await trial(env, task, { kind: 'alternative', id: 'inbox-status', script });
      return gradeRun(env, task, task.checks, run);
    };
    it('completing each arrival\'s item after reading it, or cancelling one blind, fails no gate', { timeout: 600_000 }, async () => {
      for (const script of [route({ extra: [1, 2, 3, 4].map((n) => close(n, 'complete')) }), route({ over: { kimKcl: [W.kimKcl, close(1, 'cancel')] } })]) {
        const g = await grade(script);
        expect(g.checks.filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id)).toEqual([]);
        expect(g.outcome).toBe('PASS');
      }
    });
    it('a blind cancel that hides an arrival still fails event_seen on its item', { timeout: 600_000 }, async () => {
      const g = await grade(route({ over: { kimKcl: [W.kimKcl, close(1, 'cancel')] }, recheck: [inbox, ...['kim-d2', 'stark-s1', 'roberts-r1'].map(arrivalRead)] }));
      expect(g.checks.find((c) => c.id === 'event_seen')?.items?.filter((i) => !i.met).map((i) => i.item)).toEqual(['kim-lisinopril']);
    });
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
