import { ref } from './ids.ts';
// T1's expected end state, written by hand (plan-amendment-worklist W1, builder-211; cut to five by
// plan-amendment-w4 PW4-E3, builder-281): for each patient on the pharmacy's DOAC dose review list,
// the inputs RBC-PHARM-07 §1 picks, the dose §2 (apixaban) or §3 (rivaroxaban) gives, and the
// records that decision depends on. policy.ts computes the same from the initial world, and the
// matrix fails when the two differ. The grader reads its targets from here. Ages on 2026-10-23;
// CrCl by Cockcroft-Gault, x 0.85 for a woman. The last column is the records that decide the
// action (decisive, below); 'Patient' is the Patient resource, which holds the age and sex (R33).
// One patient per probe class and the filler; the other four W1 patients keep their charts, off
// the list.
//
//   pt-0003  76 M  rivaroxaban 20 outside SCr 160 umol/L = 1.81, 90 kg: CrCl 44.2      -> 15 daily  weight, SCr, Patient
//   pt-0041  70 M  apixaban 5     no criterion; itraconazole                          -> 2.5 BID   the itraconazole order
//   pt-0038  79 M  rivaroxaban 15 96 kg (actual), SCr 1.45: CrCl 56.1                   -> 20 daily  weight, SCr, Patient
//   pt-0043  75 F  rivaroxaban 20 71 kg, SCr 0.92: CrCl 59.2                          unchanged    weight, SCr, Patient
//   pt-0002  82 M  apixaban 2.5   weight 143 lb = 64.86 kg, SCr 1.21 (10/20): age only -> 5 BID     weight, SCr
//
// The mid-trial events (events.ts) change some of these on the chart as delivered: EVENT_EXPECT.
export const CLASSES = ['cg_crcl_weight_rule', 'apixaban_two_of_three', 'outside_scr_umol', 'pgp_cyp3a4_inhibitor'] as const;
export type ItemClass = (typeof CLASSES)[number] | 'filler';
export type Drug = 'apixaban' | 'rivaroxaban';

export interface Item {
  patient: string;
  name: string;
  class: ItemClass;
  // The DOAC order the review starts from.
  request: string;
  action: 'reduce' | 'increase' | 'unchanged';
  // The dose RBC-PHARM-07 gives: mg per administration, administrations a day, by mouth.
  dose: { drug: Drug; mg: number; per_day: number };
  // The records that decide the expected action, and only those (verifier-W1-probe-T1-clinical-1
  // F1-F2): a record that cannot change the dose is not one. The Patient holds the age and sex,
  // and is one wherever they decide (rulings R33; verifier-W1T-190-falsepass F4). Rivaroxaban:
  // the weight and the creatinine §1 picks and the Patient (Cockcroft-Gault needs all three).
  // Apixaban with an inhibitor and no two criteria: the inhibitor's order or letter alone.
  // Apixaban at 2.5 mg on the criteria: the records of the met criteria, the Patient for age.
  // Apixaban at 5 mg: the records of the criteria not met (Vance's age is met, so his Patient
  // cannot change the dose). The Group shows members only as references, so the Patient is seen
  // by its read or a search_patients row. seen_before_change requires
  // these before the patient's DOAC write, and attribution.ts labels a wrong dose with them all
  // in view as reasoning. notes_cite_inputs leaves the Patient out: §4 names the records to cite
  // as results, medication orders or letters.
  decisive: string[];
}

const item = (patient: string, name: string, cls: ItemClass, request: string, action: Item['action'], drug: Drug, mg: number, decisive: string[]): Item => ({
  patient: `Patient/${patient}`, name, class: cls, request, action, dose: { drug, mg, per_day: drug === 'apixaban' ? 2 : 1 }, decisive,
});

