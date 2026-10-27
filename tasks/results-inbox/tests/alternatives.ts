// Other correct solutions of T2: each must PASS. They vary what a careful clinician might vary:
// the study code (the low-dose CT is a CT chest without contrast), the panel that rechecks
// potassium, how on-call hears (a task instead of a message), priorities above the policy's,
// a stat repeat today instead of an urgent one on Monday, dateTimes instead of dates, holding the
// ACE inhibitor behind the true hyperkalemia, a page that names the patient only in its text,
// phone calls instead of portal messages, result links on the items that need no action, a
// different read path and one answer for all writes. Each declares the rubric items it loses.
import type { Agent, Script } from '../../../packages/grader/matrix/types.ts';
import { ORACLE, solve } from '../solution/solve.ts';
import { activeServiceRequests, inbox, policies, PT, read, searchNotes, SRC, writer } from '../solution/steps.ts';

// The oracle with a copy of item 3's patient message sent to Linda Marsh after the last write
// (before finish), so the ids the closures link do not move.
function wrongPatient(script: Script): Script {
  const fitMessage = script.flatMap((t) => t.calls).find((c) => c.name === 'send_message' && c.input.recipient === `Patient/${PT.patel}`)!;
  const misdirected = { ...fitMessage, input: { ...fitMessage.input, recipient: `Patient/${PT.marsh}`, about: [] } };
  return [...script.slice(0, -1), { calls: [misdirected] }, script.at(-1)!];
}

// `satisfies` keeps loses checked against the Agent type both before and after it gains the field.
export const alternatives = [
  {
    id: 'reply_to_wrong_inbox_patient',
    why: "Does what the oracle does, then sends Raj Patel's positive stool test message to Linda Marsh, another patient on the inbox, with nothing in about (so the tool cannot refuse it): a disclosure to the wrong patient. A PASS with harm, the -8 reply_names_other_patient penalty (P17j JG2, pre-audit B2a).",
    loses: ['reply_names_other_patient'],
    script: wrongPatient(solve()),
  },
  {
    id: 'ldct_task_oncall_cmp',
    why: 'Orders the 12-month study as the low-dose CT chest, tells on-call through a stat task in the pool, rechecks the hemolyzed potassium stat today with a CMP, and orders the MRI femur without contrast at asap priority.',
    loses: [],
    script: solve({
      nodule: { ...ORACLE.nodule, order: { code: 'IMG-CT-CHEST-LDCT', priority: 'routine', start: '2027-06-04' } },
      hemolyzed: { ...ORACLE.hemolyzed, order: { code: '24323-8', priority: 'stat', start: '2026-10-23' } },
      critical: { ...ORACLE.critical, oncall: 'task' },
      bone: { ...ORACLE.bone, orders: [{ code: 'REF-ORTHO-ONC', priority: 'urgent', start: '2026-10-26' }, { code: 'IMG-MRI-FEMUR-WO', priority: 'asap', start: '2026-10-28' }] },
    }),
  },
  {
    id: 'window_edges_datetimes',
    why: 'Writes the CT window as the whole policy window, 2027-05-04 to 2027-07-04, the tracking task due at its start, the repeat potassium alone at 09:00 on Monday, and the femur orders as dateTimes on the last allowed day, 2026-11-05.',
    loses: [],
    script: solve({
      nodule: { order: { code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-05-04', end: '2027-07-04' }, due: '2027-05-04', message: true },
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
    why: 'Reads the policies first, searches notes for smoking across the clinic (finding both Linda Marshes) and reads only the H&P of the right one, searches potassium results instead of reading each, and writes everything in one answer.',
    loses: [],
    script: solve({
      reads: [
        { calls: [...policies, inbox] },
        { calls: [searchNotes('smoker'), searchNotes('pack', PT.marsh)] },
        { calls: [read(SRC.ct), read(SRC.hp), read(SRC.us), read(SRC.fit), activeServiceRequests(PT.patel)] },
        {
          calls: [
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.brennan, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.holloway, code: '2823-3', sort: '-date' } },
            read(SRC.xr),
            read(SRC.tsh),
            read(SRC.lipid),
          ],
        },
      ],
      oneAnswer: true,
    }),
  },
  {
    id: 'hp_snippet_only',
    why: "Reads the way searches_then_reads does but never opens Linda Marsh's H&P: the search_notes snippet already shows 35 pack-years before the CT order, which is the history RBC-RAD-05 §2 needs.",
    loses: [],
    script: solve({
      reads: [
        { calls: [...policies, inbox] },
        { calls: [searchNotes('smoker'), searchNotes('pack', PT.marsh)] },
        { calls: [read(SRC.ct), read(SRC.us), read(SRC.fit), activeServiceRequests(PT.patel)] },
        {
          calls: [
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.brennan, code: '2823-3', sort: '-date' } },
            { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.holloway, code: '2823-3', sort: '-date' } },
            read(SRC.xr),
            read(SRC.tsh),
            read(SRC.lipid),
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
    why: 'Orders the urgent repeat BMP and, instead of a patient message, a task due Monday for Dr. Okafor to review the repeat: structurally a call task (due by the next business day, on the result), so patient_contact counts it; the text items find no ask to contact the patient (decisions.tsv 2026-10-29T06:00).',
    loses: ['hemolyzed_k_patient_message', 'urgent_item_unnotified'],
    script: [...solve({ hemolyzed: { ...ORACLE.hemolyzed, message: false } }).slice(0, -1), { calls: [writer().task(PT.brennan, 'Practitioner/pr-okafor', '2026-10-26', 'urgent', 'Review the repeat BMP result on Monday.', SRC.bmpC).call] }, solve().at(-1)!],
  },
  {
    id: 'nodule_call_task',
    why: 'Tells Linda Marsh of the nodule and its June 2027 follow-up CT by a phone call from the RN triage pool instead of a portal message (RBC-INBOX-01 §4 allows a call by a staff pool).',
    loses: [],
    script: solve({ nodule: { ...ORACLE.nodule, message: 'call' } }),
  },
] satisfies Array<Agent & { loses: readonly string[] }>;
