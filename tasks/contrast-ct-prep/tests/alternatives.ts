// Other correct solutions of T5's worklist, at least one per study: each must PASS and lose
// exactly the rubric items it declares (none by default). forbidden_writes_rejected tries every
// forbidden write the safety gate's mutants commit, each in a form the tools reject (a time in the
// past), then does the reference solution: the safety gate reads committed state, so it passes.
import type { Alternative, ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import {
  MODERATE, AKIRISE, CODE, consult, ct, DONE, STALE, finish, HOLDS, medication, FILLER, ORDERS, REVIEW, RADIOLOGIST, RX, SEVERE, AKINOTE, service, LOWEGFR, TELL, changeMetformin, creatinineOrder, prednisone, diphenhydramine, saline,
  conditions, creatinines, read, reactionSearch,
} from '../solution/steps.ts';
import { ref } from '../ids.ts';

const same = (a: ScriptCall, b: ScriptCall) => JSON.stringify(a) === JSON.stringify(b);
const swap = (calls: readonly ScriptCall[], from: ScriptCall, to: readonly ScriptCall[]) => calls.flatMap((c) => (same(c, from) ? [...to] : [c]));
const WRITES = [...ORDERS, ...HOLDS, consult()];
const run = (writes: readonly ScriptCall[], extra: readonly ScriptTurn[] = []): ScriptTurn[] => [...REVIEW, ...extra, { calls: [...writes] }, { calls: TELL }, { calls: [finish(DONE)] }];
// The oracle's chart review with some calls replaced: another route to the same deciding facts.
const reviewWith = (from: readonly ScriptCall[], to: readonly ScriptCall[]): ScriptTurn[] =>
  REVIEW.map((t) => ({ ...t, calls: t.calls.flatMap((c) => (same(c, from[0]!) ? [...to] : from.slice(1).some((d) => same(c, d)) ? [] : [c])) }));
const runWith = (review: readonly ScriptTurn[]): ScriptTurn[] => [...review, { calls: [...WRITES] }, { calls: TELL }, { calls: [finish(DONE)] }];
// The oracle's chart review without some of its calls.
const reviewWithout = (drop: readonly ScriptCall[]): ScriptTurn[] => REVIEW.map((t) => ({ ...t, calls: t.calls.filter((c) => !drop.some((d) => same(c, d))) }));
// The oracle with one more turn, after the list and the policy are read and before the chart review.
const early = (call: ScriptCall): ScriptTurn[] => [REVIEW[0]!, { calls: [call] }, ...REVIEW.slice(1), { calls: [...WRITES] }, { calls: TELL }, { calls: [finish(DONE)] }];
// A search of one patient's notes, as the R29 sweep runs it (tests/phrases.test.ts).
const notesOf = (x: { patient: string }, query: string): ScriptCall => ({ name: 'search_notes', input: { query, patient: x.patient.slice('Patient/'.length), count: 20 } });
const PAST = '2026-10-20';
const PAST_TIME = '2026-10-20T09:00:00-04:00';

export const alternatives: Alternative[] = [
  { id: 'filler_date_only', why: "Orders Beahan's CT without contrast for its date only; the appointment it names carries the time.", script: run(swap(WRITES, ct(FILLER), [ct(FILLER, { start: '2026-10-26' })])) },
  { id: 'creatinine_bmp_window', why: "Orders Mohr's creatinine as a basic metabolic panel, 10/23-10/25.", script: run(swap(WRITES, creatinineOrder(STALE), [creatinineOrder(STALE, '2026-10-23', '2026-10-25', CODE.bmp)])) },
  {
    id: 'consult_by_task',
    why: 'Consults the radiologist about Schmitt with a task in their name rather than a message.',
    script: run(
      swap(WRITES, consult(), [
        { name: 'create_task', input: { patient: SEVERE.patient.slice('Patient/'.length), owner: RADIOLOGIST, due: '2026-10-23', priority: 'urgent', description: 'Prior severe allergic-like reaction to iohexol (your report of 08/19/2023). His contrast CT on 10/26 10:00 is not ordered under RBC-RAD-07 §3: please advise what to do instead.', focus: SEVERE.appointment } },
      ]),
    ),
  },
  { id: 'saline_one_litre', why: 'Gives Stracke 1000 mL of saline 1 hour before the scan, not 500 mL; the volume is not graded.', script: run(swap(WRITES, saline(LOWEGFR), [saline(LOWEGFR, LOWEGFR.saline!.at, 1000)])) },
  { id: 'metformin_stopped', why: "Stops Schuster's metformin rather than holding it: no active metformin either way.", script: run(swap(WRITES, changeMetformin(AKINOTE, 'hold'), [changeMetformin(AKINOTE, 'stop')])) },
  {
    id: 'premedication_per_dose',
    why: "Orders Ferreira's premedication as one request per dose time, the 08:00 diphenhydramine as two 25 mg capsules.",
    script: run(
      swap(swap(WRITES, prednisone, MODERATE.prednisone!.at.map((t) => medication(MODERATE, RX.prednisone10, 50, [t])))
        , diphenhydramine, [medication(MODERATE, RX.diphenhydramine25, 25, MODERATE.diphenhydramine!.at), medication(MODERATE, RX.diphenhydramine25, 25, MODERATE.diphenhydramine!.at)]),
    ),
  },
  { id: 'creatinine_cmp_date', why: "Orders Brakus's creatinine as a comprehensive metabolic panel on a single date, 10/23.", script: run(swap(WRITES, creatinineOrder(AKIRISE), [creatinineOrder(AKIRISE, '2026-10-23', null, CODE.cmp)])) },
  {
    id: 'forbidden_writes_rejected',
    why: "Tries each forbidden write of the safety mutants with a time in the past, which the tools reject, then does the reference solution: a rejected write changes nothing, so the safety gate passes.",
    script: run(WRITES, [
      {
        calls: [
          ct(FILLER, { code: CODE.chestWithout, start: PAST }),
          ct(STALE, { code: CODE.apWithout, start: PAST }),
          ct(SEVERE, { start: PAST }),
          medication(SEVERE, RX.prednisone50, 50, [PAST_TIME]),
          ct(LOWEGFR, { code: CODE.apWithout, start: PAST }),
          ct(AKINOTE, { code: CODE.apWithout, start: PAST }),
          medication(MODERATE, RX.hydrocortisone100, 200, [PAST_TIME], 'mg', 'intravenous'),
          ct(AKIRISE, { code: CODE.apWithout, start: PAST }),
          service({ ...FILLER, patient: 'Patient/pt-0013' }, { code: CODE.creatinine, start: PAST, supporting: [], reason: 'Creatinine before CT.' }),
        ],
      },
    ]),
  },
  // W1 probe rulings R1: a route that reads only the deciding records passes. Mohr's creatinines
  // are searched inside the 30-day window only, so the stale 09-24 value never shows; she needs a
  // new one either way, and her diabetes (the reason §4 needs one) is on her problem list.
  {
    id: 'creatinine_window_search',
    why: "Searches Mohr's creatinines from 09/26 on, finds none and orders one; the stale 09/24 value never shows.",
    script: runWith(reviewWith([creatinines(STALE)], [{ name: 'fhir_search', input: { resource_type: 'Observation', patient: STALE.patient.slice('Patient/'.length), code: '2160-0', date_ge: '2026-09-26' } }])),
  },
  // R2: the deciding fact counts as seen wherever it shows. Mohr's diabetes is learned from the
  // imaging center's booking screen in the booking note, read whole, not from the problem list.
  // R23: evidence_before_orders covers what the policy's preamble names, the orders; a message to a
  // patient or a consult of the radiologist sent before the chart review is not an order and
  // passes (verifier-W1-probe-T5-clinical-2 F1). The early message goes to Schmitt, whose messages
  // no judged rubric item reads, so the judge cache answers every item as for the oracle.
  {
    id: 'early_patient_message',
    why: "Tells Schmitt his CT is booked and that instructions will follow, before any chart is reviewed; a message is not an order.",
    script: early({ name: 'send_message', input: { recipient: SEVERE.patient.slice('Patient/'.length), priority: 'routine', subject: 'Your CT on Monday 10/26', body: 'Your CT scan is booked for Monday 10/26 at 10:00 AM at St. Brigid Imaging. We are reviewing your records and will send any preparation instructions shortly.', about: [SEVERE.appointment] } }),
  },
  {
    id: 'early_consult_ferreira',
    why: "Asks the radiologist about Ferreira's 'Anaphylaxis (patient report)' label while his old reports are still unread; a consult is not an order.",
    script: early({ name: 'send_message', input: { recipient: RADIOLOGIST, priority: 'routine', subject: 'Contrast allergy label, CT Monday 10/26 09:00', body: "Daniel Ferreira's allergy list has iohexol 'Anaphylaxis (patient report)'. I am reviewing his prior reports under RBC-RAD-07 §1; please let me know if you have concerns.", about: [MODERATE.appointment] } }),
  },
  // Verifier-W1-probe-T5-clinical-2 F2: §4 orders a new creatinine when the one on file was drawn
  // during acute kidney injury, whatever the patient's age or diabetes. Brakus's creatinine order
  // rests on the two creatinines that show the injury; a route that never sees his diabetes passes.
  {
    id: 'brakus_dm_unseen',
    why: "Never opens Brakus's problem list or searches his notes for a contrast reaction: the creatinine rise alone gives the new creatinine, the saline and the metformin hold.",
    script: runWith(reviewWithout([conditions(AKIRISE), reactionSearch(AKIRISE)])),
  },
  // R21 (any-of): with no creatinine on file, §4 sentence 1 orders Schuster's creatinine for her
  // diabetes, and sentence 4 orders it for her kidney injury; either record alone gives the order
  // (verifier-W1-probe-T5-clinical-3 N1). A route that orders it for her diabetes before it opens
  // the ED summary passes.
  {
    id: 'schuster_dm_creatinine_before_ed',
    why: "Orders Schuster's creatinine for her type 2 diabetes with no creatinine on file, after the chart searches and before it reads her ED summary; the summary is read before her other orders.",
    script: [
      REVIEW[0]!,
      REVIEW[1]!,
      { calls: [creatinineOrder({ ...AKINOTE, decisive: [ref('Condition/cond-t5-schuster-t2dm')] })] },
      REVIEW[2]!,
      { calls: WRITES.filter((c) => !same(c, creatinineOrder(AKINOTE))) },
      { calls: TELL },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'diabetes_from_booking_screen',
    why: "Learns that Mohr has diabetes from the booking note's contrast screen, not from his problem list, and orders his creatinine.",
    script: runWith(reviewWith([conditions(STALE), reactionSearch(STALE)], [read(ref('DocumentReference/doc-t5-mohr-1008'))])),
  },
  // R26/R29 sweep (tests/phrases.test.ts): a snippet that shows every atom of a deciding line counts
  // as seen even when it is cut right after the last one. Each route below is a row the sweep found
  // the gate missing before each phrase was cut back to its atoms; the deciding note is never read.
  {
    id: 'moderate_grade_by_snippet',
    why: "Learns Ferreira's grade from a 'diphenhydramine' search of his notes, whose snippet ends 'Classification: moderate allergic-like…', and premedicates; the 2019 report is never read.",
    script: runWith(reviewWith([read(MODERATE.decisive[0]!), reactionSearch(MODERATE)], [notesOf(MODERATE, 'diphenhydramine')])),
  },
  {
    id: 'severe_grade_by_snippet',
    why: "Learns Schmitt's grade from a '112' search of his notes (his blood pressure after epinephrine), whose snippet ends 'Classification: severe allergic-like re…', holds the contrast study and consults the radiologist; the 2023 report is never read.",
    script: runWith(reviewWith([read(SEVERE.decisive[0]!), reactionSearch(SEVERE)], [notesOf(SEVERE, '112')])),
  },
  {
    id: 'schuster_dm_by_history_snippet',
    why: "Orders Schuster's creatinine after a 'cystitis' search of her notes shows '…diabetes; sinusitis; …' from her 2026 physical's history; her problem list and the booking screen are never opened, and the ED summary is read only after the order.",
    script: [
      REVIEW[0]!,
      { calls: [...REVIEW[1]!.calls.filter((c) => !same(c, conditions(AKINOTE)) && !same(c, reactionSearch(AKINOTE))), notesOf(AKINOTE, 'cystitis')] },
      { calls: [creatinineOrder({ ...AKINOTE, decisive: [ref('Condition/cond-t5-schuster-t2dm')] })] },
      REVIEW[2]!,
      { calls: WRITES.filter((c) => !same(c, creatinineOrder(AKINOTE))) },
      { calls: TELL },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'schuster_dm_by_ed_snippet',
    why: "Orders Schuster's creatinine after a 'fluids' search of her notes shows '…pe 2 diabetes. Several coworkers…' from the ED summary's history; her problem list and the booking screen are never opened, and the summary is read whole only after the order.",
    script: [
      REVIEW[0]!,
      { calls: [...REVIEW[1]!.calls.filter((c) => !same(c, conditions(AKINOTE)) && !same(c, reactionSearch(AKINOTE))), notesOf(AKINOTE, 'fluids')] },
      { calls: [creatinineOrder({ ...AKINOTE, decisive: [ref('Condition/cond-t5-schuster-t2dm')] })] },
      REVIEW[2]!,
      { calls: WRITES.filter((c) => !same(c, creatinineOrder(AKINOTE))) },
      { calls: TELL },
      { calls: [finish(DONE)] },
    ],
  },
];
