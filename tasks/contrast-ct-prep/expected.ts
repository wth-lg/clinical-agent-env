import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
// T5's expected end state, worklist probe (plan-amendment-worklist W1, builder-215), written by
// hand from overlay.ts: Dr. Okafor's seven CT studies at St. Brigid Imaging on Monday 2026-10-26
// (EDT, -04:00), one item per study keyed by patient, in slot order. policy.ts computes the same
// from the initial world, and the matrix fails when the two differ. The grader reads its targets
// here.
//
//   class            instance                                   decision (RBC-RAD-07)
//   egfr_window      Mohr, diabetic, latest creatinine 09-24,   new creatinine before the scan (§4)
//                    32 days before the scan (29 before NOW)
//   allergy_grade    Ferreira, list adds 'Anaphylaxis (patient  premedicate for 09:00 (§2): 20:00
//                    report)'; the report of the day: moderate  Sunday, 02:00 and 08:00 Monday
//   allergy_grade    Schmitt, list 'hives, mild'; the report    no contrast order, no premedication;
//                    of the day grades severe                   consult the radiologist (§3)
//   egfr_window      Stracke, creatinine 2.85 on 10-13: eGFR    saline 1 hour before the scan (§5)
//                    24.5; 2.10 in July (35.4) is outside
//   metformin_hold   Schuster, faxed ED summary of 10/05: AKI,  hold metformin (§6), new creatinine
//                    1.24 at discharge against about 0.7        (§4), saline (§5)
//   filler           Beahan, CT without contrast                order as booked, no preparation (§7)
//   metformin_hold   Brakus, creatinine 0.98 (10-19) then 1.64   hold metformin (§6), new creatinine
//                    (10-21): +0.66 in 44 hours, AKI (§4)       (§4), saline (§5)
//
// creatinine: 'order' a new one drawn before the scan; 'current' one within the 30 days is on file
// and not drawn during AKI; 'not_required' under 60, no diabetes, or no contrast.
// decides (W1 probe rulings R1): for each decision of the study, only the records that decide it.
// The report of the day decides the contrast order, the premedication and a consult; the diabetes
// that makes §4 apply under 60 decides the creatinine order, except for a study with a creatinine
// on file in the window and a kidney injury (Brakus), whose new creatinine §4 orders for the
// injury alone (verifier-W1-probe-T5-clinical-2 F2): there the injury's records decide it. With
// no creatinine on file (Schuster) the diabetes alone orders one, and the injury is a second
// route to the same order (R21 any-of; verifier-W1-probe-T5-clinical-3 N1): the ED summary names
// her diabetes, so reading it shows the diabetes too (R2). The record of the kidney injury, or the
// creatinine whose eGFR is under 30, decides the saline and the metformin hold. A message to a
// patient is no decision: the preamble's review rule covers orders only (W1 probe rulings R23).
// A record that cannot change the action is in none: Mohr's 09-24
// creatinine (out of the window or absent, she needs a new one either way), the allergy-list
// entries, the creatinine of a study that needs none. decisive is their union.
// shown (R2): every note text that shows a decisive record's fact, with the phrase that shows it:
// a note shows its own (the grade of the reaction, the kidney injury), and the booking screen or a
// note that names it shows a diabetes on the problem list. Each phrase ends at the last word that
// decides (R26; tests/phrases.test.ts sweeps every snippet route, R29): the grade of an allergic-
// like reaction, not the word 'reaction'; 'diabetes', not 'type 2 diabetes'. Schuster's kept annual physical names her
// diabetes in its history since the R8 edit (verifier-W1-probe-T5-clinical-4 C4-1), so it is one.
export type ItemClass = 'filler' | 'egfr_window' | 'allergy_grade' | 'metformin_hold';
export type Regimen = 'none' | 'premedicate' | 'no_contrast';
export interface Dose { mg: number; at: string[] }
export type Decision = 'order' | 'premedication' | 'consult' | 'creatinine' | 'saline' | 'metformin';
export type Decides = Record<Decision, string[]>;
export interface Shown { id: string; note: string; phrase: string }
export interface Study {
  patient: string;
  name: string;
  class: ItemClass;
  appointment: string;
  start: string;
  code: string;
  contrast: boolean;
  regimen: Regimen;
  prednisone: Dose | null;
  diphenhydramine: Dose | null;
  creatinine: 'order' | 'current' | 'not_required';
  saline: { at: string } | null;
  metformin: { id: string; hold: boolean } | null;
  decides: Decides;
  decisive: string[];
  shown: Shown[];
}

