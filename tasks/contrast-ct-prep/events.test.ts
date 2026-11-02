// T5's mid-trial events (plan-amendment-w4 PW4-E3, events.ts): the list cut to four studies, the
// shared policy sentence word for word, the specs (e_max 5, ACTIVE 4: classes A, B, O and a lure),
// and the double derivation of each event's expected study: policy.ts applied to the world with the
// spec's resources delivered gives expected.ts EVENTS.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { activeSpecs, AMEND_CLASSES } from '../../packages/env/events.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { focusOf } from '../../packages/grader/events.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import * as events from './events.ts';
import { EVENTS, expected } from './expected.ts';
import { ref } from './ids.ts';
import { derive } from './policy.ts';
import { arrivalDecidesAll, decidingArrival } from './tests/grader.ts';

// plan-amendment-w4, Event mechanism table, row 'Policy sentence': the same in all six policies.
export const SHARED_SENTENCE =
  'Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. If it does not change the decision under this protocol, leave the decision in place.';

const store = await loadStore(matrixEnv().world);
const base = [...store.resources()];
type Res = (typeof base)[number];
const view = (resources: readonly Res[]): WorldView => ({
  get: (type, id) => resources.find((r) => r.resourceType === type && r.id === id) as never,
  all: (type) => (type === undefined ? resources : resources.filter((r) => r.resourceType === type)) as never,
});
// The world as the agent finishes on it once the spec's arrival is in: each resource put, an
// existing id replaced (a class B correction).
const delivered = (specId: string): WorldView => {
  const spec = events.SPECS.find((s) => s.id === specId)!;
  const put = spec.resources as unknown as Res[];
  const keys = new Set(put.map((r) => `${r.resourceType}/${r.id}`));
  return view([...base.filter((r) => !keys.has(`${r.resourceType}/${r.id}`)), ...put]);
};

describe('T5 list cut (PW4-E3)', () => {
  it('four studies, one instance of each probe class, metformin_hold kept', () => {
    expect(expected.items.map((x) => [x.name, x.class])).toEqual([
      ['Britt Vincenzo Mohr', 'egfr_window'],
      ['Daniel Ferreira', 'allergy_grade'],
      ['Anisha Margarita Schuster', 'metformin_hold'],
      ['Lauren Sixta Beahan', 'filler'],
    ]);
  });

  it('the three studies taken off the list are cancelled by the patient, their charts kept', () => {
    for (const k of ['Appointment/appt-t5-schmitt', 'Appointment/appt-t5-stracke', 'Appointment/appt-t5-brakus'] as const) {
      const [type, id] = ref(k).split('/') as [string, string];
      const a = store.get(type, id) as { status?: string; cancelationReason?: { text?: string }; start?: string };
      expect(a.status, k).toBe('cancelled');
      expect(a.cancelationReason?.text, k).toMatch(/patient/i);
      expect(a.start, k).toMatch(/^2026-10-26T/);
    }
  });
});

