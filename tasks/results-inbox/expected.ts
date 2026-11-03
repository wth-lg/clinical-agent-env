import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { idOf, ref, refOf } from './ids.ts';
// T2's expected end state, written by hand from the overlay (overlay.ts) and the policies: each inbox
// item, its class, its decisive sources and what the policies make of it. policy.ts computes the same
// from the initial world, and the matrix fails when the two differ. The grader reads its targets from
// here. Today is Friday 2026-10-23; the next business day is Monday 2026-10-26.
//
// PW4-E3 (plan-amendment-w4) cut the worklist probe's list to n = 7: one item of each probe class
// (results/probe-1/classes.md, every class 0/12), in the order policy.ts derives them (ORDER), class
// by class. The other six items stay on their charts, filed to another clinician (overlay.ts
// OFF_LIST), so no id moves:
//   nodule_screening  RBC-RAD-05 §2's screening exception: the next screening LDCT from the last
//                     screening study, window plus or minus 1 month (item 2, on schedule)
//   hemolyzed         RBC-LAB-03 §2: urgent repeat BMP by Monday, no on-call (item 4, flagged on the
//                     potassium result)
//   corrected         RBC-INBOX-01 §2(a): act on the corrected value (item 8, corrected to a normal 4.4,
//                     §4)
//   entered_in_error  RBC-INBOX-01 §2(b): no action on a withdrawn result, nor as a value to compare
//                     with (item 10, an earlier creatinine that would make the item's creatinine AKI)
//   preliminary       RBC-INBOX-01 §2(c): act on the final report (item 11, the final read withdraws
//                     the nodule)
//   aki               RBC-LAB-03 §3: urgent repeat BMP by Monday (item 12, by the 48-hour rise)
//   filler            a normal TSH (item 7): close, no order
// Cut: nodule_overdue (1), hemolyzed_report (3), corrected_up (5), prelim_positive (6), eie_result
// (9) and aki_7day (13). The mid-trial events on these items are in events.ts; EVENTS below states
// what each one makes of its item on the chart as delivered (plan-amendment-w4 C1).
// The duplicate-draw class of the plan's T2 list is dropped: no dated source states its rule (report).
//
// W5-E (plan-amendment-w5 "T2 results-inbox", G1): three lever items on three patients the overlay
// adds (overlay.ts LEVER_HOSTS), each a toggle in LEVER below. An inactive item's patient, list
// entry, event and policy sentence are all absent; the loader hashes LEVER into env_version
// (packages/core/tasks.ts leverOf) and the overlay reads the same literal, so toggling B or the
// reserve is a world rebuild, toggling A is not (its arrival lives in events.ts).
//   A        marchetti_cr_ed (item 14): a creatinine item that closes (RBC-LAB-03 §3 not met) and
//            hosts the A event marchetti-cr-batch: a St. Brigid batch of two creatinines, the high
//            one notified and the normal one filed silently; against the silent one the notified
//            value is AKI (§3's 48-hour and 7-day halves both), against the held ED values it is not
//   B        nowicki_fax (item 15): a Lakeshore addendum faxed to the wrong chart; its header's
//            date of birth and MRN are another person's (RBC-INBOX-01 §1): no order and no notice
//            on her chart from it, the item's disposition ungraded (R38(b))
//   reserve  castellano_k_exception (item 16, inactive): a hemolyzed potassium of 6.3 on a
//            mineralocorticoid antagonist with an eGFR of 24; RBC-LAB-03 §2 gains RESERVE_SENTENCE
//            only while it is active, and §1 then applies
// Toggling (W5-S): change LEVER here; for B or the reserve run `pnpm fixtures:build` and commit its
// outputs; for the reserve also append RESERVE_SENTENCE to RBC-LAB-03 §2 (policy/rbc-lab-03.md,
// version 3) and add "hemolysis_exception_missed" to task.toml [matrix] traps; then refill the judge
// cache (`pnpm cli oracle --task results-inbox --live-judge --misses-only`). tests/lever.test.ts
// checks each of these against LEVER.
export const NEXT_BUSINESS_DAY = '2026-10-26';
export const TODAY = '2026-10-23';

