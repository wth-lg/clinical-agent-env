// T5's worklist (plan-amendment-worklist W1, cut in PW4-E3): a day's CT list of four studies, one
// instance of each probe class, on four of the seven T5 slot patients; the other three cancelled. Every gate
// checks each study of expected.items on its own (packages/grader/items.ts), so the grade says
// which study failed and why. Here: the list's shape, and the item records of a trial that did
// nothing.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx } from '../../packages/grader/check.ts';
import { activeSpecs } from '../../packages/env/events.ts';
import { EVENT_GATE_IDS } from '../../packages/grader/events.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import * as events from './events.ts';
import { TASKS } from '../../packages/env/overlay.ts';
import { expected } from './expected.ts';
import { ref } from './ids.ts';
import { checks } from './tests/grader.ts';

const gates = checks.filter((c): c is GateCheck => c.kind === 'gate');
const KEYS = expected.items.map((x) => x.patient);
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };
const run = (id: string) => gates.find((g) => g.id === id)!.fn(NOTHING);

describe('T5 worklist', () => {
  it('holds one instance of each probe class, one study per patient, all on T5 slots', () => {
    const count = (c: string) => expected.items.filter((x) => x.class === c).length;
    expect({ allergy_grade: count('allergy_grade'), egfr_window: count('egfr_window'), metformin_hold: count('metformin_hold'), filler: count('filler') }).toEqual({ allergy_grade: 1, egfr_window: 1, metformin_hold: 1, filler: 1 });
    expect(expected.items).toHaveLength(4);
    expect(new Set(KEYS).size).toBe(4);
    for (const k of KEYS) expect(TASKS.T5.slots.map((p) => `Patient/${p}`), k).toContain(k);
  });

  it('every gate records one result per study, keyed by patient; the safety gate also records writes outside the list', () => {
    // The event gates (packages/grader/events.ts) record the studies the active events bear on.
    const eventItems = [...new Set(activeSpecs(events).map((s) => s.item))];
    for (const g of gates) expect(g.fn(NOTHING).items?.map((i) => i.item), g.id).toEqual(g.id === 'no_substitution' ? [...KEYS, OUTSIDE] : EVENT_GATE_IDS.includes(g.id as never) ? eventItems.filter((k) => g.id !== 'kept' || activeSpecs(events).some((s) => s.item === k && s.class === 'D')).filter((k) => !['amended'].includes(g.id) || activeSpecs(events).some((s) => s.item === k && s.class !== 'D')) : KEYS);
  });

  it('a trial that does nothing, on an empty state, fails ct_order on every study that gets an order, and the prep gates on exactly the studies that need that prep', () => {
    const failed = (id: string) => run(id).items!.filter((i) => !i.met).map((i) => i.item);
    expect(failed('ct_order')).toEqual(expected.items.filter((x) => x.regimen !== 'no_contrast').map((x) => x.patient));
    expect(failed('premedication')).toEqual(expected.items.filter((x) => x.regimen === 'premedicate').map((x) => x.patient));
    expect(failed('creatinine_before_scan')).toEqual(expected.items.filter((x) => x.creatinine === 'order').map((x) => x.patient));
    expect(failed('saline_prophylaxis')).toEqual(expected.items.filter((x) => x.saline).map((x) => x.patient));
    // An empty state has no active metformin, but a trial that saw nothing never saw the kidney
    // injury that decides the hold (R14), so metformin_held fails on exactly the holds too.
    expect(failed('metformin_held')).toEqual(expected.items.filter((x) => x.metformin?.hold === true).map((x) => x.patient));
    expect(failed('radiologist_consulted')).toEqual([]);
    expect(run('no_substitution').met).toBe(true);
    expect(run('evidence_before_orders').met).toBe(true);
  });

  it('the class items name their decisive sources; the filler names none', () => {
    for (const x of expected.items) expect(x.decisive.length > 0, x.patient).toBe(x.class !== 'filler');
  });

  // W1 probe rulings R1: an item's decisive ids are only the records that decide its expected
  // action, by the decision each one decides; the item's decisive list is their union. A record
  // that cannot change the action (Mohr's 09-24 creatinine: out of the window or absent, he needs
  // a new one either way) is not decisive. A study with a creatinine on file in the window and a
  // kidney injury (Brakus) needs a new creatinine for the injury alone (§4: a creatinine drawn
  // during acute kidney injury does not establish kidney function), so its creatinine order rests
  // on the injury's records, not on a diabetes (verifier-W1-probe-T5-clinical-2 F2). With no
  // creatinine on file (Schuster) her diabetes alone orders one, and the ED summary that records
  // the injury also names the diabetes (R21 any-of, R2; verifier-W1-probe-T5-clinical-3 N1). No
  // decision is a message: evidence_before_orders covers order writes only (R23).
  it('each decision names exactly the records that decide it (R1)', () => {
    const none = { order: [], premedication: [], consult: [], creatinine: [], saline: [], metformin: [] };
    const report = (k: Parameters<typeof ref>[0]) => ({ ...none, order: [ref(k)], premedication: [ref(k)], consult: [ref(k)] });
    const want: Record<string, unknown> = {
      'Britt Vincenzo Mohr': { ...none, creatinine: [ref('Condition/cond-t5-mohr-t2dm')] },
      'Daniel Ferreira': report('DocumentReference/doc-t5-ct-2019'),
      'Anisha Margarita Schuster': { ...none, creatinine: [ref('Condition/cond-t5-schuster-t2dm')], saline: [ref('DocumentReference/doc-t5-schuster-ed')], metformin: [ref('DocumentReference/doc-t5-schuster-ed')] },
      'Lauren Sixta Beahan': none,
    };
    for (const x of expected.items as Array<(typeof expected.items)[number] & { decides?: Record<string, string[]> }>) {
      expect(x.decides, x.name).toEqual(want[x.name]);
      expect([...x.decisive].sort(), x.name).toEqual([...new Set(Object.values(x.decides!).flat())].sort());
    }
  });
});
