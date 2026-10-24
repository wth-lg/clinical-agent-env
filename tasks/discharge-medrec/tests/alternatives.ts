// Other correct solutions of T4: each must PASS. They vary what a careful clinician might vary
// (stop and reorder instead of modify and resume, which tablet the dose is written on, complete
// instead of stop for potassium, what the message is about, one answer for everything).
import type { Agent } from '../../../packages/grader/matrix/types.ts';
import { change, finish, furosemideUp, kclStop, lisinoprilResume, message, MESSAGE, modify, MR, note, order, reads, RX, spironolactone, writes } from '../solution/steps.ts';

export const alternatives: Agent[] = [
  {
    id: 'stop_and_reorder',
    why: 'Stops furosemide 20 mg and orders 40 mg, and orders lisinopril 10 mg daily replacing the held order instead of resuming it.',
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
    script: [...reads, { calls: [...writes, message(), note(), finish()] }],
  },
  {
    id: 'reads_old_summary_too',
    why: 'Also opens the 2025 summary and names it in the note as not used: the hybrid pattern flags the note and the judge clears it.',
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
];
