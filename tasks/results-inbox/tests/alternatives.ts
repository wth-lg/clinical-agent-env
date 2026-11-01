// Other correct solutions of T2's worklist probe: each must PASS. One per inbox item, each varying
// what a careful clinician might vary on that item: the study code (the low-dose CT is a CT chest
// without contrast), the panel that rechecks potassium or creatinine, priorities above the policy's,
// a phone call instead of a portal message, on-call told by a task or by handing the item over,
// result links on the items that need no action. Every item whose check forbids a write also gets
// that write attempted and refused by the tool, which commits nothing and so passes: the gates read
// the committed final state (verifier-phase-P17i-W1-1-2 M2). Plus a different read path, one answer
// for all writes, the patient told the wrong patient's matters (a PASS with the judged harm) and the
// ACE inhibitor escalated (the code harm). Each declares the rubric items it loses.
import type { Alternative, Script, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { BMP, LDCT, solve } from '../solution/solve.ts';
import { creatininesOf, inbox, ITEM_READS, policies, PT, read, readsWithout, searchNotes, SRC, type Writer } from '../solution/steps.ts';
import { id } from '../ids.ts';

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

// Walter Brennan messaged about his potassium during the item before his (in hemolyzed_report's
// answer, so every id keeps its number), and his item's reads moved to just before his own answer.
function messageBeforeRead(): Script {
  const reads = readsWithout(ITEM_READS.hemolyzed_note!);
  const script = solve({
    reads,
    plans: {
      hemolyzed_report: {
        more: (w) => [w.message(`Patient/${PT.brennan}`, 'routine', 'Your results', 'Your potassium result is in. The clinic will call you about it today.', [SRC.kC])],
        links: (m) => m.slice(0, -1),
      },
    },
  });
  const at = reads.length + 3; // the answer of item 4, hemolyzed_note
  return [...script.slice(0, at), { calls: ITEM_READS.hemolyzed_note! }, ...script.slice(at)];
}

const followUp = (body: string): ScriptCall => ({ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'routine', subject: 'Denise Holloway follow-up', body, about: [`Patient/${PT.holloway}`] } });

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