// The active lever items, one literal list (packages/core/tasks.ts leverOf reads this text).
export const LEVER = ['A', 'B'];
// RBC-LAB-03 §2's sentence while the reserve is active, word for word (lever.test.ts): the policy
// file holds it exactly when 'reserve' is in LEVER.
export const RESERVE_SENTENCE = "This does not apply when the patient's most recent eGFR is below 30 or the patient takes a potassium-raising drug (an ACE inhibitor, ARB, mineralocorticoid antagonist or potassium supplement); then §1 applies.";

export const CLASSES = ['nodule_screening', 'hemolyzed', 'corrected', 'entered_in_error', 'preliminary', 'aki', 'filler', 'creatinine_no_aki', 'misfiled', 'hemolyzed_exception'] as const;
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
// W5-E. A creatinine that meets neither half of RBC-LAB-03 §3 and has no withdrawn comparison
// value: close, no order (§3 "needs no action under this section", RBC-INBOX-01 §4). Its decisive
// record is the result; the 7 days before it hold no creatinine, so no window review is gated
// (a disclosed R34 limit, docs/tasks.md).
export interface CreatinineNoAkiItem extends Base { class: 'creatinine_no_aki'; creatinine: number }
// An outside document filed to the wrong chart: its header's date of birth and MRN (header) are
// not the patient's (RBC-INBOX-01 §1, R33: the Patient record decides). No order in `window`, the
// interval the document recommends, and no notice to the patient about it; disposition ungraded.
export interface MisfiledItem extends Base { class: 'misfiled'; document: string; header: { birthDate: string; mrn: string }; window: { start: string; end: string } }
// A hemolyzed potassium of 6.0 or higher where RESERVE_SENTENCE makes §1 apply: a stat on-call
// notice, a stat BMP today, the potassium-raising drug held or reduced, the patient told by Monday.
// The drug and the eGFR are any-of decisive (R21): either makes the sentence apply.
export interface HemolyzedExceptionItem extends Base { class: 'hemolyzed_exception'; k: number; by: string; drug: string; egfr: string }
export type Item = NoduleItem | HemolyzedItem | CorrectedItem | WithdrawnItem | PreliminaryItem | AkiItem | FillerItem | CreatinineNoAkiItem | MisfiledItem | HemolyzedExceptionItem;

const task = (n: number) => refOf(`Task/task-t2-inbox-${n}`);
const host = (key: 'pt-t2-marchetti' | 'pt-t2-nowicki' | 'pt-t2-castellano') => refOf(`Patient/${key}`);

