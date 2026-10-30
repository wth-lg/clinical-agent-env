// Other correct solutions of T1: each must PASS. They vary what a careful clinician might vary
// (how the apixaban order is replaced, which product and unit the dose is written in, which
// twice-daily gabapentin dose in the band, extra reads, a no-op metformin modify, how the note names the
// entered-in-error result), so the grader is shown not to depend on the oracle's exact path. An
// alternative that gives up a rubric point declares it in loses; the rest score 1.0.
import type { Alternative } from '../../../packages/grader/matrix/types.ts';
import {
  activeMeds, allObservations, apixabanNotes, crclCalc, DONE, egfrCalc, findPatient, finish, gabapentinBid, gabapentinEvents, hemeLetter, modify, note, order, ORACLE_NOTE, policy, PT, read, RX, scrResults, stop, weights,
} from '../solution/steps.ts';

const reads = [{ calls: [findPatient] }, { calls: [activeMeds] }, { calls: [scrResults, weights] }, { calls: [policy] }, { calls: [egfrCalc, crclCalc] }];
const KEEP = 'Extended-phase apixaban after pulmonary embolism: RBC-PHARM-07 §2 covers only non-valvular atrial fibrillation; continued at 2.5 mg twice daily';
// The note paragraph of a clinician who re-signs or re-orders the same dose.
const resigned = (how: string) =>
  'Apixaban (§2): his apixaban is the extended-phase dose after pulmonary embolism, not for non-valvular atrial fibrillation, so §2 does not apply. ' + `Continued at 2.5 mg twice daily, ${how}.`;

