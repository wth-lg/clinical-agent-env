// Other correct solutions of T4: each must PASS and lose exactly the rubric items in `loses`.
// They vary what a careful clinician might vary (stop and reorder instead of modify and resume,
// which tablet the dose is written on, complete instead of stop for potassium, what the message
// is about, one answer for everything, seeing the addendum only as a search snippet, a potassium
// and creatinine recheck after starting spironolactone).
import type { Alternative } from '../../../packages/grader/matrix/types.ts';
import { allMeds, change, findPatient, finish, furosemideUp, kclStop, lisinoprilResume, message, MESSAGE, modify, MR, note, order, policy, PT, reads, RX, scr, spironolactone, summaries, summary, writes } from '../solution/steps.ts';

export const alternatives: Alternative[] = [
  {
    id: 'stop_and_reorder',
    why: 'Stops furosemide 20 mg and orders 40 mg, and orders lisinopril 10 mg daily replacing the held order instead of resuming it.',
    loses: [],
    script: [
      ...reads,
      { calls: [change(MR.furosemide, 'stop', 'Discharge: increased to 40 mg'), order(RX.furosemide40, 40, 'QD', 'Discharge summary: furosemide 40 mg daily'), spironolactone, kclStop, order(RX.lisinopril10, 10, 'QD', 'Resume: SCr 1.32 < 1.5', MR.lisinopril)] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'two_20mg_tablets',
    why: 'Raises furosemide to 40 mg daily on the 20 mg tablet he has (two tablets), completes potassium chloride instead of stopping it, and puts both beta-blockers in the message.',
    loses: [],
    script: [
      ...reads,
      { calls: [modify(MR.furosemide, { value: 40, unit: 'mg', frequency: 'QD' }, 'Discharge: 40 mg daily as two 20 mg tablets'), spironolactone, change(MR.kcl, 'complete', 'Discharge: stop potassium chloride'), lisinoprilResume] },
      { calls: [message(MESSAGE, [`MedicationRequest/${MR.tart}`, `MedicationRequest/${MR.succ}`])] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'one_answer',
    why: 'Makes every change, the message, the note and finish in one answer after the reads.',
    loses: [],
    script: [...reads, { calls: [...writes, message(), note(), finish()] }],
  },
  {
    id: 'reads_old_summary_too',
    why: 'Also opens the 2025 summary and names it in the note as not used: the hybrid pattern flags the note and the judge clears it.',
    loses: [],
    script: [
      { calls: reads[0]!.calls },
      { calls: reads[1]!.calls },
      { calls: [...reads[2]!.calls, { name: 'fhir_read', input: { resource_type: 'DocumentReference', id: 'doc-t4-dc-2025' } }] },
      { calls: [furosemideUp, spironolactone, kclStop, lisinoprilResume] },
      { calls: [message()] },
      { calls: [note({ sources: 'Sources: St. Brigid Regional discharge summary of 10/19/2026 and its signed addendum of 10/19/2026 (RBC-TOC-02 §1); creatinine 1.32 mg/dL on 10/21/2026. The March 2025 discharge summary is from an earlier stay and was not used.' })] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'snippet_only_addendum',
    why: "Sees the signed addendum's correction in the search_notes snippet ('Correction: spironolactone 25 mg daily') and orders 25 mg without opening the addendum.",
    loses: [],
    script: [
      { calls: [findPatient] },
      { calls: [allMeds, summaries, policy] },
      { calls: [summary, scr] },
      { calls: writes },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'recheck_bmp',
    why: 'Also creates a Task for a repeat basic metabolic panel a week after starting spironolactone (potassium and creatinine, 2022 AHA/ACC/HFSA guideline).',
    loses: [],
    script: [
      ...reads,
      { calls: [...writes, { name: 'create_task', input: { patient: PT, owner: 'Practitioner/pr-okafor', due: '2026-10-28', priority: 'routine', description: 'Repeat basic metabolic panel (potassium, creatinine) 1 week after starting spironolactone' } }] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'modify_held_lisinopril',
    why: 'Resumes lisinopril by modifying the held order at its same 10 mg daily dose, which makes a new active order, instead of the resume action.',
    loses: [],
    script: [
      ...reads,
      { calls: [furosemideUp, spironolactone, kclStop, modify(MR.lisinopril, { value: 10, unit: 'mg', frequency: 'QD' }, 'Discharge summary: resume when SCr < 1.5; SCr 1.32 on 10/21', RX.lisinopril10)] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'spironolactone_on_50mg_tablet',
    why: 'Writes spironolactone 25 mg daily on the 50 mg tablet (half a tablet), the dose the addendum gives.',
    loses: [],
    script: [
      ...reads,
      { calls: [furosemideUp, order(RX.spironolactone50, 25, 'QD', 'Signed addendum 10/19: spironolactone 25 mg daily (half of a 50 mg tablet)'), kclStop, lisinoprilResume] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'furosemide_via_replaces',
    why: 'Raises furosemide by ordering 40 mg daily with replaces naming the 20 mg order, which stops it, instead of modifying it.',
    loses: [],
    script: [
      ...reads,
      { calls: [order(RX.furosemide40, 40, 'QD', 'St. Brigid discharge summary 10/19: furosemide increased to 40 mg daily', MR.furosemide), spironolactone, kclStop, lisinoprilResume] },
      { calls: [message()] },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
  {
    id: 'extra_concerns_message',
    why: 'Sends the tartrate message and a second message to Dr. Okafor with other concerns: the creatinine still above his baseline and no SGLT2 inhibitor for his reduced ejection fraction.',
    loses: [],
    script: [
      ...reads,
      { calls: writes },
      {
        calls: [
          message(),
          {
            name: 'send_message',
            input: {
              recipient: 'Practitioner/pr-okafor',
              priority: 'routine',
              subject: 'Walter Kim: other points for the post-discharge visit',
              body: 'His creatinine is 1.32 on 10/21, still above his baseline of about 0.94, with lisinopril resumed and spironolactone started: a basic metabolic panel within a week would be prudent. He is also on no SGLT2 inhibitor for heart failure with reduced ejection fraction; worth discussing at the visit.',
              about: ['Observation/obs-t4-scr-1021'],
            },
          },
        ],
      },
      { calls: [note()] },
      { calls: [finish()] },
    ],
  },
];
