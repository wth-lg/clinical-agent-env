import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
// T2's expected end state, written by hand from the overlay (overlay.ts) and the policies: each inbox
// item, its class, its decisive sources and what the policies make of it. policy.ts computes the same
// from the initial world, and the matrix fails when the two differ. The grader reads its targets from
// here. Today is Friday 2026-10-23; the next business day is Monday 2026-10-26.
//
// The worklist probe (plan-amendment-worklist.md W1, T2) holds exactly two items of each kept class and
// one filler (CLASSES; worklist.test.ts), in the order policy.ts derives them (ORDER), class by class:
//   nodule_screening  RBC-RAD-05 §2's screening exception: the next screening LDCT from the last
//                     screening study, window plus or minus 1 month, or within 14 days of today once
//                     that window has passed (item 1 overdue, item 2 on schedule)
//   hemolyzed         RBC-LAB-03 §2: urgent repeat BMP by Monday, no on-call (item 3 flagged on the
//                     panel's report, item 4 on the potassium result)
//   corrected         RBC-INBOX-01 §2(a): act on the corrected value (item 5 corrected to a critical
//                     6.4, RBC-LAB-03 §1; item 8 corrected to a normal 4.4, §4)
//   entered_in_error  RBC-INBOX-01 §2(b): no action on a withdrawn result, nor as a value to compare
//                     with (item 9 the item's own FIT; item 10 an earlier creatinine that would make the
//                     item's creatinine AKI)
//   preliminary       RBC-INBOX-01 §2(c): act on the final report (item 6's final read is an urgent
//                     bone lesion, RBC-RAD-05 §3; item 11's final read withdraws the nodule)
//   aki               RBC-LAB-03 §3: urgent repeat BMP by Monday (item 12 by the 48-hour rise, item 13
//                     by the 7-day ratio)
//   filler            a normal TSH (item 7): close, no order
// The duplicate-draw class of the plan's T2 list is dropped: no dated source states its rule (report).
export const NEXT_BUSINESS_DAY = '2026-10-26';
export const TODAY = '2026-10-23';

export const CLASSES = ['nodule_screening', 'hemolyzed', 'corrected', 'entered_in_error', 'preliminary', 'aki', 'filler'] as const;
export type Class = (typeof CLASSES)[number];

interface Base {
  key: string;
  task: string;
  patient: string;
  // The records that decide the item's action (w1-probe-rulings R1): its result and the record that
  // changes the reading. A record that cannot change the action is not one: a preliminary report whose
  // final version exists (the final decides). Every seen-before rule, the notes rubric and the
  // per-item attribution read this list.
  sources: readonly string[];
  // order: the item needs an order (and its patient told, RBC-INBOX-01 §5); close: no order.
  action: 'order' | 'close';
}
export interface NoduleItem extends Base { class: 'nodule_screening'; nodule_mm: number; index_date: string; screening_index: string; lung_rads: number; overdue: boolean; window: { start: string; end: string } }
export interface HemolyzedItem extends Base { class: 'hemolyzed'; k: number; by: string }
export interface CorrectedItem extends Base { class: 'corrected'; reported: number; k: number; by?: string }
// A withdrawn comparison creatinine (forbid 'creatinine') also has RBC-LAB-03 §3's 7-day window
// before the item's result (R31): from the instant 7 days before its collection to the collection,
// as ISO instants. The rule's two halves (a rise over a value in the 48 hours before, 1.5 times the
// lowest value in the 7 days before) are both ruled out only by seeing every valid creatinine in
// that window, so its review is a search that cannot hide one (tests/grader.ts windowCovers). The
// window's lowest valid creatinine (by value, then id) stands for that review in sources: it counts as
// seen only once such a search completes, never by being read or shown on a narrower search.
export interface WithdrawnItem extends Base { class: 'entered_in_error'; withdrawn: string; forbid: 'gi' | 'creatinine'; baseline?: { id: string; from: string; to: string } }
export interface PreliminaryItem extends Base { class: 'preliminary'; final: string; report_date: string; by?: string }
export interface AkiItem extends Base { class: 'aki'; creatinine: number; compare: string; compare_value: number; rule: '48h' | '7d'; by: string }
export interface FillerItem extends Base { class: 'filler' }
export type Item = NoduleItem | HemolyzedItem | CorrectedItem | WithdrawnItem | PreliminaryItem | AkiItem | FillerItem;

