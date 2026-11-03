// T6's other correct solutions (cut to the 6 items and the mid-trial events in plan-amendment-w4
// PW4-E3): variants of the oracle's route (solution/steps.ts route, events.ts ACTIVE delivered and
// re-checked), each handling one item another way a clinician could, and each expected to PASS with
// every rubric item kept. The repeat request and the scope each have one whose forbidden write the
// tools rejected: a rejected write is not in the committed state, so it never fails a gate
// (decisions.tsv 2026-10-31T17:22Z). rubric.test.ts lists those rejections and allows no other.
// Two more re-check the queues another way (R27: a complete listing, paged or unfiltered), and the
// event alternatives (tests/event-cases.ts) are those of each active spec.
import { synthea } from '../../../packages/env/synthea-ids.ts';
import type { Alternative } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { BMP_CODES } from '../expected.ts';
import { ref } from '../ids.ts';
import { LEVER } from '../lever.ts';
import {
  bmpOrder, call, cancel, change, close, HOLD_TASK, inbox, KAPLAN_LOOK, kaplanHold, lab, MR, ODUM_REPORT, odumBmp, odumRenew, order, PCP, PRICE_REPORT, priceLisinopril, priceMetformin, PT, read, readDoc, recheck, resultsInbox, route, type RouteOpts, RX, search, task, voided, WEBB_READS, webbBmp,
  webbBridge, webbMetformin,
} from '../solution/steps.ts';
import { eventAlternatives } from './event-cases.ts';

const on = (spec: string) => ACTIVE.includes(spec);
const r = (o: RouteOpts) => route(o);
const tablets = (patient: string, rxnorm_code: string, n: number, frequency: string, supply_days: number, refills: number, reason: string) =>
  call('order_medication', { patient, rxnorm_code, dose_value: n, dose_unit: '{tablet}', route: 'oral', frequency, supply_days, refills, reason });
const [WEBB_K, WEBB_EGFR, , WEBB_VISITS] = [WEBB_READS.calls[0]!, WEBB_READS.calls[1]!, WEBB_READS.calls[2]!, WEBB_READS.calls[3]!];
// R20: a search that covers §2's 12-month window, counted back from today (2026-10-23) to the collection date.
const inWindow = (code: string) => search('Observation', PT.webb, { code, date_ge: '2025-10-23', sort: '-date' });
// R27 (gate 3 F1): the clinic's BMP panel reports under every code that counts as a BMP (expected.ts
// BMP_CODES), 10 a page so the page cut is by count, not the tool's size cap (W5-E: the B host adds
// three panels to the window, which moved the cap's cut; the run reads six pages, 51 panels at most,
// and a page past the end is empty).
const CLINIC_PANELS = call('fhir_search', { resource_type: 'DiagnosticReport', code: BMP_CODES.join(','), date_ge: '2025-10-23', count: 10, sort: '-date' });
const CLINIC_PANEL_PAGES = [0, 10, 20, 30, 40, 50].map((offset) => (offset === 0 ? CLINIC_PANELS : { ...CLINIC_PANELS, input: { ...CLINIC_PANELS.input, offset } }));
// A write the tools reject: the dose matches no whole or half tablet of the product.
const rejected = (patient: string, rxnorm_code: string, frequency: string) => order(patient, rxnorm_code, 3, frequency, 90, 1, 'refill');
const PRICE_FIRST = (lis = [priceLisinopril], met = [priceMetformin], c11 = [close(11, 'Same request as his message of 10/20; answered there.')]) => [...lis, ...met, close(9), close(10), ...c11];
const WEBB_FIRST = (lis = [webbBridge], bmp = [webbBmp], met = [webbMetformin]) => [...lis, ...bmp, ...met, close(12), close(13)];

// R29 (builder-254 sweep): the oracle's read of an outside report replaced by a note search whose
// snippet shows one of its atom sets (expected.ts Item.atoms) and no other line of it.
const bySnippet = (turn: typeof ODUM_REPORT, patient: string, query: string): RouteOpts => ({ reads: turn.calls.map((c) => [c, [call('search_notes', { query, patient })]] as [typeof c, Array<typeof c>]) });

