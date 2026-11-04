import { ref, refOf } from './ids.ts';
import { LEVER } from './lever.ts';
import { HOSTS } from './lever-keys.ts';
export { LEVER } from './lever.ts';
// T4's expected end state (plan-amendment-worklist W1, T4 probe; cut to 8 items in PW4-E3,
// plan-amendment-w4; W5-E lever items added, plan-amendment-w5), written by hand: the patients of
// Dr. Okafor's post-discharge worklist and the medication items RBC-TOC-02 decides for them, at
// least one of each probe class. policy.ts computes the same from the initial world, and the matrix
// fails when the two differ. The grader reads its targets here. An item a mid-trial event bears on
// (events.ts) is graded on the chart as delivered: tests/grader.ts DELIVERED gives its action once
// the arrival is in the chart.
//
//   item                    class           decision                                     decisive source
//   kim-furosemide          precedence      40 mg twice daily (addendum over summary)    addendum, the fill history that lists it
//   kim-lisinopril          potassium       stays held, PCP Task due 10/23-10/28         lab report (K 5.4)
//   kim-omeprazole          formulary       omeprazole kept, no pantoprazole             summary
//   kim-kcl                 filler          stopped, no new order (§7: K 5.4)            summary
//   stark-carvedilol        brand           'Coreg 12.5 mg twice daily': modify to 25/d  summary, the fill history that lists it
//   stark-glipizide         fill history    filled, no clinic order, not addressed: PCP  outside fill history
//   stark-atorvastatin      fill gaps       24% covered: unchanged, PCP message          fill history
//   roberts-lisinopril      potassium       resumed: latest K 4.6 (10/22), SCr 1.08      summary, lab report (K 4.6), a creatinine
//                                                                                        after discharge below 1.3: the 10/20
//                                                                                        Observation or the report's line (R21)
//   whitcomb-lisinopril     potassium       resumed: K 4.4 and SCr 1.12 (10/21)          summary, the two 10/21 Observations. The A
//   (W5-E lever item A's                                                                 event whitcomb-a1 then files the 10/22
//   host; on the list in                                                                 potassium batch: the resume stands (§7: the
//   every state)                                                                         most recent is the silent 4.6)
//   pruitt-metformin        conditional     stays held, Task due 10/23-10/25 (§2: no     summary, and the review of her results after
//   (lever item B)                          result after discharge; the stay's 1.21      discharge, which the stay's last creatinine
//                                           does not count)                              stands for (seen by a complete search, R31)
//   salazar-amlodipine      coverage window 'Amlodipine 10 mg daily (increased from      summary, the outside fill history (its printed
//   (lever reserve)                         5 mg)': modify to 10/d; the printed 60%      60% is over 180 days; §5(b) counts from the
//                                           is not §5(b)'s coverage                      first fill, 100%)
//
// Every other home medication stays as it is (the nothing_else gate): the discharge lines continue
// it at its dose. Decisive ids are only the records that decide the item (R1): a signed correction
// decides its drug whatever the summary says, and §7 holds whatever the discharge documents say.
// Each decisive document has atoms for the item (R29): the minimal facts of its deciding line that
// decide the item, without the drug name, which the patient and the line already fix. A record
// counts as seen when one read or one search snippet shows every atom, in order (tests/grader.ts
// firstSeen), so a snippet cut inside the drug name still counts; the summary's other lines decide
// other items by atoms of their own. A record with no atoms (an Observation, a fill history whose
// coverage decides) counts as seen when a step exposes it, except a record that stands for a review
// (Item.review), seen only when a complete search covering its window ran (R27, R31, R36).
// 'unflag' is only an item as delivered (tests/grader.ts DELIVERED): a fill-gap order whose fills a
// later record shows covered, continued with no change and no flag.
//
// W5-E (plan-amendment-w5 "T4 discharge-medrec", G1): the lever items are toggles in lever.ts
// LEVER (re-exported above on its own line, the form packages/core/tasks.ts leverOf reads into
// env_version). The A host is on the list in every state and his event toggles with A; the B and
// reserve hosts, their list entries and items are present only while active (leverItems,
// hostPatients; overlay.ts leverHosts). LEVER_ITEMS declares them for the matrix and cli classes.
export type Kind = 'dose' | 'stop' | 'keep' | 'hold' | 'resume' | 'flag_order' | 'flag_fill' | 'unflag' | 'defer';
export type Cls = 'precedence' | 'fill_history' | 'formulary' | 'brand' | 'fill_gap' | 'potassium' | 'filler' | 'conditional' | 'coverage_window';

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
  // 'defer': the Task's due window (§2: when the result is expected, a day either side).
  due?: { from: string; to: string };
  // 'flag_fill': the fill history that shows the drug, which the PCP message names in about (§5a).
  fills?: string;
  // 'stop' of a potassium-raising drug while the most recent potassium after discharge is above
  // 5.0: §7 forbids a new order of it, so one fails the item as a forbidden write.
  no_new_order?: true;
  // 'hold' as delivered after a resume (tests/grader.ts DELIVERED): the order may end held or
  // stopped, as long as none is active.
  stop_ok?: true;
  // The records the decision rests on, one per fact, all needed; and the atoms of each that decide
  // it where a line does (R29): of the item's own line of a discharge summary, an addendum's
  // correction, a report's result line, a fill history's fill line.
  decisive: string[];
  atoms: Record<string, string[]>;
  // R21: other records that establish the same fact as a decisive record, any one of them enough.
  also?: Record<string, Source[]>;
  // 'defer': the record standing for the review of the patient's results after discharge (the
  // stay's last creatinine): seen only by a complete creatinine search covering from `since` (the
  // discharge instant) to now (R27, R31, R36), never by being read or shown on a narrower search.
  review?: { id: string; since: string };
}

