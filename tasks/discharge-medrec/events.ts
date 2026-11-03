// T4's mid-trial events (plan-amendment-w4 PW4-E3; the core is packages/env/events.ts). Each is
// a record a post-discharge reconciliation really receives while it is under way: a repeat outside
// lab panel, an amended or new signed addendum from the hospital, an inpatient result filed late, a
// pharmacy's faxed dispensing record, a specialist's letter. Each enters the store after the trial's
// first committed write about that patient (after_write), and every passing route writes on that
// patient: each patient has an item whose expected action is a write (Kim: the furosemide dose;
// Stark: the carvedilol dose or the glipizide flag; Roberts: the lisinopril resume), so a trial that
// skips the review never fires the event and fails the item on its base gates (brief addendum 2).
// The inbox Task says only "New result" or "Outside document received" (packages/env/events.ts
// ARRIVAL_SUMMARY); no deciding fact is in it (R29).
//
// Each event cites the RBC-TOC-02 line that decides it (policy/rbc-toc-02.md). Amend events change
// the action the policy gives; lures do not (R19). policy.ts derives the same answer on the chart
// with each arrival added (tests/events.test.ts, "delivered double derivation").
//
//   id         item                class  arrival                                  policy line         expected action on the chart as delivered
//   kim-k1     kim-lisinopril      O      Northgate faxed repeat BMP, collected    §2, §7              resume lisinopril 10 mg daily: the most recent
//                                         10/23: potassium 4.7, creatinine 1.21                        potassium is no longer above 5.0 and SCr < 1.5
//   kim-k2     kim-furosemide      B      the signed addendum, amended: its         §1                  furosemide 40 mg once daily (the latest signed
//                                         correction now reads 40 mg daily                             addendum rules)
//   kim-d1     kim-lisinopril      D      an inpatient potassium of 4.1, collected  §7 (after           lisinopril stays held: the result is from before
//                                         10/18 (before discharge), filed late      discharge)          discharge and is not the most recent
//   kim-d2     kim-furosemide      D      an unsigned draft addendum: furosemide    §1 (signed)         unchanged: an unsigned draft is not a signed
//                                         60 mg twice daily                                            addendum
//   kim-d4     kim-omeprazole      D      the hospital pharmacy's faxed record of   §3, §5              omeprazole kept, no pantoprazole: a fill after
//                                         a pantoprazole fill on 10/19                                 discharge is not a home medication (§5 counts the
//                                                                                                      180 days before admission) and §3 reverts it
//   stark-s1   stark-carvedilol    B      a signed addendum: carvedilol 6.25 mg     §1, §4              carvedilol 6.25 mg twice daily, the home dose (a
//                                         twice daily, the increase reversed                           line at the same dose is no change)
//   stark-s2   stark-atorvastatin  O      the mail-order pharmacy's faxed fills:    §5(b), the          no change and no fill-gap flag: fills now cover
//                                         atorvastatin 06/02 and 08/31 (90 days)    arrivals sentence   100% of the window; a flag already sent is
//                                                                                                      corrected by a later message to the PCP
//   stark-d5   stark-glipizide     D      Valley Endocrinology's letter:           §1, §5(a)           glipizide not ordered, PCP flag as before: a
//                                         'glipizide 5 mg daily: continue'                             specialist's letter is not discharge documentation
//   roberts-r1 roberts-lisinopril  A      a clinic potassium of 5.5, collected      §7                  lisinopril held (not active) and a Task for the
//                                         10/23, final                                                 PCP due 10/25 to 10/30
//   whitcomb-a1 whitcomb-lisinopril A     Northgate's 10/22 potassium batch after  §7 ('most recent    the resume stands: the most recent potassium
//   (W5-E lever item A;                   the resume: 5.4 at 07:50, flagged H,      potassium after     after discharge is the 4.6; a hold on the 5.4
//   active while 'A' is in                with an inbox Task; 4.6 at 16:30 (a      discharge'), §8     is a decision the arrival does not change
//   lever.ts LEVER)                       same-day repeat), unflagged, filed with   (leave a decision
//                                         no inbox item                             the arrival does
//                                                                                   not change)
//   whitcomb-a1-twin (G4's   whitcomb-lisinopril A  the same batch shape: 5.4 at    §7                  lisinopril held (not active) and a Task for the
//   A-twin, matrix only;                  16:30 notified, 4.6 at 07:50 silent;                         PCP due 10/24 to 10/29: the notified value is
//   never active with whitcomb-a1)        the notified value is the newest                             the most recent
//
// whitcomb-a1 (R39(a)): the deciding resource is the silent sibling obs-09004 (the newer
// potassium) with the notified obs-09003; the inbox item's focus decides nothing on its own. The
// delivery mirrors Northgate's abnormal-only results routing: both file to the chart, only the
// high one makes an inbox item (his normal 10/21 results made none either). The seen rule
// requires both resources (R39(b), R38(i)); a tool route the policy names returns the sibling (an
// Observation search by code or date, §2 'a result in the patient's results'). It is an amend
// event whose policy action on the chart as delivered is the base one (R39(d)): a hold written
// on the notified value fails `amended`, as retrieval when the sibling was never shown and as
// reasoning when it was.
//
// ACTIVE (pilot-4a): kim-k1 (O, required), stark-s1 (B), roberts-r1 (A) and the lure kim-d2 (D),
// one event per item, plus each active lever item's event (LEVER_SPECS; W5-E). Each other spec is
// graded and its mutants run while it is active in tests/events.test.ts. No item has two amend
// events active together (EXCLUSIVE: the twin never runs with whitcomb-a1); kim-d1 and kim-d2 are
// second events on an item that has an amend event in SPECS, which the plan allows for a lure.
//
// Arrival ids follow the world's own numbering, past its highest DocumentReference (doc-00214) and
// Observation (obs-03552), as a record filed today is numbered (discover.test.ts asserts none is in
// the world before its trigger). kim-k2 replaces the addendum DocumentReference in place.
import type { EventSpec } from '../../packages/env/events.ts';
import { id, idOf } from './ids.ts';
import { HOSTS, LEVER } from './lever.ts';