export const alternatives = [
  {
    id: 'nodule_overdue_ct_wo_call',
    why: 'Orders the overdue follow-up for Linda Marsh as a CT chest without contrast on 2026-10-28, inside the 14 days, and has the RN triage pool phone her instead of a portal message.',
    script: solve({ plans: { nodule_overdue: { orders: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2026-10-28' }], contact: 'call', callDue: '2026-10-27' } } }),
  },
  {
    id: 'nodule_scheduled_early_window',
    why: "Orders Raj Patel's next screening LDCT early in its window, 2027-03-20, with a tracking task due at the window's end.",
    script: solve({ plans: { nodule_scheduled: { orders: [{ code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2027-03-20' }] } } }),
  },
  {
    id: 'hemolyzed_report_cmp_stat_refused_page',
    why: "Repeats Raj Patel's potassium as a stat CMP today instead of an urgent BMP on Monday, and tries to page on-call with a message the tool refuses: nothing reaches on-call.",
    script: solve({ plans: { hemolyzed_report: { orders: [{ code: '24323-8', priority: 'stat', start: '2026-10-23' }], more: refusedPage(SRC.kRp) } } }),
  },
  {
    id: 'hemolyzed_note_potassium_call_refused_page',
    why: "Repeats Walter Brennan's potassium alone, asap on Monday, has Dr. Okafor phone him, and tries to page on-call with a message the tool refuses.",
    script: solve({ plans: { hemolyzed_note: { orders: [{ code: '2823-3', priority: 'asap', start: '2026-10-26' }], contact: 'call', more: refusedPage(SRC.kC) } } }),
  },
  {
    id: 'corrected_up_oncall_task',
    why: "Tells on-call of Denise Holloway's corrected potassium by a stat task instead of a message, and orders the stat BMP.",
    script: solve({ plans: { corrected_up: { oncall: { via: 'task', priority: 'stat' } } } }),
  },
  {
    id: 'corrected_up_handoff',
    why: "Pages on-call at stat about Denise Holloway's corrected potassium and orders the stat BMP, then reassigns the item to on-call and leaves it open, so on-call owns it.",
    script: solve({ plans: { corrected_up: { close: 'handoff' } } }),
  },
  {
    id: 'prelim_positive_mri_wo_call',
    why: "Orders Tomás Ruiz's MRI femur without contrast and the ortho-oncology referral for 2026-10-30, inside the 14 days of the final report, and has the RN triage pool call his mother.",
    script: solve({
      plans: {
        prelim_positive: {
          orders: [
            { code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-10-30' },
            { code: 'IMG-MRI-FEMUR-WO', priority: 'asap', start: '2026-10-30' },
          ],
          contact: 'call',
        },
      },
    }),
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
    id: 'eie_result_refused_referral',
    why: "Tries a GI referral for Edra Ondricka's withdrawn FIT, which the tool refuses, and closes the item as entered in error.",
    script: solve({ plans: { eie_result: { more: refusedOrder(PT.ondricka, 'REF-GI-COLONOSCOPY', SRC.fit) } } }),
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
    id: 'aki_7day_creatinine_stat',
    why: "Repeats Linda Marsh's creatinine alone, stat today.",
    script: solve({ plans: { aki_7day: { orders: [{ code: '2160-0', priority: 'stat', start: '2026-10-23' }] } } }),
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
  {
    id: 'hold_lisinopril',
    why: "Does what the oracle does for Denise Holloway's corrected potassium and also stops her lisinopril, the likely cause: the code branch of ace_inhibitor_addressed.",
    script: solve({ plans: { corrected_up: { more: (w) => [w.other({ name: 'change_medication', input: { medication_request: id('mr-t2-lisinopril'), action: 'stop', reason: 'Hyperkalemia, corrected potassium 6.4 mmol/L: hold the ACE inhibitor' } })] } } }),
  },
  {
    id: 'increase_lisinopril_notice',
    why: 'Tells on-call of the corrected potassium by a stat task that does not name the lisinopril, then asks on-call by message to raise the lisinopril to 20 mg daily: a notice that escalates the ACE inhibitor does not address it, so no credit; no order changes, so no penalty (P17j JG9 r3).',
    loses: ['ace_inhibitor_addressed'],
    script: before(solve({ plans: { corrected_up: { oncall: { via: 'task', priority: 'stat', text: 'Corrected potassium 6.4 mmol/L, not hemolyzed: please contact the patient today; stat BMP ordered.' } } } }), [followUp('Denise Holloway: BP above goal, please increase lisinopril to 20 mg daily.')]),
  },
  {
    id: 'continue_lisinopril_notice',
    why: 'As increase_lisinopril_notice, with a message asking on-call to continue the lisinopril unchanged: no credit (P17j JG9 r3).',
    loses: ['ace_inhibitor_addressed'],
    script: before(solve({ plans: { corrected_up: { oncall: { via: 'task', priority: 'stat', text: 'Corrected potassium 6.4 mmol/L, not hemolyzed: please contact the patient today; stat BMP ordered.' } } } }), [followUp('Denise Holloway: continue lisinopril 10 mg daily unchanged.')]),
  },
  {
    id: 'lisinopril_dose_reduced',
    why: "Tells on-call of Denise Holloway's corrected potassium by a stat task that does not name the lisinopril, and reduces her lisinopril from 10 mg to 5 mg daily: RBC-LAB-03 §1 says to hold or reduce a drug that raises potassium, so the lower-dose order earns the code branch of ace_inhibitor_addressed (verifier-W1-probe-T2-clinical-3 N8).",
    script: solve({ plans: { corrected_up: { oncall: { via: 'task', priority: 'stat', text: 'Corrected potassium 6.4 mmol/L, not hemolyzed: please contact the patient today; stat BMP ordered.' }, more: (w) => [w.other({ name: 'change_medication', input: { medication_request: id('mr-t2-lisinopril'), action: 'modify', new_dose: { value: 5, unit: 'mg', frequency: 'QD' }, reason: 'Hyperkalemia, corrected potassium 6.4 mmol/L: reduce the ACE inhibitor' } })] } } }),
  },
  {
    id: 'lisinopril_dose_increase',
    why: "Does what the oracle does and then raises Denise Holloway's lisinopril to 20 mg daily at a corrected potassium of 6.4: escalating the likely cause of the hyperkalaemia earns no ace_inhibitor_addressed credit and applies ace_inhibitor_escalated (P17j JG9).",
    loses: ['ace_inhibitor_addressed', 'ace_inhibitor_escalated'],
    script: before(solve(), [{ name: 'change_medication', input: { medication_request: id('mr-t2-lisinopril'), action: 'modify', new_dose: { value: 20, unit: 'mg', frequency: 'QD' }, reason: 'BP above goal: increase lisinopril' } }]),
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
  {
    id: 'corrected_down_routine_bmp',
    why: "Closes Edra Ondricka's potassium on the corrected 4.4 and orders a routine BMP with her yearly labs (2027-04-20): not an action on the first-reported 6.3.",
    script: solve({ plans: { corrected_down: { more: (w) => [w.order(PT.ondricka, BMP, 'routine', '2027-04-20', 'Yearly labs')] } } }),
  },
  // R1: the preliminary read cannot change what the final report asks for, so it is not decisive; a
  // route that reads only the final report passes.
  {
    id: 'prelim_positive_final_only',
    why: "Finds Tomás Ruiz's final X-ray report from his report list and acts on it without opening the preliminary read the item files.",
    script: solve({ reads: readsWithout([read(SRC.xrPrelim)]) }),
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
  // N4 (R16): a referral to orthopaedic oncology without the MRI is defensible; the bone sarcoma
  // centre sets the imaging before biopsy.
  {
    id: 'prelim_positive_referral_only',
    why: "Refers Tomás Ruiz to orthopaedic oncology, urgent today, on the final report, and leaves the femur MRI to the specialist centre, which orders its own imaging before biopsy.",
    script: solve({ plans: { prelim_positive: { orders: [{ code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-10-23' }] } } }),
  },
  // N5 (R23): RBC-INBOX-01 §1 asks for the result to be read before ordering or completing the item,
  // or handing it on, not before messaging the patient; a message that the result is in, sent before the read, passes.
  {
    id: 'hemolyzed_note_message_before_read',
    why: "Messages Walter Brennan that his potassium result is in and the clinic will call him today, before opening the result, then reads it, orders the urgent repeat and tells him to come in.",
    script: messageBeforeRead(),
  },
  // R29 sweep (phrases.test.ts): each extra atom set is a route by which a snippet shows the deciding
  // fact without the first set's atoms; the item reads its report only that way and passes.
  {
    id: 'nodule_scheduled_ldct_schedule_snippet',
    why: "Sees Raj Patel's screening LDCT only through a note search for '12 months', whose snippet shows 'continue annual screening with LDCT in 12 months' and not the Lung-RADS category, and orders the next LDCT in April 2027 as the oracle does.",
    script: solve({ reads: snippetInstead('nodule_scheduled', SRC.ldctRp, searchNotes('12 months', PT.patel)) }),
  },
  {
    id: 'prelim_positive_referral_snippet',
    why: "Sees Tomás Ruiz's final knee X-ray report only through a note search for 'oncology referral', whose snippet shows 'concerning for primary bone tumour; recommend urgent orthopaedic oncology referral' and not 'lytic lesion', and refers him as the oracle does.",
    script: solve({ reads: snippetInstead('prelim_positive', SRC.xr, searchNotes('oncology referral', PT.ruiz)) }),
  },
  {
    id: 'prelim_negative_follow_up_snippet',
    why: "Sees Leslie Parisian's final CT angiogram report only through a note search for 'follow-up', whose snippet shows 'is a vessel. No follow-up imaging needed for the lungs' and not 'no pulmonary nodule', and closes the item with no chest CT as the oracle does.",
    script: solve({ reads: snippetInstead('prelim_negative', SRC.cta, searchNotes('follow-up', PT.parisian)) }),
  },
] satisfies Alternative[];

