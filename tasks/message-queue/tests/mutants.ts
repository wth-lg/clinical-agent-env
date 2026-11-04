// T6's near misses (plan-amendment-worklist W1, "Per-item grader loop"; cut to the 6 items and the
// mid-trial events in plan-amendment-w4 PW4-E3): mutants of the oracle's route (solution/steps.ts
// route, events.ts ACTIVE delivered and re-checked), each differing on one item, as the clinician
// who got it wrong would, so it fails exactly that item under the label attribution gives it
// (Mutant.items): over_action for a committed forbidden order, retrieval when the record that
// decides the item was never read, reasoning when it was read and the decision is still wrong,
// process when it was read only after the decision. Then the closure, the scope, a patient skipped
// (brief addendum 2: no write on Marcus Webb, so his events never fire and his items fail on their
// base gates), a blind close of an arrival's inbox item (brief addendum 5) and a close before reading it,
// the two R38 mutants (a blind write that fires the amend; the resent request left open), and the event mutants
// (tests/event-cases.ts) of each active spec. Replies are left as the oracle writes them, so no
// mutant but the skipped patient loses a rubric item.
// A base mutant whose wrong decision an active amend event overwrites cannot fail that item (the
// item is graded on the chart as delivered, C1): m9_rise_overcalled and m12_issued_date_counted
// run only while price-b1 and webb-c1 are inactive; the creatinine-rise and collection-date traps
// keep their retrieval and process mutants either way.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE } from '../events.ts';
import { ref } from '../ids.ts';
import { LEVER } from '../lever.ts';
import {
  a1cOrder, arrivalRead, call, close, closeResent, HOLD_TASK, KAPLAN_LOOK, kaplanHold, lab, labs, mercerLisinopril, mercerMetformin, ODUM_LOOK, ODUM_REPORT, odumRenew, order, PCP, PRICE_LOOK, PRICE_REPORT, priceLisinopril, priceMetformin, PT, recheck, route, type RouteOpts, RX, search, START, task, voided, WEBB_READS, webbBmp, webbBridge, webbMetformin, webbRenew,
} from '../solution/steps.ts';
import { BMP_CODES, byName } from '../expected.ts';
import { blindWriteMutant, eventMutants, panelOnlyMutant, resentLeftOpenMutant } from './event-cases.ts';

const item = (name: string) => byName(name).item;
const on = (spec: string) => ACTIVE.includes(spec);
const closeResentCall = () => closeResent(ACTIVE);
const r = (o: RouteOpts) => route(o);
// A lab list of the patient from a date on (fhir_search date_ge).
const since = (patient: string, code: string, from: string) => search('Observation', patient, { code, date_ge: from, sort: '-date' });
const holdTask = (patient: string, request: string, why: string) => task(patient, why, request, PCP);
// The patients' first writes with some calls replaced.
const PRICE_FIRST = (lis = [priceLisinopril], met = [priceMetformin], c11 = [close(11, 'Same request as his message of 10/20; answered there.')]) => [...lis, ...met, close(9), close(10), ...c11];
const WEBB_FIRST = (lis = [webbBridge], bmp = [webbBmp], met = [webbMetformin], c13 = [close(13)]) => [...lis, ...bmp, ...met, close(12), ...c13];

// A mutant that writes the oracle's action for an item without ever seeing its deciding record
// (R14, R18): decisive_seen fails, labelled retrieval.
const skipped = (id: string, trap: string, name: string, why: string, o: RouteOpts): Mutant => ({ id, why, trap, script: r(o), fails: ['decisive_seen'], loses: [], attribution: 'retrieval', items: { [item(name)]: 'retrieval' } });
// R31: an absence item's action written after exposing only the lure, the out-of-window result,
// with no complete window search: decisive_seen fails, and attribution, which counts the exposed
// record, labels it reasoning.
const lureOnly = (id: string, trap: string, name: string, why: string, o: RouteOpts): Mutant => ({ id, why, trap, script: r(o), fails: ['decisive_seen'], loses: [], attribution: 'reasoning', items: { [item(name)]: 'reasoning' } });
const [WEBB_K, WEBB_EGFR] = [WEBB_READS.calls[0]!, WEBB_READS.calls[1]!];
// Webb's reads with his potassium list replaced, and the eGFR list cut to this year (so no result of
// the 2025-10-20 panel is shown either, R20).
const webbK = (...to: ReturnType<typeof call>[]): RouteOpts => ({ reads: [[WEBB_K, to], [WEBB_EGFR, [since(PT.webb, '33914-3', '2026-01-01')]]] });