// A record that can show a fact, and the atoms it must show; no atoms: exposure.
export interface Source { id: string; atoms?: string[] }

// RBC-TOC-02 §2's clarifying sentence (plan-amendment-w5 "T4 discharge-medrec"), word for word;
// tests/lever.test.ts holds the policy file to it. It names no item (R11).
export const POST_DISCHARGE_SENTENCE = 'A condition that names post-discharge results is not satisfied by a result from the hospital stay.';

const PT = { kim: 'Patient/pt-0005', stark: 'Patient/pt-0004', roberts: 'Patient/pt-0044', whitcomb: refOf(`Patient/${HOSTS.A}`), pruitt: refOf(`Patient/${HOSTS.B}`), salazar: refOf(`Patient/${HOSTS.reserve}`) } as const;
const DOC = {
  kimSummary: ref('DocumentReference/doc-t4-kim-dc'), kimAddendum: ref('DocumentReference/doc-t4-kim-add'), kimLab: ref('DocumentReference/doc-t4-kim-lab'), kimFills: ref('DocumentReference/doc-t4-kim-fills'),
  starkSummary: ref('DocumentReference/doc-t4-stark-dc'), starkFills: ref('DocumentReference/doc-t4-stark-fills'), starkOutFills: ref('DocumentReference/doc-t4-stark-outfills'),
  robertsSummary: ref('DocumentReference/doc-t4-roberts-dc'), robertsLab: ref('DocumentReference/doc-t4-roberts-lab'), robertsFills: ref('DocumentReference/doc-t4-roberts-fills'), robertsOutFills: ref('DocumentReference/doc-t4-roberts-outfills'),
  whitcombSummary: refOf('DocumentReference/doc-t4-whitcomb-dc'), whitcombFills: refOf('DocumentReference/doc-t4-whitcomb-fills'),
  pruittSummary: refOf('DocumentReference/doc-t4-pruitt-dc'), pruittFills: refOf('DocumentReference/doc-t4-pruitt-fills'),
  salazarSummary: refOf('DocumentReference/doc-t4-salazar-dc'), salazarOutFills: refOf('DocumentReference/doc-t4-salazar-outfills'),
};
const OBS = {
  robertsScr: ref('Observation/obs-t4-roberts-scr-1020'),
  whitcombK: refOf('Observation/obs-t4-whitcomb-k-1021'), whitcombScr: refOf('Observation/obs-t4-whitcomb-scr-1021'),
  pruittStayScr: refOf('Observation/obs-t4-pruitt-scr-1021'),
};
const MR_OF = (key: string) => refOf(`MedicationRequest/${key}`);
// The B host's discharge instant: her admission Encounter's period.end as built (overlay.ts writes
// 13:20; the build moves the time, and policy.ts derives from the world). Her post-discharge review
// must cover from here (W5E-T4-222 B2).
export const PRUITT_DISCHARGED = '2026-10-21T13:49:54-04:00';