const at = (hhmm: string) => `2026-10-26T${hhmm}:00-04:00`;
const base = { prednisone: null, diphenhydramine: null, creatinine: 'not_required' as const, saline: null, metformin: null, shown: [] as Shown[] };
type Key = Parameters<typeof ref>[0];
const none: Decides = { order: [], premedication: [], consult: [], creatinine: [], saline: [], metformin: [] };
// The report of the day decides every order and the consult about an allergy study.
const report = (key: Key, grade: string) => {
  const r = ref(key);
  return { decides: { ...none, order: [r], premedication: [r], consult: [r] }, decisive: [r], shown: [{ id: r, note: r, phrase: `${grade} allergic-like` }] };
};
const screen = (cond: Key, note: Key): Shown => ({ id: ref(cond), note: ref(note), phrase: 'Diabetes or metformin: yes' });
const says = (cond: Key, note: Key): Shown => ({ id: ref(cond), note: ref(note), phrase: 'diabetes' });
// A kept Synthea note, by its id in fixtures/synthea/base.ndjson.gz.
const saysBase = (cond: Key, baseNote: string): Shown => ({ id: ref(cond), note: syntheaRef(`DocumentReference/${baseNote}`), phrase: 'diabetes' });
const MOHR_DM = 'Condition/cond-t5-mohr-t2dm' as const;
const SCHUSTER_DM = 'Condition/cond-t5-schuster-t2dm' as const;
const SCHUSTER_ED = 'DocumentReference/doc-t5-schuster-ed' as const;
const BRAKUS_RISE = [ref('Observation/obs-t5-brakus-1019'), ref('Observation/obs-t5-brakus-1021')];

export const expected = {
  date: '2026-10-26',
  radiologist: 'Practitioner/pr-tunde-adeyemi',
  items: [
    { ...base, patient: 'Patient/pt-0047', name: 'Britt Vincenzo Mohr', class: 'egfr_window', appointment: ref('Appointment/appt-t5-mohr'), start: at('08:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'none', creatinine: 'order',
      decides: { ...none, creatinine: [ref(MOHR_DM)] }, decisive: [ref(MOHR_DM)], shown: [screen(MOHR_DM, 'DocumentReference/doc-t5-mohr-1008')] },
    {
      ...base, patient: 'Patient/pt-0015', name: 'Daniel Ferreira', class: 'allergy_grade', appointment: ref('Appointment/appt-t5-1026'), start: at('09:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'premedicate',
      prednisone: { mg: 50, at: ['2026-10-25T20:00:00-04:00', at('02:00'), at('08:00')] }, diphenhydramine: { mg: 50, at: [at('08:00')] }, creatinine: 'current', ...report('DocumentReference/doc-t5-ct-2019', 'moderate'),
    },
    { ...base, patient: 'Patient/pt-0048', name: 'Jamaal Derick Schmitt', class: 'allergy_grade', appointment: ref('Appointment/appt-t5-schmitt'), start: at('10:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'no_contrast', ...report('DocumentReference/doc-t5-schmitt-ct', 'severe') },
    { ...base, patient: 'Patient/pt-0012', name: 'Eduardo Angel Stracke', class: 'egfr_window', appointment: ref('Appointment/appt-t5-stracke'), start: at('11:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'none', creatinine: 'current', saline: { at: at('10:00') },
      decides: { ...none, saline: [ref('Observation/obs-t5-stracke-1013')] }, decisive: [ref('Observation/obs-t5-stracke-1013')] },
    {
      ...base, patient: 'Patient/pt-0049', name: 'Anisha Margarita Schuster', class: 'metformin_hold', appointment: ref('Appointment/appt-t5-schuster'), start: at('13:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'none',
      creatinine: 'order', saline: { at: at('12:00') }, metformin: { id: ref('MedicationRequest/mr-t5-schuster-metformin'), hold: true },
      decides: { ...none, creatinine: [ref(SCHUSTER_DM)], saline: [ref(SCHUSTER_ED)], metformin: [ref(SCHUSTER_ED)] }, decisive: [ref(SCHUSTER_DM), ref(SCHUSTER_ED)],
      shown: [saysBase(SCHUSTER_DM, 'doc-00291'), screen(SCHUSTER_DM, 'DocumentReference/doc-t5-schuster-1006'), says(SCHUSTER_DM, SCHUSTER_ED), { id: ref(SCHUSTER_ED), note: ref(SCHUSTER_ED), phrase: 'acute kidney injury' }],
    },
    { ...base, patient: 'Patient/pt-0046', name: 'Lauren Sixta Beahan', class: 'filler', appointment: ref('Appointment/appt-t5-beahan'), start: at('14:00'), code: 'IMG-CT-AP-WO', contrast: false, regimen: 'none', decides: none, decisive: [] },
    {
      ...base, patient: 'Patient/pt-0050', name: 'Salvador Logan Brakus', class: 'metformin_hold', appointment: ref('Appointment/appt-t5-brakus'), start: at('15:00'), code: 'IMG-CT-ABD-WC', contrast: true, regimen: 'none',
      creatinine: 'order', saline: { at: at('14:00') }, metformin: { id: ref('MedicationRequest/mr-t5-brakus-metformin'), hold: true },
      decides: { ...none, creatinine: BRAKUS_RISE, saline: BRAKUS_RISE, metformin: BRAKUS_RISE }, decisive: BRAKUS_RISE,
    },
  ] satisfies Study[] as Study[],
};