type Resource = EventSpec['resources'][number];

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const KIM = { reference: 'Patient/pt-0005' };
const STARK = { reference: 'Patient/pt-0004' };
const ROBERTS = { reference: 'Patient/pt-0044' };
// The A host (lever.ts HOSTS, in the world in every state); its world id once the registry holds
// it, its key before the first build.
export const WHITCOMB = idOf(HOSTS.A);
const WHITCOMB_REF = { reference: `Patient/${WHITCOMB}` };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const NORTHGATE = { reference: `Organization/${id('org-t4-northgate')}` };
const BOATENG = { reference: `Practitioner/${id('pr-t4-boateng')}` };
const MENSAH = { reference: `Practitioner/${id('pr-t4-mensah')}` };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const doc = (rid: string, subject: { reference: string }, type: [string, string], text: string, extra: Record<string, unknown> = {}): Resource => ({
  resourceType: 'DocumentReference',
  id: rid,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: type[0], display: type[1] }], text: type[1] },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject,
  date: '2026-10-23T08:00:00-04:00',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(text) } }],
  ...extra,
} as Resource);

const potassium = (rid: string, subject: { reference: string }, at: string, value: number, performer: { reference: string }, encounter?: string, extra: Record<string, unknown> = {}): Resource => ({
  resourceType: 'Observation',
  id: rid,
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' }], text: 'Potassium [Moles/volume] in Serum or Plasma' },
  subject,
  ...(encounter ? { encounter: { reference: `Encounter/${encounter}` } } : {}),
  effectiveDateTime: at,
  issued: at,
  performer: [performer],
  valueQuantity: { value, unit: 'mmol/L', system: UCUM, code: 'mmol/L' },
  referenceRange: [{ low: { value: 3.5, unit: 'mmol/L', system: UCUM, code: 'mmol/L' }, high: { value: 5.1, unit: 'mmol/L', system: UCUM, code: 'mmol/L' } }],
  ...extra,
} as Resource);
// A flagged result, as the lab's interface marks it.
const HIGH = { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }] };
const REPEAT_NOTE = (after: string) => ({ note: [{ text: `Repeat specimen drawn at the ordering provider's request after the ${after} result.` }] });

const LAB_REPORT: [string, string] = ['11502-2', 'Laboratory report'];
const SUMMARY: [string, string] = ['18842-5', 'Discharge summary'];
const FILLS: [string, string] = ['10160-0', 'History of Medication use Narrative'];
const LETTER: [string, string] = ['11488-4', 'Consult note'];
const FILL_COLUMNS = "Fill date    Medication                                    Qty   Days' supply   Prescriber                                  Pharmacy";

