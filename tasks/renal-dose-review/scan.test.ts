// The whole-list scan (plan-amendment-w5 G2; R40): on the built world, every list patient's §1
// inputs and dose are the planned ones, computed by policy.ts from the chart, so no decisive line
// the overlay touches (§1's most recent valid creatinine, the 90-day outside letters, §2's
// inhibitor rule) fires on an unplanned patient; and no resource T1 plants references a patient of
// another task (the frozen T3 and T5 included). Run in every LEVER state after its rebuild.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { TASKS } from '../../packages/env/overlay.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected, LEVER_ITEMS } from './expected.ts';
import { IDS, ref } from './ids.ts';
import { LEVER } from './lever.ts';
import { leverOn } from './lever-keys.ts';
import { derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
type Row = { patient: string; name: string; class: string; action: string; dose: { mg: number }; decisive: string[]; tell?: string };
const derived = (derive(world) as { items: Row[] }).items;
const lref = (reference: string): string => ref(reference as Parameters<typeof ref>[0]);
const lever = (id: 'A' | 'B' | 'reserve') => LEVER_ITEMS.find((i) => i.id === id)!.item;
const T1_PATIENTS = new Set([...TASKS.T1.slots.map((p) => `Patient/${p}`), ...LEVER_ITEMS.map((i) => i.item)]);

describe('T1 whole-list scan (W5 G2)', () => {
  it(`the list is the planned one for LEVER [${LEVER.join(', ')}], each patient's class, action and dose as planned`, () => {
    const planned: Array<[string, string, string, number]> = [
      ...(leverOn('B') ? [[lever('B'), 'inhibitor_stopped', 'increase', 5] as [string, string, string, number]] : []),
      ['Patient/pt-0003', 'outside_scr_umol', 'reduce', 15],
      ['Patient/pt-0041', 'pgp_cyp3a4_inhibitor', 'reduce', 2.5],
      [lever('A'), 'filler', 'unchanged', 5],
      ['Patient/pt-0038', 'cg_crcl_weight_rule', 'increase', 20],
      ['Patient/pt-0043', 'filler', 'unchanged', 20],
      ['Patient/pt-0002', 'apixaban_two_of_three', 'increase', 5],
      ...(leverOn('reserve') ? [[lever('reserve'), 'inhibitor_at_reduced_dose', 'unchanged', 2.5] as [string, string, string, number]] : []),
    ];
    expect(derived.map((r) => [r.patient, r.class, r.action, r.dose.mg])).toEqual(planned);
    expect(expected.items.map((r) => [r.patient, r.class, r.action, r.dose.mg])).toEqual(planned);
  });

  it("each list patient's deciding records are the planned ones (the newest valid creatinine, the newest measured weight, the inhibitor route), so no decisive line fires on another record", () => {
    const by = Object.fromEntries(derived.map((r) => [r.patient, r]));
    expect(by[lever('A')]!.decisive).toEqual([lref('Observation/obs-t1-fw-wt'), lref('Observation/obs-t1-fw-scr')]);
    if (leverOn('B')) expect(by[lever('B')]!.decisive).toEqual([lref('Observation/obs-t1-cas-wt'), lref('Observation/obs-t1-cas-scr'), lever('B'), lref('DocumentReference/doc-t1-cas-id-0910')]);
    if (leverOn('reserve')) expect(by[lever('reserve')]).toMatchObject({ decisive: [lref('Observation/obs-t1-wh-wt'), lever('reserve'), lref('MedicationRequest/mr-t1-wh-itra')], tell: 'Practitioner/pr-reyes' });
    expect(by['Patient/pt-0002']!.decisive).toEqual([ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')]);
    expect(by['Patient/pt-0041']!.decisive).toEqual([ref('MedicationRequest/mr-t1-1703')]);
    // No list patient but the planned ones holds an outside letter of the last 90 days that names an inhibitor.
    const letters = derived.filter((r) => r.decisive.some((d) => d.startsWith('DocumentReference/'))).map((r) => r.patient);
    expect(letters).toEqual(leverOn('B') ? [lever('B')] : []);
  });

  it('every resource T1 plants references only T1 patients: none of another task, the frozen crc-care-gap and contrast-ct-prep included', () => {
    const planted = new Set<string>(Object.values(IDS));
    const refs = (v: unknown, out: string[] = []): string[] => {
      if (Array.isArray(v)) for (const x of v) refs(x, out);
      else if (v !== null && typeof v === 'object') {
        const r = (v as { reference?: unknown }).reference;
        if (typeof r === 'string' && r.startsWith('Patient/')) out.push(r);
        for (const x of Object.values(v)) refs(x, out);
      }
      return out;
    };
    const others = new Set([...TASKS.T3.slots, ...TASKS.T5.slots, ...TASKS.T2.slots, ...TASKS.T4.slots, ...TASKS.T6.slots].map((p) => `Patient/${p}`));
    const bad = all.filter((r) => planted.has(r.id!)).flatMap((r) => refs(r).filter((p) => !T1_PATIENTS.has(p)).map((p) => `${r.resourceType}/${r.id} -> ${p}`));
    expect(bad).toEqual([]);
    expect([...others].filter((p) => T1_PATIENTS.has(p))).toEqual([]);
  });
});
