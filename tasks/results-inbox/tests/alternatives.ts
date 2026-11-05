// Other correct solutions of T2's worklist probe, cut to 7 items with mid-trial events in PW4-E3:
// each must PASS, with any one event active and with ACTIVE. One per inbox item, each varying
// what a careful clinician might vary on that item: the study code (the low-dose CT is a CT chest
// without contrast), the panel that rechecks potassium or creatinine, priorities above the policy's,
// a phone call instead of a portal message, on-call told by a task or by handing the item over,
// result links on the items that need no action. Every item whose check forbids a write also gets
// that write attempted and refused by the tool, which commits nothing and so passes: the gates read
// the committed final state (verifier-phase-P17i-W1-1-2 M2). Plus a different read path, one answer
// for all writes and the patient told the wrong patient's matters (a PASS with the judged harm); and
// for the events (eventAlternatives): the queue listed page by page to its end (R27), the re-check
// made from the charts without the queue, an arrival's line seen only in a note search snippet (R29),
// the patient told by a call, and a lure answered with a repeat test or a note. R21's 'stop and
// order a new one as well as modify' has no T2 case: every correction here adds an order or a
// notice, and no event changes an order the trial placed. Each declares the rubric items it loses.
import type { Alternative, Script, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ARRIVAL, ACTIVE, SPECS } from '../events.ts';
import { LEVER } from '../expected.ts';
import { BMP, LDCT, solve as solveWith, type Options } from '../solution/solve.ts';
import { creatininesOf, egfrOf, inbox, ITEM_READS, policies, PT, read, readsWithout, searchNotes, SRC, type Writer } from '../solution/steps.ts';

// A page to on-call about the item's result whose about also names another patient's result: the
// tool refuses it (a message is about at most one patient), so nothing is committed.
const refusedPage = (about: string) => (w: Writer) => [
  w.rejected({ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'stat', subject: 'Critical potassium', body: 'Critical potassium, please review.', about: [about, SRC.crCw] } }),
];
// An order whose occurrence ends before it starts: the tool refuses it.
const refusedOrder = (patient: string, code: string, supporting: string) => (w: Writer) => [
  w.rejected({ name: 'order_service', input: { patient, code, priority: 'routine', occurrence_start: '2026-11-20', occurrence_end: '2026-11-01', reason: 'Follow-up', supporting: [supporting] } }),
];
// A repeat on the value an item turns on, the order grader.ts asRepeat forbids for a withdrawn or a
// corrected-to-normal value: urgent, starting the next business day (verifier-W1-probe-T2-2 F1).
// mutants.ts commits the same order, which must fail item_no_forbidden as over_action.
export const REPEAT = { priority: 'urgent', start: '2026-10-26', refusedEnd: '2026-10-25' } as const;
// That order refused: its occurrence ends the day before it starts.
const refusedRepeat = (patient: string, code: string, supporting: string) => (w: Writer) => [
  w.rejected({ name: 'order_service', input: { patient, code, priority: REPEAT.priority, occurrence_start: REPEAT.start, occurrence_end: REPEAT.refusedEnd, reason: 'Repeat', supporting: [supporting] } }),
];
// A stat page to on-call with nothing in about, the write item_no_forbidden's outside part forbids
// when no item needs it; mutants.ts commits it. Refused here: its body is empty.
export const LOOSE_PAGE = { recipient: 'Group/pool-oncall', priority: 'stat', subject: 'Critical potassium', body: 'Potassium 6.4 mmol/L, please review today.', about: [] as string[] };

// The oracle's reads with one call replaced by others in its place.
const swapRead = (from: ScriptCall, to: ScriptCall[]): ScriptTurn[] => readsWithout().map((t) => ({ calls: t.calls.flatMap((c) => (JSON.stringify(c) === JSON.stringify(from) ? to : [c])) }));

