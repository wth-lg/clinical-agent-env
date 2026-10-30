import { ref } from './ids.ts';
// T4's expected end state, written by hand from design section 4 ("T4" gate): what each line of
// the 2026-10-19 discharge documents does to the outpatient list under RBC-TOC-02, and the home
// medication no document addresses. policy.ts computes the same from the initial world, and the
// matrix fails when the two differ. The grader reads its targets from here.
//
//   furosemide      summary: 40 mg daily (from 20)          modify mr-t4-furosemide, 40 mg/day
//   spironolactone  summary 12.5 mg, addendum 25 mg (§1)    not started (§7, P19): potassium 5.4
//                                                           in doc-t4-lab-1021 is above 5.0; no
//                                                           order, a Task for the PCP
//   KCl             summary: stop                           stop mr-t4-kcl (a stop is not a start)
//   lisinopril      resume 10 mg when SCr < 1.5 (§2)        1.32 in the outside lab report
//                                                           doc-t4-lab-1021 (P18o R14-07 L2) meets
//                                                           the line, but §7 keeps it held on the
//                                                           same report's potassium 5.4: on-hold,
//                                                           a Task for the PCP (P19)
//   metoprolol XL   alias of metoprolol succinate ER (§4)   no change
//   atorvastatin    continue                                no change
//   aspirin 81 mg   continue (RxNorm 243670)                no change
//   pantoprazole    formulary substitution (§3), marked in  keep omeprazole, no pantoprazole
//                   its own section (P18o R14-07 L1)
//   tartrate 25 BID not addressed (§5)                      unchanged; message the PCP about it
//
// sources.lines holds the summary line each change the summary rules is made from; G8 wants it
// shown before that change's first order write, as it wants the addendum's correction before any
// spironolactone order, the creatinine before any lisinopril write, and the potassium before
// either (§7). For lisinopril it is the operative rule alone: the 'spironolactone' snippet shows
// the rule cut before 'Lisinopril:' (alternative natural_snippet_queries, P17 builder-153).
export const expected = {
  patient: 'Patient/pt-0005',
  sources: { summary: ref('DocumentReference/doc-t4-dc-1019'), addendum: ref('DocumentReference/doc-t4-dc-1019-add'), correction: 'spironolactone 25 mg daily',
    lines: {
      furosemide: 'Furosemide 40 mg by mouth daily (increased from 20 mg).',
      potassium_chloride: 'Potassium chloride: stop.',
      lisinopril: 'Resume home 10 mg daily when SCr < 1.5',
    },
    ignored: [ref('DocumentReference/doc-t4-dc-2025')] },
  scr: { id: ref('DocumentReference/doc-t4-lab-1021'), mg_dl: 1.32, threshold: 1.5, line: 'Creatinine 1.32 mg/dL' },
  k: { id: ref('DocumentReference/doc-t4-lab-1021'), mmol_l: 5.4, threshold: 5.0, line: 'Potassium 5.4 mmol/L' },
  furosemide: { request: ref('MedicationRequest/mr-t4-furosemide'), action: 'modify', daily_mg: 40, per_day: 1 },
  spironolactone: { request: null, action: 'task', daily_mg: 25, per_day: 1 },
  potassium_chloride: { request: ref('MedicationRequest/mr-t4-kcl'), action: 'stop' },
  lisinopril: { request: ref('MedicationRequest/mr-t4-lisinopril'), action: 'task', daily_mg: 10, per_day: 1 },
  // In world id order, as policy.ts lists them.
  unchanged: [ref('MedicationRequest/mr-t4-aspirin'), ref('MedicationRequest/mr-t4-atorvastatin'), ref('MedicationRequest/mr-t4-metoprolol-succ'), ref('MedicationRequest/mr-t4-metoprolol-tart'), ref('MedicationRequest/mr-t4-omeprazole')].sort(),
  not_ordered: ['pantoprazole'],
  message_about: [ref('MedicationRequest/mr-t4-metoprolol-tart')],
  cites: [ref('DocumentReference/doc-t4-dc-1019-add'), ref('DocumentReference/doc-t4-lab-1021')],
};