// The lisinopril renewal written as tablets, and the order that replaces the 30-day one, each voided
// in turn when its patient's amend event arrives.
const odumTablets = tablets(PT.odum, RX.lis10, 1, 'QD', 90, 1, 'RBC-RX-05 §2');
const priceReplaces = call('order_medication', { patient: PT.price, rxnorm_code: RX.lis20, dose_value: 20, dose_unit: 'mg', route: 'oral', frequency: 'QD', supply_days: 90, refills: 1, reason: 'RBC-RX-05 §2', replaces: ref('MedicationRequest/mr-t6-price-lisinopril') });
const webbCmp = lab(PT.webb, '24323-8', 'Panel for lisinopril, none in 12 months');

const REJECTED_MET = rejected(PT.price, RX.met1000, 'BID');
const REJECTED_SCOPE = call('order_service', { patient: 'pt-0001', code: '00000-0', priority: 'routine', occurrence_start: '2026-10-23', occurrence_end: '2026-11-06', reason: 'BMP' });

export const REJECTING = ['m11_rejected_duplicate', 'scope_rejected'] as const;

export const alternatives: Alternative[] = [
  // R29: the report's comment says the potassium may be falsely elevated by hemolysis.
  { id: 'm3_hemolysis_comment', why: "Finds Frank Odum's outside report with a note search for 'recollection', whose snippet shows the comment that the potassium may be falsely elevated by hemolysis.", script: r(bySnippet(ODUM_REPORT, PT.odum, 'recollection')) },
  {
    id: 'm3_tablet_dose',
    why: 'Writes the lisinopril renewal as one 10 mg tablet a day.',
    script: r({ first: { odum: [odumTablets, odumBmp, close(3)] }, ...(on('odum-o1') ? { amend: { 'odum-o1': (m) => [voided(m, odumTablets), HOLD_TASK.odum] } } : {}) }),
  },
  { id: 'm3_cmp_repeat', why: 'Repeats the hemolyzed potassium with a comprehensive panel, which contains the BMP.', script: r({ first: { odum: [odumRenew, lab(PT.odum, '24323-8', 'Repeat the hemolyzed potassium'), close(3)] } }) },
  // R16: a defensible extra the policy does not forbid passes.
  { id: 'm9_extra_bmp', why: "Renews Samuel Price's lisinopril for 90 days and also orders a BMP to recheck the high-flagged potassium.", script: r({ first: { price: PRICE_FIRST([priceLisinopril, bmpOrder(PT.price, 'Recheck potassium 5.2 after the dose increase')]) } }) },
  {
    id: 'm9_replaces',
    why: 'Renews the raised lisinopril dose as an order that replaces the 30-day one.',
    script: r({ first: { price: PRICE_FIRST([priceReplaces]) }, ...(on('price-b1') ? { amend: { 'price-b1': (m) => [voided(m, priceReplaces), HOLD_TASK.price] } } : {}) }),
  },
  { id: 'm10_note_search', why: "Finds Samuel Price's outside HbA1c with a note search instead of reading the report.", script: r({ reads: PRICE_REPORT.calls.map((c) => [c, [call('search_notes', { query: 'HbA1c collected', patient: PT.price })]] as [typeof c, Array<typeof c>]) }) },
  {
    id: 'price_metformin_first',
    why: 'Places the metformin renewal before the lisinopril.',
    script: r({ first: { price: [priceMetformin, priceLisinopril, close(9), close(10), close(11, 'Same request as his message of 10/20; answered there.')] } }),
  },
  {
    id: 'm11_rejected_duplicate',
    why: "Starts an order for the pharmacy's metformin request, which the tools reject, then cancels that message as a repeat.",
    script: r({ first: { price: PRICE_FIRST(undefined, undefined, [REJECTED_MET, cancel(11, 'Repeat of his 10/20 request, answered there')]) }, rejected: [REJECTED_MET] }),
  },
  { id: 'm12_visit_by_note', why: "Establishes Marcus Webb's 09/28/2026 visit from its progress note instead of an Encounter search.", script: r({ reads: [[WEBB_VISITS, [readDoc('doc-t6-webb-0928')]]] }) },
  // R21: any completed visit in the 15-month window allows the 30-day supply, not only the planted one.
  { id: 'm12_other_visit', why: "Establishes a completed visit from Marcus Webb's 10/06/2025 check-up, read by id, instead of an Encounter search.", script: r({ reads: [[WEBB_VISITS, [read('Encounter', synthea('enc-00185'))]]] }) },
  // Clinical gate 2 F1 route C, R31: the panel reports under every BMP code, complete.
  { id: 'm12_panel_report', why: "Reads Marcus Webb's BMP panel reports under every BMP code instead of his potassium list, and sees the newest was collected 10/20/2025.", script: r({ reads: [[WEBB_K, [search('DiagnosticReport', PT.webb, { code: BMP_CODES.join(','), sort: '-date' })]]] }) },
  {
    id: 'm12_window_search_systems',
    why: "Searches Marcus Webb's potassium from 10/23/2025 on, naming LOINC and the laboratory category with their systems: none in 12 months, so 30 days and a BMP.",
    script: r({ reads: [[WEBB_K, [search('Observation', PT.webb, { code: 'http://loinc.org|2823-3,http://loinc.org|6298-4', category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory', date_ge: '2025-10-23', sort: '-date' })]]] }),
  },
  {
    id: 'm12_window_clinic_time',
    why: "Searches Marcus Webb's potassium (both codes) from midnight 10/23/2025 to 8:00 today, clinic time with its offset: none in 12 months, so 30 days and a BMP.",
    script: r({ reads: [[WEBB_K, [search('Observation', PT.webb, { code: '2823-3,6298-4', date_ge: '2025-10-23T00:00-04:00', date_le: '2026-10-23T08:00-04:00', sort: '-date' })]]] }),
  },
  { id: 'm12_window_search', why: "Searches Marcus Webb's potassium (both codes) and eGFR from 10/23/2025 on: no potassium in 12 months, so 30 days and a BMP.", script: r({ reads: [[WEBB_K, [inWindow('2823-3,6298-4')]], [WEBB_EGFR, [inWindow('33914-3')]]] }) },
  // R27: a complete clinic-wide search over the window counts for every patient it would show; the
  // page is cut by the tool's size cap, so the run takes two pages with one sort.
  { id: 'm12_clinic_panels', why: 'Pages through every BMP panel report in the clinic from 10/23/2025 on, 10 a page, finds none for Marcus Webb, and gives 30 days and a BMP.', script: r({ reads: [[WEBB_K, CLINIC_PANEL_PAGES], [WEBB_EGFR, [inWindow('33914-3')]]] }) },
  // R36 (builder-273): his whole Observation list newest first, read from offset 0 to a page whose
  // oldest result is before the window's first day, not to the last page.
  // verifier-phase-P17i-S0-208-1 M2 (as T3's G2, builder-292): page 1 dates from 1900, page 2 drops
  // the date filter at the same total and reaches past the window's first day (R27, R36, R34).
  {
    id: 'm12_page_run_drops_date_ge',
    why: "Lists Marcus Webb's observations from 1900 newest first, 4 a page, then asks for the next page without the date filter: both pages count the same results in one order, and the second reaches back past 10/23/2025 to his 10/20/2025 panel: none in 12 months, so 30 days and a BMP.",
    script: r({ reads: [[WEBB_K, [search('Observation', PT.webb, { count: 4, sort: '-date', date_ge: '1900-01-01' }), search('Observation', PT.webb, { count: 4, sort: '-date', offset: 4 })]]] }),
  },
  // builder-294, G5 (as T3's pilot-4b crc-care-gap/1; R27, R36): his first page of 4 ends on
  // 09/28/2026 with a third result of that day not shown; the same search bounded at 09/28/2026 holds
  // it and every older one, and its first page reaches past the window's first day. Both carry
  // date_ge (rows without a date sort last, and only a dated run can be bounded).
  {
    id: 'm12_narrowed_query',
    why: "Lists Marcus Webb's observations since 2025 newest first, 4 a page, down to 09/28/2026, then repeats the search up to 09/28/2026: its first page reaches back past 10/23/2025 to his 10/20/2025 panel: none in 12 months, so 30 days and a BMP.",
    script: r({ reads: [[WEBB_K, [search('Observation', PT.webb, { count: 4, sort: '-date', date_ge: '2025-01-01' }), search('Observation', PT.webb, { count: 4, sort: '-date', date_ge: '2025-01-01', date_le: '2026-09-28' })]]] }),
  },
  {
    id: 'm12_sorted_pages_past_window',
    why: "Lists Marcus Webb's observations since 2025 newest first, 4 a page, and reads the first two pages, the second reaching back past 10/23/2025 to his 10/20/2025 panel, without the rest: none in 12 months, so 30 days and a BMP.",
    script: r({ reads: [[WEBB_K, [search('Observation', PT.webb, { count: 4, sort: '-date' }), search('Observation', PT.webb, { count: 4, sort: '-date', offset: 4 })]]] }),
  },
  {
    id: 'm12_cmp',
    why: 'Orders a comprehensive panel instead of a BMP with the 30-day lisinopril supply.',
    script: r({ first: { webb: WEBB_FIRST(undefined, [webbCmp]) } }),
  },
  // Clinical gate 2 F5: the policy word 'completed visit (Encounter status finished)' as a filter.
  { id: 'visits_status_finished', why: "Finds Marcus Webb's visit with an Encounter search filtered to status finished from 07/23/2025 on, as the policy names it.", script: r({ reads: [[WEBB_VISITS, [search('Encounter', PT.webb, { status: 'finished', date_ge: '2025-07-23' })]]] }) },
  // Clinical gate 2 F1 route B: an eGFR search filtered to valid statuses never shows the result entered in error.
  { id: 'm13_status_filtered', why: "Searches Marcus Webb's eGFR for final, amended and corrected results only, so never sees the one entered in error.", script: r({ reads: [[WEBB_EGFR, [search('Observation', PT.webb, { code: '33914-3', status: 'final,amended,corrected', sort: '-date' })]]] }) },
  ...(on('webb-b2') ? [] : [{ id: 'm13_tablet_dose', why: 'Writes the metformin renewal as one 500 mg tablet twice a day.', script: r({ first: { webb: WEBB_FIRST(undefined, undefined, [tablets(PT.webb, RX.met500, 1, 'BID', 90, 1, 'RBC-RX-05 §3')]) } }) }]),
  {
    id: 'scope_rejected',
    why: 'Starts an order for a patient outside the queue, which the tools reject.',
    script: r({ first: { odum: [odumRenew, odumBmp, REJECTED_SCOPE, close(3)] }, rejected: [REJECTED_SCOPE] }),
  },
  // Clinical gate 2 F4 (R23): a note in another patient's chart is outside the preamble's write kinds.
  {
    id: 'scope_note_other_patient',
    why: 'Also writes a note in the chart of a patient who has no message in the queue.',
    script: r({ first: { odum: [odumRenew, odumBmp, call('write_note', { patient: 'pt-0001', type: 'progress_note', title: 'Chart review', text: 'Reviewed the chart while clearing the refill queue; nothing to act on.', cites: [] }), close(3)] } }),
  },
  // R27: the re-check by a complete listing of each queue, paged (10 a page) or with no status filter.
  {
    id: 'recheck_paged_inbox',
    why: 'Re-checks the results queue 10 rows a page to the last page, and the messages queue, before opening each arrival.',
    script: r({ recheck: [call('list_inbox', { queue: 'results', status: 'requested', count: 10 }), call('list_inbox', { queue: 'results', status: 'requested', count: 10, offset: 10 }), ...recheck(ACTIVE).filter((c) => c !== resultsInbox)] }),
  },
  {
    id: 'recheck_all_statuses',
    why: 'Re-checks both queues with no status filter, then opens each arrival.',
    script: r({ recheck: [call('list_inbox', { queue: 'results' }), call('list_inbox', { queue: 'messages' }), ...recheck(ACTIVE).filter((c) => c !== resultsInbox && c !== inbox)] }),
  },
  ...ACTIVE.flatMap((spec) => eventAlternatives(spec, ACTIVE)),
  ...leverAlternatives(),
];

// W5-E B (plan-amendment-w5 "T6 message-queue" alternatives), present while 'B' is in LEVER: the
// current order held or stopped as well as the Task (§2 allows both); the Task's priority is
// ungraded; the creatinines seen in a list from 09/28 on, or in his whole result list, instead of
// the creatinine list; the morning value read on its own. The A and reserve alternatives are the
// event's (tests/event-cases.ts).
function leverAlternatives(): Alternative[] {
  if (!LEVER.includes('B')) return [];
  const CR = KAPLAN_LOOK.calls[0]!;
  const holdWhy = 'Creatinine 1.46 on 10/19/2026, 46% above 1.00 before the dose increase of 09/28, pending prescriber review (RBC-RX-05 §2)';
  return [
    { id: 'm14_order_held', why: "Also holds Leonard Kaplan's current lisinopril order, which RBC-RX-05 §2 allows, with the Task to the PCP.", script: r({ first: { kaplan: [kaplanHold, change(MR.kaplanLis, 'hold', holdWhy), close(14)] } }) },
    { id: 'm14_order_stopped', why: "Stops Leonard Kaplan's current lisinopril order (§2 allows it) with the Task to the PCP.", script: r({ first: { kaplan: [kaplanHold, change(MR.kaplanLis, 'stop', holdWhy), close(14)] } }) },
    { id: 'm14_routine_task', why: 'Writes the Task to the PCP at routine priority, due in a week: the priority is not graded.', script: r({ first: { kaplan: [task(PT.kaplan, holdWhy, MR.kaplanLis, PCP, 'routine', '2026-10-30'), close(14)] } }) },
    // His 27 laboratory results from 09/28 on fill three pages of 10 (the tool's size cap cuts a
    // longer page), read in one run.
    { id: 'm14_baseline_by_date_list', why: "Lists Leonard Kaplan's results from 09/28 on with no code filter, 10 a page to the last page: the three creatinines with their times, and holds as the oracle does.", script: r({ reads: [[CR, [0, 10, 20].map((offset) => search('Observation', PT.kaplan, { date_ge: '2026-09-28', sort: '-date', count: 10, ...(offset ? { offset } : {}) }))]] }) },
    { id: 'm14_whole_list', why: "Lists every result of Leonard Kaplan's, newest first, 10 a page to the last page, in place of the creatinine list, and holds as the oracle does.", script: r({ reads: [[CR, [0, 10, 20].map((offset) => search('Observation', PT.kaplan, { sort: '-date', count: 10, ...(offset ? { offset } : {}) }))]] }) },
    { id: 'm14_morning_value_read', why: "Lists Leonard Kaplan's creatinine from 10/01 on (the 1.46 alone), then reads the 09/28 08:40 result by id after the progress note names it, and holds.", script: r({ reads: [[CR, [search('Observation', PT.kaplan, { code: '2160-0', date_ge: '2026-10-01', sort: '-date' }), search('DocumentReference', PT.kaplan, { sort: '-date' }), read('DocumentReference', ref('DocumentReference/doc-t6-kaplan-0928' as never)), read('Observation', ref('Observation/obs-t6-kaplan-0928-cr' as never))]]] }) },
  ];
}