// The arrival ids (see the header).
export const ARRIVAL = {
  kimK1: 'doc-00901', kimK2: id('doc-t4-kim-add'), kimD1: 'obs-09001', kimD2: 'doc-00902', kimD4: 'doc-00903',
  starkS1: 'doc-00904', starkS2: 'doc-00905', starkD5: 'doc-00906', robertsR1: 'obs-09002',
  // W5-E: the batch (the notified high value, the silent sibling) and its twin.
  whitcombA1High: 'obs-09003', whitcombA1Silent: 'obs-09004', whitcombTwinHigh: 'obs-09005', whitcombTwinSilent: 'obs-09006',
} as const;

// ---- whitcomb-a1 (A) and its twin --------------------------------------------------------------
// One batch from Northgate's interface: the flagged value is the inbox item's focus, the normal
// one is filed silently. Both carry the batch's issue time (stampFields). In whitcomb-a1 the
// silent sibling is the newer (a same-day repeat); in the twin the notified value is.
const WHITCOMB_A1_HIGH = potassium(ARRIVAL.whitcombA1High, WHITCOMB_REF, '2026-10-22T07:50:00-04:00', 5.4, NORTHGATE, undefined, HIGH);
const WHITCOMB_A1_SILENT = potassium(ARRIVAL.whitcombA1Silent, WHITCOMB_REF, '2026-10-22T16:30:00-04:00', 4.6, NORTHGATE, undefined, REPEAT_NOTE('07:50'));
const WHITCOMB_TWIN_HIGH = potassium(ARRIVAL.whitcombTwinHigh, WHITCOMB_REF, '2026-10-22T16:30:00-04:00', 5.4, NORTHGATE, undefined, HIGH);
const WHITCOMB_TWIN_SILENT = potassium(ARRIVAL.whitcombTwinSilent, WHITCOMB_REF, '2026-10-22T07:50:00-04:00', 4.6, NORTHGATE);

const KIM_K1 = `Northgate Outpatient Laboratory - Final Report
Patient: Walter Kim   DOB 1952-02-19
Ordering provider: Samuel Boateng, MD (St. Brigid Regional)   Copy to: Maya Okafor, MD (Riverbend Family Medicine)
Collected: 10/23/2026 06:52   Reported: 10/23/2026 07:47

Basic metabolic panel (repeat)
Sodium            139 mmol/L    (136-145)
Potassium         4.7 mmol/L    (3.5-5.1)
Chloride          102 mmol/L    (98-107)
Carbon dioxide    27 mmol/L     (22-29)
Urea nitrogen     21 mg/dL      (8-23)
Creatinine        1.21 mg/dL    (0.74-1.35)
Glucose           104 mg/dL     (70-99)  H
Calcium           9.4 mg/dL     (8.6-10.3)`;

const KIM_K2 = `St. Brigid Regional - Discharge Summary Addendum (signed; amended)
Patient: Walter Kim   DOB 1952-02-19
Admission 2026-10-14 to 2026-10-19. Service: Hospital Medicine.

Amended 10/23/2026: the correction signed on 10/19 recorded the inpatient diuretic dose of the day of discharge. The dose he was discharged on, checked against the discharge prescription and with the patient by telephone on 10/22, is once daily. This amendment replaces the earlier correction.

Correction: furosemide 40 mg daily.

All other discharge medications and follow-up are unchanged.

Samuel Boateng, MD`;

const KIM_D2 = `St. Brigid Regional - Discharge Summary Addendum (DRAFT, not signed)
Patient: Walter Kim   DOB 1952-02-19
Admission 2026-10-14 to 2026-10-19. Service: Hospital Medicine.

Draft started 10/19/2026 by the covering night hospitalist; not reviewed or signed by the attending physician.

Proposed correction: furosemide 60 mg twice daily.

This draft is not part of the signed medical record.`;

const KIM_D4 = `Outside medication history - pharmacy dispensing record
Patient: Walter Kim   DOB 1952-02-19
Source: St. Brigid Outpatient Pharmacy dispensing system, faxed 10/23/2026 to Riverbend Family Medicine.
Prescription fills from 10/19/2026 to the fax date, St. Brigid Outpatient Pharmacy only.

${FILL_COLUMNS}
10/19/2026   pantoprazole 40 mg DR tablet                   30    30             Samuel Boateng, MD                          St. Brigid Outpatient Pharmacy`;