export const expected = {
  group: ref('Group/grp-t1-doac'),
  items: [
    item('pt-0003', 'Frank Delgado', 'outside_scr_umol', ref('MedicationRequest/mr-t1-1301'), 'reduce', 'rivaroxaban', 15, [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302'), 'Patient/pt-0003']),
    item('pt-0041', 'Raymond Duquette', 'pgp_cyp3a4_inhibitor', ref('MedicationRequest/mr-t1-1701'), 'reduce', 'apixaban', 2.5, [ref('MedicationRequest/mr-t1-1703')]),
    item('pt-0038', 'Eugene Moravec', 'cg_crcl_weight_rule', ref('MedicationRequest/mr-t1-1401'), 'increase', 'rivaroxaban', 20, [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405'), 'Patient/pt-0038']),
    item('pt-0043', 'Marjorie Pellegrino', 'filler', ref('MedicationRequest/mr-t1-1801'), 'unchanged', 'rivaroxaban', 20, [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802'), 'Patient/pt-0043']),
    item('pt-0002', 'Harold Vance', 'apixaban_two_of_three', ref('MedicationRequest/mr-t1-apixaban'), 'increase', 'apixaban', 5, [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')]),
  ] as Item[],
};

// R29: the atoms of each snippet-visible decisive record, the minimal facts of its deciding line
// that decide the item; a read or one snippet that shows them all counts as seen (tests/grader.ts
// firstSeenBy). No base item of the five-patient list turns on a note (the inhibitor of pt-0041 is
// an order); the outside letters that arrive mid-trial have theirs in EVENT_EXPECT.
export const DECISIVE_ATOMS: Record<string, readonly string[]> = {};

// Each mid-trial event (events.ts SPECS) as the grader reads it: its item, and for an amend (A, B,
// O) the dose RBC-PHARM-07 gives on the chart as delivered. A lure (D) leaves the item's dose as it
// is. `atoms`: an arrival a search_notes snippet can show counts as seen when one snippet shows
// them (R29); otherwise only by a read or a search row that exposes it.
//   pellegrino-scr-new       SCr 1.25: CrCl (140 - 75) x 71.0 / (72 x 1.25) x 0.85 = 43.6     -> rivaroxaban 15
//   delgado-scr-amended      SCr 118 umol/L / 88.4 = 1.33: CrCl 64 x 90.0 / (72 x 1.33) = 59.9 -> rivaroxaban 20
//   vance-itraconazole       itraconazole (outside letter), 5 mg by §2                       -> apixaban 2.5
//   moravec-scr-new          SCr 1.85: CrCl 61 x 96.0 / (72 x 1.85) = 44.0                     -> rivaroxaban 15
//   moravec-weight-reported  a reported weight does not count (§1)                          dose stays
//   vance-clarithromycin     clarithromycin does not count (§2)                             dose stays
// `cites`, for an amend: the records the new dose relies on that §4 asks a note to cite (results,
// orders or letters; not the Patient), for the rubric's notes_cite_inputs.
// `alone`, for an amend: the arrival by itself decides every element of the item's action on the
// chart as delivered (rulings R38(d)), so it is an any-of route and the item's base records are not
// also required (tests/grader.ts decisionSteps). Only vance-itraconazole: a §2 inhibitor at a
// criteria dose of 5 mg gives 2.5 mg whatever the criteria, the rule that makes pt-0041's order its
// only decisive record. Every creatinine arrival still needs the base weight and age (CrCl).
export interface EventExpect {
  item: string;
  dose?: Item['dose'];
  cites?: readonly string[];
  atoms?: readonly string[];
  alone?: true;
}
const riva = (mg: number): Item['dose'] => ({ drug: 'rivaroxaban', mg, per_day: 1 });
export const EVENT_EXPECT: Record<string, EventExpect> = {
  'pellegrino-scr-new': { item: 'Patient/pt-0043', dose: riva(15), cites: [ref('Observation/obs-t1-1801'), 'Observation/obs-04001'] },
  'delgado-scr-amended': { item: 'Patient/pt-0003', dose: riva(20), cites: [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')] },
  'vance-itraconazole': { item: 'Patient/pt-0002', dose: { drug: 'apixaban', mg: 2.5, per_day: 2 }, cites: ['DocumentReference/doc-00301'], atoms: ['itraconazole'], alone: true },
  'moravec-scr-new': { item: 'Patient/pt-0038', dose: riva(15), cites: [ref('Observation/obs-t1-1404'), 'Observation/obs-04002'] },
  'moravec-weight-reported': { item: 'Patient/pt-0038' },
  'vance-clarithromycin': { item: 'Patient/pt-0002', atoms: ['clarithromycin'] },
};