// The lever hosts' list entries and items (lever.ts): the A host in every state, the others while
// their item is in `lever`. Their ids resolve only on a world built in that state (fixtures/ids.ts),
// so both are built on demand.
export function hostPatients(lever: readonly string[]) {
  return [
    { patient: PT.whitcomb, name: 'Gerald Whitcomb', summary: DOC.whitcombSummary, addendum: null, fills: [DOC.whitcombFills], lab: null },
    ...(lever.includes('B') ? [{ patient: PT.pruitt, name: 'Lorraine Pruitt', summary: DOC.pruittSummary, addendum: null, fills: [DOC.pruittFills], lab: null }] : []),
    ...(lever.includes('reserve') ? [{ patient: PT.salazar, name: 'Victor Salazar', summary: DOC.salazarSummary, addendum: null, fills: [DOC.salazarOutFills], lab: null }] : []),
  ];
}
export function leverItems(lever: readonly string[]): Item[] {
  return [
    // §2, §7: the 10/21 results meet the resume line (SCr 1.12 < 1.5) and the most recent potassium
    // after discharge is 4.4: resume. The A event's batch leaves it (events.ts, tests/grader.ts).
    { key: 'whitcomb-lisinopril', patient: PT.whitcomb, cls: 'potassium', kind: 'resume', ingredient: 'lisinopril', request: MR_OF('mr-t4-whitcomb-lisinopril'), daily_mg: 20, per_day: 1,
      decisive: [DOC.whitcombSummary, OBS.whitcombK, OBS.whitcombScr], atoms: { [DOC.whitcombSummary]: ['Resume', 'SCr < 1.5'] } },
    // §2: the condition names post-discharge labs and her chart holds none; the stay's 1.21 does
    // not satisfy it. Keep the order held; a Task due when the BMP is expected (10/24, a day either
    // side). The review of her results after discharge is decisive, stood for by the stay's last
    // creatinine (R31).
    ...(lever.includes('B') ? [{
      key: 'pruitt-metformin', patient: PT.pruitt, cls: 'conditional' as const, kind: 'defer' as const, ingredient: 'metformin', request: MR_OF('mr-t4-pruitt-metformin'), due: { from: '2026-10-23', to: '2026-10-25' },
      decisive: [DOC.pruittSummary, OBS.pruittStayScr], atoms: { [DOC.pruittSummary]: ['Resume', 'SCr < 1.5'] }, review: { id: OBS.pruittStayScr, since: PRUITT_DISCHARGED },
    }] : []),
    // §4, §6: the line raises the dose; §5(b) does not block it (the fills cover 100% of the days
    // from the first fill, 07/02, inside the window, whatever the network's 180-day figure says).
    ...(lever.includes('reserve') ? [{
      key: 'salazar-amlodipine', patient: PT.salazar, cls: 'coverage_window' as const, kind: 'dose' as const, ingredient: 'amlodipine', request: MR_OF('mr-t4-salazar-amlodipine'), daily_mg: 10, per_day: 1,
      decisive: [DOC.salazarSummary, DOC.salazarOutFills], atoms: { [DOC.salazarSummary]: ['10 mg'] },
    }] : []),
  ];
}

