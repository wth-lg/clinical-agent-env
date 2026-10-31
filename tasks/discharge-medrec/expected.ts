import { ref } from './ids.ts';
// T4's expected end state (plan-amendment-worklist W1, T4 probe), written by hand: the four
// patients of Dr. Okafor's post-discharge worklist and the 13 medication items RBC-TOC-02 decides
// for them, two of each kept class and one filler. policy.ts computes the same from the initial
// world, and the matrix fails when the two differ. The grader reads its targets here.
//
//   item                    class           decision                                     decisive source
//   kim-furosemide          precedence      40 mg twice daily (addendum over summary)    addendum
//   kim-lisinopril          potassium       stays held, PCP Task due 10/23-10/28         lab report (K 5.4)
//   kim-omeprazole          formulary       omeprazole kept, no pantoprazole             summary
//   kim-kcl                 filler          stopped, no new order (§7: K 5.4)            summary
//   stark-carvedilol        brand           'Coreg 12.5 mg twice daily': modify to 25/d  summary
//   stark-glipizide         fill history    filled, no clinic order, not addressed: PCP  outside fill history
//   stark-atorvastatin      fill gaps       24% covered: unchanged, PCP message          fill history
//   thompson-nifedipine     brand           'Procardia XL 60 mg daily': modify to 60/d   summary
//   thompson-hctz           precedence      stopped (addendum over summary)              addendum
//   thompson-levothyroxine  fill gaps       41% covered: unchanged, PCP message          fill history
//   roberts-lisinopril      potassium       resumed: latest K 4.6 (10/22), SCr 1.08      summary, lab report (K 4.6), a creatinine
//                                                                                        after discharge below 1.3: the 10/20
//                                                                                        Observation or the report's line (R21)
//   roberts-rosuvastatin    formulary       rosuvastatin kept, no atorvastatin           summary
//   roberts-sertraline      fill history    filled, no clinic order, not addressed: PCP  outside fill history
//
// Every other home medication stays as it is (the nothing_else gate): the discharge lines continue
// it at its dose. Decisive ids are only the records that decide the item (R1): a signed correction
// decides its drug whatever the summary says, and §7 holds whatever the discharge documents say.
// Each decisive document has atoms for the item (R29): the minimal facts of its deciding line that
// decide the item, without the drug name, which the patient and the line already fix. A record
// counts as seen when one read or one search snippet shows every atom, in order (tests/grader.ts
// firstSeen), so a snippet cut inside the drug name still counts; the summary's other lines decide
// other items by atoms of their own. A record with no atoms (an Observation, a fill history whose
// coverage decides) counts as seen when a step exposes it.
export type Kind = 'dose' | 'stop' | 'keep' | 'hold' | 'resume' | 'flag_order' | 'flag_fill';
export type Cls = 'precedence' | 'fill_history' | 'formulary' | 'brand' | 'fill_gap' | 'potassium' | 'filler';

export interface Item {
  key: string;
  patient: string;
  cls: Cls;
  kind: Kind;
  // The item's drug (normalize.ts ingredient), and for 'keep' the substitute not to order.
  ingredient: string;
  substitute?: string;
  // The order the item decides (none for a filled drug with no clinic order).
  request: string | null;
  // 'dose' and 'resume': the dose the patient ends on, mg per day in doses per day.
  daily_mg?: number;
  per_day?: number;
  // 'hold': the PCP Task's due window (§7: 2 to 7 days after the potassium result).
  due?: { from: string; to: string };
  // 'flag_fill': the fill history that shows the drug, which the PCP message names in about (§5a).
  fills?: string;
  // 'stop' of a potassium-raising drug while the most recent potassium after discharge is above
  // 5.0: §7 forbids a new order of it, so one fails the item as a forbidden write.
  no_new_order?: true;
  // The records the decision rests on, one per fact, all needed; and the atoms of each that decide
  // it where a line does (R29): of the item's own line of a discharge summary, an addendum's
  // correction, a report's result line, a fill history's fill line.
  decisive: string[];
  atoms: Record<string, string[]>;
  // R21: other records that establish the same fact as a decisive record, any one of them enough.
  also?: Record<string, Source[]>;
}

// A record that can show a fact, and the atoms it must show; no atoms: exposure.
export interface Source { id: string; atoms?: string[] }

const PT = { kim: 'Patient/pt-0005', stark: 'Patient/pt-0004', thompson: 'Patient/pt-0042', roberts: 'Patient/pt-0044' } as const;
const DOC = {
  kimSummary: ref('DocumentReference/doc-t4-kim-dc'), kimAddendum: ref('DocumentReference/doc-t4-kim-add'), kimLab: ref('DocumentReference/doc-t4-kim-lab'),
  starkSummary: ref('DocumentReference/doc-t4-stark-dc'), starkFills: ref('DocumentReference/doc-t4-stark-fills'), starkOutFills: ref('DocumentReference/doc-t4-stark-outfills'),
  thompsonSummary: ref('DocumentReference/doc-t4-thompson-dc'), thompsonAddendum: ref('DocumentReference/doc-t4-thompson-add'), thompsonFills: ref('DocumentReference/doc-t4-thompson-fills'),
  robertsSummary: ref('DocumentReference/doc-t4-roberts-dc'), robertsLab: ref('DocumentReference/doc-t4-roberts-lab'), robertsFills: ref('DocumentReference/doc-t4-roberts-fills'), robertsOutFills: ref('DocumentReference/doc-t4-roberts-outfills'),
};
const OBS = { robertsScr: ref('Observation/obs-t4-roberts-scr-1020') };

