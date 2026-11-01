// T6's near misses (plan-amendment-worklist W1, "Per-item grader loop"): one mutant per item of
// expected.ts ITEMS, each differing from the oracle on that item alone, as the clinician who got it
// wrong would, so it fails exactly that item under the label attribution gives it (Mutant.items):
// over_action for a committed forbidden order, retrieval when the record that decides the item was
// never read, reasoning when it was read and the decision is still wrong. Then the closure and the
// scope. Replies are left as the oracle writes them, so no mutant loses a rubric item.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { id as worldId, ref } from '../ids.ts';
import { oracle } from '../solution/solve.ts';
import {
  a1cOrder, BROOKS_LOOK, call, BROOKS_REPORT, brooksA1c, brooksBridge, brooksHold, brooksTask, odumClose4, hayesBmp, hayesRenew, lab, labs, ODUM_LOOK, ODUM_REPORT, odumAmlodipine, odumBmp, order, PARK_LOOK, PARK_REPORT,
  parkBmp, parkBridge, parkHold, parkTask, PCP, PRICE_LOOK, PRICE_REPORT, priceLisinopril, priceMetformin, PT, read, RX, search, START, swap, task, WEBB_READS, webbBmp, webbBridge, webbMetformin, without,
} from '../solution/steps.ts';
import { BMP_CODES, ITEMS } from '../expected.ts';

const item = (name: string) => ITEMS.find((x) => x.name === name)!.item;
// A lab list of the patient from a date on (fhir_search date_ge).
const since = (patient: string, code: string, from: string) => search('Observation', patient, { code, date_ge: from, sort: '-date' });
const holdTask = (patient: string, request: string, why: string) => task(patient, why, request, PCP);
// A mutant that writes the oracle's action for an item without ever seeing its deciding record
// (R14, R18): decisive_seen fails, labelled retrieval.
const skipped = (id: string, trap: string, name: string, why: string, script: Mutant['script']): Mutant[] => [
  { id, why, trap, script, fails: ['decisive_seen'], loses: [], attribution: 'retrieval', items: { [item(name)]: 'retrieval' } },
];

// R31: a mutant that writes the oracle's action for an absence item after exposing only the lure,
// the out-of-window result, with no complete window search: decisive_seen fails, and attribution,
// which counts the exposed record, labels it reasoning.
const lureOnly = (id: string, trap: string, name: string, why: string, script: Mutant['script']): Mutant[] => [
  { id, why, trap, script, fails: ['decisive_seen'], loses: [], attribution: 'reasoning', items: { [item(name)]: 'reasoning' } },
];

