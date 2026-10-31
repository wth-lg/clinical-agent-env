// T1 as a worklist probe (plan-amendment-worklist W1): a DOAC renal and interaction dose review
// over a panel of nine patients, two instances of each kept item class plus one filler already on
// the right dose. Each gate checks every panel member of expected.items on its own
// (packages/grader/items.ts); here, the class table and the item records of a trial that did
// nothing. The matrix (pnpm cli matrix --task renal-dose-review) shows each item's mutant and
// alternative.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { TASKS } from '../../packages/env/overlay.ts';
import { CLASSES, expected } from './expected.ts';
import { checks } from './tests/grader.ts';

const gates = checks.filter((c): c is GateCheck => c.kind === 'gate');
const PATIENTS = expected.items.map((x) => x.patient);
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };

describe('T1 worklist probe: expected.items', () => {
  it('holds exactly two instances of each kept class and one filler', () => {
    const count = (c: string) => expected.items.filter((x) => x.class === c).length;
    expect(CLASSES).toEqual(['cg_crcl_weight_rule', 'apixaban_two_of_three', 'outside_scr_umol', 'pgp_cyp3a4_inhibitor']);
    for (const c of CLASSES) expect(count(c), c).toBe(2);
    expect(count('filler')).toBe(1);
    expect(expected.items).toHaveLength(9);
  });

  it('puts every item on one of the task\'s own slot patients, each patient once', () => {
    const slots = TASKS.T1.slots.map((p) => `Patient/${p}`);
    expect(new Set(PATIENTS).size).toBe(PATIENTS.length);
    for (const p of PATIENTS) expect(slots).toContain(p);
  });

  it('every hard item names the records its decision depends on; the filler needs no change', () => {
    for (const x of expected.items) {
      if (x.class !== 'filler') expect(x.decisive.length, x.patient).toBeGreaterThan(0);
      expect(x.dose.drug === 'apixaban' ? x.dose.per_day : 1).toBe(x.dose.per_day);
    }
    expect(expected.items.find((x) => x.class === 'filler')!.action).toBe('unchanged');
  });
});

describe('T1 gates over expected.items', () => {
  it('every gate records one result per panel member; the safety gate records writes outside the panel too', () => {
    for (const g of gates) {
      const keys = g.fn(NOTHING).items?.map((i) => i.item);
      expect(keys, g.id).toEqual(g.category === 'safety' ? [...PATIENTS, OUTSIDE] : PATIENTS);
    }
  });

  it('a chart with no active DOAC order fails the dose gate on every member, each saying why (the null agent, which leaves the real chart as it was, is the matrix\'s case)', () => {
    const v = gates.find((g) => g.id === 'doac_dose')!.fn(NOTHING);
    expect(v.met).toBe(false);
    expect(v.items!.filter((i) => !i.met).map((i) => i.item)).toEqual(PATIENTS);
    for (const i of v.items!) expect(i.why, i.item).toMatch(/^needs (apixaban|rivaroxaban) /);
  });
});
