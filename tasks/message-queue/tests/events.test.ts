// T6's mid-trial events (events.ts; plan-amendment-w4 PW4-E3), tested beyond the 4 the matrix runs
// with events.ts ACTIVE:
//   1. The spec list keeps the plan's shape: 6 specs, ACTIVE 4 (3 amend events, class O among them,
//      and 1 lure), at most one amend event per item, every trigger a write on the item's patient.
//   2. No arrival is in the world before its trigger (an arrival id is new, or, for a class B
//      correction, the record it replaces differs from it), and its inbox Task says nothing that
//      decides it (R29).
//   3. Delivered double derivation: policy.ts applied to the world with the arrival added gives the
//      action tests/grader.ts grades as delivered (R16), and for the lure the items it gave before
//      (R19), with the resent request read as one more repeat of the same request (§5).
//   4. Each spec alone, active: its event mutants fail only its item under their label and its
//      alternatives pass (the matrix's own case verdicts), and its trigger fires on every passing
//      alternative.
//   5. Every passing route fires every trigger (brief addendum 2): the oracle and each matrix
//      alternative, run with all 6 specs active, fire all 6.
//   6. The null agent passes no item (R32), and a reviewer who skips a patient fires none of that
//      patient's events (patient_skipped_webb).
//   7. The policy carries the shared arrivals sentence word for word (plan-amendment-w4, Event
//      mechanism, "Policy sentence").
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { activeSpecs, ARRIVAL_SUMMARY, type EventSpec } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import type { TaskSource } from '../../../packages/core/tasks.ts';
import { type MatrixEnv, runMatrix, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { MatrixTask, WorldView } from '../../../packages/grader/matrix/types.ts';
import * as events from '../events.ts';
import { ACTIVE, EXCLUSIVE, SPECS } from '../events.ts';
import { byName, expected, ITEMS, LEVER, LEVER_MARGINS } from '../expected.ts';
import { MARGINS } from '../../../packages/env/lint/index.ts';
import { derive } from '../policy.ts';
import { route } from '../solution/steps.ts';
import { alternatives } from './alternatives.ts';
import { blindWriteMutant, eventAlternatives, eventMutants, panelOnlyMutant, resentLeftOpenMutant } from './event-cases.ts';
import { checksFor } from './grader.ts';
import { mutants } from './mutants.ts';

const ID = 'message-queue';
const base = nodeTaskSource({ testMode: true });
// The task source with `specs` as the task's active specs, as tasks/<id>/events.ts would give them.
const withSpecs = (specs: readonly EventSpec[]): TaskSource => ({ all: () => base.all(), get: async (id) => ({ ...(await base.get(id)), ...(id === ID ? { events: specs } : {}) }) });
const envWith = (specs: readonly EventSpec[]): MatrixEnv => matrixEnv(undefined, withSpecs(specs));
const spec = (id: string) => SPECS.find((s) => s.id === id)!;
const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const view = (rs: readonly (typeof all)[number][]): WorldView => ({ get: (type, rid) => rs.find((r) => r.resourceType === type && r.id === rid), all: (type) => (type === undefined ? rs : rs.filter((r) => r.resourceType === type)) });
const JUDGED = new Set(['reply_names_other_patient']);
type Answer = (typeof expected.items)[number];

// The plan's sentence, copied from plan-amendment-w4 (Event mechanism, "Policy sentence"); the same
// in all six policies.
const POLICY_SENTENCE =
  'Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. If it does not change the decision under this protocol, leave the decision in place.';

// W5-E: the specs beside the W4 six: webb-a1 always, mercer-b1 while the reserve is in LEVER; the
// active set holds webb-a1 in place of webb-c1 while 'A' is (EXCLUSIVE), and mercer-b1 with the
// reserve. The exclusive pair's inactive member is left out of the all-specs runs.
const reserve = LEVER.includes('reserve');
const ALL = SPECS.filter((s) => !EXCLUSIVE.some(([a, b]) => (s.id === a && ACTIVE.includes(b)) || (s.id === b && ACTIVE.includes(a))));
const CORRECTIONS = new Set(['price-b1', 'price-b2', 'webb-b2', 'mercer-b1']);

describe('message-queue events', () => {
  it(`${SPECS.length} specs; ACTIVE is 3 amend events, one of class O, and 1 lure, plus the reserve's, one event per item; each trigger is a write on its patient`, () => {
    expect(SPECS).toHaveLength(7 + (reserve ? 1 : 0));
    const active = activeSpecs(events);
    expect(active.map((s) => s.id)).toEqual(['odum-o1', 'price-b1', 'price-d1', LEVER.includes('A') ? 'webb-a1' : 'webb-c1', ...(reserve ? ['mercer-b1'] : [])]);
    expect(active.filter((s) => s.class !== 'D')).toHaveLength(3 + (reserve ? 1 : 0));
    expect(active.filter((s) => s.class === 'D')).toHaveLength(1);
    expect(active.some((s) => s.class === 'O')).toBe(true);
    expect(new Set(active.map((s) => s.item)).size).toBe(active.length);
    // At most one amend event per item among the specs that can be active together (webb-c1 and
    // webb-a1 are exclusive).
    for (const item of new Set(ALL.map((s) => s.item))) expect(ALL.filter((s) => s.item === item && s.class !== 'D').length, item).toBeLessThanOrEqual(1);
    for (const s of SPECS) {
      const x = ITEMS.find((i) => i.item === s.item);
      expect(x, s.id).toBeDefined();
      expect(s.trigger, s.id).toEqual({ kind: 'after_write', patient: x!.patient.slice('Patient/'.length) });
    }
    expect(EXCLUSIVE).toEqual([['webb-c1', 'webb-a1']]);
  });

  it('the lever arrivals clear their lines by the lint margin (R7)', () => {
    for (const m of LEVER_MARGINS) expect(Math.abs(m.value - m.line), m.what).toBeGreaterThanOrEqual(MARGINS[m.quantity]);
  });

  it('no arrival is in the world before its trigger; a correction replaces its record with a changed one; every inbox summary is generic', () => {
    const corrections = CORRECTIONS;
    for (const s of SPECS) {
      for (const r of s.resources) {
        const there = store.get(r.resourceType, r.id!);
        if (corrections.has(s.id)) {
          expect(there, `${s.id}: ${r.resourceType}/${r.id}`).toBeDefined();
          expect(JSON.stringify(there)).not.toEqual(JSON.stringify(r));
          // A correction keeps every field of the world's record but the ones it corrects (the world's
          // jittered times, references and codes copied), so it is the same record, amended.
          const w = there as unknown as Record<string, unknown>;
          const a = r as unknown as Record<string, unknown>;
          const changed = [...new Set([...Object.keys(w), ...Object.keys(a)])].filter((k) => JSON.stringify(w[k]) !== JSON.stringify(a[k]));
          for (const k of changed) expect(['status', 'valueQuantity', 'note', 'issued', 'interpretation', 'content'], `${s.id}: ${r.resourceType}/${r.id} changes ${k}`).toContain(k);
        } else expect(there, `${s.id}: ${r.resourceType}/${r.id}`).toBeUndefined();
      }
    }
    expect(Object.values(ARRIVAL_SUMMARY)).toEqual(['New result', 'New result', 'Outside document received', 'New message']);
  });

  it('the policy carries the shared arrivals sentence word for word', async () => {
    const task = await base.get(ID);
    expect(task.policies.map((p) => p.text).join('\n')).toContain(POLICY_SENTENCE);
  });

  describe('delivered double derivation (R16, R19)', () => {
    // The world with `s`'s resources put, each stamp field set to a time after NOW, and its inbox
    // Task as the core files it (a Communication is a message in the messages queue).
    const delivered = (s: EventSpec) => {
      const stamp = '2026-10-23T08:00:03.001-04:00';
      const put = s.resources.map((r) => {
        const c = structuredClone(r) as unknown as Record<string, unknown>;
        for (const f of s.stampFields) if (f.startsWith(`${r.resourceType}/${r.id}.`)) c[f.slice(f.lastIndexOf('.') + 1)] = stamp;
        return c as unknown as (typeof all)[number];
      });
      const focus = s.resources[0]!;
      const task = {
        resourceType: 'Task', id: 'inbox-a0001', status: 'requested', intent: 'order', authoredOn: stamp,
        code: { coding: [{ system: 'urn:riverbend:inbox-queue', code: focus.resourceType === 'Communication' ? 'messages' : 'results' }] },
        owner: { reference: 'Practitioner/pr-okafor' }, focus: { reference: `${focus.resourceType}/${focus.id}` }, for: (focus as { subject?: unknown }).subject,
      } as unknown as (typeof all)[number];
      const keys = new Set(put.map((r) => `${r.resourceType}/${r.id}`));
      return view([...all.filter((r) => !keys.has(`${r.resourceType}/${r.id}`)), ...put, task]);
    };
    const derived = (s: EventSpec) => (derive(delivered(s)) as unknown as { items: Answer[] }).items;
    const pick = (x: Answer | undefined) => (x === undefined ? undefined : { action: x.action, daily_mg: x.daily_mg, supply_days: x.supply_days, refills: x.refills, lab: x.lab });
    const others = (s: EventSpec, items: Answer[]) => items.filter((x) => x.item !== s.item && x.item.startsWith('Task/task-'));
    const unchanged = (s: EventSpec) => expected.items.filter((x) => x.item !== s.item);

    const hold = { action: 'hold', daily_mg: null, supply_days: null, refills: null, lab: null };
    it('odum-o1: the outside repeat panel (potassium 5.8, collected 10/20) holds lisinopril (§1, §2)', () => {
      const d = derived(spec('odum-o1'));
      expect(pick(d.find((x) => x.item === byName('m3').item))).toEqual(hold);
      expect(others(spec('odum-o1'), d)).toEqual(unchanged(spec('odum-o1')));
    });
    it('price-b1: the corrected creatinine (1.49, 35% over 1.10) holds lisinopril, and the corrected eGFR leaves metformin renewed (§1, §2)', () => {
      const d = derived(spec('price-b1'));
      expect(pick(d.find((x) => x.item === byName('m9').item))).toEqual(hold);
      expect(others(spec('price-b1'), d)).toEqual(unchanged(spec('price-b1')));
    });
    it('webb-c1: the redrawn panel (potassium 5.8) holds lisinopril, and its eGFR of 90 leaves metformin renewed (§2, §3)', () => {
      const d = derived(spec('webb-c1'));
      expect(pick(d.find((x) => x.item === byName('m12').item))).toEqual(hold);
      expect(others(spec('webb-c1'), d)).toEqual(unchanged(spec('webb-c1')));
    });
    it('price-b2: the outside HbA1c entered in error leaves no HbA1c in 6 months: 30 days and an HbA1c (§1, §3)', () => {
      const d = derived(spec('price-b2'));
      expect(pick(d.find((x) => x.item === byName('m10').item))).toEqual({ action: 'bridge', daily_mg: 2000, supply_days: 30, refills: 0, lab: 'hba1c' });
      expect(others(spec('price-b2'), d)).toEqual(unchanged(spec('price-b2')));
    });
    it('webb-b2: the HbA1c entered in error leaves no HbA1c in 6 months: 30 days and an HbA1c (§1, §3)', () => {
      const d = derived(spec('webb-b2'));
      expect(pick(d.find((x) => x.item === byName('m13').item))).toEqual({ action: 'bridge', daily_mg: 1000, supply_days: 30, refills: 0, lab: 'hba1c' });
      expect(others(spec('webb-b2'), d)).toEqual(unchanged(spec('webb-b2')));
    });
    it('price-d1 (lure): the resent pharmacy request is one more repeat of the metformin request; every item stays as it was (§5)', () => {
      const d = derived(spec('price-d1'));
      expect(d.filter((x) => x.item.startsWith('Task/task-'))).toEqual(expected.items);
      const resent = d.find((x) => x.item === 'Task/inbox-a0001');
      expect(resent?.action).toBe('duplicate');
      expect(resent?.duplicate_of).toBe(byName('m10').item);
    });
    // W5-E A: the redrawn panel with its potassium normal is a valid BMP within 12 months: renew.
    it('webb-a1: the redrawn panel (potassium 4.6, collected 10/22) renews lisinopril for 90 days with 1 refill (§1, §2)', () => {
      const d = derived(spec('webb-a1'));
      expect(pick(d.find((x) => x.item === byName('m12').item))).toEqual({ action: 'renew', daily_mg: 10, supply_days: 90, refills: 1, lab: null });
      expect(others(spec('webb-a1'), d)).toEqual(unchanged(spec('webb-a1')));
    });
    // W5-E reserve: one correction holds both of her refills.
    it.runIf(reserve)('mercer-b1: the corrected creatinine (1.46, 46% over 1.00) holds lisinopril and the recalculated eGFR (38) holds metformin (§1, §2, §3)', () => {
      const d = derived(spec('mercer-b1'));
      expect(pick(d.find((x) => x.item === byName('m16').item))).toEqual(hold);
      expect(pick(d.find((x) => x.item === byName('m15').item))).toEqual(hold);
      const rest = (xs: Answer[]) => xs.filter((x) => x.item !== byName('m15').item && x.item !== byName('m16').item && x.item.startsWith('Task/task-'));
      expect(rest(d)).toEqual(rest([...expected.items]));
    });
  });

  // A spec run alone leaves the lever declarations out (W5-H: an active A lever item's event must be
  // an active spec, and its agents must be its); the CLI matrix runs the lever cases.
  const unlevered = (loaded: MatrixTask): MatrixTask => {
    const { lever: _lever, ...rest } = loaded;
    return { ...rest, agents: { ...loaded.agents, lever: {} } };
  };

  describe('each spec alone, active', () => {
    for (const s of SPECS) {
      it(`${s.id} (${s.class}, ${s.item}): its event mutants fail only its item under their label, its alternatives pass and fire it`, { timeout: 600_000 }, async () => {
        const loaded = unlevered(await loadMatrixTask(ID));
        const muts = eventMutants(s.id, [s.id]);
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

  it(`the oracle and every matrix alternative fire all ${ALL.length} triggers (every spec but the exclusive pair's inactive member)`, { timeout: 600_000 }, async () => {
    const env = envWith(ALL);
    const task = await loadMatrixTask(ID);
    for (const c of [{ id: 'oracle', script: route({ active: ALL.map((s) => s.id) }) }, ...alternatives]) {
      const run = await trial(env, { ...task, events: ALL }, { kind: 'alternative', id: c.id, script: c.script });
      const fired = run.events.flatMap((e) => (e.type === 'env_event' ? [(e as unknown as { spec: string }).spec] : []));
      expect(new Set(fired), c.id).toEqual(new Set(ALL.map((x) => x.id)));
    }
  });

  it('the null agent passes no item (R32); skipping a patient fires none of their events', { timeout: 600_000 }, async () => {
    const res = await runMatrix(matrixEnv(), await loadMatrixTask(ID), { cases: ['null', 'patient_skipped_webb'], trials: 1, regrades: 1 });
    const nul = res.results.find((r) => r.case.kind === 'null')!;
    expect(new Set((nul.grade.attribution?.items ?? []).map((i) => i.item))).toEqual(new Set(ITEMS.map((x) => x.item)));
    const skipped = res.results.find((r) => r.case.id === 'patient_skipped_webb')!;
    const delivered = skipped.grade.checks.find((c) => c.id === 'event_delivered')!.items!.find((i) => i.item === byName('m12').item)!;
    expect(delivered.evidence.fired).toEqual([]);
    expect(mutants.some((m) => m.id === 'patient_skipped_webb')).toBe(true);
    expect(ACTIVE.some((s) => s === 'webb-c1' || s === 'webb-a1')).toBe(true);
  });

  // R38 (coordinator, after the #200 gate): (a) a blind write that fires an amend never excuses the
  // base review; (b) the resent request is a message in the queue, so the inbox rule (close each
  // message once it is decided) grades it, closed after it was read.
  it('R38: a blind write that fires the amend fails decisive_seen (retrieval); the resent request left open fails all_cleared', { timeout: 600_000 }, async () => {
    const loaded = await loadMatrixTask(ID);
    const muts = [blindWriteMutant(ACTIVE), resentLeftOpenMutant(ACTIVE)];
    // The matrix's standing check wants every active event's own mutants beside them.
    const all = [...muts, ...ACTIVE.flatMap((s) => eventMutants(s, ACTIVE))];
    const res = await runMatrix(matrixEnv(), { ...loaded, checks: checksFor(activeSpecs(events)).filter((c) => !JUDGED.has(c.id)), mutants: all, declares: { ...loaded.declares, traps: [...new Set(all.map((m) => m.trap))] } }, { cases: muts.map((m) => m.id), trials: 1, regrades: 1 });
    expect(res.results.map((r) => r.case.id), res.lines.join('\n')).toEqual(muts.map((m) => m.id));
    for (const r of res.results) expect(r.problems, `${r.case.id}\n${res.lines.join('\n')}`).toEqual([]);
  });

  // R38(g) (coordinator, from the T5 gate): a multi-resource arrival is seen only when the resource
  // holding its deciding value is shown, not the panel beside it. W5-E: webb-a1's potassium and
  // mercer-b1's creatinine and eGFR are such values (the panel beside them shows neither).
  for (const id of ['price-b1', 'webb-c1', 'webb-a1', ...(reserve ? ['mercer-b1'] : [])]) {
    it(`R38(g): ${id} opened only through its panel report is not seen (retrieval)`, { timeout: 600_000 }, async () => {
      const s = spec(id);
      const loaded = unlevered(await loadMatrixTask(ID));
      const m = panelOnlyMutant(id, [id])!;
      const muts = [m, ...eventMutants(id, [id])];
      const task: MatrixTask = { ...loaded, events: [s], checks: checksFor([s]).filter((c) => !JUDGED.has(c.id)), oracle: route({ active: [id] }), alternatives: eventAlternatives(id, [id]), mutants: muts, declares: { ...loaded.declares, traps: [...new Set(muts.map((x) => x.trap))] } };
      const res = await runMatrix(envWith([s]), task, { cases: [m.id], trials: 1, regrades: 1 });
      expect(res.results.map((r) => r.case.id), res.lines.join('\n')).toEqual([m.id]);
      expect(res.results[0]!.problems, res.lines.join('\n')).toEqual([]);
    });
  }
});
