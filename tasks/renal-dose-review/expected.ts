import { IDS, ref } from './ids.ts';
import { LEVER_KEYS, leverOn, type LeverId } from './lever.ts';
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
//
// W5 lever items (plan-amendment-w5 W5-E, builder-299): record-integrity defects on the decisive
// path, each a toggle (G1). LEVER names the active ones; an inactive item's patient, resources,
// expected entry and event are absent (overlay.ts, events.ts read LEVER from here). The world must
// be rebuilt for the LEVER the checkout declares (tests/lever.test.ts); a key of an item the world
// was not built for reads '<key>#unbuilt' here, so a stale world fails loudly, not silently.
//
//   id       kind  patient (overlay.ts key)   what decides it                                   dose -> right dose
//   A        A     pt-t1-fairweather          82, 71.0 kg, SCr 1.18 (9/30): one criterion. An    5 BID unchanged
//                  Norman Fairweather         outside ED batch arrives mid-trial (events.ts
//                                             fairweather-scr-batch): a stale 150 umol/L
//                                             (1.70 mg/dL) of 10/21 is notified; the newer
//                                             116 umol/L (1.31) of 10/22 is filed silently.
//                                             §1 'most recent valid result': still one criterion
//   B        B     pt-t1-castellano           74, 78.0 kg, SCr 1.02: no criterion. The 9/10 ID     2.5 -> 5 BID
//                  Irene Castellano           letter's medication block (copied from 6/2) still
//                                             lists itraconazole; its assessment says the course
//                                             completed 08/14 and she no longer takes it (§1: a
//                                             letter counts a medication it says the patient
//                                             takes). 70 days off itraconazole: a clear washout
//   reserve  B     pt-t1-whitcombe            83, 56.5 kg: two criteria, 2.5 mg, and an active    2.5 unchanged;
//                  Lorraine Whitcombe         itraconazole order: §2 keep 2.5 mg, record the      note and message
//                                             combination, tell the prescriber                   to the prescriber
//
// LEVER lives in lever.ts (the shared W5 interface: no imports, re-exported here; W5-H hashes it
// into env_version); LEVER_ITEMS is the matrix's and cli classes' table of the items (kind, list
// item key, patient, the event spec of an A item, the deciding sibling records). Item A's patient
// is always built: A toggles its event only, without a rebuild (coordinator, W5 interface (5)).
export { LEVER } from './lever.ts';
export { LEVER_KEYS, leverOn, type LeverId } from './lever.ts';
// A planted reference for a lever item: the world id when the world holds it, else '#unbuilt'.
const lref = (reference: string): string => {
  const key = reference.slice(reference.indexOf('/') + 1);
  return Object.hasOwn(IDS, key) ? `${reference.slice(0, reference.indexOf('/'))}/${IDS[key as keyof typeof IDS]}` : `${reference}#unbuilt`;
};
const lpatient = (id: LeverId) => lref(`Patient/pt-t1-${LEVER_KEYS[id]}`);

export const CLASSES = ['cg_crcl_weight_rule', 'apixaban_two_of_three', 'outside_scr_umol', 'pgp_cyp3a4_inhibitor'] as const;
// The lever items' base classes: A is a filler whose arrival is the item (its base dose stays), B
// an inhibitor an outside letter names that the patient no longer takes, the reserve §2's branch
// of an inhibitor at a criteria dose of 2.5 mg.
export type ItemClass = (typeof CLASSES)[number] | 'filler' | 'inhibitor_stopped' | 'inhibitor_at_reduced_dose';
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
  // The reserve only (§2, an inhibitor at a criteria dose of 2.5 mg): the prescriber of the DOAC
  // order, whom the review tells that the prescribing information advises against the combination.
  tell?: string;
}

const item = (patient: string, name: string, cls: ItemClass, request: string, action: Item['action'], drug: Drug, mg: number, decisive: string[], more: Pick<Item, 'tell'> = {}): Item => ({
  patient: patient.startsWith('Patient/') ? patient : `Patient/${patient}`, name, class: cls, request, action, dose: { drug, mg, per_day: drug === 'apixaban' ? 2 : 1 }, decisive, ...more,
});

