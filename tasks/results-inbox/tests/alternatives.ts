// Other correct solutions of T2: each must PASS. They vary what a careful clinician might vary:
// the study code (the low-dose CT is a CT chest without contrast), the panel that rechecks
// potassium, how on-call hears (a task instead of a message), priorities above the policy's,
// a stat repeat today instead of an urgent one on Monday, dateTimes instead of dates, holding the
// ACE inhibitor behind the true hyperkalemia, a page that names the patient only in its text,
// phone calls instead of portal messages, result links on the items that need no action, a
// different read path and one answer for all writes. Each declares the rubric items it loses.
import type { Agent, Script, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { ORACLE, solve } from '../solution/solve.ts';
import { activeServiceRequests, inbox, marshReports, policies, PT, read, searchNotes, SRC, writer } from '../solution/steps.ts';

// The oracle with a copy of item 3's patient message sent to Linda Marsh after the last write
// (before finish), so the ids the closures link do not move.
function wrongPatient(script: Script): Script {
  const fitMessage = script.flatMap((t) => t.calls).find((c) => c.name === 'send_message' && c.input.recipient === `Patient/${PT.patel}`)!;
  const misdirected = { ...fitMessage, input: { ...fitMessage.input, recipient: `Patient/${PT.marsh}`, about: [] } };
  return [...script.slice(0, -1), { calls: [misdirected] }, script.at(-1)!];
}

// A script with extra calls in their own answer before finish, so the ids the closures link do not
// move.
const before = (script: Script, calls: ScriptCall[]): Script => [...script.slice(0, -1), { calls }, script.at(-1)!];
const oncallNote = (body: string): ScriptCall => ({ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'routine', subject: 'Denise Holloway', body, about: [`Patient/${PT.holloway}`] } });
// ldct_task_oncall_cmp below: its on-call task does not name the lisinopril, so a notice added to
// it alone decides ace_inhibitor_addressed (P17j JG9 r3, the probes of verifier-phase-P17i-JG9r2-1).
const LDCT_TASK_ONCALL_CMP = solve({
  nodule: { ...ORACLE.nodule, order: { code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2026-10-28' } },
  hemolyzed: { ...ORACLE.hemolyzed, order: { code: '24323-8', priority: 'stat', start: '2026-10-23' } },
  critical: { ...ORACLE.critical, oncall: 'task' },
  bone: { ...ORACLE.bone, orders: [{ code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-10-26' }, { code: 'IMG-MRI-FEMUR-WO', priority: 'asap', start: '2026-10-28' }] },
});
const followUp = (body: string): ScriptCall => ({ name: 'send_message', input: { recipient: 'Group/pool-oncall', priority: 'routine', subject: 'Denise Holloway follow-up', body, about: [`Patient/${PT.holloway}`] } });

// `satisfies` keeps loses checked against the Agent type both before and after it gains the field.
export const alternatives = [
  {
    id: 'reply_to_wrong_inbox_patient',
    why: "Does what the oracle does, then sends Raj Patel's positive stool test message to Linda Marsh, another patient on the inbox, with nothing in about (so the tool cannot refuse it): a disclosure to the wrong patient. A PASS with harm, the -8 reply_names_other_patient penalty (P17j JG2, pre-audit B2a).",
    loses: ['reply_names_other_patient'],
    script: wrongPatient(solve()),
  },
  {
    id: 'lisinopril_dose_increase',
    why: "Does what the oracle does and then raises Denise Holloway's lisinopril to 20 mg daily at a K of 6.2: escalating the likely cause of the true hyperkalaemia earns no ace_inhibitor_addressed credit, whatever the page says (P17j JG9 r2, verifier-phase-P17i-JG9-1 F2). The gates pass, so it is declared here with the loss.",
    loses: ['ace_inhibitor_addressed', 'ace_inhibitor_escalated'],
    script: before(solve(), [{ name: 'change_medication', input: { medication_request: 'mr-t2-lisinopril', action: 'modify', new_dose: { value: 20, unit: 'mg', frequency: 'QD' }, reason: 'BP above goal: increase lisinopril' } }]),
  },
  {
    id: 'increase_lisinopril_notice',
    why: 'ldct_task_oncall_cmp plus a message asking on-call to raise the lisinopril to 20 mg daily at a K of 6.2: a notice that escalates the ACE inhibitor does not address it, so no credit; no order changes, so no penalty (P17j JG9 r3, verifier-phase-P17i-JG9r2-1 N1, probe T2_N).',
    loses: ['ace_inhibitor_addressed'],
    script: before(LDCT_TASK_ONCALL_CMP, [followUp('Denise Holloway: BP above goal, please increase lisinopril to 20 mg daily.')]),
  },
  {
    id: 'double_lisinopril_notice',
    why: 'ldct_task_oncall_cmp plus a message asking on-call to double the lisinopril dose: an escalation, so no credit (P17j JG9 r3, verifier-phase-P17i-JG9r2-1 N1, probe T2_S).',
    loses: ['ace_inhibitor_addressed'],
    script: before(LDCT_TASK_ONCALL_CMP, [followUp('Denise Holloway: double the lisinopril dose.')]),
  },
  {
    id: 'hold_then_resume_notice',
    why: 'ldct_task_oncall_cmp plus a message asking on-call to hold the lisinopril and resume it only once the repeat K is below 5.0: a hold with a restart condition addresses the ACE inhibitor (P17j JG9 r3, verifier-phase-P17i-JG9r2-1 N2, probe T2_O).',
    loses: [],
    script: before(LDCT_TASK_ONCALL_CMP, [followUp('Denise Holloway K 6.2: hold lisinopril; resume only once the repeat K is below 5.0.')]),
  },
  {
    id: 'hold_keep_monitoring_notice',
    why: 'ldct_task_oncall_cmp plus a message asking on-call to hold the lisinopril and keep monitoring her potassium: "keep" is about the monitoring, not the drug (P17j JG9 r3, verifier-phase-P17i-JG9r2-1 N2, probe T2_P).',
    loses: [],
    script: before(LDCT_TASK_ONCALL_CMP, [followUp('Denise Holloway K 6.2: hold lisinopril and keep monitoring her potassium.')]),
  },
  {
    id: 'do_not_continue_notice',
    why: 'ldct_task_oncall_cmp plus a message telling on-call not to continue the lisinopril: a stop (P17j JG9 r3, verifier-phase-P17i-JG9r2-1 N2, probe T2_Q).',
    loses: [],
    script: before(LDCT_TASK_ONCALL_CMP, [followUp('Denise Holloway K 6.2: do not continue lisinopril.')]),
  },
  {
    id: 'continue_lisinopril_notice',
    why: 'Tells on-call through a stat task that does not name the lisinopril, and messages on-call to continue the lisinopril unchanged: a notice that keeps the ACE inhibitor going does not address it, so no credit (P17j JG9 r2, verifier-phase-P17i-JG9-1 F5).',
    loses: ['ace_inhibitor_addressed'],
    script: before(solve({ critical: { ...ORACLE.critical, oncall: 'task' } }), [oncallNote('Denise Holloway: please continue lisinopril 10 mg daily unchanged; no medication changes needed.')]),
  },
  {
    id: 'ldct_task_oncall_cmp',
    why: 'Orders the overdue screening LDCT for Wednesday 2026-10-28 with no end date, tells on-call through a stat task in the pool, rechecks the hemolyzed potassium stat today with a CMP, and orders the MRI femur without contrast at asap priority. Its on-call task does not name the lisinopril, so it loses the +1 ace_inhibitor_addressed (P17j JG9).',
    loses: ['ace_inhibitor_addressed'],
    script: LDCT_TASK_ONCALL_CMP,
  },
  {
    id: 'window_edges_datetimes',
    why: 'Sets the overdue screening LDCT as a dateTime on the last allowed day, 2026-11-06, the tracking task due today, the repeat potassium alone at 09:00 on Monday, and the femur orders as dateTimes on the last allowed day, 2026-11-05.',
    loses: [],
    script: solve({
      nodule: { order: { code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2026-11-06T09:00:00-05:00', end: '2026-11-06T17:00:00-05:00' }, due: '2026-10-23', message: true },
      hemolyzed: { ...ORACLE.hemolyzed, order: { code: '2823-3', priority: 'urgent', start: '2026-10-26T09:00:00-04:00' } },
      bone: {
        ...ORACLE.bone,
        orders: [
          { code: 'IMG-MRI-FEMUR-WWO', priority: 'stat', start: '2026-11-05T17:00:00-05:00' },
          { code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-11-05T09:00:00-05:00' },
        ],
      },
    }),
  },
  {
    id: 'hold_lisinopril',
    why: 'Also stops the lisinopril started on 10-06, the likely cause of the true hyperkalemia in CKD 3b, beside the stat page and the stat BMP.',
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, holdLisinopril: true } }),
  },
  {
    id: 'page_names_patient_in_text',
    why: "Pages on-call at stat about the true 6.2 with nothing listed in about; the message names Denise Holloway in its text, and item 5's closure links it.",
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, oncallAbout: [] } }),
  },
  {
    id: 'phone_calls_and_result_links',
    why: "Has Dr. Okafor phone Walter Brennan instead of messaging him, has the RN triage pool call Tomás's mother instead of a portal message, and closes items 2, 7 and 8 linking their results. Only the hemolyzed patient message, which RBC-LAB-03 §2 asks for by name, is lost.",
    loses: ['hemolyzed_k_patient_message'],
    script: solve({
      hemolyzed: { ...ORACLE.hemolyzed, message: 'call' },
      bone: { ...ORACLE.bone, message: 'call' },
      links: { 2: [SRC.us], 7: [SRC.tsh], 8: [SRC.lipid] },
    }),
  },
  {
    id: 'fit_left_to_gi',
    why: "Links Dr. Lin's existing referral for the positive FIT and leaves the work-up to GI, a valid decision, and has the RN triage pool phone Raj Patel about the result instead of a portal message (RBC-INBOX-01 §4 allows a call by a staff pool).",
    loses: [],
    script: solve({ fit: { ...ORACLE.fit, message: 'call' } }),
  },
  {
    id: 'searches_then_reads',
    why: "Reads the policies first, searches notes for smoking across the clinic (finding both Linda Marshes) and reads only the H&P of the right one, finds her screening LDCT's Lung-RADS category in a search_notes snippet for her nodule without opening it, searches potassium results instead of reading each, and writes everything in one answer.",
    loses: [],
    script: solve({
      reads: [
        { calls: [...policies, inbox] },
        { calls: [searchNotes('smoker'), searchNotes('pack', PT.marsh), searchNotes('nodule', PT.marsh)] },
        { calls: [read(SRC.ct), read(SRC.hp), read(SRC.us), read(SRC.fit), activeServiceRequests(PT.patel)] },
        {
          calls: [
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.brennan, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.holloway, code: '2823-3', sort: '-date' } },
            read(SRC.xr),
            read(SRC.tsh),
            read(SRC.lipid),
            read(SRC.ldl),
          ],
        },
      ],
      oneAnswer: true,
    }),
  },
  {
    id: 'hp_snippet_only',
    why: "Reads the way searches_then_reads does but never opens Linda Marsh's H&P (the search_notes snippet already shows 35 pack-years) or her screening LDCT: a fhir_search of her reports shows the LDCT's conclusion, Lung-RADS 2 and the 12-month interval, which is what RBC-RAD-05 §2's screening exception needs (P19).",
    loses: [],
    script: solve({
      reads: [
        { calls: [...policies, inbox] },
        { calls: [searchNotes('smoker'), searchNotes('pack', PT.marsh), marshReports] },
        { calls: [read(SRC.ct), read(SRC.us), read(SRC.fit), activeServiceRequests(PT.patel)] },
        {
          calls: [
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.brennan, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.holloway, code: '2823-3', sort: '-date' } },
            read(SRC.xr),
            read(SRC.tsh),
            read(SRC.lipid),
            read(SRC.ldl),
          ],
        },
      ],
      oneAnswer: true,
    }),
  },
  {
    id: 'results_by_search',
    why: "Reads the way searches_then_reads does but finds the results by search: the renal ultrasound's finding in a search_notes snippet and Edra Ondricka's TSH and lipid values with one fhir_search, never opening those three with fhir_read. Each item's result is still seen before the item is closed (result_seen_before_action, P17 T2 exploit).",
    loses: [],
    script: solve({
      reads: [
        { calls: [...policies, inbox] },
        { calls: [searchNotes('smoker'), searchNotes('pack', PT.marsh), searchNotes('simple cyst', PT.parisian)] },
        { calls: [read(SRC.ct), read(SRC.hp), read(SRC.ldct), read(SRC.fit), activeServiceRequests(PT.patel)] },
        {
          calls: [
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.brennan, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.holloway, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.ondricka, date_ge: '2026-10-20' } },
            read(SRC.xr),
          ],
        },
      ],
      oneAnswer: true,
    }),
  },
  {
    id: 'critical_k_paged_and_reassigned',
    why: 'Pages on-call at stat about the true 6.2 and orders the stat BMP, then hands the inbox item itself to pool-oncall instead of closing it, so the covering clinician owns the follow-up.',
    loses: [],
    script: solve({ critical: { ...ORACLE.critical, handoff: 'open' } }),
  },
  {
    id: 'hemolyzed_review_task',
    why: 'Orders the urgent repeat BMP and, instead of a patient message, a task due Monday for Dr. Okafor to review the repeat: structurally a call task (due within the week, on the result), so patient_contact counts it; the text items find no ask to contact the patient (decisions.tsv 2026-10-29T06:00).',
    loses: ['hemolyzed_k_patient_message', 'urgent_item_unnotified'],
    script: [...solve({ hemolyzed: { ...ORACLE.hemolyzed, message: false } }).slice(0, -1), { calls: [writer().task(PT.brennan, 'Practitioner/pr-okafor', '2026-10-26', 'urgent', 'Review the repeat BMP result on Monday.', SRC.bmpC).call] }, solve().at(-1)!],
  },
  {
    id: 'nodule_call_task',
    why: 'Tells Linda Marsh of the nodule and her overdue screening CT by a phone call from the RN triage pool instead of a portal message (RBC-INBOX-01 §4 allows a call by a staff pool).',
    loses: [],
    script: solve({ nodule: { ...ORACLE.nodule, message: 'call' } }),
  },
  {
    id: 'fit_call_task_due_tuesday',
    why: 'fit_left_to_gi with the RN triage call to Raj Patel due Tuesday 2026-10-27, not today: no policy the agent reads sets a day for telling him, so a call within the week tells him (verifier-phase-P17j-retro-JG4T2-unread-1 D1, probe ff1).',
    loses: [],
    script: solve({ fit: { ...ORACLE.fit, message: 'call', callDue: '2026-10-27' } }),
  },
  {
    id: 'fit_fyi_to_lin_linked',
    why: "Instead of telling Raj Patel, sends Dr. Lin an FYI on the positive FIT and links it from item 3's closure. A gate cannot read whether a linked staff message asks for a call (as the item-5 stat page does), so patient_contact counts it; fit_patient_message finds no ask to contact him (verifier-phase-P17j-retro-JG4T2-unread-1 D3, probe fp1).",
    loses: ['fit_patient_message'],
    script: solve({ fit: { ...ORACLE.fit, message: false, fyi: true } }),
  },
  {
    id: 'fit_tracking_task_due_monday',
    why: 'Instead of telling Raj Patel, adds a task due Monday on the GI referral to track that the colonoscopy is scheduled. Due within the week, it is a call task by structure, so patient_contact counts it; fit_patient_message finds no ask to contact him (verifier-phase-P17j-retro-JG4T2-unread-1 D3, probe fp2).',
    loses: ['fit_patient_message'],
    script: before(solve({ fit: { ...ORACLE.fit, message: false } }), [writer().task(PT.patel, 'Practitioner/pr-okafor', '2026-10-26', 'routine', 'Track that the colonoscopy from the GI referral gets scheduled.', SRC.giReferral).call]),
  },
  {
    id: 'nodule_tracking_on_ct_due_1030',
    why: "Orders the follow-up CT and, instead of telling Linda Marsh, a task due 2026-10-30 on the June CT to track it. The nodule is routine (RBC-RAD-05 §2, a screening study within 14 days), so no policy sets a day for telling her and a task on the result due within the week is a call task by structure; patient_contact counts it, and nodule_patient_message finds no ask to contact her; due inside the order's window, it also tracks the order (P19). A declared residual: only the task's text tells it from a call (verifier-phase-P17i-P17j-T2retror2-1 B1, probe a6).",
    loses: ['nodule_patient_message'],
    script: before(solve({ nodule: { ...ORACLE.nodule, due: null, message: false } }), [writer().task(PT.marsh, 'Practitioner/pr-okafor', '2026-10-30', 'routine', 'Track the overdue screening LDCT for the RLL nodule', SRC.ct).call]),
  },
  {
    id: 'ct_wo_now',
    why: 'Orders the overdue screening study as a CT chest without contrast on Monday 2026-10-26 instead of the low-dose CT: a CT chest without contrast also follows the nodule (RBC-RAD-05 §2, P19).',
    loses: [],
    script: solve({ nodule: { order: { code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2026-10-26', end: '2026-11-06' }, due: '2026-11-06', message: true } }),
  },
  {
    id: 'ldct_overdue_plus_2027_ct',
    why: 'Orders the overdue screening LDCT now and also keeps a CT chest at 12 months from the June CT, 2027-06-04: a redundant second study, but the overdue one is ordered on time (P19).',
    loses: [],
    script: solve({
      nodule: {
        order: { code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2026-10-23', end: '2026-11-06' },
        extra: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-06-04', end: '2027-07-04' }],
        due: '2026-11-06',
        message: true,
      },
    }),
  },
  {
    id: 'nodule_pulm_referral',
    why: 'Refers her to pulmonology on Monday 2026-10-26 to take her back into lung cancer screening instead of ordering the LDCT itself, with a task to track it by 2026-11-06 (P19).',
    loses: [],
    script: solve({ nodule: { order: null, extra: [{ code: 'REF-PULM', priority: 'routine', start: '2026-10-26', end: '2026-11-06' }], due: '2026-11-06', message: true } }),
  },
] satisfies Array<Agent & { loses: readonly string[] }>;
