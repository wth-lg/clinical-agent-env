import { ref } from './ids.ts';
// T1's expected end state, written by hand (plan-amendment-worklist W1, builder-211): for each
// patient on the pharmacy's DOAC dose review list, the inputs RBC-PHARM-07 §1 picks, the dose §2
// (apixaban) or §3 (rivaroxaban) gives, and the records that decision depends on. policy.ts
// computes the same from the initial world, and the matrix fails when the two differ. The grader
// reads its targets from here. Ages on 2026-10-23; CrCl by Cockcroft-Gault, x 0.85 for a woman.
// The last column is the records that decide the action (decisive, below).
//
//   pt-0001  84 M  apixaban 5     weight 57.6 kg (10/14), SCr 1.18: age + weight      -> 2.5 BID   weight
//   pt-0002  82 M  apixaban 2.5   weight 143 lb = 64.86 kg, SCr 1.21 (10/20): age only -> 5 BID     weight, SCr
//   pt-0040  83 F  apixaban 5     outside SCr 150 umol/L / 88.4 = 1.70 (10/15): age + SCr -> 2.5 BID SCr
//   pt-0003  76 M  rivaroxaban 20 outside SCr 160 umol/L = 1.81, 90 kg: CrCl 44.2      -> 15 daily  weight, SCr
//   pt-0038  79 M  rivaroxaban 15 96 kg (actual), SCr 1.45: CrCl 56.1                   -> 20 daily  weight, SCr
//   pt-0039  81 M  rivaroxaban 20 measured 59.0 kg (not the stated 168 lb), SCr 1.10: CrCl 44.0 -> 15 daily  weight, SCr
//   pt-0041  70 M  apixaban 5     no criterion; itraconazole                          -> 2.5 BID   the itraconazole order
//   pt-0045  66 M  apixaban 5     no criterion; ritonavir (outside letter)            -> 2.5 BID   the letter
//   pt-0043  75 F  rivaroxaban 20 71 kg, SCr 0.92: CrCl 59.2                          unchanged    weight, SCr
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
  // F1-F2): a record that cannot change the dose is not one. Rivaroxaban: the weight and the
  // creatinine §1 picks (Cockcroft-Gault needs both). Apixaban with an inhibitor and no two
  // criteria: the inhibitor's order or letter alone. Apixaban at 2.5 mg on the criteria: the
  // records of the met weight or creatinine criteria (age is on the Patient). Apixaban at 5 mg:
  // the weight and creatinine records whose criterion is not met. seen_before_change requires
  // these before the patient's DOAC write, and attribution.ts labels a wrong dose with them all
  // in view as reasoning.
  decisive: string[];
}

const item = (patient: string, name: string, cls: ItemClass, request: string, action: Item['action'], drug: Drug, mg: number, decisive: string[]): Item => ({
  patient: `Patient/${patient}`, name, class: cls, request, action, dose: { drug, mg, per_day: drug === 'apixaban' ? 2 : 1 }, decisive,
});

export const expected = {
  group: ref('Group/grp-t1-doac'),
  items: [
    item('pt-0040', 'Dorothy Ashworth', 'outside_scr_umol', ref('MedicationRequest/mr-t1-1601'), 'reduce', 'apixaban', 2.5, [ref('Observation/obs-t1-1604')]),
    item('pt-0039', 'Clarence Bauer', 'cg_crcl_weight_rule', ref('MedicationRequest/mr-t1-1501'), 'reduce', 'rivaroxaban', 15, [ref('Observation/obs-t1-1503'), ref('Observation/obs-t1-1504')]),
    item('pt-0003', 'Frank Delgado', 'outside_scr_umol', ref('MedicationRequest/mr-t1-1301'), 'reduce', 'rivaroxaban', 15, [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')]),
    item('pt-0041', 'Raymond Duquette', 'pgp_cyp3a4_inhibitor', ref('MedicationRequest/mr-t1-1701'), 'reduce', 'apixaban', 2.5, [ref('MedicationRequest/mr-t1-1703')]),
    item('pt-0001', 'Walter Kowalczyk', 'apixaban_two_of_three', ref('MedicationRequest/mr-t1-1101'), 'reduce', 'apixaban', 2.5, [ref('Observation/obs-t1-1103')]),
    item('pt-0045', 'Gregory Lindahl', 'pgp_cyp3a4_inhibitor', ref('MedicationRequest/mr-t1-1901'), 'reduce', 'apixaban', 2.5, [ref('DocumentReference/doc-t1-1901')]),
    item('pt-0038', 'Eugene Moravec', 'cg_crcl_weight_rule', ref('MedicationRequest/mr-t1-1401'), 'increase', 'rivaroxaban', 20, [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405')]),
    item('pt-0043', 'Marjorie Pellegrino', 'filler', ref('MedicationRequest/mr-t1-1801'), 'unchanged', 'rivaroxaban', 20, [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')]),
    item('pt-0002', 'Harold Vance', 'apixaban_two_of_three', ref('MedicationRequest/mr-t1-apixaban'), 'increase', 'apixaban', 5, [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')]),
  ] as Item[],
};

// R29: the atoms of each snippet-visible decisive record, the minimal facts of its deciding line
// that decide the item; a read or one snippet that shows them all counts as seen (tests/grader.ts
// firstSeenBy, for the gates and attribution alike). The letter decides pt-0045's dose by the
// inhibitor it lists; §2 counts ritonavir at any dose ('including ritonavir given as a booster'),
// so its dose is not an atom (R26: the old phrase 'ritonavir 100 mg' missed a snippet cut after
// '100'). The item's own drug (apixaban) is never an atom. tests/phrases.test.ts sweeps every
// snippet.
export const DECISIVE_ATOMS: Record<string, readonly string[]> = { [ref('DocumentReference/doc-t1-1901')]: ['ritonavir'] };
