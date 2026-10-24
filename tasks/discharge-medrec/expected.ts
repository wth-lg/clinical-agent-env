// T4's expected end state, written by hand from design section 4 ("T4" gate): what each line of
// the 2026-10-19 discharge documents does to the outpatient list under RBC-TOC-02, and the home
// medication no document addresses. policy.ts computes the same from the initial world, and the
// matrix fails when the two differ. The grader reads its targets from here.
//
//   furosemide      summary: 40 mg daily (from 20)          modify mr-t4-furosemide, 40 mg/day
//   spironolactone  summary 12.5 mg, addendum 25 mg (§1)    new order, 25 mg daily
//   KCl             summary: stop                           stop mr-t4-kcl
//   lisinopril      resume 10 mg when SCr < 1.5 (§2)        obs-t4-scr-1021 1.32: resume
//   metoprolol XL   alias of metoprolol succinate ER (§4)   no change
//   atorvastatin    continue                                no change
//   pantoprazole    formulary substitution (§3)             keep omeprazole, no pantoprazole
//   tartrate 25 BID not addressed (§5)                      unchanged; message the PCP about it
export const expected = {
  patient: 'Patient/pt-0005',
  sources: { summary: 'DocumentReference/doc-t4-dc-1019', addendum: 'DocumentReference/doc-t4-dc-1019-add', ignored: ['DocumentReference/doc-t4-dc-2025'] },
  scr: { id: 'Observation/obs-t4-scr-1021', mg_dl: 1.32, threshold: 1.5 },
  furosemide: { request: 'MedicationRequest/mr-t4-furosemide', action: 'modify', daily_mg: 40, per_day: 1 },
  spironolactone: { request: null, action: 'start', daily_mg: 25, per_day: 1 },
  potassium_chloride: { request: 'MedicationRequest/mr-t4-kcl', action: 'stop' },
  lisinopril: { request: 'MedicationRequest/mr-t4-lisinopril', action: 'resume', daily_mg: 10, per_day: 1 },
  unchanged: ['MedicationRequest/mr-t4-atorvastatin', 'MedicationRequest/mr-t4-metoprolol-succ', 'MedicationRequest/mr-t4-metoprolol-tart', 'MedicationRequest/mr-t4-omeprazole'],
  not_ordered: ['pantoprazole'],
  message_about: ['MedicationRequest/mr-t4-metoprolol-tart'],
  cites: ['DocumentReference/doc-t4-dc-1019-add', 'Observation/obs-t4-scr-1021'],
};