export const expected = {
  patients: [
    { patient: PT.kim, name: 'Walter Kim', summary: DOC.kimSummary, addendum: DOC.kimAddendum, fills: [ref('DocumentReference/doc-t4-kim-fills')], lab: DOC.kimLab },
    { patient: PT.stark, name: 'Terence Stark', summary: DOC.starkSummary, addendum: null, fills: [DOC.starkFills, DOC.starkOutFills], lab: null },
    { patient: PT.thompson, name: 'Adelaide Thompson', summary: DOC.thompsonSummary, addendum: DOC.thompsonAddendum, fills: [DOC.thompsonFills], lab: null },
    { patient: PT.roberts, name: 'Earnest Roberts', summary: DOC.robertsSummary, addendum: null, fills: [DOC.robertsFills, DOC.robertsOutFills], lab: DOC.robertsLab },
  ],
  items: [
    { key: 'kim-furosemide', patient: PT.kim, cls: 'precedence', kind: 'dose', ingredient: 'furosemide', request: ref('MedicationRequest/mr-t4-kim-furosemide'), daily_mg: 80, per_day: 2,
      decisive: [DOC.kimAddendum], atoms: { [DOC.kimAddendum]: ['40 mg', 'twice daily'] } },
    { key: 'kim-lisinopril', patient: PT.kim, cls: 'potassium', kind: 'hold', ingredient: 'lisinopril', request: ref('MedicationRequest/mr-t4-kim-lisinopril'), due: { from: '2026-10-23', to: '2026-10-28' },
      decisive: [DOC.kimLab], atoms: { [DOC.kimLab]: ['Potassium 5.4'] } },
    { key: 'kim-kcl', patient: PT.kim, cls: 'filler', kind: 'stop', ingredient: 'potassium chloride', request: ref('MedicationRequest/mr-t4-kim-kcl'), no_new_order: true,
      decisive: [DOC.kimSummary], atoms: { [DOC.kimSummary]: ['stop'] } },
    { key: 'kim-omeprazole', patient: PT.kim, cls: 'formulary', kind: 'keep', ingredient: 'omeprazole', substitute: 'pantoprazole', request: ref('MedicationRequest/mr-t4-kim-omeprazole'),
      decisive: [DOC.kimSummary], atoms: { [DOC.kimSummary]: ['pantoprazole', 'in place of home'] } },
    { key: 'stark-carvedilol', patient: PT.stark, cls: 'brand', kind: 'dose', ingredient: 'carvedilol', request: ref('MedicationRequest/mr-t4-stark-carvedilol'), daily_mg: 25, per_day: 2,
      decisive: [DOC.starkSummary], atoms: { [DOC.starkSummary]: ['12.5 mg', 'twice daily'] } },
    { key: 'stark-atorvastatin', patient: PT.stark, cls: 'fill_gap', kind: 'flag_order', ingredient: 'atorvastatin', request: ref('MedicationRequest/mr-t4-stark-atorvastatin'),
      decisive: [DOC.starkFills], atoms: {} },
    { key: 'stark-glipizide', patient: PT.stark, cls: 'fill_history', kind: 'flag_fill', ingredient: 'glipizide', request: null, fills: DOC.starkOutFills,
      decisive: [DOC.starkOutFills], atoms: { [DOC.starkOutFills]: ['glipizide'] } },
    { key: 'thompson-nifedipine', patient: PT.thompson, cls: 'brand', kind: 'dose', ingredient: 'nifedipine', request: ref('MedicationRequest/mr-t4-thompson-nifedipine'), daily_mg: 60, per_day: 1,
      decisive: [DOC.thompsonSummary], atoms: { [DOC.thompsonSummary]: ['60 mg'] } },
    { key: 'thompson-hctz', patient: PT.thompson, cls: 'precedence', kind: 'stop', ingredient: 'hydrochlorothiazide', request: ref('MedicationRequest/mr-t4-thompson-hctz'),
      decisive: [DOC.thompsonAddendum], atoms: { [DOC.thompsonAddendum]: ['stop'] } },
    { key: 'thompson-levothyroxine', patient: PT.thompson, cls: 'fill_gap', kind: 'flag_order', ingredient: 'levothyroxine', request: ref('MedicationRequest/mr-t4-thompson-levothyroxine'),
      decisive: [DOC.thompsonFills], atoms: {} },
    { key: 'roberts-lisinopril', patient: PT.roberts, cls: 'potassium', kind: 'resume', ingredient: 'lisinopril', request: ref('MedicationRequest/mr-t4-roberts-lisinopril'), daily_mg: 20, per_day: 1,
      decisive: [DOC.robertsSummary, DOC.robertsLab, OBS.robertsScr], atoms: { [DOC.robertsSummary]: ['Resume', 'SCr < 1.3'], [DOC.robertsLab]: ['Potassium 4.6'] },
      also: { [OBS.robertsScr]: [{ id: DOC.robertsLab, atoms: ['Creatinine 1.08'] }] } },
    { key: 'roberts-rosuvastatin', patient: PT.roberts, cls: 'formulary', kind: 'keep', ingredient: 'rosuvastatin', substitute: 'atorvastatin', request: ref('MedicationRequest/mr-t4-roberts-rosuvastatin'),
      decisive: [DOC.robertsSummary], atoms: { [DOC.robertsSummary]: ['atorvastatin', 'in place of home'] } },
    { key: 'roberts-sertraline', patient: PT.roberts, cls: 'fill_history', kind: 'flag_fill', ingredient: 'sertraline', request: null, fills: DOC.robertsOutFills,
      decisive: [DOC.robertsOutFills], atoms: { [DOC.robertsOutFills]: ['sertraline'] } },
  ] as Item[],
};

export const PATIENTS = expected.patients.map((p) => p.patient);
export const itemOf = (key: string): Item => {
  const x = expected.items.find((i) => i.key === key);
  if (x === undefined) throw new Error(`no T4 item ${key}`);
  return x;
};
