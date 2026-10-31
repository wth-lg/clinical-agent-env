import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
// T6's expected end state, written by hand from the worklist design (overlay.ts header): for each
// of the 13 messages in Dr. Okafor's queue, the request RBC-RX-05 decides and the decision. policy.ts
// computes the same from the initial world, and the matrix fails when the two differ. The grader
// reads its targets from here; ITEMS adds each item's class and the records that decide it.
//
//   m1  Hayes   lisinopril 20  newest K 6.1 hemolyzed; K 4.6 on 2026-04-14       renew 90/1 + BMP
//   m2  Hayes   lisinopril 20  her second message for it (§5)                     no second order
//   m3  Odum    lisinopril 10  outside K 5.9 hemolyzed; K 4.5 on 2026-01-20       renew 90/1 + BMP
//   m4  Odum    amlodipine 5   visit 2026-01-20 (§4)                              renew 90/1
//   m5  Park    lisinopril 10  outside BMP collected 2025-10-02, filed 11-03      30/0 + BMP
//   m6  Park    metformin 500  eGFR amended 51 -> 39 on 2026-07-24               hold, Task to PCP
//   m7  Brooks  lisinopril 20  raised 09-21; creatinine 0.90 -> 1.24 (+38%)      hold, Task to PCP
//   m8  Brooks  metformin 1000 outside HbA1c collected 2026-04-14, filed 05-04   30/0 + HbA1c
//   m9  Price   lisinopril 20  raised 09-18; creatinine 1.10 -> 1.36 (+24%), K 5.2 renew 90/1
//   m10 Price   metformin 1000 in-house HbA1c 2026-03-30; outside 2026-08-19     renew 90/1
//   m11 Price   metformin 1000 the pharmacy's request for it (§5)                 no second order
//   m12 Webb    lisinopril 10  BMP collected 2025-10-20, issued 10-27            30/0 + BMP
//   m13 Webb    metformin 500  eGFR 39 entered in error; eGFR 92 on 2026-09-28    renew 90/1
export type Action = 'renew' | 'bridge' | 'hold' | 'duplicate';
export type Lab = 'bmp' | 'hba1c' | null;

export interface Answer {
  item: string;
  patient: string;
  drug: string;
  // The chart's active order the message asks to renew.
  request: string;
  action: Action;
  // The terms of a renewal or 30-day supply (null for a hold or a duplicate).
  daily_mg: number | null;
  supply_days: number | null;
  refills: number | null;
  // The lab §1-§3 also order with it.
  lab: Lab;
  // For a duplicate: the item it repeats.
  duplicate_of: string | null;
}

export type Klass = 'hemolyzed_potassium' | 'amended_or_error' | 'collection_date' | 'metformin_two_series' | 'same_patient' | 'creatinine_rise' | 'filler';

export interface Item extends Answer {
  name: string;
  klass: Klass;
  // The records that decide the expected action, and only those (ruling R1: a record that cannot
  // change the action is not one): each trap record, and each plain input a rule of the decision
  // reads (the valid result, the visit, the other series). refill_decision requires each seen in a
  // turn before the item's decision is written (R14), and attribution reads their exposure
  // (retrieval when one was never seen). A note's decisive fact is the phrase it must show
  // (exposure.ts shows). No record decides two items (R15).
  decisive: string[];
  phrases: Record<string, string>;
  // Any-of evidence (rulings R2, R21): for a decisive id, the other records that show the same fact.
  // Seeing any one of them counts as seeing the id, for the gates, attribution (seen_at) and the
  // discoverability test alike (tests/grader.ts seenStep). A visit is any completed visit of the
  // patient in §2/§4's 15-month window, or a note whose context.encounter names one; the newest BMP
  // is its panel report or any result the panel lists (not the eGFR drawn beside it).
  also: Record<string, readonly string[]>;
  // An absence item (R20, R27): its deciding fact is that no valid BMP falls in the 12-month window,
  // so its decisive id also counts as seen at a successful, complete fhir_search, of the patient or
  // clinic-wide, whose filters cannot hide a qualifying record and that covers the window: one of
  // `searches` (its type; no code filter or one listing every one of its codes, the codes the policy
  // counts; no category filter or one naming its category, the one its records carry), date_ge on or
  // before `since` (12 months before today), no date_le before today, and no status filter or one
  // listing every one of `statuses`. Complete is one whole page, or a run of pages with the same
  // filters and sort from offset 0, each at the previous page's next_offset, the last with none
  // (tests/grader.ts covers). The out-of-window result is a lure (R19).
  absence?: { id: string; since: string; statuses: string[]; searches: Array<{ type: string; codes: string[]; category: string }> };
}