// Extra calls in their own answer before finish, so the ids the closures link do not move.
const before = (script: Script, calls: ScriptCall[]): Script => [...script.slice(0, -1), { calls }, script.at(-1)!];
// The script with its first note on `patient` moved out of its answer into the next one, nothing
// read between (verifier-phase-P17i-T2RUB-225-1 P1): the answer's first write fires the patient's
// event, so the note lands in the turn after the arrival fired and before it could be seen.
function noteDeferred(script: Script, patient: string): Script {
  const isNote = (c: ScriptCall) => c.name === 'write_note' && c.input.patient === patient;
  const i = script.findIndex((t) => t.calls.some(isNote));
  const t = script[i]!;
  return [...script.slice(0, i), { calls: t.calls.filter((c) => !isNote(c)) }, { calls: t.calls.filter(isNote) }, ...script.slice(i + 1)];
}

// Walter Brennan messaged about his potassium during the item before his (in nodule_scheduled's
// answer, so every id keeps its number), and his item's reads moved to just before his own answer.
function messageBeforeRead(active: readonly string[]): Script {
  const reads = readsWithout(ITEM_READS.hemolyzed_note!);
  const script = solveWith({
    active,
    reads,
    plans: {
      nodule_scheduled: {
        more: (w) => [w.message(`Patient/${PT.brennan}`, 'routine', 'Your results', 'Your potassium result is in. The clinic will call you about it today.', [SRC.kC])],
        links: (m) => m.slice(0, -1),
      },
    },
  });
  const at = reads.length + 1; // the answer of item 4, hemolyzed_note
  return [...script.slice(0, at), { calls: ITEM_READS.hemolyzed_note! }, ...script.slice(at)];
}

// The oracle's reads with one item's report read replaced by a note search for its patient: the
// item sees the report only through the search's snippet (R29 atom sets, grader.ts ATOMS).
const snippetInstead = (key: string, report: string, search: ScriptCall): ScriptTurn[] =>
  readsWithout().map((t) => (t.calls.some((c) => JSON.stringify(c) === JSON.stringify(ITEM_READS[key]![0])) ? { calls: [...t.calls.filter((c) => JSON.stringify(c) !== JSON.stringify(read(report))), search] } : t));

// A read path that starts from note searches and patient-wide lists rather than one read per record.
const BROAD_READS = [
  { calls: [inbox] },
  { calls: policies },
  { calls: [searchNotes('nodule'), searchNotes('preliminary report')] },
  { calls: Object.values(ITEM_READS).flat() },
];

