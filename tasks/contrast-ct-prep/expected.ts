import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
// T5's expected end state, written by hand from overlay.ts: Dr. Okafor's CT list at St. Brigid
// Imaging on Monday 2026-10-26 (EDT, -04:00), one item per booked study keyed by patient, in slot
// order. The worklist probe (plan-amendment-worklist W1, builder-215) had seven; PW4-E3 cut it to
// four, one instance of each probe class (results/probe-1/classes.md), metformin_hold's failed
// instance kept. The three others (Schmitt, Stracke, Brakus) are cancelled by the patient
// (overlay.ts) and are off the list (RBC-RAD-07 §7). policy.ts computes the same from the initial
// world, and the matrix fails when the two differ. The grader reads its targets here; EVENTS (at
// the end) gives each mid-trial event's expected study.
//
//   class            instance                                   decision (RBC-RAD-07)
//   egfr_window      Mohr, diabetic, latest creatinine 09-24,   new creatinine before the scan (§4)
//                    32 days before the scan (29 before NOW)
//   allergy_grade    Ferreira, list adds 'Anaphylaxis (patient  premedicate for 09:00 (§2): 20:00
//                    report)'; the report of the day: moderate  Sunday, 02:00 and 08:00 Monday
//   metformin_hold   Schuster, faxed ED summary of 10/05: AKI,  hold metformin (§6), new creatinine
//                    1.24 at discharge against about 0.7        (§4), saline (§5)
//   filler           Beahan, CT without contrast                order as booked, no preparation (§7)
//
// creatinine: 'order' a new one drawn before the scan; 'current' one within the 30 days is on file
// and not drawn during AKI; 'not_required' under 60, no diabetes, or no contrast.
// decides (W1 probe rulings R1): for each decision of the study, only the records that decide it.
// The report of the day decides the contrast order, the premedication and a consult; the diabetes
// that makes §4 apply under 60 decides the creatinine order, except for a study with a creatinine
// on file in the window and a kidney injury (none on the cut list; Brakus before it), whose new creatinine §4 orders for the
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
    {
      ...base, patient: 'Patient/pt-0049', name: 'Anisha Margarita Schuster', class: 'metformin_hold', appointment: ref('Appointment/appt-t5-schuster'), start: at('13:00'), code: 'IMG-CT-AP-WC', contrast: true, regimen: 'none',
      creatinine: 'order', saline: { at: at('12:00') }, metformin: { id: ref('MedicationRequest/mr-t5-schuster-metformin'), hold: true },
      decides: { ...none, creatinine: [ref(SCHUSTER_DM)], saline: [ref(SCHUSTER_ED)], metformin: [ref(SCHUSTER_ED)] }, decisive: [ref(SCHUSTER_DM), ref(SCHUSTER_ED)],
      shown: [saysBase(SCHUSTER_DM, 'doc-00291'), screen(SCHUSTER_DM, 'DocumentReference/doc-t5-schuster-1006'), says(SCHUSTER_DM, SCHUSTER_ED), { id: ref(SCHUSTER_ED), note: ref(SCHUSTER_ED), phrase: 'acute kidney injury' }],
    },
    { ...base, patient: 'Patient/pt-0046', name: 'Lauren Sixta Beahan', class: 'filler', appointment: ref('Appointment/appt-t5-beahan'), start: at('14:00'), code: 'IMG-CT-AP-WO', contrast: false, regimen: 'none', decides: none, decisive: [] },
  ] satisfies Study[] as Study[],
};

// Each mid-trial event's expected study on the chart as delivered (plan-amendment-w4 C1; events.ts):
// policy.ts applied to the world with the spec's resources in gives `study` (events.test.ts), and
// `changes` names the decisions the arrival changes. Once a spec has fired, the base gates leave
// those decisions to the event's amended gate, which also requires them written after the arrival
// was seen; every other decision stays as expected.items states it. A lure changes nothing.
//   t5-mohr-scr      A  creatinine 1.04 (10/21) then 1.52 (10/22): acute kidney injury (§4), saline
//                       07:00 (§5); the new creatinine stays due, now for the injury too
//   t5-ferreira-scr  B  the 10/14 creatinine corrected to 2.8, eGFR 24.4: saline 08:00 (§5)
//   t5-schuster-rxn  O  an outside report grades a 2022 reaction moderate: premedicate for 13:00
//                       (§1, §2): prednisone 00:00, 06:00, 12:00 and diphenhydramine 12:00
//   t5-beahan-rxn    D  a mild reaction on a CT without contrast: nothing (§7)
//   t5-ferreira-msg  D  the patient's own account: the grade stands (§1)
export interface EventStudy { study: Study; changes: Decision[] }
const byName = (name: string) => expected.items.find((x) => x.name === name)!;
const MOHR = byName('Britt Vincenzo Mohr');
const FERREIRA = byName('Daniel Ferreira');
const SCHUSTER = byName('Anisha Margarita Schuster');
const BEAHAN = byName('Lauren Sixta Beahan');
const MOHR_SCR = ['Observation/obs-07501', 'Observation/obs-07502'];
const FERREIRA_SCR = ref('Observation/obs-t5-scr-1014');
const SCHUSTER_RXN = 'DocumentReference/doc-02501';
export const EVENTS: Record<string, EventStudy> = {
  't5-mohr-scr': {
    study: { ...MOHR, saline: { at: at('07:00') }, decides: { ...none, creatinine: MOHR_SCR, saline: MOHR_SCR }, decisive: MOHR_SCR, shown: [] },
    changes: ['saline'],
  },
  't5-ferreira-scr': {
    study: { ...FERREIRA, saline: { at: at('08:00') }, decides: { ...FERREIRA.decides, saline: [FERREIRA_SCR] }, decisive: [...FERREIRA.decisive, FERREIRA_SCR] },
    changes: ['saline'],
  },
  't5-schuster-rxn': {
    study: {
      ...SCHUSTER, regimen: 'premedicate', prednisone: { mg: 50, at: [at('00:00'), at('06:00'), at('12:00')] }, diphenhydramine: { mg: 50, at: [at('12:00')] },
      decides: { ...SCHUSTER.decides, order: [SCHUSTER_RXN], premedication: [SCHUSTER_RXN], consult: [SCHUSTER_RXN] }, decisive: [SCHUSTER_RXN, ...SCHUSTER.decisive],
      shown: [{ id: SCHUSTER_RXN, note: SCHUSTER_RXN, phrase: 'Contrast reaction severity: moderate' }, ...SCHUSTER.shown],
    },
    changes: ['premedication'],
  },
  't5-beahan-rxn': { study: BEAHAN, changes: [] },
  't5-ferreira-msg': { study: FERREIRA, changes: [] },
};
