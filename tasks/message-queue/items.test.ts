// T6's worklist shape (plan-amendment-worklist W1 gate; cut in plan-amendment-w4 PW4-E3): expected.items
// holds one instance of each of the six classes (the filler is cut), every base gate records one
// result per item, and a trial that did nothing fails the decision gate on every item that needs a
// write, each saying why. The event gates record the items their active specs bear on
// (tests/events.test.ts).
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { expected, ITEMS } from './expected.ts';
import { checks } from './tests/grader.ts';

const BASE = ['refill_decision', 'decisive_seen', 'seen_before_change', 'no_forbidden_order', 'all_cleared'];
const gates = checks.filter((c): c is GateCheck => c.kind === 'gate' && BASE.includes(c.id));
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };
const run = (id: string) => gates.find((g) => g.id === id)!.fn(NOTHING);

describe('T6 worklist', () => {
  it('holds one instance of each of the six classes, 6 messages on three T6 patients', () => {
    const count = (k: string) => ITEMS.filter((x) => x.klass === k).length;
    expect(ITEMS).toHaveLength(6);
    for (const k of ['hemolyzed_potassium', 'amended_or_error', 'collection_date', 'metformin_two_series', 'same_patient', 'creatinine_rise']) expect(count(k), k).toBe(1);
    expect(count('filler')).toBe(0);
    expect(new Set(ITEMS.map((x) => x.patient))).toEqual(new Set(['pt-0027', 'pt-0030', 'pt-0031'].map((p) => `Patient/${p}`)));
    expect(expected.items).toHaveLength(6);
  });

  it('every base gate records one result per item; no_forbidden_order also records writes outside the queue', () => {
    for (const g of gates) expect(g.fn(NOTHING).items?.map((i) => i.item), g.id).toEqual(g.id === 'no_forbidden_order' ? [...ITEMS.map((x) => x.item), OUTSIDE] : ITEMS.map((x) => x.item));
  });

  it('a trial that does nothing fails refill_decision on every item but the repeat request, and all_cleared on all 6', () => {
    expect(run('refill_decision').items!.filter((i) => !i.met).map((i) => i.item)).toEqual(ITEMS.filter((x) => x.action !== 'duplicate').map((x) => x.item));
    expect(run('all_cleared').items!.filter((i) => !i.met)).toHaveLength(6);
    expect(run('no_forbidden_order').met).toBe(true);
  });

  it("each item's decisive ids are its own", () => {
    const v = run('refill_decision');
    for (const x of ITEMS) expect(v.items!.find((i) => i.item === x.item)!.decisive_ids).toEqual(x.decisive);
  });
});