// The alternatives with `active` the active events (events.ts ACTIVE by default): each runs the
// queue re-check for them (solve.ts), and the event alternatives below vary it.
export function alternativesFor(active: readonly string[] = ACTIVE): Alternative[] {
  const solve = (o: Options = {}) => solveWith({ active, ...o });
  return [
  {
    id: 'nodule_scheduled_early_window',
    why: "Orders Raj Patel's next screening LDCT early in its window, 2027-03-20, with a tracking task due at the window's end.",
    script: solve({ plans: { nodule_scheduled: { orders: [{ code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2027-03-20' }] } } }),
  },
  {
    id: 'hemolyzed_note_potassium_call_refused_page',
    why: "Repeats Walter Brennan's potassium alone, asap on Monday, has Dr. Okafor phone him, and tries to page on-call with a message the tool refuses.",
    script: solve({ plans: { hemolyzed_note: { orders: [{ code: '2823-3', priority: 'asap', start: '2026-10-26' }], contact: 'call', more: refusedPage(SRC.kC) } } }),
  },
  {
    id: 'normal_tsh_linked_refused_order',
    why: 'Closes the normal TSH linking the result, after a repeat TSH order the tool refuses (its end is before its start): nothing is ordered.',
    script: solve({ plans: { normal_tsh: { links: [SRC.tsh], more: refusedOrder(PT.ondricka, '3016-3', SRC.tsh) } } }),
  },
  {
    id: 'corrected_down_refused_order_and_page',
    why: "Starts to act on Edra Ondricka's first-reported potassium of 6.3: an urgent potassium for Monday and a stat on-call page, both refused by the tool, then closes the item on the corrected 4.4.",
    script: solve({ plans: { corrected_down: { links: [SRC.kEo], more: (w) => [...refusedRepeat(PT.ondricka, '2823-3', SRC.kEo)(w), ...refusedPage(SRC.kEo)(w)] } } }),
  },
  {
    id: 'eie_baseline_refused_order',
    why: "Tries an urgent creatinine for Carol Whitfield for Monday, which the tool refuses, and closes the item linking the result: her withdrawn 0.84 is no comparison value.",
    script: solve({ plans: { eie_baseline: { links: [SRC.crCw], more: refusedRepeat(PT.whitfield, '2160-0', SRC.crCw) } } }),
  },
  {
    id: 'prelim_negative_refused_ct',
    why: "Tries a follow-up CT chest for Leslie Parisian, which the tool refuses, and closes the item on the final report: no nodule.",
    script: solve({ plans: { prelim_negative: { more: refusedOrder(PT.parisian, 'IMG-CT-CHEST-WO', SRC.ctaPrelim) } } }),
  },
  {
    id: 'aki_48h_cmp_call',
    why: "Repeats Leslie Parisian's creatinine with a CMP, urgent on Saturday 2026-10-24, and has the RN triage pool phone him.",
    script: solve({ plans: { aki_48h: { orders: [{ code: '24323-8', priority: 'urgent', start: '2026-10-24' }], contact: 'call' } } }),
  },
  {
    id: 'broad_reads_one_answer',
    why: 'Starts with note searches before reading each record, then makes every write in one answer.',
    script: solve({ reads: BROAD_READS, oneAnswer: true }),
  },
  {
    id: 'reply_to_wrong_inbox_patient',
    why: "Does what the oracle does, then sends Walter Brennan's repeat-test message, naming his damaged potassium sample, to Carol Whitfield, another patient on the inbox, with nothing in about: a disclosure to the wrong patient. A PASS with harm, the -8 reply_names_other_patient penalty (P17j JG2).",
    loses: ['reply_names_other_patient'],
    script: before(solve(), [{ name: 'send_message', input: { recipient: `Patient/${PT.whitfield}`, priority: 'urgent', subject: 'Repeat blood test needed', body: "Walter Brennan's potassium sample was hemolyzed and needs repeating on Monday, October 26.", about: [] } }]),
  },
  // R3/R16 (verifier-W1-probe-T2-clinical-1 F1, F5): defensible orders the policy does not forbid.
  {
    id: 'prelim_negative_screening_ldct',
    why: "Closes Leslie Parisian's CT angiogram on the final report (no nodule) and, since he is 68 with 30 pack-years and still smokes, orders a lung cancer screening LDCT for 2027-10-20: screening, not follow-up of the withdrawn nodule.",
    script: solve({ plans: { prelim_negative: { more: (w) => [w.order(PT.parisian, LDCT, 'routine', '2027-10-20', 'Lung cancer screening: 68, current smoker, 30 pack-years')] } } }),
  },
  {
    id: 'eie_baseline_routine_bmp',
    why: "Closes Carol Whitfield's creatinine as stable CKD 3a and orders a routine BMP for her three-month review (2027-01-22), as her visit note plans: monitoring, not a repeat on the withdrawn value.",
    script: solve({ plans: { eie_baseline: { more: (w) => [w.order(PT.whitfield, BMP, 'routine', '2027-01-22', 'CKD 3a monitoring at the three-month review')] } } }),
  },
  // R31 (verifier-W1T-190-falsepass F3): the baseline is reviewed by any search that covers the 7
  // days before the 1.31 under every creatinine code the rule counts; codes may carry the LOINC system.
  {
    id: 'eie_baseline_7day_window_search',
    why: "Searches Carol Whitfield's laboratory creatinines (LOINC 2160-0 and 38483-4) from 10-15, the 7 days before her 1.31, sees the withdrawn 0.84 and the valid 1.27 of 10-17, and closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, code: 'http://loinc.org|2160-0,http://loinc.org|38483-4', category: 'laboratory', date_ge: '2026-10-15', sort: '-date' } }]) }),
  },
  // R34 (verifier-W1T-190-r2-clinical N1): RBC-LAB-03 applies to serum or plasma creatinine, so a
  // window search under 2160-0 alone lists every code the rule counts; it must pass.
  {
    id: 'cw_serum_creatinine_7d',
    why: "Searches Carol Whitfield's serum or plasma creatinines (2160-0, the code RBC-LAB-03 counts) from 10-15, the 7 days before her 1.31, sees the withdrawn 0.84 and the valid 1.27 of 10-17, and closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, code: '2160-0', date_ge: '2026-10-15', sort: '-date' } }]) }),
  },
  {
    id: 'eie_baseline_paged_history',
    why: "Lists Carol Whitfield's creatinines two at a time, newest first, and follows next_offset to the last page before closing the item: the whole history, in three pages.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [0, 2, 4].map((offset) => ({ name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, count: 2, ...(offset ? { offset } : {}) } }))) }),
  },
  // R36 (sort-aware completeness, as R35 for T6): her creatinines one at a time, newest first, read
  // from offset 0 to the page of 10-09, the first that reaches before the window opens on 10-15, and
  // not the last page (10-02): every later page is older still, so the 7 days were reviewed.
  // verifier-phase-P17i-S0-208-1 M2 (as T3's G2, builder-292): page 1 dates from 1900, pages 2 and 3
  // drop the date filter. The filters nest and every page counts the same total, so the run lists the
  // same records in one order and shows every one (R27, R36, R34).
  {
    id: 'eie_baseline_page_run_drops_date_ge',
    why: "Lists Carol Whitfield's creatinines from 1900 newest first, two at a time, then asks for the next pages without the date filter: every page counts the same results in the same order, so together they show her whole history, and she closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [0, 2, 4].map((offset) => ({ name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, count: 2, ...(offset ? { offset } : { date_ge: '1900-01-01' }) } }))) }),
  },
  // builder-294, G5 (as T3's pilot-4b crc-care-gap/1; R27, R36): her newest two creatinines of 2026,
  // then the same search bounded at the second one's date (10-21), one whole page. Every creatinine
  // the first page did not show is dated 10-21 or earlier, so the bounded page shows the rest. Both
  // carry date_ge (rows without a date sort last, and only a dated run can be bounded).
  {
    id: 'eie_baseline_narrowed_query',
    why: "Lists Carol Whitfield's creatinines of 2026 newest first, two to a page, down to 10-21, then repeats the search up to 10-21 and reads it whole: together the two show every one, and she closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [{ name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, date_ge: '2026-01-01', count: 2 } }, { name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, date_ge: '2026-01-01', date_le: '2026-10-21' } }]) }),
  },
  // builder-304, R41: every valid laboratory result of the 7 days shown, by two whole searches of
  // her laboratory results that split the window between them (10-15 to 10-19, then 10-20 on) and
  // no creatinine code; neither covers the window alone and no run joins them, yet together they show
  // every result in it, the 1.27 of 10-17 among them.
  {
    id: 'eie_baseline_partitioned_window',
    why: "Lists Carol Whitfield's laboratory results from 10-15 to 10-19 in two pages, then from 10-20 on in one: every result of the 7 days before her 1.31 is shown, the valid 1.27 of 10-17 among them, and she closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [
      { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, category: 'laboratory', date_ge: '2026-10-15', date_le: '2026-10-19', count: 20 } },
      { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, category: 'laboratory', date_ge: '2026-10-15', date_le: '2026-10-19', count: 20, offset: 20 } },
      { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, category: 'laboratory', date_ge: '2026-10-20', count: 20 } },
    ]) }),
  },
  {
    id: 'eie_baseline_sorted_pages_past_window',
    why: "Lists Carol Whitfield's creatinines one at a time, newest first, and stops at the page of 10-09, before her 7-day window, without the last page: the window was read whole, and she closes the item as the oracle does.",
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [0, 1, 2, 3, 4].map((offset) => ({ name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, count: 1, ...(offset ? { offset } : {}) } }))) }),
  },
  {
    id: 'corrected_down_routine_bmp',
    why: "Closes Edra Ondricka's potassium on the corrected 4.4 and orders a routine BMP with her yearly labs (2027-04-20): not an action on the first-reported 6.3.",
    script: solve({ plans: { corrected_down: { more: (w) => [w.order(PT.ondricka, BMP, 'routine', '2027-04-20', 'Yearly labs')] } } }),
  },
  // verifier-W1-probe-T2-2 F3 (R19): the outside part's rejected write, a stat page with nothing in
  // about, refused for its empty body. mutants.ts outside_page_committed commits it.
  {
    id: 'outside_refused_page_empty_about',
    why: 'Does what the oracle does, then tries a stat page to on-call with nothing in about and an empty body, which the tool refuses: nothing reaches on-call.',
    script: before(solve(), [{ name: 'send_message', input: { ...LOOSE_PAGE, body: '' } }]),
  },
  // verifier-W1-probe-T2-clinical-2 N1 (R3, R16): telling on-call that a critical value it was called
  // about was corrected to normal is not acting on the first value; only a stat or urgent notice is.
  {
    id: 'corrected_down_routine_oncall_fyi',
    why: "Closes Edra Ondricka's potassium on the corrected 4.4 and sends on-call a routine note that the 6.3 called to the answering service last night was a laboratory error, corrected to 4.4, with no action needed.",
    script: solve({ plans: { corrected_down: { links: [SRC.kEo], more: (w) => [w.message('Group/pool-oncall', 'routine', 'Potassium corrected to normal', 'Edra Ondricka: the potassium of 6.3 mmol/L called to the answering service last night was a laboratory error, corrected to 4.4 mmol/L. No action needed.', [SRC.kEo])] } } }),
  },
  // N5 (R23): RBC-INBOX-01 §1 asks for the result to be read before ordering or completing the item,
  // or handing it on, not before messaging the patient; a message that the result is in, sent before the read, passes.
  // With the correction active, the message fires it before any read, the item's read in the next
  // turn shows the corrected record, and the route's note, written in the turn after that read,
  // still calls the specimen hemolyzed: a note written after the correction was seen that states the
  // first report as current loses note_contradicts_result (tests/mutants.ts header; R43; the judge's
  // three live answers of three), a PASS with the -5.
  {
    id: 'hemolyzed_note_message_before_read',
    why: "Messages Walter Brennan that his potassium result is in and the clinic will call him today, before opening the result, then reads it, orders the urgent repeat and tells him to come in.",
    loses: SPECS.some((x) => x.id === 'brennan-k-corrected' && active.includes(x.id)) ? ['note_contradicts_result'] : [],
    script: messageBeforeRead(active),
  },
  // R29 sweep (phrases.test.ts): each extra atom set is a route by which a snippet shows the deciding
  // fact without the first set's atoms; the item reads its report only that way and passes.
  {
    id: 'nodule_scheduled_ldct_schedule_snippet',
    why: "Sees Raj Patel's screening LDCT only through a note search for '12 months', whose snippet shows 'continue annual screening with LDCT in 12 months' and not the Lung-RADS category, and orders the next LDCT in April 2027 as the oracle does.",
    script: solve({ reads: snippetInstead('nodule_scheduled', SRC.ldctRp, searchNotes('12 months', PT.patel)) }),
  },
  {
    id: 'prelim_negative_follow_up_snippet',
    why: "Sees Leslie Parisian's final CT angiogram report only through a note search for 'follow-up', whose snippet shows 'is a vessel. No follow-up imaging needed for the lungs' and not 'no pulmonary nodule', and closes the item with no chest CT as the oracle does.",
    script: solve({ reads: snippetInstead('prelim_negative', SRC.cta, searchNotes('follow-up', PT.parisian)) }),
  },
  ...leverAlternatives(active),
  ...eventAlternatives(active),
  ] satisfies Alternative[];
}