const STARK_S1 = `St. Brigid Regional - Discharge Summary Addendum (signed)
Patient: Terence Stark   DOB 1950-10-05
Admission 2026-10-16 to 2026-10-20. Service: Hospital Medicine.

Reason for addendum: on the morning of discharge his heart rate was 48 to 52 on carvedilol 12.5 mg twice daily, with lightheadedness on standing. The increase was reversed before he left, and the discharge medication list was not updated.

Correction: carvedilol 6.25 mg twice daily: continue.

All other discharge medications and follow-up are unchanged.

Grace Mensah, MD`;

const STARK_S2 = `CareFirst Mail Pharmacy - dispensing record
Patient: Terence Stark   DOB 1950-10-05
Source: CareFirst Mail Pharmacy, faxed 10/23/2026 to Riverbend Family Medicine at the clinic's request. Mail-order fills are not reported to the pharmacy claims network.
Prescription fills from 12/01/2025 to the fax date, CareFirst Mail Pharmacy only.

${FILL_COLUMNS}
06/02/2026   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             CareFirst Mail Pharmacy
08/31/2026   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             CareFirst Mail Pharmacy`;

const STARK_D5 = `Valley Endocrinology - Clinic Letter
Patient: Terence Stark   DOB 1950-10-05
To: Maya Okafor, MD (Riverbend Family Medicine)   From: Anil Desai, MD
Visit: 10/14/2026

Type 2 diabetes on insulin 70/30 18 units twice daily; A1c 8.4%. Glipizide 5 mg daily was started in July and is tolerated without hypoglycemia on his log.

Plan: glipizide 5 mg daily: continue. A1c in 3 months.

Anil Desai, MD`;

const DOC_DATE = (rid: string) => [`DocumentReference/${rid}.date`];