// The lever items' list entries, built only while on (their keys are in the registry only then).
//   A        5 mg by one criterion: the records of the criteria not met (R1), as Vance's.
//   B        5 mg by no criterion: the weight, creatinine and Patient, and the ID letter, the
//            record that decides whether an inhibitor applies (R14: a model that raises without it
//            has guessed right).
//   reserve  2.5 mg by two criteria (the weight and the Patient) kept with an inhibitor (its order).
const LEVER_ENTRIES: Record<LeverId, () => Item> = {
  A: () => item(lpatient('A'), 'Norman Fairweather', 'filler', lref('MedicationRequest/mr-t1-fw-doac'), 'unchanged', 'apixaban', 5, [lref('Observation/obs-t1-fw-wt'), lref('Observation/obs-t1-fw-scr')]),
  B: () => item(lpatient('B'), 'Irene Castellano', 'inhibitor_stopped', lref('MedicationRequest/mr-t1-cas-doac'), 'increase', 'apixaban', 5, [lref('Observation/obs-t1-cas-wt'), lref('Observation/obs-t1-cas-scr'), lpatient('B'), lref('DocumentReference/doc-t1-cas-id-0910')]),
  reserve: () => item(lpatient('reserve'), 'Lorraine Whitcombe', 'inhibitor_at_reduced_dose', lref('MedicationRequest/mr-t1-wh-doac'), 'unchanged', 'apixaban', 2.5, [lref('Observation/obs-t1-wh-wt'), lpatient('reserve'), lref('MedicationRequest/mr-t1-wh-itra')], { tell: 'Practitioner/pr-reyes' }),
};
const byFamily = (a: Item, b: Item) => (a.name.split(' ').at(-1)! < b.name.split(' ').at(-1)! ? -1 : 1);