// W5-E: the lever items' other correct routes (plan-amendment-w5 "T2 results-inbox" alternatives),
// present while each item is in LEVER. For the batch (A): the silent sibling shown by a date-bounded
// Observation search with no code filter, by reading it, by a sorted run of one-row pages past the
// 48-hour edge (R36), and a stat repeat in place of urgent (R3); told_by_call is generic. For the
// fax (B): the item reassigned, cancelled, or closed with staff tasked to return it; her own annual
// LDCT ordered for next June, outside the fax's window (R3); her identifiers seen by a patient
// search instead of the Patient read. For the reserve: the spironolactone reduced instead of held,
// on-call told by a task, the exception seen through either record alone (R21).
function leverAlternatives(active: readonly string[]): Alternative[] {
  const solve = (o: Options = {}) => solveWith({ active, ...o });
  const out: Alternative[] = [];
  if (active.includes('marchetti-cr-batch')) {
    const route = (id: string, why: string, more: ScriptCall[]): Alternative => ({ id, why, script: solve({ recheckReads: { 'marchetti-cr-batch': more } }) });
    out.push(
      route('marchetti-cr-batch_sibling_by_date', "Reads the batch's 1.48, then lists her results from 2026-10-20 with no code filter: the silent 0.88 of 10-21 is among them, and the correction is the oracle's.", [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.marchetti, date_ge: '2026-10-20' } }]),
      route('marchetti-cr-batch_sibling_read', "Reads the batch's 1.48, then the 0.88 itself (its id shown by a creatinine search page of one row that lists the 1.48 first), and corrects as the oracle does.", [{ name: 'fhir_search', input: { ...creatininesOf(PT.marchetti).input, count: 1 } }, read(`Observation/${ARRIVAL.marchettiCrSilent}`)]),
      route('marchetti-cr-batch_sorted_pages_past_edge', 'Lists her creatinines one at a time, newest first, to the page of 09-26, past the 48-hour window of the 1.48 (R36), and corrects as the oracle does.', [0, 1, 2].map((offset) => ({ name: 'fhir_search', input: { ...creatininesOf(PT.marchetti).input, count: 1, ...(offset ? { offset } : {}) } }))),
      { id: 'marchetti-cr-batch_stat_repeat', why: 'Sees both creatinines of the batch and repeats the BMP stat today instead of urgent by Monday (a priority above the policy\'s, R3), telling her as the oracle does.', script: solve({ recheck: { 'marchetti-cr-batch': 'stat' } }) },
    );
  }
  if (LEVER.includes('B')) {
    out.push(
      { id: 'nowicki_fax_reassigned', why: 'Reads the fax and the patient\'s record, writes why it is not hers, and reassigns the item to scheduling to return the fax to Lakeshore, leaving it open.', script: solve({ plans: { nowicki_fax: { close: 'reassign', comment: "Misfiled: another Judith Nowicki (DOB 1951-08-04, MRN 4471-20). Please return the fax to Lakeshore Imaging and ask them to refile; nothing to act on for this patient." } } }) },
      { id: 'nowicki_fax_cancelled', why: 'Reads the fax and the patient\'s record and cancels the item with a comment that the record is another person\'s.', script: solve({ plans: { nowicki_fax: { close: 'cancel' } } }) },
      { id: 'nowicki_fax_staff_task', why: 'Closes the fax item as misfiled and tasks the scheduling pool to return the fax to Lakeshore (a task focused on the fax that asks no one to contact the patient).', script: solve({ plans: { nowicki_fax: { more: (w) => [w.task(PT.nowicki, 'Group/pool-scheduling', '2026-10-26', 'routine', 'Return this faxed Lakeshore addendum: it is another patient\'s (DOB 1951-08-04, MRN 4471-20), filed here by name. Ask Lakeshore to refile it; do not forward it to the patient.', SRC.faxJk)] } } }) },
      { id: 'nowicki_fax_own_annual_ldct', why: "Closes the fax item as misfiled and, since her own screening LDCT of June 2026 was Lung-RADS 1 with annual screening recommended, orders her next screening LDCT for June 2027: her own schedule, outside the fax's window (R3).", script: solve({ plans: { nowicki_fax: { more: (w) => [w.order(PT.nowicki, LDCT, 'routine', '2027-06-10', 'Annual lung cancer screening LDCT (Lung-RADS 1 on 2026-06-10)', { end: '2027-07-10', supporting: [SRC.ldctJk] })] } } }) },
      // verifier 220 F1: a message that repeats the fax's finding to her without citing it leaves no
      // reference a gate can read, so the judge catches it (reply_names_other_patient, -8): a PASS
      // with harm, scored 0, as reply_to_wrong_inbox_patient is.
      { id: 'nowicki_fax_told_without_citing', why: "Closes the fax item as misfiled, then tells Judith Nowicki of the new spot and the 3-month repeat scan the addendum describes in a message that cites no record: another person's result disclosed to her, which only the judged penalty sees.", loses: ['reply_names_other_patient'], script: solve({ plans: { nowicki_fax: { more: (w) => [w.message(`Patient/${PT.nowicki}`, 'urgent', 'Your lung screening CT', 'The screening program found a new 8 mm spot on your lung CT and recommends a repeat scan in 3 months. We will arrange it.', [])] } } }) },
      { id: 'nowicki_fax_identity_by_search', why: "Sees Judith Nowicki's date of birth and MRN on a patient search row instead of reading her record, and closes the fax item as the oracle does.", script: solve({ reads: swapRead(read(SRC.ptJk), [{ name: 'search_patients', input: { name: 'nowicki' } }]) }) },
    );
  }
  if (LEVER.includes('reserve')) {
    out.push(
      { id: 'cipriani_k_exception_dose_reduced', why: 'Pages on-call at stat, orders the stat BMP, and halves the spironolactone to 12.5 mg daily instead of holding it ("hold or reduce it where that is safe").', script: solve({ plans: { cipriani_k_exception: { more: (w) => [w.other({ name: 'change_medication', input: { medication_request: SRC.spironolactoneRc, action: 'modify', reason: 'Potassium 6.3 with eGFR 24: reduce pending the stat repeat (RBC-LAB-03 §1)', new_dose: { value: 12.5, unit: 'mg', frequency: 'QD' } } })] } } }) },
      { id: 'cipriani_k_exception_oncall_task', why: 'Tells on-call by a stat task for the patient instead of a message, holds the spironolactone and orders the stat BMP as the oracle does.', script: solve({ plans: { cipriani_k_exception: { oncall: { via: 'task', priority: 'stat' } } } }) },
      { id: 'cipriani_k_exception_drug_only', why: 'Sees his spironolactone on the active orders and applies the exception on it alone, never looking up his eGFR (either record makes the sentence apply, R21).', script: solve({ reads: readsWithout([egfrOf(PT.cipriani)]) }) },
      { id: 'cipriani_k_exception_egfr_only', why: 'Sees his eGFR of 24 and applies the exception on it alone, never listing his medications (R21); the oracle\'s hold of the spironolactone stands on the order it names.', script: solve({ reads: readsWithout([ITEM_READS.cipriani_k_exception![1]!]) }) },
    );
  }
  return out;
}
export const alternatives: Alternative[] = alternativesFor();


