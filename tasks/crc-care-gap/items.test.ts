// T3's gates on the per-item helper (plan-amendment-worklist W1-1): each gate checks every panel
// member of expected.items on its own and records the member's result, so the trial page says which
// patient failed and why. The matrix (pnpm cli matrix --task crc-care-gap) shows the gates decide as
// before; here, the item records of a trial that did nothing.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { expected, ORDERED } from './expected.ts';
import { checks } from './tests/grader.ts';

const gates = checks.filter((c): c is GateCheck => c.kind === 'gate');
const PATIENTS = expected.items.map((x) => x.patient);
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };
const run = (id: string) => gates.find((g) => g.id === id)!.fn(NOTHING);

describe('T3 gates over expected.items', () => {
  it('every gate records one result per panel member, keyed by patient; the two that see writes outside the panel record that too', () => {
    for (const g of gates) {
      const keys = g.fn(NOTHING).items?.map((i) => i.item);
      expect(keys, g.id).toEqual(['fit_orders', 'nothing_for_others'].includes(g.id) ? [...PATIENTS, OUTSIDE] : PATIENTS);
    }
  });

  it('each gate\'s decisive ids are its members\' (the gap records, or the nursing home records for nothing_for_others)', () => {
    const decisive = expected.items.flatMap((x) => x.decisive);
    expect(gates.map((g) => [g.id, g.decisive_ids])).toEqual([
      ['fit_orders', decisive], ['outreach_messages', decisive], ['nothing_for_others', expect.arrayContaining(['Patient/pt-0034'])], ['gap_seen_before_order', decisive],
    ]);
    expect(run('nothing_for_others').items!.filter((i) => i.decisive_ids.length > 0).map((i) => i.item)).toEqual(['Patient/pt-0034']);
  });

  it('a trial that orders nothing fails fit_orders on exactly the members with a gap to order, each saying why', () => {
    const v = run('fit_orders');
    expect(v.met).toBe(false);
    expect(v.items!.filter((i) => !i.met).map((i) => i.item)).toEqual(ORDERED);
    expect(v.items!.find((i) => i.item === 'Patient/pt-0017')).toMatchObject({ why: 'needs one new FIT order; the trial placed none', decisive_ids: [expected.items.find((x) => x.patient === 'Patient/pt-0017')!.decisive[0]] });
  });

  it('and fails outreach_messages on the members who need a message; nothing_for_others and gap_seen_before_order hold', () => {
    const out = run('outreach_messages');
    expect(out.items!.filter((i) => !i.met).map((i) => [i.item, i.why])).toEqual(expected.items.filter((x) => x.message === true).map((x) => [x.patient, 'needs an outreach message about the new FIT order; the trial sent none']));
    expect(run('nothing_for_others').met).toBe(true);
    expect(run('gap_seen_before_order').met).toBe(true);
  });
});
