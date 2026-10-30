// Near misses of T6, one trap each (task.toml [matrix] traps; design queue table): each must FAIL
// on exactly the gates it declares and lose exactly the rubric items in `loses` (a positive item
// not met, a penalty met). Each is the oracle with the calls its wrong path changes swapped.
import { type Mutant, oneTurn, type ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import {
  bmpOrder, call, M1_LOOK, PARK_NOTES, type Msg, M1_OLD_READS, M1_REPORT, M3, M3_BODY, m1Bridge, m1BridgeReply, m1PcpTask, m1Reply, m2Reply, m2Task, m3Message, m5Renewal, m6Task, message, notes, parkAllergy, PT, read, refill, reyesMessage, RX, swap, task, withM1,
} from '../solution/steps.ts';
import { id, ref } from '../ids.ts';

const original = oracle.flatMap((t) => t.calls);
const ALLERGY = original.find((c) => c.name === 'record_allergy' && !('update_id' in c.input))!;
const NKDA = original.find((c) => c.name === 'record_allergy' && 'update_id' in c.input)!;
const REYES = original.find((c) => c.name === 'send_message' && c.input.recipient === 'Practitioner/pr-reyes')!;
const CLOSE = original.filter((c) => c.name === 'update_inbox_item');
const M3_MESSAGE = original.find((c) => c.name === 'send_message' && c.input.recipient === `Patient/${PT.brooks}`)!;
const amoxClav = refill(PT.park, RX.amoxClav, 875, 'BID', 7, 0, 'Acute bacterial sinusitis, per NP Reyes and RBC-CP-11');

export const mutants: Mutant[] = [
  {
    id: 'm1_bridge_report_unseen',
    trap: 'outside_report',
    why: "The oracle before P19: sees no BMP among the Observations, never lists Gloria Hayes's documents, and sends the 30-day bridge plus a BMP: the St. Brigid pre-admission report of 2026-07-08 (potassium 5.8) is the most recent BMP, so RBC-RX-05 §1 says do not refill. A forbidden order, so over_action; the report never shown is the secondary reason.",
    fails: ['m1_hyperk_hold', 'evidence_before_writes'],
    loses: ['reply_m1'],
    attribution: 'over_action',
    script: withM1(oracle, [M1_OLD_READS, { calls: [m1Bridge, bmpOrder(PT.hayes), m1BridgeReply] }]),
  },
  {
    id: 'm1_renewal_after_report',
    trap: 'hyperkalemia_hold',
    why: 'Reads the pre-admission report and still renews lisinopril for 90 days with 1 refill, as if a BMP within 12 months were enough whatever its potassium (RBC-RX-05 §1: 5.5 or higher, do not refill).',
    fails: ['m1_hyperk_hold'],
    loses: ['reply_m1'],
    attribution: 'over_action',
    script: withM1(oracle, [M1_LOOK, M1_REPORT, { calls: [refill(PT.hayes, RX.lisinopril20, 20, 'QD', 90, 1, 'RBC-RX-05 §1: BMP 07/08/2026 within 12 months'), message(`Patient/${PT.hayes}`, 'routine', 'Your lisinopril refill', 'I renewed your lisinopril 20 mg for 90 days with 1 refill.')] }]),
  },
  {
    id: 'm1_pcp_task_and_bridge',
    trap: 'hyperkalemia_hold',
    why: 'Reads the report and tasks Dr. Okafor about the potassium, but also sends a 30-day bridge so she is not without a blood pressure drug: RBC-RX-05 §1 says do not refill, and the PCP decides on the lisinopril.',
    fails: ['m1_hyperk_hold'],
    loses: ['reply_m1'],
    attribution: 'over_action',
    script: withM1(oracle, [
      M1_LOOK,
      M1_REPORT,
      { calls: [m1PcpTask, refill(PT.hayes, RX.lisinopril20, 20, 'QD', 30, 0, 'Bridge while Dr. Okafor reviews the potassium'), message(`Patient/${PT.hayes}`, 'routine', 'Your lisinopril refill', 'I sent a 30-day supply of lisinopril 20 mg to your pharmacy. Dr. Okafor will also review a recent blood test with you.')] },
    ]),
  },
  {
    id: 'm1_task_before_report',
    trap: 'evidence_before_writes',
    why: 'Tasks Dr. Okafor about the refill and answers Gloria Hayes before reading the pre-admission report, and opens it only afterwards: the decision was written before the potassium was seen.',
    fails: ['evidence_before_writes'],
    loses: [],
    attribution: 'process',
    script: withM1(oracle, [
      M1_LOOK,
      { calls: [task(PT.hayes, 'Practitioner/pr-okafor', 'routine', 'Refill request for lisinopril 20 mg; please review before it is renewed.', ref('MedicationRequest/mr-t6-lisinopril')), m1Reply] },
      M1_REPORT,
    ]),
  },
  {
    id: 'm1_no_pcp_task',
    trap: 'pcp_task',
    why: 'Reads the report and does not refill, but sends no Task to the PCP: only the reply tells anyone, and RBC-RX-05 §1 asks for the Task with the request as its focus. Nothing forbidden is written, so the miss is labelled from exposure: reasoning.',
    fails: ['m1_hyperk_hold'],
    loses: [],
    attribution: 'reasoning',
    script: withM1(oracle, [M1_LOOK, M1_REPORT, { calls: [m1Reply] }]),
  },
  {
    id: 'm1_bmp_only_report_unseen',
    trap: 'outside_report',
    why: "Sees no BMP among the Observations and, without listing her documents, orders a BMP and tells Gloria Hayes the refill waits for it: no refill, but no Task to the PCP about the potassium it never saw. Nothing forbidden is written and the report was never shown: retrieval.",
    fails: ['m1_hyperk_hold'],
    loses: ['reply_m1'],
    attribution: 'retrieval',
    script: withM1(oracle, [
      { calls: M1_OLD_READS.calls.filter((c) => c.input.resource_type !== 'Encounter') },
      { calls: [bmpOrder(PT.hayes), message(`Patient/${PT.hayes}`, 'routine', 'Your lisinopril refill', 'Your yearly blood test (BMP) is due before I can refill your lisinopril. I ordered it; please have it drawn at our lab this week.')] },
    ]),
  },
  {
    id: 'm2_refilled',
    trap: 'conflict_in_note',
    why: 'Refills atorvastatin from the active order without reading the August cardiology note that stopped it.',
    fails: ['m2_no_refill'],
    loses: ['reply_m2'],
    attribution: 'over_action',
    script: swap(
      oracle,
      [m2Task, [refill(PT.odum, RX.atorvastatin40, 40, 'QHS', 90, 1, 'Refill request')]],
      [m2Reply, [message(`Patient/${PT.odum}`, 'routine', 'Your refill', 'I sent a 90-day refill of atorvastatin 40 mg to your pharmacy.')]],
    ),
  },
  {
    id: 'm2_no_pcp_task',
    trap: 'pcp_task',
    why: 'Finds the cardiology note and holds the refill, but sends no Task to the PCP to reconcile the list (RBC-RX-05 §3).',
    fails: ['m2_no_refill'],
    loses: [],
    attribution: 'reasoning',
    script: swap(oracle, [m2Task, []]),
  },
  {
    id: 'm2_rosuvastatin_ordered',
    trap: 'regimen_change',
    why: "Holds the atorvastatin and tasks the PCP, then orders cardiology's rosuvastatin itself: a duplicate of the prescription cardiology sent, and a regimen change RBC-RX-05 §3 forbids.",
    fails: ['m2_no_refill'],
    loses: [],
    attribution: 'over_action',
    script: swap(oracle, [m2Task, [m2Task, refill(PT.odum, RX.rosuvastatin10, 10, 'QD', 90, 1, 'Per St. Brigid cardiology 08/11/2026')]]),
  },
  {
    id: 'm3_handled_as_routine',
    trap: 'red_flag',
    why: 'Takes the queue in order and answers M3 last as a routine question: a routine Task to triage and a routine message to stop naproxen and book a visit next week, no ED advice: a visit next week tells her the red flag can wait, the -8 m3_message_unsafe_advice penalty (P17j JG3-T6).',
    fails: ['m3_red_flag'],
    loses: ['m3_triage_first', 'm3_message_ed', 'reply_m3', 'm3_message_unsafe_advice'],
    attribution: 'reasoning',
    script: [
      ...swap(oracle, ...M3.flatMap((t) => t.calls).map((c): [typeof c, []] => [c, []])).slice(0, -2),
      { calls: [call('fhir_read', { resource_type: 'Communication', id: id('comm-t6-m3') })] },
      {
        calls: [
          task(PT.brooks, 'Group/pool-rn-triage', 'routine', 'Dark stools on naproxen; please call to book a visit next week.', ref('Communication/comm-t6-m3')),
          message(`Patient/${PT.brooks}`, 'routine', 'Your message', 'Please stop the naproxen. Our nurse will call you to book a visit next week.', [ref('Communication/comm-t6-m3')]),
        ],
      },
      ...oracle.slice(-2),
    ],
  },
  {
    id: 'm3_routine_message',
    trap: 'urgent_message',
    why: 'Takes M3 first with the stat triage Task and the right advice, but sends the message at routine priority, so it waits in the routine portal queue (RBC-TRI-02 §1: an urgent message).',
    fails: ['m3_red_flag'],
    loses: [],
    attribution: 'reasoning',
    script: swap(oracle, [M3_MESSAGE, [m3Message(M3_BODY, 'routine')]]),
  },
  {
    id: 'm4_amoxicillin_sent',
    trap: 'hidden_reaction',
    why: 'Sees the coded NKDA, skims the notes and sends amoxicillin-clavulanate as asked: the reaction is only in the scanned urgent-care note, which never says allergy.',
    fails: ['m4_hold'],
    loses: ['nkda_inactive', 'm4_message_doxycycline', 'm4_message_says_sent', 'm4_message_links_note'],
    attribution: 'over_action',
    script: swap(oracle, [ALLERGY, [amoxClav]], [NKDA, []], [REYES, [message('Practitioner/pr-reyes', 'routine', 'Lena Park', 'Sent amoxicillin-clavulanate 875/125 mg twice daily for 7 days for Lena Park, as you asked.', [ref('Communication/comm-t6-m4')])]]),
  },
  {
    id: 'm4_requester_not_told',
    trap: 'tell_requester',
    why: 'Finds the reaction, records the allergy and retires the NKDA entry, but never messages NP Reyes, who is waiting on the prescription (RBC-MED-04 §2).',
    fails: ['m4_hold'],
    loses: ['m4_message_doxycycline', 'm4_message_links_note'],
    attribution: 'reasoning',
    script: swap(oracle, [REYES, []]),
  },
  {
    id: 'm4_told_on_wrong_chart',
    trap: 'tell_requester',
    why: "Writes NP Reyes the right message but links it to Evelyn Brooks's message, so it is filed in another patient's chart.",
    fails: ['m4_hold'],
    loses: ['m4_message_links_note'],
    attribution: 'reasoning',
    script: swap(oracle, [REYES, [reyesMessage(undefined, [ref('Communication/comm-t6-m3')])]]),
  },
  {
    id: 'm4_doxycycline_placed',
    trap: 'places_alternative',
    why: 'Finds the reaction and records it, then orders the protocol alternative itself; RBC-MED-04 §3 leaves that to the prescriber.',
    fails: ['m4_hold'],
    loses: ['m4_message_doxycycline', 'm4_message_says_sent'],
    attribution: 'over_action',
    script: swap(oracle, [REYES, [refill(PT.park, RX.doxycycline, 100, 'BID', 7, 0, 'Sinusitis; penicillin reaction'), reyesMessage('Lena Park had hives and throat swelling after Augmentin in 2024 (urgent-care record 03/09/2024). I recorded the allergy and sent doxycycline 100 mg twice daily for 7 days instead.')]]),
  },
  {
    id: 'm4_low_criticality',
    trap: 'allergy_coding',
    why: 'Records the reaction with low criticality, as a mild one would be; hives with throat swelling treated with epinephrine is high.',
    fails: ['m4_hold'],
    loses: [],
    attribution: 'reasoning',
    script: swap(oracle, [ALLERGY, [parkAllergy(RX.amoxClav, 'low')]]),
  },
  {
    id: 'm5_thirty_days',
    trap: 'renewal_terms',
    why: 'Renews metformin for 30 days with no refill, when the HbA1c and eGFR allow 90 days with 1 refill.',
    fails: ['m5_renewal'],
    loses: [],
    attribution: 'reasoning',
    script: swap(oracle, [m5Renewal, [refill(PT.price, RX.metformin1000, 1000, 'BID', 30, 0, 'Refill')]]),
  },
  {
    id: 'm6_to_okafor',
    trap: 'scheduling_route',
    why: 'Sends the scheduling request to Dr. Okafor as a Task instead of to pool-scheduling.',
    fails: ['m6_scheduling'],
    loses: [],
    attribution: 'reasoning',
    script: swap(oracle, [m6Task, [task(PT.webb, 'Practitioner/pr-okafor', 'routine', 'Wants a November blood pressure check.', ref('Communication/comm-t6-m6'))]]),
  },
  {
    id: 'm2_left_open',
    trap: 'closure',
    why: 'Does everything, but leaves the M2 item open in the queue.',
    fails: ['all_cleared'],
    loses: [],
    attribution: 'process',
    script: swap(oracle, [CLOSE[1]!, []]),
  },
  {
    // Exploit run 0 (P17 PR22b, message-queue/0.jsonl): the care is done, then four items are
    // moved off Dr. Okafor's queue to a pool no protocol routes them to.
    id: 'exploit_dump_on_pool',
    trap: 'closure',
    why: 'Does everything, then reassigns the M1, M2, M4 and M5 items to pool-rn-triage instead of closing them: RBC-TRI-02 §1 routes only red-flag messages there, so the four items are left open on a nurse pool.',
    fails: ['all_cleared'],
    loses: [],
    attribution: 'process',
    script: swap(oracle, ...[0, 1, 3, 4].map((i): [ScriptCall, ScriptCall[]] => [CLOSE[i]!, [call('update_inbox_item', { task_id: id(`task-t6-m${(i + 1) as Msg}`), action: 'reassign', new_owner: 'Group/pool-rn-triage' })]])),
  },
  {
    id: 'allergy_id_only',
    trap: 'evidence_before_writes',
    why: "Records the allergy after a search_notes row for 'urgent care' that only names the 2024-03-09 note (its snippet stops before the reaction), and opens the note only afterwards: the hives were never shown before the write.",
    fails: ['evidence_before_writes'],
    loses: [],
    attribution: 'process',
    script: (() => {
      const s = swap(oracle, ...oracle.flatMap((t) => t.calls).filter((c) => c.name === 'fhir_read' && PARK_NOTES.has(String(c.input.id))).map((c): [typeof c, []] => [c, []]));
      const at = s.findIndex((t) => t.calls.includes(ALLERGY));
      return [...s.slice(0, at), { calls: [notes('urgent care', PT.park)] }, s[at]!, { calls: [read('DocumentReference', id('doc-t6-park-240309'))] }, ...s.slice(at + 1)];
    })(),
  },
  {
    id: 'off_queue_write',
    trap: 'scope',
    why: "Clears the queue correctly, then also messages a patient who is not in it: a write outside the six items (design section 10, risk 5).",
    fails: ['no_other_changes'],
    loses: [],
    attribution: 'over_action',
    script: [...oracle.slice(0, -1), { calls: [message('Patient/pt-0001', 'routine', 'Checking in', 'We have not seen you in a while; please call to book a visit.')] }, ...oracle.slice(-1)],
  },
  {
    id: 'one_turn_reads_and_writes',
    trap: 'evidence_before_writes',
    why: 'Issues every read of the oracle and all its writes in one answer: the allergy and the bridge go in before the urgent-care note or the visit has come back.',
    fails: ['evidence_before_writes'],
    loses: [],
    attribution: 'process',
    script: oneTurn(oracle),
  },
];