export const SPECS: readonly EventSpec[] = [
  {
    id: 'kim-k1', item: 'kim-lisinopril', class: 'O', trigger: { kind: 'after_write', patient: 'pt-0005' },
    resources: [doc(ARRIVAL.kimK1, KIM, LAB_REPORT, KIM_K1, { author: [NORTHGATE], custodian: CLINIC, description: 'Outside lab report (scanned)' })],
    stampFields: DOC_DATE(ARRIVAL.kimK1),
  },
  {
    id: 'kim-k2', item: 'kim-furosemide', class: 'B', trigger: { kind: 'after_write', patient: 'pt-0005' },
    resources: [doc(ARRIVAL.kimK2, KIM, SUMMARY, KIM_K2, {
      docStatus: 'amended', author: [BOATENG], authenticator: BOATENG, custodian: HOSPITAL, description: 'Signed addendum (amended)',
      relatesTo: [{ code: 'appends', target: { reference: `DocumentReference/${id('doc-t4-kim-dc')}` } }],
      context: { encounter: [{ reference: `Encounter/${id('enc-t4-kim-adm')}` }] },
    })],
    stampFields: DOC_DATE(ARRIVAL.kimK2),
  },
  {
    id: 'kim-d1', item: 'kim-lisinopril', class: 'D', trigger: { kind: 'after_write', patient: 'pt-0005' },
    resources: [potassium(ARRIVAL.kimD1, KIM, '2026-10-18T05:41:17-04:00', 4.1, HOSPITAL, id('enc-t4-kim-adm'))],
    stampFields: [`Observation/${ARRIVAL.kimD1}.issued`],
  },
  {
    id: 'kim-d2', item: 'kim-furosemide', class: 'D', trigger: { kind: 'after_write', patient: 'pt-0005' },
    resources: [doc(ARRIVAL.kimD2, KIM, SUMMARY, KIM_D2, {
      docStatus: 'preliminary', author: [HOSPITAL], custodian: HOSPITAL, description: 'Draft addendum (unsigned)',
      relatesTo: [{ code: 'appends', target: { reference: `DocumentReference/${id('doc-t4-kim-dc')}` } }],
      context: { encounter: [{ reference: `Encounter/${id('enc-t4-kim-adm')}` }] },
    })],
    stampFields: DOC_DATE(ARRIVAL.kimD2),
  },
  {
    id: 'kim-d4', item: 'kim-omeprazole', class: 'D', trigger: { kind: 'after_write', patient: 'pt-0005' },
    resources: [doc(ARRIVAL.kimD4, KIM, FILLS, KIM_D4, { author: [HOSPITAL], custodian: CLINIC, description: 'Outside pharmacy fill history' })],
    stampFields: DOC_DATE(ARRIVAL.kimD4),
  },
  {
    id: 'stark-s1', item: 'stark-carvedilol', class: 'B', trigger: { kind: 'after_write', patient: 'pt-0004' },
    resources: [doc(ARRIVAL.starkS1, STARK, SUMMARY, STARK_S1, {
      author: [MENSAH], authenticator: MENSAH, custodian: HOSPITAL, description: 'Signed addendum',
      relatesTo: [{ code: 'appends', target: { reference: `DocumentReference/${id('doc-t4-stark-dc')}` } }],
      context: { encounter: [{ reference: `Encounter/${id('enc-t4-stark-adm')}` }] },
    })],
    stampFields: DOC_DATE(ARRIVAL.starkS1),
  },
  {
    id: 'stark-s2', item: 'stark-atorvastatin', class: 'O', trigger: { kind: 'after_write', patient: 'pt-0004' },
    resources: [doc(ARRIVAL.starkS2, STARK, FILLS, STARK_S2, { author: [OKAFOR], custodian: CLINIC, description: 'Outside pharmacy fill history' })],
    stampFields: DOC_DATE(ARRIVAL.starkS2),
  },
  {
    id: 'stark-d5', item: 'stark-glipizide', class: 'D', trigger: { kind: 'after_write', patient: 'pt-0004' },
    resources: [doc(ARRIVAL.starkD5, STARK, LETTER, STARK_D5, { custodian: CLINIC, description: 'Outside specialist letter (scanned)' })],
    stampFields: DOC_DATE(ARRIVAL.starkD5),
  },
  {
    id: 'roberts-r1', item: 'roberts-lisinopril', class: 'A', trigger: { kind: 'after_write', patient: 'pt-0044' },
    resources: [potassium(ARRIVAL.robertsR1, ROBERTS, '2026-10-23T07:18:43-04:00', 5.5, CLINIC)],
    stampFields: [`Observation/${ARRIVAL.robertsR1}.issued`],
  },
  // W5-E: the batch's focus is the notified value; the silent sibling is the second resource.
  {
    id: 'whitcomb-a1', item: 'whitcomb-lisinopril', class: 'A', trigger: { kind: 'after_write', patient: WHITCOMB },
    resources: [WHITCOMB_A1_HIGH, WHITCOMB_A1_SILENT],
    stampFields: [`Observation/${ARRIVAL.whitcombA1High}.issued`, `Observation/${ARRIVAL.whitcombA1Silent}.issued`],
  },
  {
    id: 'whitcomb-a1-twin', item: 'whitcomb-lisinopril', class: 'A', trigger: { kind: 'after_write', patient: WHITCOMB },
    resources: [WHITCOMB_TWIN_HIGH, WHITCOMB_TWIN_SILENT],
    stampFields: [`Observation/${ARRIVAL.whitcombTwinHigh}.issued`, `Observation/${ARRIVAL.whitcombTwinSilent}.issued`],
  },
];

// The lever specs (plan-amendment-w5 G1): an A lever item's event is active exactly while the item
// is in lever.ts LEVER; the twin never is (tests/events.test.ts runs it alone).
export const LEVER_SPECS: Readonly<Record<string, readonly string[]>> = { A: ['whitcomb-a1'] };
export const leverSpecs = (lever: readonly string[]): string[] => lever.flatMap((l) => LEVER_SPECS[l] ?? []);
// pilot-4a's four, plus each active lever item's event (W5-E).
export const ACTIVE: readonly string[] = ['kim-k1', 'kim-d2', 'stark-s1', 'roberts-r1', ...leverSpecs(LEVER)];

// Specs that must not be active together: each pair bears on one item with two amend events, so
// the first to fire would leave the second nothing to test.
export const EXCLUSIVE: ReadonlyArray<readonly [string, string]> = [['whitcomb-a1', 'whitcomb-a1-twin']];