export const mutants: Mutant[] = [
  {
    id: 'm1_hemolyzed_k_trusted',
    why: 'Takes the hemolyzed potassium of 6.1 as valid and holds the lisinopril with a task to the PCP, instead of renewing on the valid 4.6 and repeating the BMP.',
    trap: 'hemolyzed_potassium',
    script: swap(oracle, [hayesRenew, [holdTask(PT.hayes, ref('MedicationRequest/mr-t6-hayes-lisinopril'), 'Lisinopril refill held: potassium 6.1 on 10/05/2026.')]], [hayesBmp, []]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m1')]: 'reasoning' },
  },
  {
    id: 'm2_second_order',
    why: "Answers Gloria Hayes's follow-up message as a new request and sends a second 90-day lisinopril order.",
    trap: 'same_patient',
    script: swap(oracle, [hayesRenew, [hayesRenew, order(PT.hayes, RX.lis20, 20, 'QD', 90, 1, 'Refill per follow-up message 10/22')]]),
    fails: ['no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { [item('m2')]: 'over_action' },
  },
  {
    id: 'm3_outside_report_unread',
    why: "Never opens Frank Odum's outside pre-operative report, so renews the lisinopril on the January BMP without repeating the hemolyzed potassium.",
    trap: 'hemolyzed_potassium',
    script: swap(without(oracle, ODUM_REPORT), [odumBmp, []]),
    fails: ['refill_decision', 'decisive_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { [item('m3')]: 'retrieval' },
  },
  {
    id: 'm4_amlodipine_short',
    why: 'Gives amlodipine a 30-day supply with no refills although a visit within 15 months allows 90 days with 1 refill.',
    trap: 'filler',
    script: swap(oracle, [odumAmlodipine, [order(PT.odum, RX.aml5, 5, 'QD', 30, 0, 'Amlodipine 30-day supply')]]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m4')]: 'reasoning' },
  },
  {
    id: 'm5_filed_date_counted',
    why: "Counts Lena Park's outside BMP by the date it was filed, not collected, and renews the lisinopril for 90 days.",
    trap: 'collection_date',
    script: swap(oracle, [parkBridge, [order(PT.park, RX.lis10, 10, 'QD', 90, 1, 'BMP 11/03/2025, potassium 4.4')]], [parkBmp, []]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m5')]: 'reasoning' },
  },
  {
    id: 'm6_pre_amendment_egfr',
    why: "Decides on the eGFR of 51 in Lena Park's visit note, not the amended 39, and renews the metformin.",
    trap: 'amended_or_error',
    script: swap(oracle, [parkHold, [order(PT.park, RX.met500, 500, 'BID', 90, 1, 'eGFR 51, HbA1c 7.4% on 07/20/2026')]]),
    fails: ['refill_decision', 'no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { [item('m6')]: 'over_action' },
  },
  {
    id: 'm7_creatinine_rise_missed',
    why: 'Renews the raised lisinopril dose on a potassium under 5.5, missing the 38% creatinine rise after the increase.',
    trap: 'creatinine_rise',
    script: swap(oracle, [brooksHold, [order(PT.brooks, RX.lis20, 20, 'QD', 90, 1, 'Potassium 5.2 on 10/08/2026')]]),
    fails: ['refill_decision', 'no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { [item('m7')]: 'over_action' },
  },
  {
    id: 'm8_filing_date_counted',
    why: "Counts Evelyn Brooks's outside HbA1c by its filing date, the day the clinic filed it, not its collection date, and renews the metformin for 90 days.",
    trap: 'metformin_two_series',
    script: swap(oracle, [brooksBridge, [order(PT.brooks, RX.met1000, 1000, 'BID', 90, 1, 'eGFR 54; HbA1c 6.9% (filed 05/04/2026)')]], [brooksA1c, []]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m8')]: 'reasoning' },
  },
  {
    id: 'm9_rise_overcalled',
    why: "Holds Samuel Price's raised lisinopril dose for a creatinine rise of 24%, under the 30% the protocol names.",
    trap: 'creatinine_rise',
    script: swap(oracle, [priceLisinopril, [holdTask(PT.price, ref('MedicationRequest/mr-t6-price-lisinopril'), 'Lisinopril held: creatinine up from 1.10 to 1.36 after the dose increase.')]]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m9')]: 'reasoning' },
  },
  {
    id: 'm10_outside_a1c_unread',
    why: "Never opens Samuel Price's outside HbA1c report, so finds no HbA1c in 6 months and gives 30 days with an HbA1c order.",
    trap: 'metformin_two_series',
    script: swap(without(oracle, PRICE_REPORT), [priceMetformin, [order(PT.price, RX.met1000, 1000, 'BID', 30, 0, 'No HbA1c in 6 months'), a1cOrder(PT.price, 'HbA1c for metformin')]]),
    fails: ['refill_decision', 'decisive_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { [item('m10')]: 'retrieval' },
  },
  {
    id: 'm11_pharmacy_duplicate',
    why: "Fills the pharmacy's metformin request for Samuel Price as well as his own, two 90-day orders.",
    trap: 'same_patient',
    script: swap(oracle, [priceMetformin, [priceMetformin, order(PT.price, RX.met1000, 1000, 'BID', 90, 1, 'Pharmacy refill request 10/22')]]),
    fails: ['no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { [item('m11')]: 'over_action' },
  },
  {
    id: 'm12_issued_date_counted',
    why: "Counts Marcus Webb's BMP by the date it was issued, not collected, and renews the lisinopril for 90 days.",
    trap: 'collection_date',
    script: swap(oracle, [webbBridge, [order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'BMP 10/27/2025, potassium 4.3')]], [webbBmp, []]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m12')]: 'reasoning' },
  },
  {
    id: 'm13_error_egfr_trusted',
    why: "Takes Marcus Webb's entered-in-error eGFR of 39 as his newest and holds the metformin with a task to the PCP.",
    trap: 'amended_or_error',
    script: swap(oracle, [webbMetformin, [holdTask(PT.webb, ref('MedicationRequest/mr-t6-webb-metformin'), 'Metformin held: eGFR 39 on 10/14/2026.')]]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m13')]: 'reasoning' },
  },
  // R14: an item whose action a fallback or routine route also reaches is decided only once its
  // deciding record was seen; each of these writes the oracle's action without that record.
  ...skipped('m2_first_message_unread', 'same_patient', 'm2', "Closes Gloria Hayes's follow-up without having read her first message about the same lisinopril.", swap(oracle, [START[1]!.calls[0]!, []])),
  // Neither the Encounter search nor the notes list, which shows the visit's progress note (R21).
  ...skipped('m4_visit_unread', 'filler', 'm4', "Renews Frank Odum's amlodipine for 90 days without looking for a visit: no Encounter search, no notes list.", swap(oracle, [ODUM_LOOK.calls[2]!, []], [ODUM_LOOK.calls[1]!, []])),
  ...skipped('m5_report_unread', 'collection_date', 'm5', "Gives Lena Park's lisinopril 30 days and a BMP without opening the outside BMP filed in her chart.", without(oracle, PARK_REPORT)),
  ...skipped('m6_hold_without_egfr', 'amended_or_error', 'm6', "Holds Lena Park's metformin without having read her eGFR results.", swap(oracle, [PARK_LOOK.calls[2]!, []])),
  ...skipped('m7_hold_on_potassium', 'creatinine_rise', 'm7', "Holds Evelyn Brooks's lisinopril on her high-flagged potassium of 5.2 without having read her creatinine results.", swap(oracle, [BROOKS_LOOK.calls[0]!, []])),
  ...skipped('m8_report_unread', 'metformin_two_series', 'm8', "Gives Evelyn Brooks's metformin 30 days and an HbA1c without opening the outside HbA1c filed in her chart.", without(oracle, BROOKS_REPORT)),
  ...skipped('m9_creatinine_unread', 'creatinine_rise', 'm9', "Renews Samuel Price's raised lisinopril dose on his potassium without having read his creatinine results.", swap(oracle, [PRICE_LOOK.calls[0]!, []])),
  // R29 (builder-254 sweep): the report seen only through a snippet that holds none of its atom sets
  // (expected.ts Item.atoms) is never seen: the high potassium without the specimen's condition, or the
  // received and reported dates without the collected date, which alone places the HbA1c inside the window.
  ...skipped('m3_potassium_snippet', 'hemolyzed_potassium', 'm3', "Searches Frank Odum's notes for 'potassium', sees only 'Potassium 5.9 H' of the outside report, and renews with a BMP without seeing that the specimen was hemolyzed.", swap(oracle, ...ODUM_REPORT.calls.map((c) => [c, [call('search_notes', { query: 'potassium', patient: PT.odum })]] as [typeof c, typeof c[]]))),
  ...skipped('m10_collected_cut', 'metformin_two_series', 'm10', "Searches Samuel Price's notes for 'condition', whose snippet of the outside HbA1c is cut before its collected date, and renews the metformin for 90 days.", swap(oracle, ...PRICE_REPORT.calls.map((c) => [c, [call('search_notes', { query: 'condition', patient: PT.price })]] as [typeof c, typeof c[]]))),
  ...skipped('m10_renewed_unread', 'metformin_two_series', 'm10', "Renews Samuel Price's metformin for 90 days without opening the outside HbA1c report the renewal depends on.", without(oracle, PRICE_REPORT)),
  ...skipped('m11_own_message_unread', 'same_patient', 'm11', "Closes the pharmacy's metformin request for Samuel Price without having read his own message about it.", swap(oracle, [START[1]!.calls[9]!, []])),
  // The eGFR list is cut to this year, so no result of the 2025-10-20 panel is shown either (R20).
  ...skipped('m12_bmp_unread', 'collection_date', 'm12', "Gives Marcus Webb's lisinopril 30 days and a BMP without having read his potassium results or any result of his last BMP.", swap(oracle, [WEBB_READS.calls[0]!, []], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  // R27: a filter that leaves out a code or status the policy counts can hide a qualifying result.
  ...skipped('m12_window_one_code', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under one of its two codes only, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [since(PT.webb, '2823-3', '2025-10-23')]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  ...skipped('m12_window_final_only', 'collection_date', 'm12', "Searches Marcus Webb's final potassium results only over 12 months, missing amended and corrected ones, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [search('Observation', PT.webb, { code: '2823-3,6298-4', status: 'final', date_ge: '2025-10-23', sort: '-date' })]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  ...skipped('m12_window_wrong_category', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under the vital-signs category, which no laboratory result carries, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [search('Observation', PT.webb, { code: '2823-3,6298-4', category: 'vital-signs', date_ge: '2025-10-23', sort: '-date' })]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  // R27 (gate 3 F1, clinical-3 F2): the clinic files BMPs under 24321-2 and CMPs under 24323-8 too, so a
  // report search under 51990-0 alone can hide a qualifying panel.
  ...skipped('m12_report_one_code', 'collection_date', 'm12', "Searches Marcus Webb's BMP panel reports over 12 months under 51990-0 only, which can hide a panel filed under another BMP code, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [search('DiagnosticReport', PT.webb, { code: '51990-0', date_ge: '2025-10-23', sort: '-date' })]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  // R14, ruling 2 (clinical-3 F1): the eGFR list every m13 decision reads shows the eGFR drawn with the
  // 2025-10-20 panel, but not whether a potassium was drawn since; it does not review the panel.
  ...skipped('m12_egfr_only', 'collection_date', 'm12', "Reads Marcus Webb's full eGFR list for the metformin but never his potassium or BMP results, and gives the lisinopril 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, []])),
  // R27: a clinic-wide search counts only when complete; its first page alone is not.
  ...skipped('m12_clinic_first_page', 'collection_date', 'm12', 'Reads only the first page of the clinic\'s BMP panel reports from 10/23/2025 on, and gives Marcus Webb 30 days and a BMP.', swap(oracle, [WEBB_READS.calls[0]!, [call('fhir_search', { resource_type: 'DiagnosticReport', code: BMP_CODES.join(','), date_ge: '2025-10-23', count: 50, sort: '-date' })]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  // R20: a filtered search counts only when it covers the whole 12-month window.
  ...skipped('m12_window_too_short', 'collection_date', 'm12', "Searches Marcus Webb's potassium only from 01/01/2026 on, short of the 12-month window, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [since(PT.webb, '2823-3,6298-4', '2026-01-01')]], [WEBB_READS.calls[1]!, [since(PT.webb, '33914-3', '2026-01-01')]])),
  // R27 (verifier-W1T-190-falsepass F2): a code that names a system no result carries matches nothing,
  // so its empty page shows nothing of the patient's potassium history.
  ...skipped('m12_wrong_system_absence', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under a code system no result carries, gets an empty page, and gives 30 days and a BMP.", swap(oracle, [WEBB_READS.calls[0]!, [search('Observation', PT.webb, { code: 'http://example.org/none|2823-3,http://example.org/none|6298-4', category: 'laboratory', date_ge: '2025-10-01' })]])),
  // R31 (verifier-W1T-190-falsepass F3): the outside report is a lure for the absence; without a
  // complete search of the clinic's own results in the window, 'none in the window' was never checked.
  ...skipped('m5_outside_report_only', 'collection_date', 'm5', "Reads Lena Park's outside BMP and her visit but never searches the clinic's own BMPs or potassium, and gives 30 days and a BMP.", swap(oracle, [PARK_LOOK.calls[0]!, []])),
  ...skipped('m8_outside_report_only', 'metformin_two_series', 'm8', "Reads Evelyn Brooks's outside HbA1c and her eGFR but never searches the clinic's own HbA1c results, and gives 30 days and an HbA1c.", swap(oracle, [BROOKS_LOOK.calls[3]!, []])),
  // R31: the clinic's newest result of the kind, collected before the window, read on its own (a
  // narrowed list, or a read by id) is a lure: it does not show that none was collected since. The
  // record was exposed, so attribution labels the item reasoning (attribution.ts reads exposure).
  ...lureOnly('m5_panel_only', 'collection_date', 'm5', "Lists Lena Park's BMP panel reports under 51990-0 only, sees her 04/2025 panel, and gives 30 days and a BMP without a search that could show a panel in the window.", swap(oracle, [PARK_LOOK.calls[0]!, [search('DiagnosticReport', PT.park, { code: '51990-0', sort: '-date' })]])),
  ...lureOnly('m8_inhouse_a1c_only', 'metformin_two_series', 'm8', "Reads Evelyn Brooks's January HbA1c by id instead of her HbA1c list, and gives 30 days and an HbA1c without a search that could show one in the window.", swap(oracle, [BROOKS_LOOK.calls[3]!, [read('Observation', worldId('obs-t6-brooks-a1c-0112'))]])),
  ...lureOnly('m12_panel_only', 'collection_date', 'm12', "Lists Marcus Webb's BMP panel reports under 51990-0 only, sees the 10/20/2025 panel, and gives 30 days and a BMP without a search that could show a panel in the window.", swap(oracle, [WEBB_READS.calls[0]!, [search('DiagnosticReport', PT.webb, { code: '51990-0', sort: '-date' })]])),
  ...skipped('m13_egfr_unread', 'amended_or_error', 'm13', "Renews Marcus Webb's metformin for 90 days without having read his eGFR results.", swap(oracle, [WEBB_READS.calls[1]!, []])),
  // R18: the deciding record read only after the decision was written: seen_before_change, process.
  {
    id: 'm9_creatinine_read_late',
    why: "Renews Samuel Price's raised lisinopril dose on his potassium, and reads his creatinine results only afterwards, while working on the next patient.",
    trap: 'creatinine_rise',
    script: swap(oracle, [PRICE_LOOK.calls[0]!, []], [WEBB_READS.calls[0]!, [labs(PT.price, '2160-0'), WEBB_READS.calls[0]!]]),
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    items: { [item('m9')]: 'process' },
  },
  // R15: a decision written for the sibling item of the same patient does not pass this one.
  {
    id: 'm7_task_on_sibling_order',
    why: "Sends the PCP task for Evelyn Brooks's lisinopril hold about her metformin order instead of the lisinopril order.",
    trap: 'creatinine_rise',
    script: swap(oracle, [brooksHold, [brooksTask(ref('MedicationRequest/mr-t6-brooks-metformin'))]]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m7')]: 'reasoning' },
  },
  // Clinical gate F1: the policy names the hold Task's focus (the drug's MedicationRequest); a Task about
  // the pharmacy's message holds the drug but is not the Task the policy asks for.
  {
    id: 'm6_task_on_message',
    why: "Sends the PCP task for Lena Park's metformin hold about the pharmacy's refill message instead of her metformin order.",
    trap: 'amended_or_error',
    script: swap(oracle, [parkHold, [parkTask(ref('Communication/comm-t6-m6'))]]),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m6')]: 'reasoning' },
  },
  {
    id: 'closure_one_open',
    why: "Decides every message but leaves Frank Odum's amlodipine message open in the queue.",
    trap: 'closure',
    script: swap(oracle, [odumClose4, []]),
    fails: ['all_cleared'],
    loses: [],
    attribution: 'process',
    items: { [item('m4')]: 'process' },
  },
  {
    id: 'scope_other_patient',
    why: 'Orders a BMP for a patient who has no message in the queue.',
    trap: 'scope',
    script: swap(oracle, [webbBmp, [webbBmp, lab('pt-0001', '24321-2', 'BMP')]]),
    fails: ['no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { outside: 'over_action' },
  },
];