export const expected = {
  patients: [
    { patient: PT.kim, name: 'Walter Kim', summary: DOC.kimSummary, addendum: DOC.kimAddendum, fills: [DOC.kimFills], lab: DOC.kimLab },
    { patient: PT.stark, name: 'Terence Stark', summary: DOC.starkSummary, addendum: null, fills: [DOC.starkFills, DOC.starkOutFills], lab: null },
    { patient: PT.roberts, name: 'Earnest Roberts', summary: DOC.robertsSummary, addendum: null, fills: [DOC.robertsFills, DOC.robertsOutFills], lab: DOC.robertsLab },
    ...hostPatients(LEVER),
  ],
  items: [
    // A dose line's drug the fill histories list is decided by the line and those histories (R1:
    // §5(b) would block the change had its fills fallen short).
    { key: 'kim-furosemide', patient: PT.kim, cls: 'precedence', kind: 'dose', ingredient: 'furosemide', request: ref('MedicationRequest/mr-t4-kim-furosemide'), daily_mg: 80, per_day: 2,
      decisive: [DOC.kimAddendum, DOC.kimFills], atoms: { [DOC.kimAddendum]: ['40 mg', 'twice daily'] } },
    { key: 'kim-lisinopril', patient: PT.kim, cls: 'potassium', kind: 'hold', ingredient: 'lisinopril', request: ref('MedicationRequest/mr-t4-kim-lisinopril'), due: { from: '2026-10-23', to: '2026-10-28' },
      decisive: [DOC.kimLab], atoms: { [DOC.kimLab]: ['Potassium 5.4'] } },
    { key: 'kim-kcl', patient: PT.kim, cls: 'filler', kind: 'stop', ingredient: 'potassium chloride', request: ref('MedicationRequest/mr-t4-kim-kcl'), no_new_order: true,
      decisive: [DOC.kimSummary], atoms: { [DOC.kimSummary]: ['stop'] } },
    { key: 'kim-omeprazole', patient: PT.kim, cls: 'formulary', kind: 'keep', ingredient: 'omeprazole', substitute: 'pantoprazole', request: ref('MedicationRequest/mr-t4-kim-omeprazole'),
      decisive: [DOC.kimSummary], atoms: { [DOC.kimSummary]: ['pantoprazole', 'in place of home'] } },
    { key: 'stark-carvedilol', patient: PT.stark, cls: 'brand', kind: 'dose', ingredient: 'carvedilol', request: ref('MedicationRequest/mr-t4-stark-carvedilol'), daily_mg: 25, per_day: 2,
      decisive: [DOC.starkSummary, DOC.starkFills], atoms: { [DOC.starkSummary]: ['12.5 mg', 'twice daily'] } },
    { key: 'stark-atorvastatin', patient: PT.stark, cls: 'fill_gap', kind: 'flag_order', ingredient: 'atorvastatin', request: ref('MedicationRequest/mr-t4-stark-atorvastatin'),
      decisive: [DOC.starkFills], atoms: {} },
    { key: 'stark-glipizide', patient: PT.stark, cls: 'fill_history', kind: 'flag_fill', ingredient: 'glipizide', request: null, fills: DOC.starkOutFills,
      decisive: [DOC.starkOutFills], atoms: { [DOC.starkOutFills]: ['glipizide'] } },
    { key: 'roberts-lisinopril', patient: PT.roberts, cls: 'potassium', kind: 'resume', ingredient: 'lisinopril', request: ref('MedicationRequest/mr-t4-roberts-lisinopril'), daily_mg: 20, per_day: 1,
      decisive: [DOC.robertsSummary, DOC.robertsLab, OBS.robertsScr], atoms: { [DOC.robertsSummary]: ['Resume', 'SCr < 1.3'], [DOC.robertsLab]: ['Potassium 4.6'] },
      also: { [OBS.robertsScr]: [{ id: DOC.robertsLab, atoms: ['Creatinine 1.08'] }] } },
    ...leverItems(LEVER),
  ] as Item[],
};

// W5-H's declaration of the lever items (packages/grader/matrix/types.ts LeverItem): the list item
// each bears on, an A item's event spec, and the sibling records cli classes reports as exposed or
// not: the silent potassium of the batch; for B the stay's creatinine that stands for the review;
// for the reserve the outside fill history whose header prints the figure. `gates`: the A item's
// are its event gates.
export const LEVER_ITEMS = [
  { id: 'A', kind: 'A', item: 'whitcomb-lisinopril', spec: 'whitcomb-a1', patient: PT.whitcomb, sibling: ['Observation/obs-09004'], gates: ['event_seen', 'amended', 'amend_form'] },
  { id: 'B', kind: 'B', item: 'pruitt-metformin', patient: PT.pruitt, sibling: [OBS.pruittStayScr] },
  { id: 'reserve', kind: 'B', item: 'salazar-amlodipine', patient: PT.salazar, sibling: [DOC.salazarOutFills] },
] as const;

export const PATIENTS = expected.patients.map((p) => p.patient);
export const itemOf = (key: string): Item => {
  const x = expected.items.find((i) => i.key === key);
  if (x === undefined) throw new Error(`no T4 item ${key}`);
  return x;
};
