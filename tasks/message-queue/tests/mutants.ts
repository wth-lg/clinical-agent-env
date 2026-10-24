// Near misses of T6, one trap each (task.toml [matrix] traps; design queue table): each must FAIL
// on exactly the gates it declares and lose exactly the rubric items in `loses` (a positive item
// not met, a penalty met). Each is the oracle with the calls its wrong path changes swapped.
import type { Mutant } from '../../../packages/grader/matrix/types.ts';
import { oracle } from '../solution/solve.ts';
import {
  call, M3, m1Bridge, m2Reply, m2Task, m5Renewal, m6Task, message, notes, parkAllergy, PT, read, refill, reyesMessage, RX, swap, task,
} from '../solution/steps.ts';

const original = oracle.flatMap((t) => t.calls);
const BMP = original.find((c) => c.name === 'order_service')!;
const ALLERGY = original.find((c) => c.name === 'record_allergy' && !('update_id' in c.input))!;
const NKDA = original.find((c) => c.name === 'record_allergy' && 'update_id' in c.input)!;
const REYES = original.find((c) => c.name === 'send_message' && c.input.recipient === 'Practitioner/pr-reyes')!;
const CLOSE = original.filter((c) => c.name === 'update_inbox_item');
const amoxClav = refill(PT.park, RX.amoxClav, 875, 'BID', 7, 0, 'Acute bacterial sinusitis, per NP Reyes and RBC-CP-11');