const task = (n: number) => ref(`Task/task-t2-inbox-${n}` as `Task/task-t2-inbox-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`);

export const items: readonly Item[] = [
  {
    // 5 mm nodule on the June CT, followed by Lakeshore's screening LDCT of 2025-09-15 (Lung-RADS 2,
    // annual): due in September 2026, its window closed in mid-October, so within 14 days of today.
    key: 'nodule_overdue', class: 'nodule_screening', task: task(1), patient: 'Patient/pt-0013',
    sources: [ref('DiagnosticReport/dr-t2-ct-0604'), ref('DiagnosticReport/dr-t2-ldct-0915')],
    nodule_mm: 5, index_date: '2026-06-04', screening_index: '2025-09-15', lung_rads: 2, overdue: true, window: { start: '2026-10-23', end: '2026-11-06' }, action: 'order',
  },
  {
    // 4 mm nodule on the October CT urogram, followed by the screening LDCT of 2026-04-14 (Lung-RADS
    // 2, annual): the next one is due 2027-04-14, window 2027-03-14 to 2027-05-14. Without the
    // exception, §2's high-risk row (current smoker) would ask for a CT 2027-09-19 to 2027-11-19.
    key: 'nodule_scheduled', class: 'nodule_screening', task: task(2), patient: 'Patient/pt-0006',
    sources: [ref('DiagnosticReport/dr-t2-ct-rp-1019'), ref('DiagnosticReport/dr-t2-ldct-rp-0414')],
    nodule_mm: 4, index_date: '2026-10-19', screening_index: '2026-04-14', lung_rads: 2, overdue: false, window: { start: '2027-03-14', end: '2027-05-14' }, action: 'order',
  },
  {
    // K 6.3; the panel's report says the specimen was hemolyzed, the potassium result does not.
    key: 'hemolyzed_report', class: 'hemolyzed', task: task(3), patient: 'Patient/pt-0006',
    sources: [ref('DiagnosticReport/dr-t2-bmp-rp'), ref('Observation/obs-t2-rp-k')], k: 6.3, by: NEXT_BUSINESS_DAY, action: 'order',
  },
  {
    // K 6.4; the potassium result's comment says the specimen was hemolyzed.
    key: 'hemolyzed_note', class: 'hemolyzed', task: task(4), patient: 'Patient/pt-0008',
    sources: [ref('Observation/obs-t2-c-k')], k: 6.4, by: NEXT_BUSINESS_DAY, action: 'order',
  },
  {
    // Filed as K 5.2; corrected to 6.4 (not hemolyzed): stat on-call notice and a stat BMP today.
    key: 'corrected_up', class: 'corrected', task: task(5), patient: 'Patient/pt-0010',
    sources: [ref('Observation/obs-t2-d-k')], reported: 5.2, k: 6.4, by: TODAY, action: 'order',
  },
  {
    // Filed as K 6.3; corrected to 4.4: a normal result, no on-call and no potassium order.
    key: 'corrected_down', class: 'corrected', task: task(8), patient: 'Patient/pt-0016',
    sources: [ref('Observation/obs-t2-eo-k-1020')], reported: 6.3, k: 4.4, action: 'close',
  },
  {
    // A positive FIT marked entered in error (withdrawn): no GI referral.
    key: 'eie_result', class: 'entered_in_error', task: task(9), patient: 'Patient/pt-0016',
    sources: [ref('Observation/obs-t2-eo-fit-1019')], withdrawn: ref('Observation/obs-t2-eo-fit-1019'), forbid: 'gi', action: 'close',
  },
  {
    // Creatinine 1.31; the 0.84 of 10-21 (inside 48 hours) is withdrawn, and the valid 1.27 of 10-17
    // gives 1.03 times: not AKI, no order. The 1.31 was collected 2026-10-22 10:29:10 -04:00, so the
    // 7-day window opens 2026-10-15 10:29:10 -04:00; its lowest valid value is the 1.27 of 10-17
    // under 2160-0 (base obs-02297), seen only by a search that covers the window (R31).
    key: 'eie_baseline', class: 'entered_in_error', task: task(10), patient: 'Patient/pt-0033',
    sources: [ref('Observation/obs-t2-cw-cr'), ref('Observation/obs-t2-cw-cr-1021'), syntheaRef('Observation/obs-02297')], withdrawn: ref('Observation/obs-t2-cw-cr-1021'), forbid: 'creatinine', action: 'close',
    baseline: { id: syntheaRef('Observation/obs-02297'), from: '2026-10-15T14:29:10.000Z', to: '2026-10-22T14:29:10.000Z' },
  },
  {
    // The preliminary read saw no fracture; the final read (to urgent care) is an aggressive lytic
    // lesion with an urgent recommendation and no interval: urgent ortho-oncology referral and MRI
    // femur within 14 days of the final report, by 2026-11-05.
    key: 'prelim_positive', class: 'preliminary', task: task(6), patient: 'Patient/pt-0053',
    sources: [ref('DiagnosticReport/dr-t2-xr-1022')], final: ref('DiagnosticReport/dr-t2-xr-1022'), report_date: '2026-10-22', by: '2026-11-05', action: 'order',
  },
  {
    // The preliminary read saw a 5 mm nodule; the final read calls it a vessel, no nodule, no follow-up.
    key: 'prelim_negative', class: 'preliminary', task: task(11), patient: 'Patient/pt-0007',
    sources: [ref('DiagnosticReport/dr-t2-cta-1021')], final: ref('DiagnosticReport/dr-t2-cta-1021'), report_date: '2026-10-21', action: 'close',
  },
  {
    // Creatinine 1.64; 0.98 at the ED 34 hours earlier: a rise of 0.66 (and 1.67 times, so both
    // branches are met, each by more than the lint's 0.15 margin).
    key: 'aki_48h', class: 'aki', task: task(12), patient: 'Patient/pt-0007',
    sources: [ref('Observation/obs-t2-lp-cr'), ref('Observation/obs-t2-lped-cr')], creatinine: 1.64, compare: ref('Observation/obs-t2-lped-cr'), compare_value: 0.98, rule: '48h', by: NEXT_BUSINESS_DAY, action: 'order',
  },
  {
    // Creatinine 1.26; 0.72 at urgent care 6 days earlier: 1.75 times, with no value inside 48 hours.
    key: 'aki_7day', class: 'aki', task: task(13), patient: 'Patient/pt-0013',
    sources: [ref('Observation/obs-t2-lm-cr'), ref('Observation/obs-t2-lmuc-cr')], creatinine: 1.26, compare: ref('Observation/obs-t2-lmuc-cr'), compare_value: 0.72, rule: '7d', by: NEXT_BUSINESS_DAY, action: 'order',
  },
  { key: 'normal_tsh', class: 'filler', task: task(7), patient: 'Patient/pt-0016', sources: [ref('Observation/obs-t2-tsh-1020')], action: 'close' },
];

export const byKey = <K extends Item['class']>(key: string, cls?: K): Extract<Item, { class: K }> => {
  const x = items.find((i) => i.key === key);
  if (!x || (cls !== undefined && x.class !== cls)) throw new Error(`no ${cls ?? ''} item ${key}`);
  return x as Extract<Item, { class: K }>;
};

export const expected = { queue: 'results', items };