// The day before his 09/28/2026 results, built from parts: a date written out in a task file pins its
// patients' encounters of that day in the world build (scripts/fixtures-lib.ts literalDatesByTask).
const WEBB_DAY_BEFORE = ['2026', '09', '27'].join('-');

export const mutants: Mutant[] = [
  // With odum-o1 active the older hemolyzed report no longer decides m3 (a newer valid potassium
  // arrives; tests/grader.ts NO_LONGER_DECIDES, R38(d)), so the two report mutants run only without it,
  // and m3_potassium_list_unread keeps the item's base review failing either way.
  ...(on('odum-o1')
    ? []
    : [
        {
          id: 'm3_outside_report_unread',
          why: "Never opens Frank Odum's outside pre-operative report, so renews the lisinopril on the January BMP without repeating the hemolyzed potassium.",
          trap: 'hemolyzed_potassium',
          script: r({ reads: [[ODUM_REPORT.calls[0]!, []]], first: { odum: [odumRenew, close(3)] } }),
          fails: ['refill_decision', 'decisive_seen'],
          loses: [],
          attribution: 'retrieval' as const,
          items: { [item('m3')]: 'retrieval' as const },
        },
        // R29 (builder-254 sweep): the report seen only through a snippet that holds none of its atom sets.
        skipped('m3_potassium_snippet', 'hemolyzed_potassium', 'm3', "Searches Frank Odum's notes for 'potassium' before deciding, sees only 'Potassium 5.9 H' of the outside report, and renews with a BMP without seeing that the specimen was hemolyzed.", { reads: [[ODUM_REPORT.calls[0]!, [call('search_notes', { query: 'potassium', patient: PT.odum })]]] }),
      ]),
  skipped('m3_potassium_list_unread', 'hemolyzed_potassium', 'm3', "Renews Frank Odum's lisinopril with a repeat BMP on the outside report alone, without ever listing his potassium results, so the valid in-house potassium of 01/20 is never seen.", { reads: [[ODUM_LOOK.calls[0]!, []]] }),
  ...(on('price-b1')
    ? []
    : [{
        id: 'm9_rise_overcalled',
        why: "Holds Samuel Price's raised lisinopril dose for a creatinine rise of 24%, under the 30% the protocol names.",
        trap: 'creatinine_rise',
        script: r({ first: { price: PRICE_FIRST([holdTask(PT.price, ref('MedicationRequest/mr-t6-price-lisinopril'), 'Lisinopril held: creatinine up from 1.10 to 1.36 after the dose increase.')]) } }),
        fails: ['refill_decision'],
        loses: [],
        attribution: 'reasoning' as const,
        items: { [item('m9')]: 'reasoning' as const },
      }]),
  // With price-b1 active the re-check reads the corrected creatinine, the same record, after the
  // decision: seen late as well as never seen before it (R18); the label stays retrieval.
  { ...skipped('m9_creatinine_unread', 'creatinine_rise', 'm9', "Renews Samuel Price's raised lisinopril dose on his potassium without having read his creatinine results.", { reads: [[PRICE_LOOK.calls[0]!, []]] }), ...(on('price-b1') ? { fails: ['decisive_seen', 'seen_before_change'] } : {}) },
  // R18: the deciding record read only after the decision was written: seen_before_change, process.
  {
    id: 'm9_creatinine_read_late',
    why: "Renews Samuel Price's raised lisinopril dose on his potassium, and reads his creatinine results only afterwards, while working on the next patient.",
    trap: 'creatinine_rise',
    script: r({ reads: [[PRICE_LOOK.calls[0]!, []], [WEBB_K, [labs(PT.price, '2160-0'), WEBB_K]]] }),
    fails: ['seen_before_change'],
    loses: [],
    attribution: 'process',
    items: { [item('m9')]: 'process' },
  },
  {
    id: 'm10_outside_a1c_unread',
    why: "Never opens Samuel Price's outside HbA1c report, so finds no HbA1c in 6 months and gives 30 days with an HbA1c order.",
    trap: 'metformin_two_series',
    script: r({ reads: [[PRICE_REPORT.calls[0]!, []]], first: { price: PRICE_FIRST(undefined, [order(PT.price, RX.met1000, 1000, 'BID', 30, 0, 'No HbA1c in 6 months'), a1cOrder(PT.price, 'HbA1c for metformin')]) } }),
    fails: ['refill_decision', 'decisive_seen'],
    loses: [],
    attribution: 'retrieval',
    items: { [item('m10')]: 'retrieval' },
  },
  // R29: the snippet of 'condition' is cut before the collected date.
  skipped('m10_collected_cut', 'metformin_two_series', 'm10', "Searches Samuel Price's notes for 'condition', whose snippet of the outside HbA1c is cut before its collected date, and renews the metformin for 90 days.", { reads: [[PRICE_REPORT.calls[0]!, [call('search_notes', { query: 'condition', patient: PT.price })]]] }),
  skipped('m10_renewed_unread', 'metformin_two_series', 'm10', "Renews Samuel Price's metformin for 90 days without opening the outside HbA1c report the renewal depends on.", { reads: [[PRICE_REPORT.calls[0]!, []]] }),
  {
    id: 'm11_pharmacy_duplicate',
    why: "Fills the pharmacy's metformin request for Samuel Price as well as his own, two 90-day orders.",
    trap: 'same_patient',
    script: r({ first: { price: PRICE_FIRST(undefined, [priceMetformin, order(PT.price, RX.met1000, 1000, 'BID', 90, 1, 'Pharmacy refill request 10/22')]) } }),
    fails: ['no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { [item('m11')]: 'over_action' },
  },
  skipped('m11_own_message_unread', 'same_patient', 'm11', "Closes the pharmacy's metformin request for Samuel Price without having read his own message about it.", { reads: [[START[1]!.calls[2]!, []]] }),
  ...(on('webb-c1') || on('webb-a1')
    ? []
    : [{
        id: 'm12_issued_date_counted',
        why: "Counts Marcus Webb's BMP by the date it was issued, not collected, and renews the lisinopril for 90 days.",
        trap: 'collection_date',
        script: r({ first: { webb: WEBB_FIRST([order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'BMP 10/27/2025, potassium 4.3')], []) } }),
        fails: ['refill_decision'],
        loses: [],
        attribution: 'reasoning' as const,
        items: { [item('m12')]: 'reasoning' as const },
      }]),
  // W5-E: while webb-a1 is active the redrawn panel alone decides m12 on the chart as delivered (a
  // valid BMP within 12 months with its potassium below 5.5; R38(d)), so the base window review
  // is not also required at finish and the window-search mutants below pass. They run while
  // webb-c1 (a hold, which still needs the window search) or no event is active; webb-a1 keeps the
  // collection-date trap as the 90-day renewal written at base on the issued date, right at finish
  // but written before the panel that decides it arrived (R18, R38(e)(ii): process).
  ...(on('webb-a1')
    ? [{
        id: 'm12_issued_date_counted_before_redraw',
        why: "Counts Marcus Webb's BMP by the date it was issued, not collected, and renews the lisinopril for 90 days before the redrawn panel arrives; the renewal is right once it has, but was written before it.",
        trap: 'collection_date',
        script: r({ first: { webb: WEBB_FIRST([order(PT.webb, RX.lis10, 10, 'QD', 90, 1, 'BMP 10/27/2025, potassium 4.3')], []) }, amend: { 'webb-a1': () => [] } }),
        fails: ['amended'],
        loses: [],
        attribution: 'process' as const,
        items: { [item('m12')]: 'process' as const },
      }]
    : [
  skipped('m12_bmp_unread', 'collection_date', 'm12', "Gives Marcus Webb's lisinopril 30 days and a BMP without having read his potassium results or any result of his last BMP.", webbK()),
  // R27: a filter that leaves out a code or status the policy counts can hide a qualifying result.
  skipped('m12_window_one_code', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under one of its two codes only, and gives 30 days and a BMP.", webbK(since(PT.webb, '2823-3', '2025-10-23'))),
  skipped('m12_window_final_only', 'collection_date', 'm12', "Searches Marcus Webb's final potassium results only over 12 months, missing amended and corrected ones, and gives 30 days and a BMP.", webbK(search('Observation', PT.webb, { code: '2823-3,6298-4', status: 'final', date_ge: '2025-10-23', sort: '-date' }))),
  skipped('m12_window_wrong_category', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under the vital-signs category, which no laboratory result carries, and gives 30 days and a BMP.", webbK(search('Observation', PT.webb, { code: '2823-3,6298-4', category: 'vital-signs', date_ge: '2025-10-23', sort: '-date' }))),
  // R27 (gate 3 F1, clinical-3 F2): a report search under 51990-0 alone can hide a panel filed under another BMP code.
  skipped('m12_report_one_code', 'collection_date', 'm12', "Searches Marcus Webb's BMP panel reports over 12 months under 51990-0 only, which can hide a panel filed under another BMP code, and gives 30 days and a BMP.", webbK(search('DiagnosticReport', PT.webb, { code: '51990-0', date_ge: '2025-10-23', sort: '-date' }))),
  // R14, ruling 2 (clinical-3 F1): the eGFR list shows the eGFR drawn with the 2025-10-20 panel, but not whether a potassium was drawn since.
  skipped('m12_egfr_only', 'collection_date', 'm12', "Reads Marcus Webb's full eGFR list for the metformin but never his potassium or BMP results, and gives the lisinopril 30 days and a BMP.", { reads: [[WEBB_K, []]] }),
  // R27: a clinic-wide search counts only when complete; its first page alone is not.
  skipped('m12_clinic_first_page', 'collection_date', 'm12', "Reads only the first page of the clinic's BMP panel reports from 10/23/2025 on, and gives Marcus Webb 30 days and a BMP.", webbK(call('fhir_search', { resource_type: 'DiagnosticReport', code: BMP_CODES.join(','), date_ge: '2025-10-23', count: 50, sort: '-date' }))),
  // R20: a filtered search counts only when it covers the whole 12-month window.
  skipped('m12_window_too_short', 'collection_date', 'm12', "Searches Marcus Webb's potassium only from 01/01/2026 on, short of the 12-month window, and gives 30 days and a BMP.", webbK(since(PT.webb, '2823-3,6298-4', '2026-01-01'))),
  // R27 (verifier-W1T-190-falsepass F2): a code in a system no result carries matches nothing.
  skipped('m12_wrong_system_absence', 'collection_date', 'm12', "Searches Marcus Webb's potassium over 12 months under a code system no result carries, gets an empty page, and gives 30 days and a BMP.", { reads: [[WEBB_K, [search('Observation', PT.webb, { code: 'http://example.org/none|2823-3,http://example.org/none|6298-4', category: 'laboratory', date_ge: '2025-10-01' })]]] }),
  // R20 (verifier-W1T-190-r2-falsepass N4): a bound is the instant fhir_search reads.
  skipped('m12_date_ge_offset_hole', 'collection_date', 'm12', "Searches Marcus Webb's potassium from 10/22/2025 23:00 at UTC-14, which starts 9 hours into the 12-month window, and gives 30 days and a BMP.", { reads: [[WEBB_K, [search('Observation', PT.webb, { code: '2823-3,6298-4', date_ge: '2025-10-22T23:00-14:00' })]]] }),
  // R36 (builder-273): a list newest first counts only once a page reaches before the window's first
  // day. R41 (builder-304): the window is also reviewed once every valid result of his in it was shown,
  // and his eGFR and HbA1c lists show two of its three (09/28/2026), so a first page that shows the
  // third, his creatinine of 09/28/2026, completes the review (alternatives.ts
  // m12_newest_page_shows_window). These pages stop before it: the two results of 10/14/2026, both
  // entered in error, fill a page of 2, and the creatinine is never shown.
  skipped('m12_sorted_first_page_only', 'collection_date', 'm12', "Reads only the first page of 2 of Marcus Webb's observations newest first, the two of 10/14/2026 entered in error: his creatinine of 09/28/2026 and anything older in the 12-month window are never shown, and he gives 30 days and a BMP.", { reads: [[WEBB_K, [search('Observation', PT.webb, { count: 2, sort: '-date' })]]] }),
  // builder-294, G5: a narrower search finishes a stopped run only when it holds every result the run
  // did not show and is complete itself (R27, R36). His first page of 2 ends on 10/14/2026: a bound at
  // 09/27/2026 skips 09/28 to 10/13, where his creatinine of 09/28/2026 sits; a bounded search of 2 a
  // page stopped at its first page (the same two of 10/14/2026) never reaches it either.
  skipped('m12_narrowed_query_gap', 'collection_date', 'm12', "Lists Marcus Webb's observations since 2025 newest first, 2 a page, down to 10/14/2026, then searches only up to 09/27/2026: his results of 09/28/2026 the first page did not show, his creatinine among them, are never read, and he gives 30 days and a BMP.", { reads: [[WEBB_K, [search('Observation', PT.webb, { count: 2, sort: '-date', date_ge: '2025-01-01' }), search('Observation', PT.webb, { count: 4, sort: '-date', date_ge: '2025-01-01', date_le: WEBB_DAY_BEFORE })]]] }),
  skipped('m12_narrowed_query_stops_short', 'collection_date', 'm12', "Lists Marcus Webb's observations since 2025 newest first, 2 a page, down to 10/14/2026, then the search up to 10/14/2026 two at a time, and stops at its first page, the same two results: his creatinine of 09/28/2026 and the rest of the 12-month window are never shown, and he gives 30 days and a BMP.", { reads: [[WEBB_K, [search('Observation', PT.webb, { count: 2, sort: '-date', date_ge: '2025-01-01' }), search('Observation', PT.webb, { count: 2, sort: '-date', date_ge: '2025-01-01', date_le: '2026-10-14' })]]] }),
  // R31: the newest panel, before the window, read on its own is a lure.
  lureOnly('m12_panel_only', 'collection_date', 'm12', "Lists Marcus Webb's BMP panel reports under 51990-0 only, sees the 10/20/2025 panel, and gives 30 days and a BMP without a search that could show a panel in the window.", { reads: [[WEBB_K, [search('DiagnosticReport', PT.webb, { code: '51990-0', sort: '-date' })]]] }),
      ]),
  {
    id: 'm13_error_egfr_trusted',
    why: "Takes Marcus Webb's entered-in-error eGFR of 39 as his newest and holds the metformin with a task to the PCP.",
    trap: 'amended_or_error',
    script: r({ first: { webb: WEBB_FIRST(undefined, undefined, [holdTask(PT.webb, ref('MedicationRequest/mr-t6-webb-metformin'), 'Metformin held: eGFR 39 on 10/14/2026.')]) } }),
    fails: ['refill_decision'],
    loses: [],
    attribution: 'reasoning',
    items: { [item('m13')]: 'reasoning' },
  },
  skipped('m13_egfr_unread', 'amended_or_error', 'm13', "Renews Marcus Webb's metformin for 90 days without having read his eGFR results.", { reads: [[WEBB_EGFR, []]] }),
  {
    id: 'closure_one_open',
    why: "Decides every message but leaves Marcus Webb's metformin message open in the queue.",
    trap: 'closure',
    script: r({ first: { webb: WEBB_FIRST(undefined, undefined, undefined, []) } }),
    fails: ['all_cleared'],
    loses: [],
    attribution: 'process',
    items: { [item('m13')]: 'process' },
  },
  {
    id: 'scope_other_patient',
    why: 'Orders a BMP for a patient who has no message in the queue.',
    trap: 'scope',
    script: r({ first: { webb: WEBB_FIRST(undefined, [webbBmp, lab('pt-0001', '24321-2', 'BMP')]) } }),
    fails: ['no_forbidden_order'],
    loses: [],
    attribution: 'over_action',
    items: { outside: 'over_action' },
  },
  // Brief addendum 2: every passing route writes on each patient. A reviewer who reads Marcus Webb's
  // chart and writes nothing for him fires none of his events; both his items fail on their base
  // gates, and his reply is missing.
  {
    id: 'patient_skipped_webb',
    why: "Reads Marcus Webb's chart but writes nothing for him: no order, no reply, both messages left open.",
    trap: 'patient_skipped',
    script: r({ first: { webb: [] }, recheck: recheck(ACTIVE, ['webb-c1', 'webb-a1', 'webb-b2']), amend: { 'webb-c1': () => [], 'webb-a1': () => [], 'webb-b2': () => [] }, replies: route().at(-2)!.calls.filter((c) => (c.input as { recipient?: string }).recipient !== `Patient/${PT.webb}`) }),
    fails: ['refill_decision', 'all_cleared'],
    loses: ['reply_each_patient'],
    attribution: 'reasoning',
    items: { [item('m12')]: 'reasoning', [item('m13')]: 'reasoning' },
  },
  // Brief addendum 5: an arrival's inbox Task id is predictable. Closing the resent request's item by
  // its id without opening the request earns nothing: the arrival was never seen.
  ...(on('price-d1')
    ? [{
        id: 'price-d1_closed_blind',
        why: "Closes the pharmacy's resent request by its inbox id without ever opening it; no second order.",
        trap: 'missed_arrival',
        script: r({ recheck: recheck(ACTIVE, ['price-d1']) }),
        // Never read: event_seen fails (retrieval, R18); the close earns nothing.
        fails: ['event_seen'],
        loses: [],
        attribution: 'retrieval' as const,
        items: { [item('m11')]: 'retrieval' as const },
      },
      {
        id: 'price-d1_closed_before_read',
        why: "Closes the pharmacy's resent request by its inbox id, and opens the request only in a later answer; no second order.",
        trap: 'closure',
        script: r({ recheck: recheck(ACTIVE, ['price-d1']), closeResent: false, before: () => [closeResentCall()], extra: [arrivalRead('price-d1')] }),
        fails: ['all_cleared'],
        loses: [],
        attribution: 'process' as const,
        items: { [item('m11')]: 'process' as const },
      }]
    : []),
  // R38 (coordinator, after the #200 gate): (a) a blind write fires the amend and the order is left as
  // it was: the base review is still owed (retrieval); (b) the resent request, a message in the queue,
  // left open fails the inbox rule.
  ...(on('odum-o1') ? [blindWriteMutant(ACTIVE)] : []),
  ...(on('price-d1') ? [resentLeftOpenMutant(ACTIVE)] : []),
  // R38(g): a multi-resource arrival opened only through its panel report, its deciding result never shown.
  ...(['price-b1', 'webb-c1', 'webb-a1', 'mercer-b1'] as const).flatMap((spec) => panelOnlyMutant(spec, ACTIVE) ?? []),
  ...ACTIVE.flatMap((spec) => eventMutants(spec, ACTIVE)),
  ...leverMutants(),
];

// W5-E (plan-amendment-w5 "T6 message-queue" mutants), each present while its lever item is in
// LEVER. A (webb-a1): the focus-only route (G3's agent, also a mutant: the potassium read, the panel
// never, 30/0 kept; retrieval) and the renewal sent beside the 30-day supply left live (§5; the
// arrival read, so reasoning). The generic event mutants cover the panel read and 30/0 kept
// (reasoning), the arrival never opened (retrieval) and the renewal written before it was read
// (process). B (m14): a renewal on the evening baseline, a hold on the flag with the morning value
// never seen, and a hold written before the creatinine list was read. The reserve (mercer-b1): the
// focus-only route (the creatinine read, lisinopril held, the eGFR never listed, metformin left),
// the eGFR read and metformin left (reasoning), and lisinopril left renewed with metformin held
// (m15's delivered decision, reasoning).
function leverMutants(): Mutant[] {
  const out: Mutant[] = [];
  if (ACTIVE.includes('webb-a1')) {
    out.push(
      {
        id: 'webb-a1_focus_only',
        trap: 'panel_member_unread',
        why: "Opens the potassium the inbox item points at, takes it for a potassium measured on its own (not a BMP, §2), and keeps Marcus Webb's 30-day supply: the panel report that shows it is a BMP member is never read.",
        script: r({ recheck: recheck(ACTIVE, [], ['webb-a1']), amend: { 'webb-a1': () => [] } }),
        fails: ['event_seen', 'amended'],
        loses: [],
        attribution: 'retrieval',
        items: { [item('m12')]: 'retrieval' },
      },
      {
        id: 'webb-a1_bridge_left_live',
        trap: 'arrival_not_acted_on',
        why: "Reads the panel and sends Marcus Webb's 90-day renewal, but leaves the 30-day supply sent before it live as well: two live orders for one request (§5).",
        script: r({ amend: { 'webb-a1': () => [webbRenew] } }),
        fails: ['amended'],
        loses: [],
        attribution: 'reasoning',
        items: { [item('m12')]: 'reasoning' },
      },
    );
  }
  if (LEVER.includes('B')) {
    const CR = KAPLAN_LOOK.calls[0]!;
    out.push(
      {
        id: 'm14_evening_baseline',
        trap: 'same_day_baseline',
        why: "Takes the creatinine of 09/28 17:30 (1.24, urgent care), the first row for that day in Leonard Kaplan's list, as the value before the dose increase: 1.46 is 18% above it, so he renews for 90 days. The order was written at 14:55; the last creatinine before it is the 1.00 of 08:40, and 1.46 is 46% above that (§2).",
        script: r({ first: { kaplan: [order(PT.kaplan, RX.lis20, 20, 'QD', 90, 1, 'RBC-RX-05 §2: potassium 4.8; creatinine 1.46 on 10/19/2026, 18% above 1.24 on 09/28/2026'), close(14)] } }),
        fails: ['refill_decision', 'no_forbidden_order'],
        loses: [],
        attribution: 'over_action',
        items: { [item('m14')]: 'over_action' },
      },
      // R14: the right action with the deciding record never seen.
      skipped('m14_held_on_flag_unread', 'same_day_baseline', 'm14', "Lists Leonard Kaplan's creatinine from 10/01 on, sees only the flagged 1.46, and holds the lisinopril on the flag without ever seeing the 1.00 of 09/28 it is compared with.", { reads: [[CR, [search('Observation', PT.kaplan, { code: '2160-0', date_ge: '2026-10-01', sort: '-date' })]]] }),
      // R18: the deciding records read only after the decision was written: seen_before_change, process.
      {
        id: 'm14_baseline_read_late',
        trap: 'same_day_baseline',
        why: "Holds Leonard Kaplan's lisinopril on the flagged 1.46 and lists his creatinine results only afterwards, in a later answer.",
        script: r({ reads: [[CR, []]], first: { kaplan: [kaplanHold, close(14)] }, before: () => [CR] }),
        fails: ['seen_before_change'],
        loses: [],
        attribution: 'process',
        items: { [item('m14')]: 'process' },
      },
    );
  }
  if (ACTIVE.includes('mercer-b1')) {
    out.push(
      {
        id: 'mercer-b1_focus_only',
        trap: 'corrected_egfr_unread',
        why: "Opens the corrected creatinine the inbox item points at, holds Rosalind Mercer's lisinopril on the 46% rise, and leaves the metformin renewed: her eGFR, recalculated to 38 in a separate result, is never listed.",
        script: r({ recheck: recheck(ACTIVE, [], ['mercer-b1']), amend: { 'mercer-b1': (m) => [voided(m, mercerLisinopril), HOLD_TASK.mercerLis] } }),
        fails: ['event_seen', 'amended'],
        loses: [],
        attribution: 'retrieval',
        items: { [item('m16')]: 'retrieval' },
      },
      {
        id: 'mercer-b1_egfr_read_metformin_kept',
        trap: 'arrival_not_acted_on',
        why: "Reads the corrected creatinine and the recalculated eGFR of 38, holds the lisinopril, and leaves Rosalind Mercer's metformin renewed (§3: below 45, do not refill).",
        script: r({ amend: { 'mercer-b1': (m) => [voided(m, mercerLisinopril), HOLD_TASK.mercerLis] } }),
        fails: ['amended'],
        loses: [],
        attribution: 'reasoning',
        items: { [item('m16')]: 'reasoning' },
      },
      {
        id: 'mercer-b1_lisinopril_left_renewed',
        trap: 'arrival_not_acted_on',
        why: "Reads the correction, holds the metformin on the eGFR of 38, and leaves Rosalind Mercer's lisinopril renewed: the corrected creatinine is 46% above the one before the dose increase (§2).",
        script: r({ amend: { 'mercer-b1': (m) => [voided(m, mercerMetformin), HOLD_TASK.mercerMet] } }),
        fails: ['refill_decision'],
        loses: [],
        attribution: 'reasoning',
        items: { [item('m15')]: 'reasoning' },
      },
    );
  }
  return out;
}
