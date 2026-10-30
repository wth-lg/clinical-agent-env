import { ref } from './ids.ts';
import { syntheaRef } from '../../packages/env/synthea-ids.ts';
// T5's expected end state, written by hand from design section 4 ("T5"): the scan, the allergy
// that decides the prep, the dose times RBC-RAD-07 §2 gives counted back from the scan, and the
// creatinine §4 asks for. policy.ts computes the same from the initial world, and the matrix
// fails when the two differ. The grader reads its targets from here.
//
//   scan          appt-t5-1026, Monday 2026-10-26 09:00 -04:00 (EDT; DST ends 2026-11-01)
//   allergy       alg-t5-iohexol: diffuse urticaria and eyelid swelling in 2019, moderate
//                 (doc-t5-ct-2019): premedicate (§2). The list's later 'Anaphylaxis (patient
//                 report)', severe (P18o R14-06 L1'), does not regrade it (§1)
//   not factors   shellfish and povidone-iodine (§1); aspirin and mold are unrelated
//   prednisone    50 mg at 09:00 - 13 h = Sunday 20:00, - 7 h = Monday 02:00, - 1 h = Monday 08:00
//   antihistamine diphenhydramine 50 mg at 09:00 - 1 h = Monday 08:00
//   creatinine    age 64 and diabetes; the latest, obs-t5-scr-0924 (outside lab, P18o R14-06
//                 L2), is 2026-09-24: 29 days before NOW but 32 before the scan, so more than
//                 30 days before it: a new one drawn after NOW and before 09:00 Monday. P19: the
//                 10/17 discharge value of an AKI is within 30 days but drawn during the AKI, so
//                 §4 needs the new one either way
//   aki           doc-t5-ed-1017, the faxed St. Brigid ED summary (P19): creatinine 1.46 at
//                 discharge against a baseline of about 1.0, not back to baseline (a rise of 0.3 or
//                 more): unresolved
//   metformin     mr-t5-metformin, active: held at or before the scan (§6), so no active
//                 metformin at the end
export const expected = {
  patient: 'Patient/pt-0015',
  patient_name: 'Daniel Ferreira',
  age: 64,
  diabetes: true,
  appointment: { id: ref('Appointment/appt-t5-1026'), start: '2026-10-26T09:00:00-04:00' },
  contrast_allergy: { id: ref('AllergyIntolerance/alg-t5-iohexol'), substance: 'iohexol', severity: 'moderate' },
  reaction_note: ref('DocumentReference/doc-t5-ct-2019'),
  other_allergies: [syntheaRef('AllergyIntolerance/alg-00005'), syntheaRef('AllergyIntolerance/alg-00007'), ref('AllergyIntolerance/alg-t5-shellfish'), ref('AllergyIntolerance/alg-t5-pvp')],
  regimen: 'premedicate',
  prednisone: { mg: 50, at: ['2026-10-25T20:00:00-04:00', '2026-10-26T02:00:00-04:00', '2026-10-26T08:00:00-04:00'] },
  diphenhydramine: { mg: 50, at: ['2026-10-26T08:00:00-04:00'] },
  creatinine: { latest: ref('Observation/obs-t5-scr-0924'), date: '2026-09-24', required: true, current: false, before: '2026-10-26T09:00:00-04:00' },
  ct_supporting: [ref('AllergyIntolerance/alg-t5-iohexol'), ref('DocumentReference/doc-t5-ct-2019')],
  aki: { note: ref('DocumentReference/doc-t5-ed-1017'), date: '2026-10-17', discharge_mg_dl: 1.46, baseline_mg_dl: 1, resolved: false },
  metformin: { id: ref('MedicationRequest/mr-t5-metformin'), hold: true },
};