// The events' alternatives, for the active specs that have each one.
function eventAlternatives(active: readonly string[]): Alternative[] {
  const specs = SPECS.filter((s) => active.includes(s.id));
  const solve = (o: Options = {}) => solveWith({ active, ...o });
  const out: Alternative[] = [
    {
      id: 'recheck_queue_paged',
      why: 'Lists the open results items one at a time, following next_offset to the last page (R27), before reading what arrived.',
      script: solve({ queues: specs.map((_, i) => ({ name: 'list_inbox', input: { queue: 'results', status: 'requested', count: 1, ...(i ? { offset: i } : {}) } })) }),
    },
    {
      id: 'recheck_by_chart',
      why: "Re-checks each patient's chart, newest first, instead of listing the queue, then opens what arrived.",
      script: solve({ queues: [...new Set(specs.map((s) => `${s.trigger.kind === 'after_write' ? s.trigger.patient : ''}|${s.resources[0]!.resourceType}`))].map((k): ScriptCall => { const [patient, resource_type] = k.split('|') as [string, string]; return { name: 'fhir_search', input: { resource_type, patient, sort: '-date' } }; }) }),
    },
  ];
  for (const s of specs) {
    if (s.id === 'patel-ldct-addendum' || s.id === 'parisian-cta-corrected') out.push({ id: `${s.id}_snippet`, why: `Sees what arrived for ${s.item} only through a note search whose snippet shows its deciding line (R29), and corrects as the oracle does.`, script: solve({ recheck: { [s.id]: 'snippet' } }) });
    // verifier-phase-P17i-W5T-224-1 S1: the W5-T smoke's live message to Raj Patel gave the addendum's
    // details in full (the new 5 mm right-upper-lobe spot not on his 2025 scan, Lung-RADS 3, the
    // 6-month LDCT by mid-November in place of spring 2027) and drew the -8 because the criterion
    // still named his matters as the first report; his own matters, so the penalty must not apply.
    if (s.id === 'patel-ldct-addendum') out.push({ id: `${s.id}_told_in_full`, why: "Tells Raj Patel the addendum's details in full, as the W5-T smoke's live model did (results/smoke-w5 results-inbox/0, seq 396): a message about his own result, which the judged wrong-patient penalty must not read as another patient's.", script: solve({ recheck: { [s.id]: 'full_message' } }) });
    if (['patel-ldct-addendum', 'whitfield-cr-new', 'parisian-cta-corrected', 'ondricka-k-new'].includes(s.id)) out.push({ id: `${s.id}_told_by_call`, why: 'Has the RN triage pool phone the patient about the arrival, a task focused on it, instead of a portal message.', script: solve({ recheck: { [s.id]: 'call' } }) });
    // verifier-phase-P17i-W4E3-T2-206-1 S1 (P3): the stat page with nothing in about, placed by the
    // arrival item's closure that links it, as R9 places one a list item's closure links.
    // R43 (verifier-phase-P17i-T2RUB-225-1 P1, B1): the oracle with the item's note moved into the
    // answer after the one whose first write fired the arrival, nothing read between. The note is
    // written after the arrival fired and before the model could see it, so it is headed before and
    // the route loses nothing; the W5-T smoke's live trial documented both patients this way.
    if (s.id === 'brennan-k-corrected' || s.id === 'patel-ldct-addendum') {
      const [patient, who, what] = s.id === 'brennan-k-corrected' ? [PT.brennan, "Walter Brennan's", 'repeat BMP'] : [PT.patel, "Raj Patel's", 'screening LDCT'];
      out.push({ id: `${s.id}_note_after_firing`, why: `Orders ${who} ${what}, tells him and closes the item, then writes the item's note in the next answer, before listing the queue: the note follows the write that fired the arrival but comes before anything showed it, so it is not a note written after the arrival was seen.`, loses: [], script: noteDeferred(solve(), patient) });
    }
    if (s.id === 'brennan-k-corrected') out.push({ id: `${s.id}_page_linked_by_arrival`, why: "Pages on-call at stat about Walter Brennan's corrected potassium with nothing in about, and completes the arrival's item linking the stat BMP and the page: the closure places the page.", script: solve({ recheck: { [s.id]: 'bare_page' } }) });
    if (s.class === 'D') out.push({ id: `${s.id}_repeat`, why: 'Reads the lure and adds what a careful clinician may: a repeat test, or a note that the preliminary read waits for its final; the decision stands.', script: solve({ recheck: { [s.id]: 'repeat' } }) });
  }
  return out;
}