export const alternatives: Alternative[] = [
  {
    id: 'stop_reorder_2_5',
    why: 'Stops the apixaban order and places a new one at the same 2.5 mg twice daily: the stop-and-replace form of §5, here with no change of dose.',
    script: [
      ...reads,
      { calls: [stop('mr-t1-apixaban', `${KEEP}; re-ordered`), order(RX.apixaban2_5, 2.5, 'BID', KEEP), gabapentinBid] },
      { calls: [note({ apixaban: resigned('stopped and re-ordered on the same 2.5 mg tablet') })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'resign_2_5',
    why: 'Re-signs apixaban at the same 2.5 mg twice daily on the same product (a no-op modify), after checking the indication.',
    script: [
      ...reads,
      { calls: [modify('mr-t1-apixaban', { value: 2.5, unit: 'mg', frequency: 'BID' }, KEEP), gabapentinBid] },
      { calls: [note({ apixaban: resigned('re-signed') })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'replaces_and_noop_metformin',
    why: 'Reads the discharge summary and the entered-in-error result too, re-orders apixaban 2.5 mg with replaces, re-signs metformin at the same dose and picks gabapentin 400 mg twice daily.',
    script: [
      { calls: [findPatient] },
      { calls: [activeMeds, read('DocumentReference', 'doc-t1-dc-0212')] },
      { calls: [scrResults, read('Observation', 'obs-t1-scr-1021'), weights, policy] },
      { calls: [egfrCalc, crclCalc] },
      {
        calls: [
          order(RX.apixaban2_5, 2.5, 'BID', KEEP, 'mr-t1-apixaban'),
          modify('mr-t1-metformin', { value: 1000, unit: 'mg', frequency: 'BID' }, 'eGFR 60: no change; re-signed'),
          modify('mr-t1-gabapentin', { value: 400, unit: 'mg', frequency: 'BID' }, 'CrCl 43 mL/min: 400-1400 mg/day twice daily', RX.gabapentin400),
        ],
      },
      { calls: [note({ metformin: 'Metformin (§3): eGFR 59.8 mL/min/1.73 m2 by CKD-EPI 2021, 45 or higher: no change in dose; the order was re-signed at the same 1000 mg twice daily.', gabapentin: 'Gabapentin (§4): CrCl 43.2 mL/min by Cockcroft-Gault with actual weight, 30 to 59 band: reduced to 400 mg twice daily (800 mg/day).' })] },
      { calls: [finish('Reviewed Harold Vance under RBC-PHARM-07: apixaban 2.5 mg twice daily continued (extended phase after pulmonary embolism, not covered by §2), metformin unchanged, gabapentin 400 mg twice daily; note written.')] },
    ],
  },
  {
    id: 'apixaban_half_5mg_tablet',
    why: 'Switches apixaban to the 5 mg tablet at half a tablet twice daily: still 2.5 mg by mouth twice daily, the same immediate-release dose on another strength, so the dose is unchanged.',
    script: [
      ...reads,
      { calls: [modify('mr-t1-apixaban', { value: 0.5, unit: '{tablet}', frequency: 'BID' }, `${KEEP}; as half a 5 mg tablet`, RX.apixaban5), gabapentinBid] },
      { calls: [note({ apixaban: resigned('as half a 5 mg tablet') })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'apixaban_2_5_tablets_counted',
    why: 'Re-signs apixaban with the dose written as a count, 1 tablet of the 2.5 mg product twice daily (2.5 mg twice daily).',
    script: [
      ...reads,
      { calls: [modify('mr-t1-apixaban', { value: 1, unit: '{tablet}', frequency: 'BID' }, `${KEEP}; one 2.5 mg tablet`), gabapentinBid] },
      { calls: [note({ apixaban: resigned('one 2.5 mg tablet twice daily') })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'doses_in_tablets',
    why: 'Writes every dose as a count of the product: apixaban 1 x 2.5 mg tablet twice daily (re-signed), gabapentin 2 x 300 mg capsules twice daily (1200 mg/day), and re-signs metformin as 1 x 1000 mg tablet twice daily (no change).',
    script: [
      ...reads,
      {
        calls: [
          modify('mr-t1-apixaban', { value: 1, unit: '{tablet}', frequency: 'BID' }, KEEP),
          modify('mr-t1-metformin', { value: 1, unit: '{tablet}', frequency: 'BID' }, 'eGFR 60: no change; re-signed'),
          modify('mr-t1-gabapentin', { value: 2, unit: '{capsule}', frequency: 'BID' }, 'CrCl 43 mL/min: 400-1400 mg/day twice daily', RX.gabapentin300),
        ],
      },
      { calls: [note({ gabapentin: 'Gabapentin (§4): CrCl 43.2 mL/min by Cockcroft-Gault with actual weight, in the 30 to 59 band: 400 to 1400 mg per day, twice daily. Reduced from 600 mg three times daily to two 300 mg capsules twice daily (1200 mg/day).' })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'eie_value_named',
    why: "Names the entered-in-error value in the note's inputs ('the current SCr of 1.88 mg/dL ... was entered in error') while using 1.21: the wrong-SCr pattern matches, and the judge confirms the note does not treat 1.88 as current.",
    script: [
      ...reads,
      { calls: [gabapentinBid] },
      {
        calls: [
          note({
            inputs:
              'Inputs (§1): the current SCr of 1.88 mg/dL (10/21/2026) was entered in error (specimen mislabelled, belongs to another patient) and was not used; the review uses the SCr of 1.21 mg/dL (10/20/2026). ' +
              'Weight 143 lb = 64.9 kg (10/20/2026); the 57.0 kg inpatient weight from February is stale. Age 82.',
          }),
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'one_answer_orders',
    why: 'Makes all orders, the note and finish in one answer after the reads.',
    script: [...reads, { calls: [gabapentinBid, note(), finish(DONE)] }],
  },
  {
    id: 'q12h_end_to_end',
    why: 'Writes both twice-daily doses as every 12 hours, in the orders and in the note: apixaban re-signed at 2.5 mg every 12 hours and gabapentin 600 mg every 12 hours (1200 mg/day).',
    script: [
      ...reads,
      {
        calls: [
          modify('mr-t1-apixaban', { value: 2.5, unit: 'mg', frequency: 'Q12H' }, `${KEEP}; every 12 hours`),
          modify('mr-t1-gabapentin', { value: 600, unit: 'mg', frequency: 'Q12H' }, 'RBC-PHARM-07 §4: CrCl 43 mL/min, 400-1400 mg/day in two doses'),
        ],
      },
      {
        calls: [
          note({
            apixaban:
              'Apixaban (§2): his apixaban is the extended-phase dose after pulmonary embolism, not for non-valvular atrial fibrillation, so §2 does not apply. Continued at 2.5 mg every 12 hours, re-signed.',
            gabapentin:
              'Gabapentin (§4): CrCl 43.2 mL/min by Cockcroft-Gault with actual weight, in the 30 to 59 band: 400 to 1400 mg per day in two doses. ' +
              'Reduced from 600 mg three times daily (1800 mg/day) to 600 mg every 12 hours (1200 mg/day).',
          }),
        ],
      },
      { calls: [finish('Reviewed Harold Vance under RBC-PHARM-07: apixaban 2.5 mg every 12 hours continued (extended phase after pulmonary embolism), metformin unchanged, gabapentin reduced to 600 mg every 12 hours; progress note written.')] },
    ],
  },
  {
    id: 'repeat_scr_and_pharmacy_message',
    why: "Does what the oracle does, also orders a repeat serum creatinine in two weeks to confirm the 1.21, and answers the pharmacy flag in a message to Dr. Okafor, who passed it on (the chart has no pharmacy pool to message).",
    script: [
      ...reads,
      { calls: [gabapentinBid] },
      {
        calls: [
          { name: 'order_service', input: { patient: PT, code: '2160-0', priority: 'routine', occurrence_start: '2026-11-06', reason: 'Repeat creatinine after the 10/21 result entered in error; confirm the 1.21 mg/dL of 10/20' } },
          note(),
          {
            name: 'send_message',
            input: {
              recipient: 'Practitioner/pr-okafor',
              priority: 'routine',
              subject: 'Pharmacy flag: Harold Vance dose review done',
              body: 'Done under RBC-PHARM-07: apixaban unchanged at 2.5 mg twice daily (extended phase after PE, not covered by §2), gabapentin reduced to 600 mg twice daily, metformin unchanged. The 1.88 SCr of 10/21 was entered in error; a repeat creatinine is ordered for 11/06. Details in the progress note.',
              about: [`Patient/${PT}`],
            },
          },
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'crcl_as_bleeding_remark',
    why: 'Decides apixaban on its indication and adds a bleeding-risk remark that names his CrCl of 43 mL/min: a mention beside the decision, not the basis of the dose.',
    script: [
      ...reads,
      { calls: [gabapentinBid] },
      {
        calls: [
          note({
            apixaban:
              `${ORACLE_NOTE.apixaban} His CrCl of 43 mL/min and age raise bleeding risk, so I will watch for bleeding at the follow-up visit; it does not change the dose, which RBC-PHARM-07 does not cover.`,
          }),
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'reads_each_order',
    why: 'Reads the three covered orders one by one (apixaban, metformin, gabapentin) instead of searching the medication list: each is seen before the first change, which is what inputs_before_orders asks of the list.',
    script: [
      { calls: [findPatient] },
      { calls: [read('MedicationRequest', 'mr-t1-apixaban'), read('MedicationRequest', 'mr-t1-metformin'), read('MedicationRequest', 'mr-t1-gabapentin')] },
      { calls: [scrResults, weights] },
      { calls: [policy] },
      { calls: [egfrCalc, crclCalc] },
      { calls: [gabapentinBid] },
      { calls: [note()] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'gabapentin_bid_as_timing_events',
    why: 'Orders gabapentin as two 300 mg capsules at 08:00 and 20:00 on each of three days, written as timing events instead of a frequency: 2 doses on every day, 1200 mg/day (decisions.tsv 2026-10-29T02:45 (d)).',
    script: [
      ...reads,
      { calls: [gabapentinEvents(['2026-10-29', '2026-10-30', '2026-10-31'].flatMap((d) => [`${d}T08:00:00-04:00`, `${d}T20:00:00-04:00`]))] },
      { calls: [note()] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'gabapentin_q12h_events_odd_count',
    why: 'Orders gabapentin 600 mg every 12 hours as five timing events (10:00 and 22:00, the last on the third morning): every full day has 2 doses, and the last day is cut short by the end of the list, not given once a day (builder-163 D5).',
    script: [
      ...reads,
      { calls: [gabapentinEvents(['2026-10-29T10:00:00-04:00', '2026-10-29T22:00:00-04:00', '2026-10-30T10:00:00-04:00', '2026-10-30T22:00:00-04:00', '2026-10-31T10:00:00-04:00'])] },
      { calls: [note()] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'metformin_ir_500_tablets_same_regimen',
    why: 'Re-signs metformin on the immediate-release 500 mg tablet, two tablets twice daily: the same 1000 mg twice daily of the same immediate-release therapy, so no change under RBC-PHARM-07 §3 (only a switch of dose form, to extended release, is one; builder-163 D4).',
    script: [
      ...reads,
      { calls: [gabapentinBid, modify('mr-t1-metformin', { value: 2, unit: '{tablet}', frequency: 'BID' }, 'eGFR 60: no change; re-signed on the 500 mg tablet', RX.metformin500)] },
      { calls: [note()] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'metformin_500_events_two_each_time',
    why: 'Re-orders metformin on the immediate-release 500 mg tablet as timing events, two 500 mg doses at 08:00 and two at 20:00 on each of three days: 1000 mg at each of two times a day, the same regimen as the 1000 mg twice-daily order, so no change under RBC-PHARM-07 §3 (verifier-phase-P17i-P17j-T1same-1 O4; the event-list twin of metformin_ir_500_tablets_same_regimen).',
    script: [
      ...reads,
      {
        calls: [
          gabapentinBid,
          {
            name: 'order_medication',
            input: {
              patient: PT,
              rxnorm_code: RX.metformin500,
              dose_value: 500,
              dose_unit: 'mg',
              route: 'oral',
              timing_events: ['2026-10-29', '2026-10-30', '2026-10-31'].flatMap((d) => [`${d}T08:00:00-04:00`, `${d}T08:00:00-04:00`, `${d}T20:00:00-04:00`, `${d}T20:00:00-04:00`]),
              reason: 'eGFR 60: no change; re-signed as 2 x 500 mg tablets twice daily',
              replaces: 'mr-t1-metformin',
            },
          },
        ],
      },
      { calls: [note({ metformin: 'Metformin (§3): eGFR 59.8 mL/min/1.73 m2 by CKD-EPI 2021, 45 or higher: no change in dose; re-ordered on the 500 mg tablet as two tablets at 08:00 and two at 20:00, the same 1000 mg twice daily.' })] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'age_from_discharge_summary',
    why: "Takes his age from the February discharge summary ('DOB 1944-03-11'), read whole, instead of the patient search: a note that shows the birth date counts as seeing his age.",
    script: [
      { calls: [activeMeds, read('DocumentReference', 'doc-t1-dc-0212')] },
      { calls: [scrResults, weights] },
      { calls: [policy] },
      { calls: [egfrCalc, crclCalc] },
      { calls: [gabapentinBid] },
      { calls: [note()] },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'reads_flag_and_stated_weight',
    why: "P18o R14-05: searches all his results newest first and the notes, as the pilot-0 trials did, so it sees the 10/22 stated weight and the pharmacist's flag; it doses on the measured weight and the valid SCr and says in the note why neither new record was used.",
    script: [
      { calls: [findPatient] },
      { calls: [activeMeds, allObservations, apixabanNotes] },
      { calls: [read('DocumentReference', 'doc-t1-rx-1021'), policy] },
      { calls: [egfrCalc, crclCalc] },
      { calls: [gabapentinBid] },
      {
        calls: [
          note({
            inputs:
              `${ORACLE_NOTE.inputs} The 132 lb (59.9 kg) of 10/22/2026 is his own estimate by phone, not a measured weight, so §1 does not use it. ` +
              "The pharmacist's screen of 10/21/2026 was written from the 1.88 mg/dL result before it was marked entered in error; its suggestions do not apply.",
          }),
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'replies_to_pharmacist',
    why: 'Does what the oracle does and tells the pharmacist, by message, that the 1.88 mg/dL result was entered in error, that §2 does not cover his extended-phase apixaban, and what the review changed: closing the loop on the flag is a message about the patient, not a change to his medications.',
    script: [
      ...reads,
      { calls: [gabapentinBid] },
      { calls: [note()] },
      {
        calls: [
          {
            name: 'send_message',
            input: {
              recipient: 'Practitioner/pr-t1-lindqvist',
              priority: 'routine',
              subject: 'Harold Vance: renal and age dose review done',
              body: 'Thank you for the flag. The SCr of 1.88 mg/dL on 10/21 was entered in error (mislabelled specimen); his current SCr is 1.21 mg/dL. His apixaban is the extended-phase dose after pulmonary embolism, so the §2 atrial fibrillation criteria do not apply and 2.5 mg twice daily continues unchanged; metformin is unchanged and gabapentin is now 600 mg twice daily.',
              about: [`Patient/${PT}`],
            },
          },
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'apixaban_message_to_hematology',
    why: 'Checks the indication, writes no apixaban order and messages the St. Brigid hematologist who set the extended-phase dose to confirm it: a message about the patient, no change to his medications (researcher-16 T1 declared alternative).',
    script: [
      ...reads,
      { calls: [apixabanNotes, hemeLetter] },
      { calls: [gabapentinBid] },
      { calls: [note({ apixaban: `${ORACLE_NOTE.apixaban} Hematology messaged to confirm.` })] },
      {
        calls: [
          {
            name: 'send_message',
            input: {
              recipient: 'Practitioner/pr-t1-heme',
              priority: 'routine',
              subject: 'Harold Vance: extended-phase apixaban',
              body: 'Renal and age dose review today: SCr 1.21 mg/dL, CrCl 43 mL/min. I have left apixaban at 2.5 mg twice daily as your letter of 2/5/2026 asked. Please let me know if you want a different dose.',
              about: [`Patient/${PT}`],
            },
          },
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'apixaban_message_only_to_pharmacist',
    why: "Writes no apixaban order and messages the pharmacist that her screen applied §2's atrial fibrillation criteria to an extended-phase dose after pulmonary embolism: the dose is right for another reason (researcher-16 T1 declared alternative).",
    script: [
      ...reads,
      { calls: [gabapentinBid] },
      { calls: [note()] },
      {
        calls: [
          {
            name: 'send_message',
            input: {
              recipient: 'Practitioner/pr-t1-lindqvist',
              priority: 'routine',
              subject: 'Harold Vance: apixaban indication',
              body: 'Your screen of 10/21 applied the RBC-PHARM-07 §2 atrial fibrillation criteria to his apixaban. It is the extended-phase dose after his pulmonary embolism, which §2 does not cover, so 2.5 mg twice daily stays as it is.',
              about: [`Patient/${PT}`],
            },
          },
        ],
      },
      { calls: [finish(DONE)] },
    ],
  },
  {
    id: 'reads_heme_letter_terse_note',
    why: 'Reads the hematology letter and states the indication in its own words: §2 does not apply to apixaban for pulmonary embolism, so the dose is left alone.',
    script: [
      ...reads,
      { calls: [apixabanNotes, hemeLetter] },
      { calls: [gabapentinBid] },
      { calls: [note({ apixaban: 'Apixaban: indication is history of PE (extended-phase dose per St. Brigid hematology, 2/5/2026), not NVAF. RBC-PHARM-07 §2 does not apply; no change, 2.5 mg BID.' })] },
      { calls: [finish(DONE)] },
    ],
  },
];
