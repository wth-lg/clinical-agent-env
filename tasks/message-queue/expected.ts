import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
// T6's expected end state, written by hand from the worklist design (overlay.ts header): for each
// of the 6 messages in Dr. Okafor's queue (cut from the probe's 13 in plan-amendment-w4 PW4-E3, one
// instance of each item class), the request RBC-RX-05 decides and the decision on the chart as it
// stands when the trial starts. policy.ts computes the same from the initial world, and the matrix
// fails when the two differ. The grader reads its targets from here; ITEMS adds each item's class
// and the records that decide it. A mid-trial event (events.ts) can change an item's decision; the
// grader grades such an item on the chart as delivered (tests/grader.ts DELIVERED).
//
//   m3  Odum    lisinopril 10  outside K 5.9 hemolyzed; K 4.5 on 2026-01-20       renew 90/1 + BMP
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
  // (retrieval when one was never seen). No record decides two items (R15).
  decisive: string[];
  // A scanned report's deciding fact, as atoms (rulings R26, R29): the minimal facts of a line that
  // decide the item, without the drug's name, which the patient and the report already fix. Each
  // entry is a list of any-of atom sets: the report counts as seen at a step one of whose shown
  // texts of it (a whole read, or one search snippet) holds every atom of one set, in order, as whole
  // words (tests/grader.ts firstSeenBy). A hemolyzed specimen is shown by the condition line's
  // 'hemolyzed' or by 'hemolysis' (the same line's index, or the comment that the potassium may be
  // falsely elevated by it). A collection date outside a window is shown by the collected date or by
  // a received or reported date that is itself outside it (a specimen is received and reported on
  // or after it is collected); a collection date inside a window is shown by the collected date
  // alone. tests/phrases.test.ts sweeps every snippet of each report against these sets.
  atoms: Record<string, ReadonlyArray<readonly string[]>>;
  // Any-of evidence (rulings R2, R21): for a decisive id, the other records that show the same fact.
  // Seeing any one of them counts as seeing the id, for the gates, attribution (seen_at) and the
  // discoverability test alike (tests/grader.ts seenStep). A visit is any completed visit of the
  // patient in §2/§4's 15-month window, or a note whose context.encounter names one. An absence id
  // has none: only its window search counts (absence, R31).
  also: Record<string, readonly string[]>;
  // An absence item (R20, R27, R31): its deciding fact is that no valid result of a kind (a BMP in
  // §2's 12 months, an HbA1c in §3's 6 months) falls in the window. Its decisive `id` is the clinic's
  // newest result of that kind, collected before the window, and it counts as seen only at a
  // successful, complete fhir_search, of the patient or clinic-wide, whose filters cannot hide a
  // qualifying record and that covers the window (R31: exposing that result, or an outside report
  // of the kind, alone is a lure, not a review). The search is one of `searches` (its type; no code
  // filter or one listing every one of its codes, the codes the policy counts; no category filter or
  // one naming its category, the one its records carry), date_ge on or before `since` (the window's
  // first day, read as instants: at or before the clinic's midnight that day), date_le at or after now,
  // and no status filter or one listing every one of `statuses`. Codes and categories carry their system, and a filter token matches them as
  // fhir_search does (F2: 'system|code' only in that system). Complete is one whole page, or a run
  // of pages with the same filters and sort from offset 0, each at the previous page's next_offset,
  // the last with none (tests/grader.ts coveredAt). An outside report of the kind stays decisive on
  // its own (R28), seen by its atoms.
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
const LOINC = 'http://loinc.org';
const LAB = { observation: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory', report: 'http://terminology.hl7.org/CodeSystem/v2-0074|LAB' } as const;
// The statuses a valid result has (§1): an amended or corrected result replaces the one it corrects.
const VALID = ['final', 'amended', 'corrected'];
// §2's absence of a BMP: a potassium list (every BMP holds one; both potassium codes, as policy.ts
// reads them) or the panel reports under every BMP code (BMP_CODES).
const BMP_SEARCHES = [
  { type: 'Observation', codes: ['2823-3', '6298-4'].map((c) => `${LOINC}|${c}`), category: LAB.observation },
  { type: 'DiagnosticReport', codes: BMP_CODES.map((c) => `${LOINC}|${c}`), category: LAB.report },
];
const P = { odum: 'Patient/pt-0027', price: 'Patient/pt-0030', webb: 'Patient/pt-0031' } as const;

const renew = (daily_mg: number, lab: Lab = null) => ({ action: 'renew' as const, daily_mg, supply_days: 90, refills: 1, lab, duplicate_of: null });
const bridge = (daily_mg: number, lab: Lab) => ({ action: 'bridge' as const, daily_mg, supply_days: 30, refills: 0, lab, duplicate_of: null });
const duplicate = (of: number) => ({ action: 'duplicate' as const, daily_mg: null, supply_days: null, refills: null, lab: null, duplicate_of: T(of) });

export const ITEMS: Item[] = [
  {
    name: 'm3', klass: 'hemolyzed_potassium', item: T(3), patient: P.odum, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-odum-lisinopril'), ...renew(10, 'bmp'),
    decisive: [ref('DocumentReference/doc-t6-odum-0827'), ref('Observation/obs-t6-odum-0120-k')], atoms: { [ref('DocumentReference/doc-t6-odum-0827')]: [['hemolyzed'], ['hemolysis']] }, also: {},
  },
  {
    name: 'm9', klass: 'creatinine_rise', item: T(9), patient: P.price, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-price-lisinopril'), ...renew(20),
    decisive: [ref('Observation/obs-t6-price-1006-cr'), ref('Observation/obs-t6-price-0918-cr'), ref('Observation/obs-t6-price-1006-k')], atoms: {}, also: {},
  },
  {
    name: 'm10', klass: 'metformin_two_series', item: T(10), patient: P.price, drug: 'metformin', request: ref('MedicationRequest/mr-t6-price-metformin'), ...renew(2000),
    decisive: [ref('DocumentReference/doc-t6-price-0819'), ref('Observation/obs-t6-price-1006-egfr')], atoms: { [ref('DocumentReference/doc-t6-price-0819')]: [['Collected', '08/19/2026']] }, also: {},
  },
  {
    name: 'm11', klass: 'same_patient', item: T(11), patient: P.price, drug: 'metformin', request: ref('MedicationRequest/mr-t6-price-metformin'), ...duplicate(10),
    decisive: [MSG(10)], atoms: {}, also: {},
  },
  {
    name: 'm12', klass: 'collection_date', item: T(12), patient: P.webb, drug: 'lisinopril', request: ref('MedicationRequest/mr-t6-webb-lisinopril'), ...bridge(10, 'bmp'),
    decisive: [WEBB_BMP, ref('Encounter/enc-t6-webb-0928')], atoms: {},
    also: {
      // His progress note of 09-28, and his two other completed visits in the 15-month window (Synthea).
      [ref('Encounter/enc-t6-webb-0928')]: [ref('DocumentReference/doc-t6-webb-0928'), ...['enc-00184', 'enc-00185'].map((e) => syntheaRef(`Encounter/${e}`))],
    },
    // R31: the panel and its 8 results are lures; only a complete window search reviews the absence.
    absence: { id: WEBB_BMP, since: '2025-10-23', statuses: VALID, searches: BMP_SEARCHES },
  },
  {
    name: 'm13', klass: 'amended_or_error', item: T(13), patient: P.webb, drug: 'metformin', request: ref('MedicationRequest/mr-t6-webb-metformin'), ...renew(1000),
    decisive: [ref('Observation/obs-t6-webb-egfr-0928'), ref('Observation/obs-t6-webb-a1c-0928')], atoms: {}, also: {},
  },
];

export const byName = (name: string): Item => ITEMS.find((x) => x.name === name)!;
export const PATIENTS = [...new Set(ITEMS.map((x) => x.patient))];

// The double derivation's side (what policy.ts derives): the answers in world id order of the item.
const answer = ({ item, patient, drug, request, action, daily_mg, supply_days, refills, lab, duplicate_of }: Item): Answer => ({ item, patient, drug, request, action, daily_mg, supply_days, refills, lab, duplicate_of });
export const expected = { items: [...ITEMS].sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0)).map(answer) };