// `loses` is required by the matrix from wth-lg/p11-matrix-loses on; the intersection keeps it
// typed until this branch is rebased onto that.
export const mutants: Array<Mutant & { loses: readonly string[] }> = [
  {
    id: 'm1_full_renewal',
    trap: 'stale_monitoring',
    why: 'Renews lisinopril for 90 days with 1 refill and orders no BMP, as if the 2025-09-08 BMP were within 12 months; it is 45 days past.',
    fails: ['m1_bridge'],
    loses: [],
    script: swap(oracle, [m1Bridge, [refill(PT.hayes, RX.lisinopril20, 20, 'QD', 90, 1, 'RBC-RX-05 §1 renewal')]], [BMP, []]),
  },
  {
    id: 'm1_bridge_without_bmp',
    trap: 'bmp_order',
    why: 'Sends the 30-day bridge but not the BMP order RBC-RX-05 §1 pairs it with.',
    fails: ['m1_bridge'],
    loses: [],
    script: swap(oracle, [BMP, []]),
  },
  {
    id: 'm2_refilled',
    trap: 'conflict_in_note',
    why: 'Refills atorvastatin from the active order without reading the August cardiology note that stopped it.',
    fails: ['m2_no_refill'],
    loses: [],
    script: swap(
      oracle,
      [m2Task, [refill(PT.odum, RX.atorvastatin40, 40, 'QHS', 90, 1, 'Refill request')]],
      [m2Reply, [message(`Patient/${PT.odum}`, 'routine', 'Your refill', 'I sent a 90-day refill of atorvastatin 40 mg to your pharmacy.')]],
    ),
  },
  {
    id: 'm3_handled_as_routine',
    trap: 'red_flag',
    why: 'Takes the queue in order and answers M3 last as a routine question: a routine Task to triage and a routine message to stop naproxen and book a visit, no ED advice.',
    fails: ['m3_red_flag'],
    loses: ['m3_triage_first', 'm3_message_ed'],
    script: [
      ...swap(oracle, ...M3.flatMap((t) => t.calls).map((c): [typeof c, []] => [c, []])).slice(0, -2),
      { calls: [call('fhir_read', { resource_type: 'Communication', id: 'comm-t6-m3' })] },
      {
        calls: [
          task(PT.brooks, 'Group/pool-rn-triage', 'routine', 'Dark stools on naproxen; please call to book a visit next week.', 'Communication/comm-t6-m3'),
          message(`Patient/${PT.brooks}`, 'routine', 'Your message', 'Please stop the naproxen. Our nurse will call you to book a visit next week.', ['Communication/comm-t6-m3']),
        ],
      },
      ...oracle.slice(-2),
    ],
  },
  {
    id: 'm4_amoxicillin_sent',
    trap: 'hidden_reaction',
    why: 'Sees the coded NKDA, skims the notes and sends amoxicillin-clavulanate as asked: the reaction is only in the scanned urgent-care note, which never says allergy.',
    fails: ['m4_hold'],
    loses: ['nkda_inactive', 'm4_message_doxycycline', 'm4_message_says_sent'],
    script: swap(oracle, [ALLERGY, [amoxClav]], [NKDA, []], [REYES, [message('Practitioner/pr-reyes', 'routine', 'Lena Park', 'Sent amoxicillin-clavulanate 875/125 mg twice daily for 7 days for Lena Park, as you asked.', ['Communication/comm-t6-m4'])]]),
  },
  {
    id: 'm4_doxycycline_placed',
    trap: 'places_alternative',
    why: 'Finds the reaction and records it, then orders the protocol alternative itself; RBC-MED-04 §3 leaves that to the prescriber.',
    fails: ['m4_hold'],
    loses: ['m4_message_doxycycline', 'm4_message_says_sent'],
    script: swap(oracle, [REYES, [refill(PT.park, RX.doxycycline, 100, 'BID', 7, 0, 'Sinusitis; penicillin reaction'), reyesMessage('Lena Park had hives and throat swelling after Augmentin in 2024 (urgent-care record 03/09/2024). I recorded the allergy and sent doxycycline 100 mg twice daily for 7 days instead.')]]),
  },
  {
    id: 'm4_low_criticality',
    trap: 'allergy_coding',
    why: 'Records the reaction with low criticality, as a mild one would be; hives with throat swelling treated with epinephrine is high.',
    fails: ['m4_hold'],
    loses: [],
    script: swap(oracle, [ALLERGY, [parkAllergy(RX.amoxClav, 'low')]]),
  },
  {
    id: 'm5_thirty_days',
    trap: 'renewal_terms',
    why: 'Renews metformin for 30 days with no refill, when the HbA1c and eGFR allow 90 days with 1 refill.',
    fails: ['m5_renewal'],
    loses: [],
    script: swap(oracle, [m5Renewal, [refill(PT.price, RX.metformin1000, 1000, 'BID', 30, 0, 'Refill')]]),
  },
  {
    id: 'm6_to_okafor',
    trap: 'scheduling_route',
    why: 'Sends the scheduling request to Dr. Okafor as a Task instead of to pool-scheduling.',
    fails: ['m6_scheduling'],
    loses: [],
    script: swap(oracle, [m6Task, [task(PT.webb, 'Practitioner/pr-okafor', 'routine', 'Wants a November physical.', 'Communication/comm-t6-m6')]]),
  },
  {
    id: 'm2_left_open',
    trap: 'closure',
    why: 'Does everything, but leaves the M2 item open in the queue.',
    fails: ['all_cleared'],
    loses: [],
    script: swap(oracle, [CLOSE[1]!, []]),
  },
  {
    id: 'allergy_from_snippet',
    trap: 'evidence_before_writes',
    why: 'Records the allergy from a search_notes snippet and opens the urgent-care note only afterwards.',
    fails: ['evidence_before_writes'],
    loses: [],
    script: (() => {
      const s = swap(oracle, ...oracle.flatMap((t) => t.calls).filter((c) => c.name === 'fhir_read' && String(c.input.id).startsWith('doc-t6-park-')).map((c): [typeof c, []] => [c, []]));
      const at = s.findIndex((t) => t.calls.includes(ALLERGY));
      return [...s.slice(0, at), { calls: [notes('hives', PT.park)] }, s[at]!, { calls: [read('DocumentReference', 'doc-t6-park-240309')] }, ...s.slice(at + 1)];
    })(),
  },
];