const POLICY = (await nodeTaskSource({ testMode: false }).get('contrast-ct-prep')).policies.find((p) => p.id === 'RBC-RAD-07')!.text;
describe('RBC-RAD-07 carries the shared sentence and the list rule', () => {
  it('holds the shared policy sentence word for word', () => {
    expect(POLICY.replace(/\s+/g, ' ')).toContain(SHARED_SENTENCE);
  });

  it('says the list is the booked studies and a cancelled appointment is not on it', () => {
    expect(POLICY.replace(/\s+/g, ' ')).toMatch(/The day's list is the CT studies booked for that day \(appointment status booked\); a cancelled appointment is not on the list\./);
  });
});

describe('T5 event specs', () => {
  const active = activeSpecs(events);
  const onList = new Set(expected.items.map((x) => x.patient));

  it('e_max 5 specs; ACTIVE 4: one each of A, B, O and one lure (D)', () => {
    expect(events.SPECS).toHaveLength(5);
    expect(active.map((s) => s.class).sort()).toEqual(['A', 'B', 'D', 'O']);
  });

  it('each spec bears on a study of the list and fires after a write on its patient (Addendum 2: the trigger holds on every passing route)', () => {
    for (const s of events.SPECS) {
      expect(onList.has(s.item), s.id).toBe(true);
      expect(s.trigger, s.id).toEqual({ kind: 'after_write', patient: s.item.slice('Patient/'.length) });
    }
  });

  it('at most one amend event per study; a lure may be a second event on one', () => {
    for (const x of expected.items) expect(events.SPECS.filter((s) => s.item === x.patient && AMEND_CLASSES.has(s.class)).length, x.name).toBeLessThanOrEqual(1);
  });

  it.each(events.SPECS.map((s) => [s.id] as const))('%s: policy.ts on the delivered chart gives EVENTS[%s]', (id) => {
    const derived = derive(delivered(id)) as unknown as typeof expected;
    const spec = events.SPECS.find((s) => s.id === id)!;
    const study = derived.items.find((x) => x.patient === spec.item)!;
    expect(study).toEqual(EVENTS[id]!.study);
    // Every other study is as without the event.
    expect(derived.items.filter((x) => x.patient !== spec.item)).toEqual(expected.items.filter((x) => x.patient !== spec.item));
  });

  // discover.test and every search run on the world before the trigger: no arrival is there yet.
  // A new arrival's id is in no world range; only the class B correction names a world record,
  // and it keeps that record but for the corrected value, its status and note, and the stamp.
  it('arrivals are absent from the world before their trigger; the correction changes only what a lab correction does', () => {
    for (const s of events.SPECS) {
      for (const r of s.resources) {
        const there = store.get(r.resourceType, r.id!) as unknown as Record<string, unknown> | undefined;
        if (s.class !== 'B') expect(there, `${s.id} ${r.resourceType}/${r.id}`).toBeUndefined();
        else {
          expect(there, `${s.id} replaces a world record`).toBeDefined();
          const { status, valueQuantity, note, issued, ...rest } = there!;
          const mine = r as unknown as Record<string, unknown>;
          expect(status).toBe('final');
          expect((valueQuantity as { value: number }).value).toBe(0.98);
          expect([note, mine.issued]).toEqual([undefined, undefined]);
          expect(Object.fromEntries(Object.entries(mine).filter(([k]) => !['status', 'valueQuantity', 'note'].includes(k)))).toEqual(rest);
          expect(issued).toBeDefined();
          expect([mine.status, (mine.valueQuantity as { value: number }).value]).toEqual(['corrected', 2.8]);
        }
      }
    }
  });

  // R38(a): a fired event never excuses the base review. Once an amend fires, the base gates leave
  // only its `changes` to the amended gate; each of those decides nothing on the list's chart, so
  // every base decisive record of the study is still required by its own gate's guard (R14).
  it('an amend takes over only decisions no base record decides (R38a)', () => {
    for (const s of events.SPECS.filter((x) => AMEND_CLASSES.has(x.class))) {
      const before = expected.items.find((x) => x.patient === s.item)!;
      for (const d of EVENTS[s.id]!.changes) expect(before.decides[d], `${s.id} ${d}`).toEqual([]);
      expect(EVENTS[s.id]!.changes.length, s.id).toBeGreaterThan(0);
    }
  });

  // R38(d): only an arrival that alone decides every element of the delivered study is an any-of
  // route; per element, the records are EVENTS[spec].study.decides.
  it('the arrival is an any-of route only where it decides the whole delivered study (R38d)', () => {
    expect(events.SPECS.filter(arrivalDecidesAll).map((s) => s.id)).toEqual(['t5-mohr-scr']);
    expect(EVENTS['t5-mohr-scr']!.study.decides).toEqual({ order: [], premedication: [], consult: [], creatinine: ['Observation/obs-07501', 'Observation/obs-07502'], saline: ['Observation/obs-07501', 'Observation/obs-07502'], metformin: [] });
  });

  // R38(g): an arrival is seen only when the records holding its deciding atoms are, and the focus
  // is the deciding record where it can be. Every spec of SPECS, the inactive one included: Mohr's
  // two creatinines (the rise is between them; the 1.52 is the focus), and one record, the focus,
  // for every other spec.
  it('every spec\'s seen rule needs each arrival record that decides it, and the focus decides (R38g)', () => {
    const want: Record<string, string[]> = {
      't5-mohr-scr': ['Observation/obs-07502', 'Observation/obs-07501'],
      't5-ferreira-scr': [ref('Observation/obs-t5-scr-1014')],
      't5-schuster-rxn': ['DocumentReference/doc-02501'],
      't5-beahan-rxn': ['DocumentReference/doc-02502'],
      't5-ferreira-msg': ['Communication/comm-00501'],
    };
    expect(Object.fromEntries(events.SPECS.map((s) => [s.id, decidingArrival(s)]))).toEqual(want);
    for (const s of events.SPECS) {
      const keys = s.resources.map((r) => `${r.resourceType}/${r.id}`);
      expect(decidingArrival(s), `${s.id}: the focus is a deciding record`).toContain(focusOf(s));
      if (AMEND_CLASSES.has(s.class)) for (const d of EVENTS[s.id]!.changes) for (const k of EVENTS[s.id]!.study.decides[d].filter((k) => keys.includes(k))) expect(decidingArrival(s), `${s.id} ${d}`).toContain(k);
    }
  });

  it('an amend event changes its study; a lure leaves it as it was', () => {
    for (const s of events.SPECS) {
      const before = expected.items.find((x) => x.patient === s.item)!;
      if (AMEND_CLASSES.has(s.class)) expect(EVENTS[s.id]!.study, s.id).not.toEqual(before);
      else expect(EVENTS[s.id]!.study, s.id).toEqual(before);
    }
  });
});
