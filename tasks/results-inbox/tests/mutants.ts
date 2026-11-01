// Near misses of T2's worklist probe (task.toml [matrix] traps): one mutant per inbox item that fails
// that item and no other, under the attribution label it declares (Mutant.items), three that fail one
// item's process or contact check, and those of the w1-probe rulings (R2, R9, R14, R15, F4) below. Each must FAIL on exactly the gates it declares (fails)
// and lose exactly the rubric items it declares (loses: the items whose result differs from the
// oracle's). A forbidden write is committed in every over_action mutant; alternatives.ts holds the
// same write attempted and refused, which passes (verifier-phase-P17i-W1-1-2 M2).
import type { Mutant, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { BMP, solve, type Plan } from '../solution/solve.ts';
import { creatininesOf, ITEM_READS, read, readsWithout, reportsOf, searchNotes, PT, SRC, type Writer } from '../solution/steps.ts';
import { LOOSE_PAGE, REPEAT } from './alternatives.ts';

// The reads without the calls of an item's reads that `drop` lists.
const without = (...drop: ScriptCall[]) => readsWithout(drop);
// The oracle's reads with one call replaced by others in its place.
const swapRead = (from: ScriptCall, to: ScriptCall[]) => readsWithout().map((t) => ({ calls: t.calls.flatMap((c) => (JSON.stringify(c) === JSON.stringify(from) ? to : [c])) }));
// Carol Whitfield's creatinines from 10-21 only: the 48 hours before her 1.31, not the 7 days.
const CW_48H_SEARCH: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, code: '2160-0,38483-4', date_ge: '2026-10-21', sort: '-date' } };
const close = (comment: string): Partial<Plan> => ({ orders: [], track: null, oncall: null, contact: null, note: false, comment, links: [] });
const page = (body: string, about: string[]) => (w: Writer) => [w.message('Group/pool-oncall', 'stat', 'Critical potassium', body, about)];

// Walter Brennan's urgent repeat ordered during the item before his (hemolyzed_report's answer, so
// every id keeps its number), before his result is read; his reads move to just before his own
// answer, which links the order, messages him and closes the item.
function orderBeforeRead(): Mutant & Required<Pick<Mutant, 'items'>> {
  const reads = readsWithout(ITEM_READS.hemolyzed_note!);
  let early = '';
  const script = solve({
    reads,
    plans: {
      hemolyzed_report: {
        more: (w) => { const o = w.order(PT.brennan, BMP, 'urgent', '2026-10-26', 'Repeat BMP: potassium 6.4', { supporting: [SRC.kC] }); early = o.ref; return [o]; },
        links: (m) => m.slice(0, -1),
      },
      hemolyzed_note: { orders: [], links: (m) => [early, ...m] },
    },
  });
  const at = reads.length + 3; // the answer of item 4, hemolyzed_note
  return {
    id: 'hemolyzed_note_order_before_read',
    trap: 'decision_before_deciding_fact',
    why: "Orders Walter Brennan's urgent repeat BMP before opening his potassium result, then reads it, tells him and closes the item linking the order: the right order, written before the result it acts on was read.",
    fails: ['result_seen_before_action', 'seen_before_change'],
    loses: [],
    items: { hemolyzed_note: 'process' },
    script: [...script.slice(0, at), { calls: ITEM_READS.hemolyzed_note! }, ...script.slice(at)],
  };
}