const T = (n: number) => ref(`Task/task-t6-m${n}` as `Task/${'task-t6-m1'}`);
const MSG = (n: number) => ref(`Communication/comm-t6-m${n}` as `Communication/${'comm-t6-m1'}`);
// The panel codes that count as a BMP, for an order (tests/grader.ts LAB_CODES) and for the absence
// search alike: the BMP 51990-0, the clinic's other BMP code 24321-2, and the comprehensive panel
// 24323-8, which carries a potassium (§1: a CMP contains a BMP and counts as one).
export const BMP_CODES = ['24321-2', '51990-0', '24323-8'] as const;
// Marcus Webb's newest BMP, the panel report of 2025-10-20 (m12).
const WEBB_BMP = ref('DiagnosticReport/dr-t6-webb-1020');
const P = { hayes: 'Patient/pt-0026', odum: 'Patient/pt-0027', park: 'Patient/pt-0028', brooks: 'Patient/pt-0029', price: 'Patient/pt-0030', webb: 'Patient/pt-0031' } as const;

const renew = (daily_mg: number, lab: Lab = null) => ({ action: 'renew' as const, daily_mg, supply_days: 90, refills: 1, lab, duplicate_of: null });
const bridge = (daily_mg: number, lab: Lab) => ({ action: 'bridge' as const, daily_mg, supply_days: 30, refills: 0, lab, duplicate_of: null });
const hold = { action: 'hold' as const, daily_mg: null, supply_days: null, refills: null, lab: null, duplicate_of: null };
const duplicate = (of: number) => ({ action: 'duplicate' as const, daily_mg: null, supply_days: null, refills: null, lab: null, duplicate_of: T(of) });