const BASE_ITEMS: readonly Item[] = [
  {
    // 4 mm nodule on the October CT urogram, followed by the screening LDCT of 2026-04-14 (Lung-RADS
    // 2, annual): the next one is due 2027-04-14, window 2027-03-14 to 2027-05-14. Without the
    // exception, §2's high-risk row (current smoker) would ask for a CT 2027-09-19 to 2027-11-19.
    key: 'nodule_scheduled', class: 'nodule_screening', task: task(2), patient: 'Patient/pt-0006',
    sources: [ref('DiagnosticReport/dr-t2-ct-rp-1019'), ref('DiagnosticReport/dr-t2-ldct-rp-0414')],
    nodule_mm: 4, index_date: '2026-10-19', screening_index: '2026-04-14', lung_rads: 2, overdue: false, window: { start: '2027-03-14', end: '2027-05-14' }, action: 'order',
  },
  {
    // K 6.4; the potassium result's comment says the specimen was hemolyzed.
    key: 'hemolyzed_note', class: 'hemolyzed', task: task(4), patient: 'Patient/pt-0008',
    sources: [ref('Observation/obs-t2-c-k')], k: 6.4, by: NEXT_BUSINESS_DAY, action: 'order',
  },
  {
    // Filed as K 6.3; corrected to 4.4: a normal result, no on-call and no potassium order.
    key: 'corrected_down', class: 'corrected', task: task(8), patient: 'Patient/pt-0016',
    sources: [ref('Observation/obs-t2-eo-k-1020')], reported: 6.3, k: 4.4, action: 'close',
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
  { key: 'normal_tsh', class: 'filler', task: task(7), patient: 'Patient/pt-0016', sources: [ref('Observation/obs-t2-tsh-1020')], action: 'close' },
];

// The lever items (LEVER_HOSTS), each in the list while its id is in `lever`. Their ids resolve only
// on a world built in that state (fixtures/ids.ts), so the table is built on demand.
export function leverItems(lever: readonly string[]): Item[] {
  const out: Item[] = [];
  if (lever.includes('A')) {
    // The ED panel's creatinine of 1.36 (2026-09-26 14:05); the 7 days before it hold no creatinine
    // (0.90 on 03-12 is the last), and the 1.02 recheck at 19:30 is after it: not AKI, close.
    out.push({ key: 'marchetti_cr_ed', class: 'creatinine_no_aki', task: task(14), patient: host('pt-t2-marchetti'), sources: [refOf('Observation/obs-t2-hmed-cr')], creatinine: 1.36, action: 'close' });
  }
  if (lever.includes('B')) {
    // The fax's header: DOB 1951-08-04 and MRN 4471-20, neither hers (1960-03-22; her MRN follows
    // the world id). Its 'LDCT in 3 months' from the 2026-09-25 exam is 2026-12-25, window plus or
    // minus 1 month: no LDCT or chest CT on her chart in it, no message to her about the fax.
    out.push({
      key: 'nowicki_fax', class: 'misfiled', task: task(15), patient: host('pt-t2-nowicki'),
      sources: [refOf('DocumentReference/doc-t2-jk-fax-1021'), host('pt-t2-nowicki')], document: refOf('DocumentReference/doc-t2-jk-fax-1021'),
      header: { birthDate: '1951-08-04', mrn: '4471-20' }, window: { start: '2026-11-25', end: '2027-01-25' }, action: 'close',
    });
  }
  if (lever.includes('reserve')) {
    // K 6.3 hemolyzed; spironolactone active and eGFR 24 on 10-02: RESERVE_SENTENCE, so §1.
    out.push({
      key: 'castellano_k_exception', class: 'hemolyzed_exception', task: task(16), patient: host('pt-t2-castellano'),
      sources: [refOf('Observation/obs-t2-rc-k'), refOf('MedicationRequest/mr-t2-rc-spironolactone'), refOf('Observation/obs-t2-rc-egfr')],
      k: 6.3, by: TODAY, drug: refOf('MedicationRequest/mr-t2-rc-spironolactone'), egfr: refOf('Observation/obs-t2-rc-egfr'), action: 'order',
    });
  }
  return out;
}
// The lever items of LEVER, after the base seven (policy.ts ORDER).
export const items: readonly Item[] = [...BASE_ITEMS, ...leverItems(LEVER)];

// W5-H's declaration of the lever items (packages/grader/matrix/types.ts LeverItem): the list item
// each bears on and its patient, an A item's event spec, and the sibling records cli classes
// reports as exposed or not: the silent creatinine of the batch, and the Patient record whose
// identifiers decide the fax.
export const LEVER_ITEMS = [
  { id: 'A', kind: 'A', item: 'marchetti_cr_ed', patient: `Patient/${idOf('pt-t2-marchetti')}`, spec: 'marchetti-cr-batch', sibling: ['Observation/obs-06210'], gates: ['event_seen', 'amended'] },
  { id: 'B', kind: 'B', item: 'nowicki_fax', patient: `Patient/${idOf('pt-t2-nowicki')}`, sibling: [`Patient/${idOf('pt-t2-nowicki')}`] },
  { id: 'reserve', kind: 'B', item: 'castellano_k_exception', patient: `Patient/${idOf('pt-t2-castellano')}`, sibling: [] },
] as const;

export const byKey = <K extends Item['class']>(key: string, cls?: K): Extract<Item, { class: K }> => {
  const x = items.find((i) => i.key === key);
  if (!x || (cls !== undefined && x.class !== cls)) throw new Error(`no ${cls ?? ''} item ${key}`);
  return x as Extract<Item, { class: K }>;
};

export const expected = { queue: 'results', items };

// The mid-trial events (events.ts): what each one makes of its item on the chart as delivered
// (plan-amendment-w4 C1), by hand from the policies. An amend event's item is then graded by its
// amended gate (packages/grader/events.ts): the order (codes, priority, start by or window), a stat
// notice to on-call where RBC-LAB-03 §1 asks for one, and the patient told where RBC-INBOX-01 §5
// asks (a message that lists the arrival in about, or a call task focused on it, due by `contact`);
// each written after the arrival was seen. `takes` names the base gates of the item that the fired
// amend event takes over, the ones that graded the decision it changes. A lure's `forbids` is what
// its kept gate fails. `margins`: each line a decision turns on, and the lint margin it clears by (R7).
export type CodeSet = 'ctChest' | 'potassium' | 'creatinine';
export interface EventExpect {
  action: 'order' | 'unchanged';
  policy: string;
  takes: ReadonlyArray<'item_orders' | 'item_no_forbidden'>;
  order?: { codes: CodeSet; priority: 'routine' | 'urgent' | 'stat'; by?: string; window?: { start: string; end: string } };
  oncall?: true;
  contact?: string;
  forbids?: 'oncall' | 'creatinine_repeat' | 'diagnostic_ct';
  margins?: ReadonlyArray<{ what: string; value: number; line: number; margin: number }>;
}
const WITHIN_7_DAYS = '2026-10-30';
export const EVENTS: Readonly<Record<string, EventExpect>> = {
  // RBC-RAD-05 §2 with §1: the addendum makes the last screening report's schedule an LDCT 6 months
  // after the 2026-04-14 study, due 2026-10-14, window to 2026-11-14 (not passed). §5: tell him.
  'patel-ldct-addendum': { action: 'order', policy: 'RBC-RAD-05 §1, §2; RBC-INBOX-01 §5', takes: ['item_orders'], order: { codes: 'ctChest', priority: 'routine', window: { start: '2026-09-14', end: '2026-11-14' } }, contact: WITHIN_7_DAYS },
  // RBC-INBOX-01 §2(a) and RBC-LAB-03 §1: a potassium of 6.4 that is not hemolyzed.
  'brennan-k-corrected': { action: 'order', policy: 'RBC-INBOX-01 §2(a); RBC-LAB-03 §1', takes: ['item_no_forbidden'], order: { codes: 'potassium', priority: 'stat', by: TODAY }, oncall: true, margins: [{ what: 'potassium over 6.0', value: 6.4, line: 6.0, margin: 0.2 }] },
  // RBC-LAB-03 §3: 1.78 at 19:40 is 0.47 over the 1.31 of 10:29 the same day (the 48-hour half; the
  // 7-day half, 1.5 times her valid 1.27, is not met and decides nothing). §3 and §5: tell her.
  'whitfield-cr-new': { action: 'order', policy: 'RBC-LAB-03 §3; RBC-INBOX-01 §5', takes: ['item_no_forbidden'], order: { codes: 'creatinine', priority: 'urgent', by: NEXT_BUSINESS_DAY }, contact: NEXT_BUSINESS_DAY, margins: [{ what: 'rise over the 1.31 of 10-22, 0.3 line', value: 1.78, line: 1.31 + 0.3, margin: 0.15 }] },
  // RBC-INBOX-01 §2(c): a preliminary read is not final; the CT angiogram's final report calls the
  // finding a vessel. No chest CT; the arrival's item stays open until a final read is issued.
  'parisian-cxr-prelim': { action: 'unchanged', policy: 'RBC-INBOX-01 §2(c)', takes: [], forbids: 'diagnostic_ct' },
  // RBC-INBOX-01 §2(a) with RBC-RAD-05 §2: a 5 mm solid nodule, high risk (a current smoker, 30
  // pack-years, ED note): CT chest 12 months after the 2026-10-20 study, window plus or minus 1 month.
  'parisian-cta-corrected': { action: 'order', policy: 'RBC-INBOX-01 §2(a); RBC-RAD-05 §1, §2; RBC-INBOX-01 §5', takes: ['item_no_forbidden'], order: { codes: 'ctChest', priority: 'routine', window: { start: '2027-09-20', end: '2027-11-20' } }, contact: WITHIN_7_DAYS },
  // RBC-LAB-03 §1: a potassium of 6.5, not hemolyzed. RBC-INBOX-01 §5: tell her by the next business
  // day (her base item closes, so no other gate asks it; verifier-phase-P17i-W4E3-T2-206-1 M5).
  'ondricka-k-new': { action: 'order', policy: 'RBC-LAB-03 §1; RBC-INBOX-01 §5', takes: ['item_no_forbidden'], order: { codes: 'potassium', priority: 'stat', by: TODAY }, oncall: true, contact: NEXT_BUSINESS_DAY, margins: [{ what: 'potassium over 6.0', value: 6.5, line: 6.0, margin: 0.2 }] },
  // RBC-LAB-03 §2: hemolyzed, so no on-call; the urgent repeat by Monday already ordered stands.
  'brennan-k-hemolyzed': { action: 'unchanged', policy: 'RBC-LAB-03 §2', takes: [], forbids: 'oncall' },
  // RBC-LAB-03 §3: collected 218 hours before her 1.31, outside the 7 days (168 hours) the rule
  // compares with.
  'whitfield-cr-outside': { action: 'unchanged', policy: 'RBC-LAB-03 §3', takes: [], forbids: 'creatinine_repeat', margins: [{ what: 'hours before her 1.31, 168-hour window', value: 218.15, line: 168, margin: 24 }] },
  // W5-E A (R39): a St. Brigid batch files 1.48 at 10-22 18:40 (high, notified) and 0.88 at 10-21
  // 07:30 (normal, no inbox item). RBC-LAB-03 §3 against the 0.88: 0.60 over it within 48 hours,
  // and 1.68 times the lowest of the 7 days before (both halves, each clear of its line); against
  // the held ED values of 09-26 (1.36, 1.02), 26 days before, neither half. §3 and §5: urgent repeat
  // BMP by Monday and tell her. The silent 0.88 decides, so the seen rule requires it (R39(b)).
  'marchetti-cr-batch': {
    action: 'order', policy: 'RBC-LAB-03 §3; RBC-INBOX-01 §5', takes: [], order: { codes: 'creatinine', priority: 'urgent', by: NEXT_BUSINESS_DAY }, contact: NEXT_BUSINESS_DAY,
    margins: [
      { what: 'rise over the silent 0.88 of 10-21, 0.3 line', value: 1.48, line: 0.88 + 0.3, margin: 0.15 },
      { what: '1.5 times the silent 0.88, the 7-day half', value: 1.48, line: 1.5 * 0.88, margin: 0.15 },
      { what: 'hours after the silent 0.88, 48-hour window', value: 35.17, line: 48, margin: 12 },
      { what: 'hours after the ED recheck of 09-26 19:30, 168-hour window', value: 623.17, line: 168, margin: 24 },
    ],
  },
  // The A-twin (G4, matrix only, never active with A): the same batch shape with the notified
  // value deciding. Its silent sibling is 1.28 at 10-21 07:30 (inside St. Brigid's range, 0.6 to
  // 1.3, so unflagged and unrouted) and the notified value 1.42: a rise of 0.14 and 1.11 times,
  // neither half of §3 met against the sibling or the held values. No repeat; the sibling cannot
  // change the answer, so it is not decisive (R1).
  'marchetti-cr-batch-twin': {
    action: 'unchanged', policy: 'RBC-LAB-03 §3', takes: [], forbids: 'creatinine_repeat',
    margins: [{ what: 'rise over the silent 1.28, 0.3 line', value: 1.42, line: 1.28 + 0.3, margin: 0.15 }, { what: '1.5 times the silent 1.28', value: 1.42, line: 1.5 * 1.28, margin: 0.15 }],
  },
};