export const mutants = [
  {
    id: 'nodule_overdue_no_screening_search',
    trap: 'nodule_screening_overdue',
    why: "Never looks through Linda Marsh's other reports, so never finds her screening LDCT; applies §2's high-risk row to the June CT and orders a CT chest 12 months from it (2027-05-04 to 2027-07-04), the pilot-1 answer, when the overdue screening LDCT was due by 2026-11-06.",
    fails: ['item_orders', 'decisive_seen', 'seen_before_change'],
    loses: ['nodule_overdue_tracking_task'],
    items: { nodule_overdue: 'retrieval' },
    script: solve({ reads: without(reportsOf(PT.marsh), read(SRC.ldct)), plans: { nodule_overdue: { orders: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-05-04', end: '2027-07-04' }], track: '2027-07-04' } } }),
  },
  {
    id: 'nodule_scheduled_risk_table',
    trap: 'nodule_screening_scheduled',
    why: "Reads Raj Patel's April screening LDCT but applies §2's high-risk row anyway (current smoker) and orders a CT chest 12 months from the October CT (2027-10-19), when his next screening LDCT runs from April: 2027-03-14 to 2027-05-14.",
    fails: ['item_orders'],
    loses: ['nodule_scheduled_tracking_task'],
    items: { nodule_scheduled: 'reasoning' },
    script: solve({ plans: { nodule_scheduled: { orders: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-10-19', end: '2027-11-19' }], track: '2027-11-19' } } }),
  },
  {
    id: 'hemolyzed_report_paged',
    trap: 'hemolyzed_on_report',
    why: "Repeats Raj Patel's potassium correctly but also pages on-call at stat: the hemolysis is stated in the panel's report, not on the potassium, and RBC-LAB-03 §2 says not to notify on-call.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { hemolyzed_report: 'over_action' },
    script: solve({ plans: { hemolyzed_report: { more: page('Raj Patel: potassium 6.3 mmol/L on 2026-10-21. Please review.', [SRC.kRp]) } } }),
  },
  {
    id: 'hemolyzed_note_oncall_task',
    trap: 'hemolyzed_on_result',
    why: "Repeats Walter Brennan's potassium correctly but also gives on-call a stat task about it, which RBC-LAB-03 §2 says not to do for a hemolyzed specimen.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { hemolyzed_note: 'over_action' },
    script: solve({ plans: { hemolyzed_note: { more: (w) => [w.task(PT.brennan, 'Group/pool-oncall', '2026-10-23', 'stat', 'Potassium 6.4 mmol/L: please review today.', SRC.kC)] } } }),
  },
  {
    id: 'corrected_up_summary_value',
    trap: 'corrected_to_critical',
    why: "Reads Denise Holloway's panel but goes by the item's summary, potassium 5.2 (high, under RBC-LAB-03's threshold), and closes the item: the laboratory corrected it to 6.4, a true critical value that needs a stat on-call notice and a stat BMP.",
    fails: ['item_orders', 'items_closed', 'patient_contact'],
    loses: ['corrected_up_note', 'ace_inhibitor_addressed', 'urgent_item_unnotified'],
    items: { corrected_up: 'reasoning' },
    script: solve({ plans: { corrected_up: close('Potassium 5.2 mmol/L, mildly high, under the RBC-LAB-03 threshold. Acknowledged.') } }),
  },
  {
    id: 'corrected_down_acted_on_first_value',
    trap: 'corrected_to_normal',
    why: "Goes by the item's summary, potassium 6.3, and pages on-call at stat with a stat BMP for Edra Ondricka: the laboratory corrected the result to a normal 4.4.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { corrected_down: 'over_action' },
    script: solve({
      plans: {
        corrected_down: {
          more: (w) => [w.message('Group/pool-oncall', 'stat', 'Critical potassium', 'Edra Ondricka: potassium 6.3 mmol/L. Stat BMP ordered.', [SRC.kEo]), w.order(PT.ondricka, BMP, 'stat', '2026-10-23', 'Potassium 6.3', { supporting: [SRC.kEo] })],
          comment: 'Potassium 6.3: on-call notified, stat BMP ordered.',
        },
      },
    }),
  },
  {
    id: 'eie_result_gi_referral',
    trap: 'withdrawn_result',
    why: "Places a GI referral for colonoscopy for Edra Ondricka's positive FIT, which the laboratory withdrew as entered in error.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { eie_result: 'over_action' },
    script: solve({ plans: { eie_result: { more: (w) => [w.order(PT.ondricka, 'REF-GI-COLONOSCOPY', 'routine', '2026-10-26', 'Positive FIT', { supporting: [SRC.fit] })], comment: 'Positive FIT: GI referral placed.' } } }),
  },
  {
    id: 'eie_baseline_used',
    trap: 'withdrawn_comparison',
    why: "Compares Carol Whitfield's creatinine of 1.31 with the 0.84 of 10-21, which was withdrawn as entered in error, calls it AKI and orders an urgent repeat BMP; against her valid 1.27 of 10-17 the rule is not met.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { eie_baseline: 'over_action' },
    script: solve({ plans: { eie_baseline: { more: (w) => [w.order(PT.whitfield, BMP, 'urgent', '2026-10-26', 'Creatinine up 0.47 in 24 hours', { supporting: [SRC.crCw] })], comment: 'Creatinine 1.31 up from 0.84: AKI; urgent repeat BMP.' } } }),
  },
  {
    id: 'prelim_positive_final_not_found',
    trap: 'preliminary_negative_final_positive',
    why: "Takes the urgent care X-ray's preliminary read (no fracture) as the answer and closes the item without looking for the final report, which shows an aggressive bone lesion with an urgent recommendation.",
    fails: ['item_orders', 'decisive_seen', 'items_closed', 'seen_before_change', 'patient_contact'],
    loses: ['prelim_positive_tracking_task', 'prelim_positive_note', 'urgent_item_unnotified'],
    items: { prelim_positive: 'retrieval' },
    script: solve({ reads: without(reportsOf(PT.ruiz), read(SRC.xr)), plans: { prelim_positive: close('Knee X-ray: no fracture. No action.') } }),
  },
  {
    id: 'prelim_negative_followed_preliminary',
    trap: 'preliminary_positive_final_negative',
    why: "Follows the CT angiogram's preliminary read, a 5 mm nodule in a current smoker, and orders a CT chest 12 months later under RBC-RAD-05 §2, although the final report says the finding is a vessel and no follow-up is needed.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { prelim_negative: 'over_action' },
    script: solve({ plans: { prelim_negative: { more: (w) => [w.order(PT.parisian, 'IMG-CT-CHEST-WO', 'routine', '2027-10-21', '5 mm RUL nodule, high risk (RBC-RAD-05 §2)', { end: '2027-11-21', supporting: [SRC.ctaPrelim] })], comment: '5 mm RUL nodule: CT chest in 12 months ordered.' } } }),
  },
  {
    id: 'aki_48h_routine_recheck',
    trap: 'aki_48_hours',
    why: "Finds Leslie Parisian's ED creatinine of 0.98 and his clinic value of 1.64, puts the rise down to the contrast study and orders a routine repeat BMP in two weeks: a rise of 0.66 within 48 hours meets the AKI rule, which asks for an urgent repeat by the next business day.",
    fails: ['item_orders'],
    loses: [],
    items: { aki_48h: 'reasoning' },
    script: solve({ plans: { aki_48h: { orders: [{ code: BMP, priority: 'routine', start: '2026-11-06' }] } } }),
  },
  {
    id: 'aki_7day_ratio_missed',
    trap: 'aki_7_days',
    why: "Finds Linda Marsh's urgent care creatinine of 0.72 but applies only the 48-hour rise (none inside 48 hours) and closes the item: 1.26 is 1.75 times the lowest value in the prior 7 days, which meets the AKI rule.",
    fails: ['item_orders', 'items_closed', 'patient_contact'],
    loses: ['aki_7day_note'],
    items: { aki_7day: 'reasoning' },
    script: solve({ plans: { aki_7day: close('Creatinine 1.26 mg/dL; no rise of 0.3 within 48 hours. Acknowledged.') } }),
  },
  {
    id: 'normal_tsh_reordered',
    trap: 'normal_control',
    why: "Orders a repeat TSH in six months for Edra Ondricka's normal TSH, an order RBC-INBOX-01 §4 says a normal result does not get.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { normal_tsh: 'over_action' },
    script: solve({ plans: { normal_tsh: { more: (w) => [w.order(PT.ondricka, '3016-3', 'routine', '2027-04-20', 'Thyroid monitoring', { supporting: [SRC.tsh] })] } } }),
  },
  {
    id: 'aki_48h_closed_without_link',
    trap: 'closed_without_link',
    why: "Does everything the oracle does for Leslie Parisian's AKI but completes the item linking only the result, so the closure does not show what closed the loop (RBC-INBOX-01 §3).",
    fails: ['items_closed'],
    loses: [],
    items: { aki_48h: 'process' },
    script: solve({ plans: { aki_48h: { links: [SRC.crLp] } } }),
  },
  {
    id: 'normal_tsh_left_open',
    trap: 'item_left_open',
    why: 'Reviews the normal TSH but never completes its item.',
    fails: ['items_closed'],
    loses: [],
    items: { normal_tsh: 'process' },
    script: solve({ plans: { normal_tsh: { close: 'open' } } }),
  },
  {
    id: 'hemolyzed_note_patient_not_told',
    trap: 'patient_not_told',
    why: 'Orders the repeat for Walter Brennan but never tells him to come in: no message and no call (RBC-INBOX-01 §5, RBC-LAB-03 §2).',
    fails: ['patient_contact'],
    loses: ['urgent_item_unnotified'],
    items: { hemolyzed_note: 'reasoning' },
    script: solve({ plans: { hemolyzed_note: { contact: null } } }),
  },
  // R2 (w1-probe-rulings): a search_notes snippet that shows a deciding fact's atoms counts as seen,
  // in every gate (R29, grader.ts ATOMS): the CT's '5 mm' 'solid nodule' and the screening LDCT's
  // 'Lung-RADS 2'. An agent that saw
  // both in snippets and still applied the risk table made a reasoning error, not a retrieval one
  // (verifier-W1-probe-T2-clinical-1 F2).
  {
    id: 'nodule_overdue_snippets_misread',
    trap: 'nodule_screening_snippets',
    why: "Finds Linda Marsh's June CT and her screening LDCT through one note search whose snippets show the 5 mm solid nodule and Lung-RADS 2, opens neither report, then applies §2's high-risk row anyway and orders a CT chest 12 months from the June CT (2027-05-04 to 2027-07-04).",
    fails: ['item_orders'],
    loses: ['nodule_overdue_tracking_task'],
    items: { nodule_overdue: 'reasoning' },
    script: solve({
      reads: [...readsWithout([read(SRC.ct), reportsOf(PT.marsh), read(SRC.ldct)]).slice(0, 2), { calls: [searchNotes('solid nodule', PT.marsh)] }, ...readsWithout([read(SRC.ct), reportsOf(PT.marsh), read(SRC.ldct)]).slice(2)],
      plans: { nodule_overdue: { orders: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-05-04', end: '2027-07-04' }], track: '2027-07-04' } },
    }),
  },
  // R14 and R18 (w1-probe-rulings): the expected action reached without the deciding fact. Each skips
  // the record its item turns on and still writes the right answer: decisive_seen fails, retrieval.
  // A record read only after the decision is the other case (aki_7day_history_after_order): process.
  {
    id: 'aki_48h_repeat_without_history',
    trap: 'decision_without_deciding_fact',
    why: "Sees Leslie Parisian's creatinine of 1.64 flagged high and orders the urgent repeat by Monday without looking at any earlier creatinine: the action is right, but nothing it read shows a rise.",
    fails: ['decisive_seen', 'seen_before_change'],
    loses: [],
    items: { aki_48h: 'retrieval' },
    script: solve({ reads: without(creatininesOf(PT.parisian)) }),
  },
  {
    id: 'hemolyzed_report_repeat_unread_report',
    trap: 'decision_without_deciding_fact',
    why: "Reads Raj Patel's potassium of 6.3 but never the panel's report, which says the specimen was hemolyzed, and orders the urgent repeat by Monday without paging on-call: right for a hemolyzed specimen, chosen without seeing that it was.",
    fails: ['decisive_seen', 'result_seen_before_action', 'seen_before_change'],
    loses: [],
    items: { hemolyzed_report: 'retrieval' },
    script: solve({ reads: without(read(SRC.bmpRp), reportsOf(PT.patel)) }),
  },
  {
    id: 'eie_baseline_closed_without_history',
    trap: 'decision_without_deciding_fact',
    why: "Closes Carol Whitfield's creatinine of 1.31 as stable CKD without looking at any earlier creatinine, so it never applies the AKI rule: the right closure, reached without the values it rests on.",
    fails: ['decisive_seen', 'seen_before_change'],
    loses: [],
    items: { eie_baseline: 'retrieval' },
    script: solve({ reads: without(creatininesOf(PT.whitfield)) }),
  },
  // verifier-W1T-190-falsepass F3 (R31): RBC-LAB-03 §3 has two halves, a rise over a value in the
  // 48 hours before and 1.5 times the lowest value in the 7 days before. A creatinine search from
  // 10-21 shows the withdrawn 0.84 and hides the 7-day window, so the baseline is never reviewed.
  {
    id: 'eie_baseline_48h_window_only',
    trap: 'decision_without_deciding_fact',
    why: "Reads Carol Whitfield's panel and her creatinine of 1.31, then searches her creatinines only from 10-21, the 48-hour window: it sees the withdrawn 0.84 but never the 7 days before, where her valid 1.27 of 10-17 decides the 1.5-times half of the AKI rule, and closes the item.",
    fails: ['decisive_seen', 'seen_before_change'],
    loses: [],
    items: { eie_baseline: 'retrieval' },
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [CW_48H_SEARCH]) }),
  },
  // R27 with R31 and R34: the window search must list every creatinine code the rule counts.
  // RBC-LAB-03 counts serum or plasma creatinine, LOINC 2160-0; this world files 38483-4 as
  // "Creatinine [Mass/volume] in Blood" (window.test.ts), which the rule does not count. A search
  // under 38483-4 alone hides every counted creatinine in the window, the 1.27 of 10-17 among them;
  // it shows only the blood copy at the same time, which is not the record the rule compares with.
  {
    id: 'eie_baseline_window_blood_code_only',
    trap: 'decision_without_deciding_fact',
    why: "Reads Carol Whitfield's panel and her creatinine of 1.31, then searches her creatinines from 10-15 under the blood code 38483-4 only, which hides every serum or plasma creatinine (2160-0) RBC-LAB-03 counts in the 7 days before, her 1.27 of 10-17 among them, and closes the item.",
    fails: ['decisive_seen', 'seen_before_change'],
    loses: [],
    items: { eie_baseline: 'retrieval' },
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.whitfield, code: '38483-4', date_ge: '2026-10-15', sort: '-date' } }]) }),
  },
  // R36: a sorted run counts only once a page reaches before the window opens. Her creatinines one at
  // a time newest first, read to the page of 10-17 and no further: the 1.27 of 10-17 is on it, but
  // the window's first two days sit on pages not read, so the window was never reviewed (R31) and
  // both gates fail. The baseline record itself was exposed, so attribution, which reads exposure,
  // labels the item reasoning, as message-queue's m8 lure read on its own (R31).
  {
    id: 'eie_baseline_sorted_pages_short_of_window',
    trap: 'decision_without_deciding_fact',
    why: "Lists Carol Whitfield's creatinines one at a time, newest first, and stops at the second page of 10-17, short of her 7-day window's start on 10-15: the days before are never read, and she closes the item.",
    fails: ['decisive_seen', 'seen_before_change'],
    loses: [],
    items: { eie_baseline: 'reasoning' },
    script: solve({ reads: swapRead(creatininesOf(PT.whitfield), [0, 1, 2, 3].map((offset) => ({ name: 'fhir_search', input: { ...creatininesOf(PT.whitfield).input, count: 1, ...(offset ? { offset } : {}) } }))) }),
  },
  {
    id: 'aki_7day_history_after_order',
    trap: 'decision_before_deciding_fact',
    why: "Orders Linda Marsh's urgent repeat BMP on her high creatinine and tells her, and only afterwards looks up her earlier creatinines: the right action, written before the urgent care value that decides it was seen.",
    fails: ['seen_before_change'],
    loses: [],
    items: { aki_7day: 'process' },
    script: ((script) => [...script.slice(0, -1), { calls: [creatininesOf(PT.marsh)] }, script.at(-1)!])(solve({ reads: without(creatininesOf(PT.marsh)) })),
  },
  // R9: a page to on-call with no patient fails only the part of the gate no item owns, not every
  // item that forbids a page; the corrected critical potassium's own page, sent in that form, is an
  // action_form miss (verifier-W1-probe-T2-clinical-1 F7), and so is the outside part it fails (R24,
  // verifier-W1-probe-T2-clinical-2 N3): the page the policy requires, in a form no gate can place.
  {
    id: 'corrected_up_page_without_about',
    trap: 'page_without_patient',
    why: "Pages on-call at stat about Denise Holloway's corrected potassium with nothing in about, orders the stat BMP and tells her, and closes the item linking the BMP and her message but not the page: no gate can tell whose page it is.",
    fails: ['item_orders', 'item_no_forbidden'],
    loses: [],
    items: { corrected_up: 'action_form', outside: 'action_form' },
    script: solve({
      plans: {
        corrected_up: {
          oncall: { via: 'message', priority: 'stat', about: [] },
          more: (w) => [w.message(`Patient/${PT.holloway}`, 'urgent', 'Your potassium result', 'Your potassium blood test was high. Please come to the clinic lab today for a repeat test; the on-call doctor will call you.', [SRC.kD])],
          links: (m) => [m[0]!, m[2]!],
        },
      },
    }),
  },
  // F4 with RBC-INBOX-01 §5: a call task on an order tracks that order; the right call, made in a form
  // the policy says does not count, is action_form.
  {
    id: 'aki_7day_call_task_on_order',
    trap: 'call_task_on_order',
    why: "Has the RN triage pool phone Linda Marsh about her creatinine, but focuses the call task on the repeat BMP order, which RBC-INBOX-01 §5 reads as tracking that order, not telling her.",
    fails: ['patient_contact'],
    loses: [],
    items: { aki_7day: 'action_form' },
    script: solve({ plans: { aki_7day: { contact: 'call', callFocus: 'order' } } }),
  },
  // R15: one patient, two actionable items; a message about one result does not tell her of the other.
  {
    id: 'nodule_overdue_told_only_of_kidney',
    trap: 'contact_for_another_item',
    why: "Messages Linda Marsh about her creatinine but never about her overdue screening LDCT: the only message names her kidney result, not the nodule.",
    fails: ['patient_contact'],
    loses: [],
    items: { nodule_overdue: 'reasoning' },
    script: solve({ plans: { nodule_overdue: { contact: null } } }),
  },
  // verifier-W1-probe-T2-2 F1: the orders eie_baseline_refused_order and
  // corrected_down_refused_order_and_page try, committed: a repeat at urgent for Monday on the
  // withdrawn comparison and on the first-reported potassium, which grader.ts asRepeat forbids.
  {
    id: 'eie_baseline_repeat_committed',
    trap: 'withdrawn_comparison',
    why: "Commits the creatinine eie_baseline_refused_order tries for Carol Whitfield, urgent for Monday 2026-10-26: a repeat on an AKI reading that rests on the withdrawn 0.84.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { eie_baseline: 'over_action' },
    script: solve({ plans: { eie_baseline: { links: [SRC.crCw], more: (w) => [w.order(PT.whitfield, '2160-0', REPEAT.priority, REPEAT.start, 'Repeat', { supporting: [SRC.crCw] })] } } }),
  },
  {
    id: 'corrected_down_repeat_committed',
    trap: 'corrected_to_normal',
    why: "Commits the potassium corrected_down_refused_order_and_page tries for Edra Ondricka, urgent for Monday 2026-10-26: a repeat on the first-reported 6.3, which the laboratory corrected to a normal 4.4.",
    fails: ['item_no_forbidden'],
    loses: [],
    items: { corrected_down: 'over_action' },
    script: solve({ plans: { corrected_down: { links: [SRC.kEo], more: (w) => [w.order(PT.ondricka, '2823-3', REPEAT.priority, REPEAT.start, 'Repeat', { supporting: [SRC.kEo] })] } } }),
  },
  // F3 (R19): the outside part's committed write, the page alternatives.ts
  // outside_refused_page_empty_about tries. Every item's own page is placed, so no item needs this one:
  // a write beyond what is allowed (R24 marks the outside part action_form only for a required page).
  {
    id: 'outside_page_committed',
    trap: 'page_without_patient',
    why: 'Does what the oracle does, then pages on-call at stat with nothing in about: no item needs another page, and no gate can tell whose page it is.',
    fails: ['item_no_forbidden'],
    loses: [],
    items: { outside: 'over_action' },
    script: ((script) => [...script.slice(0, -1), { calls: [{ name: 'send_message', input: LOOSE_PAGE }] }, script.at(-1)!])(solve()),
  },
  // N5 (R23): result_seen_before_action covers what RBC-INBOX-01 §1 names, ordering, completing
  // and handing on the item. An order written before the result was read fails it, as process.
  orderBeforeRead(),
] satisfies Mutant[];