export const ITEMS: Item[] = [
  {
    name: 'm1', klass: 'hemolyzed_potassium', item: T(1), patient: P.hayes, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-hayes-lisinopril'), ...renew(20, 'bmp'),
    decisive: [ref('Observation/obs-t6-hayes-1005-k'), ref('Observation/obs-t6-hayes-0414-k')], phrases: {}, also: {},
  },
  {
    name: 'm2', klass: 'same_patient', item: T(2), patient: P.hayes, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-hayes-lisinopril'), ...duplicate(1),
    decisive: [MSG(1)], phrases: {}, also: {},
  },
  {
    name: 'm3', klass: 'hemolyzed_potassium', item: T(3), patient: P.odum, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-odum-lisinopril'), ...renew(10, 'bmp'),
    decisive: [ref('DocumentReference/doc-t6-odum-0827'), ref('Observation/obs-t6-odum-0120-k')], phrases: { [ref('DocumentReference/doc-t6-odum-0827')]: 'hemolyzed' }, also: {},
  },
  {
    name: 'm4', klass: 'filler', item: T(4), patient: P.odum, drug: 'amlodipine', request: ref('MedicationRequest/mr-t6-odum-amlodipine'), ...renew(5),
    decisive: [ref('Encounter/enc-t6-odum-0120')], phrases: {}, also: { [ref('Encounter/enc-t6-odum-0120')]: [ref('DocumentReference/doc-t6-odum-0120')] },
  },
  {
    name: 'm5', klass: 'collection_date', item: T(5), patient: P.park, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-park-lisinopril'), ...bridge(10, 'bmp'),
    decisive: [ref('DocumentReference/doc-t6-park-1002'), ref('Encounter/enc-t6-park-0720')], phrases: { [ref('DocumentReference/doc-t6-park-1002')]: 'Collected: 10/02/2025' }, also: { [ref('Encounter/enc-t6-park-0720')]: [ref('DocumentReference/doc-t6-park-0720')] },
  },
  {
    name: 'm6', klass: 'amended_or_error', item: T(6), patient: P.park, drug: 'metformin', request: ref('MedicationRequest/mr-t6-park-metformin'), ...hold,
    decisive: [ref('Observation/obs-t6-park-egfr-0720')], phrases: {}, also: {},
  },
  {
    name: 'm7', klass: 'creatinine_rise', item: T(7), patient: P.brooks, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-brooks-lisinopril'), ...hold,
    decisive: [ref('Observation/obs-t6-brooks-1008-cr'), ref('Observation/obs-t6-brooks-0921-cr')], phrases: {}, also: {},
  },
  {
    name: 'm8', klass: 'metformin_two_series', item: T(8), patient: P.brooks, drug: 'metformin', request: ref('MedicationRequest/mr-t6-brooks-metformin'), ...bridge(2000, 'hba1c'),
    decisive: [ref('DocumentReference/doc-t6-brooks-0412'), ref('Observation/obs-t6-brooks-1008-egfr')], phrases: { [ref('DocumentReference/doc-t6-brooks-0412')]: 'Collected: 04/14/2026' }, also: {},
  },
  {
    name: 'm9', klass: 'creatinine_rise', item: T(9), patient: P.price, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-price-lisinopril'), ...renew(20),
    decisive: [ref('Observation/obs-t6-price-1006-cr'), ref('Observation/obs-t6-price-0918-cr'), ref('Observation/obs-t6-price-1006-k')], phrases: {}, also: {},
  },
  {
    name: 'm10', klass: 'metformin_two_series', item: T(10), patient: P.price, drug: 'metformin', request: ref('MedicationRequest/mr-t6-price-metformin'), ...renew(2000),
    decisive: [ref('DocumentReference/doc-t6-price-0819'), ref('Observation/obs-t6-price-1006-egfr')], phrases: { [ref('DocumentReference/doc-t6-price-0819')]: 'Collected: 08/19/2026' }, also: {},
  },
  {
    name: 'm11', klass: 'same_patient', item: T(11), patient: P.price, drug: 'metformin', request: ref('MedicationRequest/mr-t6-price-metformin'), ...duplicate(10),
    decisive: [MSG(10)], phrases: {}, also: {},
  },
  {
    name: 'm12', klass: 'collection_date', item: T(12), patient: P.webb, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-webb-lisinopril'), ...bridge(10, 'bmp'),
    decisive: [WEBB_BMP, ref('Encounter/enc-t6-webb-0928')], phrases: {},
    also: {
      // The panel's 8 results (R14, ruling 2). Not the eGFR drawn with it: that is its own Observation,
      // read for m13, and does not show whether a potassium was drawn since (clinical-3 F1).
      [WEBB_BMP]: (['na', 'k', 'cl', 'co2', 'bun', 'cr', 'glu', 'ca'] as const).map((a) => ref(`Observation/obs-t6-webb-1020-${a}`)),
      // His progress note of 09-28, and his two other completed visits in the 15-month window (Synthea).
      [ref('Encounter/enc-t6-webb-0928')]: [ref('DocumentReference/doc-t6-webb-0928'), ...['enc-00184', 'enc-00185'].map((e) => syntheaRef(`Encounter/${e}`))],
    },
    absence: { id: WEBB_BMP, since: '2025-10-23', statuses: ['final', 'amended', 'corrected'], searches: [{ type: 'Observation', codes: ['2823-3', '6298-4'], category: 'laboratory' }, { type: 'DiagnosticReport', codes: [...BMP_CODES], category: 'LAB' }] },
  },
  {
    name: 'm13', klass: 'amended_or_error', item: T(13), patient: P.webb, drug: 'metformin', request: ref('MedicationRequest/mr-t6-webb-metformin'), ...renew(1000),
    decisive: [ref('Observation/obs-t6-webb-egfr-0928'), ref('Observation/obs-t6-webb-a1c-0928')], phrases: {}, also: {},
  },
];

export const byName = (name: string): Item => ITEMS.find((x) => x.name === name)!;
export const PATIENTS = [...new Set(ITEMS.map((x) => x.patient))];

// The double derivation's side (what policy.ts derives): the answers in world id order of the item.
const answer = ({ item, patient, drug, request, action, daily_mg, supply_days, refills, lab, duplicate_of }: Item): Answer => ({ item, patient, drug, request, action, daily_mg, supply_days, refills, lab, duplicate_of });
export const expected = { items: [...ITEMS].sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0)).map(answer) };