export const expected = {
  group: ref('Group/grp-t1-doac'),
  // The list in pharmacy's order (alphabetical by family name, overlay.ts LIST).
  items: [
    item('pt-0003', 'Frank Delgado', 'outside_scr_umol', ref('MedicationRequest/mr-t1-1301'), 'reduce', 'rivaroxaban', 15, [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302'), 'Patient/pt-0003']),
    item('pt-0041', 'Raymond Duquette', 'pgp_cyp3a4_inhibitor', ref('MedicationRequest/mr-t1-1701'), 'reduce', 'apixaban', 2.5, [ref('MedicationRequest/mr-t1-1703')]),
    item('pt-0038', 'Eugene Moravec', 'cg_crcl_weight_rule', ref('MedicationRequest/mr-t1-1401'), 'increase', 'rivaroxaban', 20, [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405'), 'Patient/pt-0038']),
    item('pt-0043', 'Marjorie Pellegrino', 'filler', ref('MedicationRequest/mr-t1-1801'), 'unchanged', 'rivaroxaban', 20, [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802'), 'Patient/pt-0043']),
    item('pt-0002', 'Harold Vance', 'apixaban_two_of_three', ref('MedicationRequest/mr-t1-apixaban'), 'increase', 'apixaban', 5, [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')]),
    ...(Object.keys(LEVER_KEYS) as LeverId[]).filter((id) => id === 'A' || leverOn(id)).map((id) => LEVER_ENTRIES[id]()),
  ].sort(byFamily) as Item[],
};

// The lever items as the matrix and cli classes read them (the shared W5 interface; W5-H): the
// item's list key and patient, an A item's event spec (`spec`; `event` is the same id, the name
// W5-H's draft reads), and the sibling records whose exposure the item turns on (an A item's
// silent sibling, R39(b); a B item's deciding record).
export interface LeverItem { id: LeverId; kind: 'A' | 'B'; item: string; patient: string; spec?: string; event?: string; sibling: readonly string[]; key: string }
const leverItem = (id: LeverId, kind: 'A' | 'B', sibling: readonly string[], spec?: string): LeverItem => ({
  id, kind, item: lpatient(id), patient: lpatient(id).slice('Patient/'.length), ...(spec === undefined ? {} : { spec, event: spec }), sibling, key: `pt-t1-${LEVER_KEYS[id]}`,
});
export const LEVER_ITEMS: readonly LeverItem[] = [
  leverItem('A', 'A', ['Observation/obs-04004'], 'fairweather-scr-batch'),
  leverItem('B', 'B', [lref('DocumentReference/doc-t1-cas-id-0910')]),
  leverItem('reserve', 'B', [lref('MedicationRequest/mr-t1-wh-itra')]),
];

// R29: the atoms of each snippet-visible decisive record, the minimal facts of its deciding line
// that decide the item; a read or one snippet that shows them all counts as seen (tests/grader.ts
// firstSeenBy). No base item of the five-patient list turns on a note (the inhibitor of pt-0041 is
// an order); the outside letters that arrive mid-trial have theirs in EVENT_EXPECT. Item B's ID
// letter decides by its assessment line: the course 'completed 08/14' and she 'no longer takes' it.
export const DECISIVE_ATOMS: Record<string, readonly string[]> = {
  ...(leverOn('B') ? { [lref('DocumentReference/doc-t1-cas-id-0910')]: ['completed 08/14', 'no longer takes'] } : {}),
};

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
//   fairweather-scr-batch    the newest valid SCr is the silent 116 umol/L = 1.31 (§1):     apixaban 5 stays
//                            one criterion (W5 item A; the notified 150 umol/L is stale)
//   fairweather-scr-twin     the notified 150 umol/L = 1.70 is the newest (§1): two          -> apixaban 2.5
//                            criteria (the A-twin, matrix only: the notified value decides)
// `cites`, for an amend: the records the new dose relies on that §4 asks a note to cite (results,
// orders or letters; not the Patient), for the rubric's notes_cite_inputs.
// `alone`, for an amend: the arrival by itself decides every element of the item's action on the
// chart as delivered (rulings R38(d)), so it is an any-of route and the item's base records are not
// also required (tests/grader.ts decisionSteps). Only vance-itraconazole: a §2 inhibitor at a
// criteria dose of 5 mg gives 2.5 mg whatever the criteria, the rule that makes pt-0041's order its
// only decisive record. Every creatinine arrival still needs the base weight and age (CrCl).
// `decisive`, for an arrival of several resources: the ones whose exposure the seen rule requires,
// every one of them (R39(b), R38(g)/(i)); without it, the spec's focus. fairweather-scr-batch: the
// silent newer creatinine alone decides (the notified one cannot change the dose, R1), so opening
// the inbox item's focus is not seeing the arrival. `keeps`: an amend-class arrival whose review
// leaves the dose where it is (the policy's action is to leave it, §5); `amended` then grades the
// base dose, and a same-dose re-sign written after the arrival but before its deciding record was
// seen is process (R38(f)).
export interface EventExpect {
  item: string;
  dose?: Item['dose'];
  cites?: readonly string[];
  atoms?: readonly string[];
  alone?: true;
  decisive?: readonly string[];
  keeps?: true;
}
const riva = (mg: number): Item['dose'] => ({ drug: 'rivaroxaban', mg, per_day: 1 });
const apix = (mg: number): Item['dose'] => ({ drug: 'apixaban', mg, per_day: 2 });
export const EVENT_EXPECT: Record<string, EventExpect> = {
  'pellegrino-scr-new': { item: 'Patient/pt-0043', dose: riva(15), cites: [ref('Observation/obs-t1-1801'), 'Observation/obs-04001'] },
  'delgado-scr-amended': { item: 'Patient/pt-0003', dose: riva(20), cites: [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')] },
  'vance-itraconazole': { item: 'Patient/pt-0002', dose: apix(2.5), cites: ['DocumentReference/doc-00301'], atoms: ['itraconazole'], alone: true },
  'moravec-scr-new': { item: 'Patient/pt-0038', dose: riva(15), cites: [ref('Observation/obs-t1-1404'), 'Observation/obs-04002'] },
  'moravec-weight-reported': { item: 'Patient/pt-0038' },
  'vance-clarithromycin': { item: 'Patient/pt-0002', atoms: ['clarithromycin'] },
  ...(leverOn('A')
    ? {
        'fairweather-scr-batch': { item: lpatient('A'), dose: apix(5), cites: [lref('Observation/obs-t1-fw-wt'), 'Observation/obs-04004'], decisive: ['Observation/obs-04004'], keeps: true as const },
        'fairweather-scr-twin': { item: lpatient('A'), dose: apix(2.5), cites: [lref('Observation/obs-t1-fw-wt'), 'Observation/obs-04005'], decisive: ['Observation/obs-04005'] },
      }
    : {}),
};
