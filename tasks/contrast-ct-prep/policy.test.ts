// Double derivation for T5's worklist (design section 4, "Double derivation"): policy.ts applied to
// the committed world gives expected.ts, and the numbers the class decisions turn on are the ones
// worked out by hand in overlay.ts. The matrix checks the same equality; this test shows it alone.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { ref } from './ids.ts';
import { ckdEpi2021, derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('contrast-ct-prep', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('CKD-EPI 2021: Stracke under 30 inside the window and over it before; the AKI patients over 30 (only the AKI rule holds metformin)', () => {
    expect(ckdEpi2021(2.85, 60, false)).toBeCloseTo(24.5, 1);
    expect(ckdEpi2021(2.1, 60, false)).toBeCloseTo(35.4, 1);
    expect(ckdEpi2021(1.24, 23, true)).toBeGreaterThan(35);
    expect(ckdEpi2021(1.64, 22, false)).toBeGreaterThan(35);
    // At the knot (creatinine = kappa) only the age and sex terms remain: 142 x 0.9938^50 x 1.012.
    expect(ckdEpi2021(0.7, 50, true)).toBeCloseTo(105.3, 1);
  });

  it('counts 13, 7 and 1 hours back from the 09:00 slot, across midnight', () => {
    const premed = expected.items.find((x) => x.regimen === 'premedicate')!;
    expect(premed.prednisone!.at).toEqual(['2026-10-25T20:00:00-04:00', '2026-10-26T02:00:00-04:00', '2026-10-26T08:00:00-04:00']);
    expect(premed.diphenhydramine!.at).toEqual(['2026-10-26T08:00:00-04:00']);
  });

  it('each slot is on the list day and the studies run in slot order', () => {
    const starts = expected.items.map((x) => x.start);
    expect(starts.every((s) => s.startsWith('2026-10-26T'))).toBe(true);
    expect([...starts].sort()).toEqual(starts);
  });

  // RBC-RAD-07 §4 sets no time limit on an acute kidney injury documented in a record: it holds
  // until a later creatinine is back at baseline (verifier-W1-probe-T5-clinical-1 F5).
  it('an unresolved acute kidney injury in an older record still counts', () => {
    const ed = ref('DocumentReference/doc-t5-schuster-ed');
    const shifted: WorldView = {
      get: (type, id) => (`${type}/${id}` === ed ? { ...(store.get(type, id) as object), date: '2026-08-20T08:00:00-04:00' } : store.get(type, id)) as never,
      all: (type) => world.all(type).map((r) => (`${r.resourceType}/${r.id}` === ed ? { ...r, date: '2026-08-20T08:00:00-04:00' } : r)) as never,
    };
    const schuster = (derive(shifted) as unknown as typeof expected).items.find((x) => x.class === 'metformin_hold' && x.decisive.includes(ed))!;
    expect(schuster.saline).not.toBeNull();
    expect(schuster.metformin?.hold).toBe(true);
  });
});

// W1 probe rulings R4 (the grader enforces only what the policy states, in general terms) and R11
// (no sentence points at one item's trap).
const POLICY = (await nodeTaskSource({ testMode: false }).get('contrast-ct-prep')).policies.find((p) => p.id === 'RBC-RAD-07')!.text.replace(/\s+/g, ' ');
describe('RBC-RAD-07 states what the gates enforce', () => {
  it.each([
    ['no_substitution: no other corticosteroid, by any route', /no other corticosteroid, by any route/],
    ['no_substitution: premedication only for a graded mild or moderate reaction', /premedication only for a prior mild or moderate allergic-like reaction graded under §1/],
    ['ct_order: one order per booked study, linked', /one order for each booked study, linked to its appointment/],
    ['no_substitution: no other imaging study', /no other imaging study for the patient/],
    ['no_substitution outside: orders only for the list', /orders only for the patients on the day's list/],
    ['evidence_before_orders: review before ordering', /Review the records a decision under this policy depends on before placing the orders it decides/],
  ])('%s', (_rule, sentence) => {
    expect(POLICY).toMatch(sentence);
  });

  it.each([
    ['the window count (Mohr)', /Count the 30 days back/],
    ['outside records (Schuster)', /including outside records/],
  ])('carries no sentence pointing at one item: %s', (_item, phrase) => {
    expect(POLICY).not.toMatch(phrase);
  });
});
