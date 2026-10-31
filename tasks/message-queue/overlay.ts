// T6 message-queue overlay (plan-amendment-worklist W1, T6 probe): Dr. Okafor's messages queue as
// a refill worklist of 13 messages on the six T6 slots, each a portal or pharmacy message
// (Communication) behind an inbox Task. Every message asks for a refill RBC-RX-05 decides from the
// chart's results; the item classes (two instances each, plus one filler) are:
//   hemolyzed potassium      m1 Hayes   lisinopril; the newest BMP's potassium is hemolyzed (a note
//                                       on the result), the one before is valid and recent
//                            m3 Odum    lisinopril; a scanned outside BMP whose report calls the
//                                       specimen hemolyzed, an in-house BMP before it
//   amended / entered in error
//                            m6 Park    metformin; the eGFR she was told at her visit was amended
//                                       down below 45 four days later
//                            m13 Webb   metformin; the newest eGFR, 39 (below 45), is entered in error
//   collection-date window   m5 Park    lisinopril; a scanned outside BMP filed inside 12 months,
//                                       collected outside them
//                            m12 Webb   lisinopril; an in-house BMP collected before the 12-month
//                                       line and issued after it
//   metformin, two series    m8 Brooks  metformin; eGFR current, the only HbA1c inside 6 months by
//                                       its filing date is an outside report collected before them
//                            m10 Price  metformin; eGFR current, the in-house HbA1c is old, an
//                                       outside report collected inside 6 months is current
//   same-patient messages    m2 Hayes   her second message for the same lisinopril
//                            m11 Price  a pharmacy request for the metformin he asked for himself
//   potassium or creatinine rise after a dose increase
//                            m7 Brooks  lisinopril raised 3 weeks ago; creatinine 38% above the BMP
//                                       before the change, potassium under the line
//                            m9 Price   the same history; creatinine 24% above, potassium 5.2
//   filler                   m4 Odum    amlodipine, a completed visit 9 months ago
// Each patient keeps the Synthea chart that fits, with the name and (Lena Park) the sex patched,
// and Dr. Okafor as PCP. The overlay removes what would contradict a scenario or start a question
// it does not ask: every Synthea note and its report (they name the old patients); every Synthea
// metabolic panel, kidney and HbA1c result of the six (each chart's lab history is written here);
// Hayes's 2026 prenatal visits, everything recorded at them and her "Pregnant" status (an ACE
// inhibitor in pregnancy is another task) and her OTC naproxen; Park's examinations, ED visit and
// sore-throat visit (male-range results); Price's rheumatoid arthritis visit and drugs; Webb's 1985
// chlorpheniramine, his "allergic disposition", every Synthea antihypertensive order of his and the
// Synthea examination on the morning of his planted check-up, with what was recorded at it; the prediabetes entries of the patients who now have type 2 diabetes.
// A BMP is a DiagnosticReport (51990-0) with one Observation per analyte, as Synthea writes it; an
// eGFR is its own Observation drawn with it. Outside results are scanned laboratory reports
// (DocumentReference, LOINC 11502-2) with no Observation behind them; the report's text gives the
// collection and report times, and the DocumentReference's date is the day the clinic filed it.
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';
import { patientRefs } from '../../packages/env/overlay.ts';

const PT = { hayes: 'pt-0026', odum: 'pt-0027', park: 'pt-0028', brooks: 'pt-0029', price: 'pt-0030', webb: 'pt-0031' } as const;
type Who = keyof typeof PT;
const subject = (who: Who) => ({ reference: `Patient/${PT[who]}` });
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const LIN = { reference: 'Practitioner/pr-lin' };
const REYES = { reference: 'Practitioner/pr-reyes' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const PHARMACY = { reference: 'Organization/org-t6-pharmacy' };
const HARBOR = { reference: 'Organization/org-t6-harbor' };
const BRIGID_LAB = { reference: 'Organization/org-t6-brigid-lab' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
const INBOX = 'urn:riverbend:inbox-queue';

const NAMES: Record<Who, { given: string; family: string; prefix: string; gender?: 'female' }> = {
  hayes: { given: 'Gloria', family: 'Hayes', prefix: 'Ms.' },
  odum: { given: 'Frank', family: 'Odum', prefix: 'Mr.' },
  park: { given: 'Lena', family: 'Park', prefix: 'Ms.', gender: 'female' },
  brooks: { given: 'Evelyn', family: 'Brooks', prefix: 'Ms.' },
  price: { given: 'Samuel', family: 'Price', prefix: 'Mr.' },
  webb: { given: 'Marcus', family: 'Webb', prefix: 'Mr.' },
};

// Base resources that contradict a scenario. Encounters listed in DROP_ENCOUNTERS take every
// resource recorded at them along.
// Webb's enc-00186 is a Synthea examination on the morning of the planted check-up
// (enc-t6-webb-0928), with its own blood pressure (clinical-3 N2).
const DROP_ENCOUNTERS = ['enc-00154', 'enc-00155', 'enc-00156', 'enc-00178', 'enc-00163', 'enc-00164', 'enc-00166', 'enc-00167', 'enc-00168', 'enc-00186'];
const REMOVE: Array<{ resourceType: string; id: string }> = [
  // Hayes's OTC naproxen; Price's methotrexate and naproxen; Webb's chlorpheniramine and every
  // Synthea amlodipine, hydrochlorothiazide and lisinopril order of his, from each of his three
  // yearly examinations (his regimen and its history are written below; clinical-3 N2).
  ...['mr-00270', 'mr-00277', 'mr-00278', 'mr-00279', 'mr-00280', 'mr-00281', 'mr-00282', 'mr-00283', 'mr-00284', 'mr-00285', 'mr-00286', 'mr-00287', 'mr-00288'].map((id) => ({ resourceType: 'MedicationRequest', id })),
  // Hayes's miscarriage history, Price's rheumatoid arthritis and prediabetes, and the
  // prediabetes of Brooks and Webb, who have type 2 diabetes here.
  ...['cond-00588', 'cond-00634', 'cond-00632', 'cond-00619', 'cond-00639'].map((id) => ({ resourceType: 'Condition', id })),
  { resourceType: 'AllergyIntolerance', id: 'alg-00021' },
  // Hayes: "Pregnancy status: Pregnant" (2026-05-25), at a dental visit the prenatal drop missed.
  { resourceType: 'Observation', id: 'obs-01952' },
];
// Synthea's metabolic panels and the kidney, potassium and HbA1c results of the six, except the
// ones that sit before every scenario and agree with it: Brooks's 2026-07-25 panel (before her dose
// increase and its baseline), Price's 2025-02-13 panel, and the HbA1c results drawn before the
// 6-month window (Webb's 2026-09-28 panel would be a BMP inside 12 months, and Brooks's and Webb's
// 2026 HbA1c results one inside 6 months, so those go).
const PANELS = ['51990-0', '24323-8', '24321-2'];
const LAB_CODES = ['2823-3', '6298-4', '2160-0', '38483-4', '33914-3', '98979-8', '62238-1', '4548-4'];
const KEEP_PANELS = ['dr-00296', 'dr-00301'];
const KEEP_BEFORE = { code: '4548-4', before: '2026-04-23' };
// One of the kept results, corrected after release as a laboratory does from time to time: an
// amended status is not one only the scenario's results carry.
const AMENDED_BASE = { id: 'obs-02116', time: '2025-02-17T10:20:00-05:00', text: 'Corrected result: previously reported 6.12 %. Re-run after a calibration check.' };

const ORGANIZATIONS: Resource[] = [
  { resourceType: 'Organization', id: 'org-t6-pharmacy', active: true, name: 'Riverbend Community Pharmacy' },
  { resourceType: 'Organization', id: 'org-t6-harbor', active: true, name: 'Harbor Diagnostic Laboratory' },
  { resourceType: 'Organization', id: 'org-t6-brigid-lab', active: true, name: 'St. Brigid Regional Laboratory', partOf: HOSPITAL },
];

const encounter = (id: string, who: Who, type: [string, string], start: string, end: string): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: subject(who),
  participant: [{ individual: OKAFOR }],
  period: { start, end },
  serviceProvider: CLINIC,
});
const VISIT: [string, string] = ['185349003', 'Encounter for check up (procedure)'];
const PROBLEM: [string, string] = ['185347001', 'Encounter for problem (procedure)'];

const condition = (id: string, who: Who, code: string, display: string, onset: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code, display }], text: display },
  subject: subject(who),
  onsetDateTime: onset,
  recordedDate: onset,
});
const HTN: [string, string] = ['59621000', 'Essential hypertension (disorder)'];
const T2DM: [string, string] = ['44054006', 'Diabetes mellitus type 2 (disorder)'];

const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];
const q = (value: number, unit: string, code = unit) => ({ value, unit, system: UCUM, code });
type Note = { time: string; text: string };
const obs = (id: string, who: Who, code: [string, string], value: number, unit: string, at: string, issued: string, enc: string | null, more: { status?: string; note?: Note[]; ucum?: string; high?: boolean } = {}): Resource =>
  ({
    resourceType: 'Observation',
    id,
    status: more.status ?? 'final',
    category: LAB,
    code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
    subject: subject(who),
    ...(enc ? { encounter: { reference: `Encounter/${enc}` } } : {}),
    effectiveDateTime: at,
    issued,
    performer: [CLINIC],
    valueQuantity: q(value, unit, more.ucum ?? unit),
    ...(more.high ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }] } : {}),
    ...(more.note ? { note: more.note } : {}),
  }) as Resource;
const C = {
  na: ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma'],
  k: ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'],
  cl: ['2075-0', 'Chloride [Moles/volume] in Serum or Plasma'],
  co2: ['2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma'],
  bun: ['3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma'],
  cr: ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'],
  glu: ['2345-7', 'Glucose [Mass/volume] in Serum or Plasma'],
  ca: ['17861-6', 'Calcium [Mass/volume] in Serum or Plasma'],
  egfr: ['33914-3', 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum or Plasma by Creatinine-based formula (MDRD)'],
  a1c: ['4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'],
} as const satisfies Record<string, [string, string]>;
const EGFR_UNIT = ['mL/min/1.73m2', 'mL/min/{1.73_m2}'] as const;
const egfr = (id: string, who: Who, value: number, at: string, issued: string, enc: string | null, more: { status?: string; note?: Note[] } = {}) => obs(id, who, C.egfr, value, EGFR_UNIT[0], at, issued, enc, { ...more, ucum: EGFR_UNIT[1] });

// A BMP drawn in the clinic: the panel report, its eight results (ids <key>-<analyte>) and an eGFR.
interface Bmp { na: number; k: number; cl: number; co2: number; bun: number; cr: number; glu: number; ca: number; egfr: number }
function bmp(key: string, who: Who, at: string, issued: string, enc: string | null, v: Bmp, notes: { k?: Note[]; cr?: Note[] } = {}): Resource[] {
  const analytes: Array<[keyof Omit<Bmp, 'egfr'>, string]> = [['na', 'mmol/L'], ['k', 'mmol/L'], ['cl', 'mmol/L'], ['co2', 'mmol/L'], ['bun', 'mg/dL'], ['cr', 'mg/dL'], ['glu', 'mg/dL'], ['ca', 'mg/dL']];
  const results = analytes.map(([a, unit]) =>
    obs(`obs-t6-${key}-${a}`, who, C[a], v[a], unit, at, issued, enc, { ...(notes[a as 'k' | 'cr'] ? { note: notes[a as 'k' | 'cr'] } : {}), high: (a === 'k' && v.k > 5.1) || (a === 'glu' && v.glu > 99) }),
  );
  return [
    {
      resourceType: 'DiagnosticReport',
      id: `dr-t6-${key}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      code: { coding: [{ system: LOINC, code: '51990-0', display: 'Basic metabolic panel - Blood' }], text: 'Basic metabolic panel - Blood' },
      subject: subject(who),
      ...(enc ? { encounter: { reference: `Encounter/${enc}` } } : {}),
      effectiveDateTime: at,
      issued,
      performer: [CLINIC],
      result: results.map((r) => ({ reference: `Observation/${r.id}` })),
    } as Resource,
    ...results,
    egfr(`obs-t6-${key}-egfr`, who, v.egfr, at, issued, enc),
  ];
}

const FREQ = { QD: [1, 'once daily', 'QD'], BID: [2, 'twice daily', 'BID'] } as const;
const medication = (
  id: string,
  who: Who,
  rx: [code: string, display: string],
  dose: number,
  freq: keyof typeof FREQ,
  authored: string,
  reason: string,
  dispense: { days: number; refills: number; tablets: number },
  status: 'active' | 'stopped' | 'completed' = 'active',
  requester: { reference: string } = OKAFOR,
): Resource => {
  const [perDay, words, gts] = FREQ[freq];
  return {
    resourceType: 'MedicationRequest',
    id,
    status,
    intent: 'order',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
    subject: subject(who),
    authoredOn: authored,
    requester,
    reasonCode: [{ text: reason }],
    dosageInstruction: [
      {
        text: `${dose} mg by mouth ${words}`,
        timing: { code: { coding: [{ system: GTS, code: gts }], text: words }, repeat: { frequency: perDay, period: 1, periodUnit: 'd' } },
        route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
        doseAndRate: [{ doseQuantity: q(dose, 'mg') }],
      },
    ],
    dispenseRequest: { quantity: q(dispense.tablets, 'tablet', '{tablet}'), numberOfRepeatsAllowed: dispense.refills, expectedSupplyDuration: q(dispense.days, 'days', 'd') },
  };
};
const RX = {
  lis10: ['314076', 'lisinopril 10 MG Oral Tablet'],
  lis20: ['314077', 'lisinopril 20 MG Oral Tablet'],
  met500: ['861007', 'metformin hydrochloride 500 MG Oral Tablet'],
  met1000: ['861004', 'metformin hydrochloride 1000 MG Oral Tablet'],
  aml5: ['197361', 'amlodipine 5 MG Oral Tablet'],
} as const satisfies Record<string, [string, string]>;
const YEAR = { days: 90, refills: 3, tablets: 90 };
const YEAR_BID = { days: 90, refills: 3, tablets: 180 };

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
const NOTE_TYPES = { progress: ['11506-3', 'Progress note'], physical: ['34117-2', 'History and physical note'], phone: ['34748-4', 'Telephone encounter Note'], lab: ['11502-2', 'Laboratory report'] } as const;
const note = (id: string, who: Who, date: string, type: keyof typeof NOTE_TYPES, author: { reference: string }, custodian: { reference: string }, text: string, enc?: string): Resource => ({
  resourceType: 'DocumentReference',
  id,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: NOTE_TYPES[type][0], display: NOTE_TYPES[type][1] }], text: NOTE_TYPES[type][1] },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: subject(who),
  date,
  author: [author],
  custodian,
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(text) } }],
  ...(enc ? { context: { encounter: [{ reference: `Encounter/${enc}` }] } } : {}),
});
// Lena Park's notes from before her hypertension (2021) and diabetes (2023): no medications then.
const PARK_PHYSICAL = (year: number, extra: string) =>
  `Annual physical - Riverbend Family Medicine\nLena Park, ${year - 1978} y/o F.\nAllergies: NKDA.\nMedications: none.\n${extra}\nPlan: routine screening up to date; return in 1 year.\n\nMaya Okafor, MD`;
const PARK_EARLY: Array<[date: string, author: { reference: string }, text: string]> = [
  ['2014-05-12T09:30:00-04:00', OKAFOR, PARK_PHYSICAL(2014, 'New patient. Healthy. Works as an accountant.')],
  ['2015-02-03T10:10:00-05:00', LIN, 'Acute visit - Riverbend Family Medicine\nCough and congestion for 4 days, no fever. Viral upper respiratory infection. Supportive care.\n\nDaniel Lin, MD'],
  ['2015-05-18T09:30:00-04:00', OKAFOR, PARK_PHYSICAL(2015, 'No concerns.')],
  ['2016-05-23T09:30:00-04:00', OKAFOR, PARK_PHYSICAL(2016, 'Occasional low back pain after long days at a desk; stretching advised.')],
  ['2016-11-08T14:00:00-05:00', REYES, 'Telephone note\nAsked about the flu vaccine; scheduled at the nurse clinic.\n\nJordan Reyes, NP'],
  ['2017-05-22T09:30:00-04:00', OKAFOR, PARK_PHYSICAL(2017, 'No concerns. BP 118/74.')],
  ['2018-01-15T11:00:00-05:00', REYES, 'Acute visit\nSore throat for 2 days, no fever, no exudate, Centor score 0. Viral pharyngitis; no antibiotic.\n\nJordan Reyes, NP'],
  ['2018-05-21T09:30:00-04:00', OKAFOR, PARK_PHYSICAL(2018, 'No concerns.')],
  ['2019-03-04T10:00:00-05:00', OKAFOR, PARK_PHYSICAL(2019, 'Allergy list reviewed with the patient: no known drug allergies recorded.')],
  ['2019-09-16T15:20:00-04:00', LIN, 'Acute visit\nRight ankle sprain stepping off a curb. Ottawa rules negative. Rest, ice, compression; ibuprofen as needed.\n\nDaniel Lin, MD'],
  ['2020-06-08T09:30:00-04:00', OKAFOR, 'Telephone visit\nAnnual review by phone. Feeling well. Labs ordered.\n\nMaya Okafor, MD'],
  ['2020-12-14T11:30:00-05:00', REYES, 'Acute visit\nNasal congestion and facial pressure for 5 days, improving. Viral rhinosinusitis. Saline rinses.\n\nJordan Reyes, NP'],
];
const parkId = (date: string) => `doc-t6-park-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
const visitNote = (who: Who, body: string) => `Progress note - Riverbend Family Medicine\n${NAMES[who].given} ${NAMES[who].family}. ${body}\n\nMaya Okafor, MD`;

// ---- the 13 messages and their inbox items ----

interface Item {
  n: number;
  who: Who;
  from: { reference: string };
  sent: string;
  subject: string;
  body: string;
}
const fromPatient = (who: Who) => subject(who);
const pharmacyBody = (patient: string, dob: string, drug: string, sig: string, qty: number) =>
  `Riverbend Community Pharmacy - electronic refill request\nPatient: ${patient}   DOB ${dob}\nMedication: ${drug}\nSig: ${sig}\nLast fill quantity: ${qty}   Refills remaining: 0\nPlease authorize a new prescription or refills.`;
export const ITEMS: Item[] = [
  { n: 1, who: 'hayes', from: fromPatient('hayes'), sent: '2026-10-19T18:20:00-04:00', subject: 'Refill request', body: 'Hi, I need a refill of my lisinopril 20 mg, I am almost out. Thank you, Gloria Hayes' },
  { n: 9, who: 'price', from: fromPatient('price'), sent: '2026-10-19T20:42:00-04:00', subject: 'Refill', body: 'The new lisinopril 20 mg prescription is finished. Can I get a refill please? Samuel Price' },
  { n: 3, who: 'odum', from: fromPatient('odum'), sent: '2026-10-20T07:15:00-04:00', subject: 'Refill request', body: 'Please refill my lisinopril 10 mg. The pharmacy says there are no refills left. Frank Odum' },
  { n: 5, who: 'park', from: fromPatient('park'), sent: '2026-10-20T12:05:00-04:00', subject: 'Blood pressure pill', body: 'Could you send a refill of my lisinopril to the pharmacy? I have about a week left. Lena Park' },
  { n: 10, who: 'price', from: fromPatient('price'), sent: '2026-10-20T19:30:00-04:00', subject: 'Refill', body: 'Also running low on metformin, could you send that too? Thanks, Samuel Price' },
  { n: 4, who: 'odum', from: fromPatient('odum'), sent: '2026-10-21T08:02:00-04:00', subject: 'One more refill', body: 'Sorry, I forgot to ask yesterday: I also need my amlodipine 5 mg refilled. Frank Odum' },
  { n: 7, who: 'brooks', from: fromPatient('brooks'), sent: '2026-10-21T09:48:00-04:00', subject: 'Refill request', body: 'My lisinopril 20 mg ran out yesterday. Please send a refill. Evelyn Brooks' },
  { n: 12, who: 'webb', from: fromPatient('webb'), sent: '2026-10-21T13:10:00-04:00', subject: 'Refills', body: 'Hello, I need a refill of lisinopril 10 mg. Marcus Webb' },
  { n: 13, who: 'webb', from: fromPatient('webb'), sent: '2026-10-21T13:12:00-04:00', subject: 'Refills', body: 'And my metformin 500 mg too please. Marcus Webb' },
  { n: 6, who: 'park', from: PHARMACY, sent: '2026-10-21T16:30:00-04:00', subject: 'Refill request: metformin', body: pharmacyBody('Lena Park', '06/16/1977', 'metformin hydrochloride 500 mg tablet', '1 tablet by mouth twice daily', 180) },
  { n: 2, who: 'hayes', from: fromPatient('hayes'), sent: '2026-10-22T07:55:00-04:00', subject: 'Following up', body: 'Following up on my message from Monday about the lisinopril. I have two pills left, can it go to the pharmacy today? Gloria Hayes' },
  { n: 8, who: 'brooks', from: PHARMACY, sent: '2026-10-22T10:20:00-04:00', subject: 'Refill request: metformin', body: pharmacyBody('Evelyn Brooks', '07/01/1978', 'metformin hydrochloride 1000 mg tablet', '1 tablet by mouth twice daily', 180) },
  { n: 11, who: 'price', from: PHARMACY, sent: '2026-10-22T11:05:00-04:00', subject: 'Refill request: metformin', body: pharmacyBody('Samuel Price', '01/25/1979', 'metformin hydrochloride 1000 mg tablet', '1 tablet by mouth twice daily', 180) },
];

const message = (i: Item): Resource => ({
  resourceType: 'Communication',
  id: `comm-t6-m${i.n}`,
  status: 'completed',
  priority: 'routine',
  subject: subject(i.who),
  topic: { text: i.subject },
  sent: i.sent,
  received: i.sent,
  recipient: [OKAFOR],
  sender: i.from,
  payload: [{ contentString: i.body }],
});
const inboxItem = (i: Item): Resource => ({
  resourceType: 'Task',
  id: `task-t6-m${i.n}`,
  status: 'requested',
  intent: 'order',
  priority: 'routine',
  code: { coding: [{ system: INBOX, code: 'messages', display: 'Messages' }], text: 'messages' },
  description: `${i.from.reference.startsWith('Patient/') ? 'Portal message' : 'Pharmacy message'}: ${i.subject}`,
  focus: { reference: `Communication/comm-t6-m${i.n}` },
  for: subject(i.who),
  authoredOn: i.sent,
  lastModified: i.sent,
  requester: i.from,
  owner: OKAFOR,
});

// ---- scanned outside reports ----

// A scanned outside report as the laboratory prints it: its letterhead, the patient and ordering
// blocks, the specimen line with the collection, receipt and report times, the specimen's
// condition, the results table, a comment and the laboratory's footer.
const LABS: Record<string, { address: string; director: string }> = {
  'St. Brigid Regional Laboratory': { address: '400 Harbor View Drive, Leverett   CLIA 22D0841176   Tel (413) 555-0190', director: 'Medical director: Alan Pruitt, MD' },
  'Harbor Diagnostic Laboratory': { address: '18 Mill Street, Suite 2, Leverett   CLIA 22D2093318   Tel (413) 555-0147', director: 'Laboratory director: Grace Okoye, MD, PhD' },
};
const outsideLab = (lab: string, patient: string, sex: string, dob: string, accession: string, collected: string, received: string, reported: string, orderedBy: string, condition: string, rows: string, comment = '') =>
  `${lab}\n${LABS[lab]!.address}\nLABORATORY REPORT (scanned outside record)   Page 1 of 1\n` +
  `PATIENT: ${patient}   DOB ${dob}   Sex ${sex}\nORDERING: ${orderedBy}\nCOPY TO: Maya Okafor, MD (PCP), Riverbend Family Medicine\nACCESSION: ${accession}   Status: FINAL\n` +
  `SPECIMEN: venipuncture   Collected: ${collected}   Received: ${received}   Reported: ${reported}\nSPECIMEN CONDITION: ${condition}\n\n` +
  `TEST                                   RESULT     FLAG   REFERENCE        UNITS\n${rows}\n\n` +
  `${comment ? `Comment: ${comment}\n` : ''}Results relate only to the specimen tested. Reference ranges are for adults.\n${LABS[lab]!.director}`;
const bmpRows = (v: Omit<Bmp, 'egfr'> & { egfr: number }, kFlag = '') =>
  `Basic metabolic panel (BMP)\nSodium                                 ${v.na}              136-145          mmol/L\nPotassium                              ${v.k}        ${kFlag.padEnd(4)}   3.5-5.1          mmol/L\n` +
  `Chloride                               ${v.cl}              98-107           mmol/L\nCarbon dioxide                         ${v.co2}               22-29            mmol/L\nUrea nitrogen                          ${v.bun}               7-20             mg/dL\n` +
  `Creatinine                             ${v.cr}              0.60-1.30        mg/dL\nGlucose                                ${v.glu}        ${v.glu > 99 ? 'H   ' : '    '}   70-99            mg/dL\nCalcium                                ${v.ca}              8.6-10.3         mg/dL\neGFR (CKD-EPI 2021)                    ${v.egfr}               >59              mL/min/1.73m2`;
const a1cRows = (value: number) => `Hemoglobin A1c (HbA1c)                 ${value}        H      4.0-5.6          %   (diabetes: 6.5 or higher)`;

// m3 Odum: hemolyzed, the potassium not a valid result (RBC-RX-05 §1).
const ODUM_PREOP = outsideLab(
  'St. Brigid Regional Laboratory', 'Frank Odum', 'M', '12/01/1976', 'SB-26-0827-0412', '08/27/2026 07:50', '08/27/2026 08:35', '08/27/2026 11:35',
  'Rosa Whitfield, MD (General Surgery), pre-operative testing for an elective inguinal hernia repair.',
  'moderately hemolyzed (hemolysis index 2+); specimen accepted for testing.',
  bmpRows({ na: 140, k: 5.9, cl: 104, co2: 24, bun: 15, cr: 1.05, glu: 97, ca: 9.5, egfr: 87 }, 'H'),
  'Potassium may be falsely elevated by hemolysis; recollection recommended.',
);
// m5 Park: a BMP collected before the 12-month line, filed after it.
const PARK_UC = outsideLab(
  'St. Brigid Regional Laboratory', 'Lena Park', 'F', '06/16/1977', 'SB-25-1002-1187', '10/02/2025 15:20', '10/02/2025 15:45', '10/02/2025 18:05',
  'Helen Marsh, PA-C (St. Brigid Regional Urgent Care), dizziness after a viral illness.',
  'acceptable.',
  bmpRows({ na: 138, k: 4.4, cl: 102, co2: 25, bun: 16, cr: 1.1, glu: 132, ca: 9.3, egfr: 62 }),
);
// m8 Brooks: an HbA1c collected before the 6-month line, filed after it.
const BROOKS_A1C = outsideLab(
  'Harbor Diagnostic Laboratory', 'Evelyn Brooks', 'F', '07/01/1978', 'HD-0414-55871', '04/14/2026 08:05', '04/14/2026 12:30', '04/16/2026 09:40',
  'Workplace health screening (Harbor Employer Health Program).', 'acceptable (whole blood, EDTA).', a1cRows(6.9),
);
// m10 Price: an HbA1c collected inside 6 months.
const PRICE_A1C = outsideLab(
  'Harbor Diagnostic Laboratory', 'Samuel Price', 'M', '01/25/1979', 'HD-0819-60213', '08/19/2026 07:40', '08/19/2026 11:55', '08/20/2026 10:15',
  'Workplace health screening (Harbor Employer Health Program).', 'acceptable (whole blood, EDTA).', a1cRows(7.1),
);

// ---- results notes ----
const HEMOLYZED: Note[] = [{ time: '2026-10-05T14:05:00-04:00', text: 'Specimen hemolyzed; may be falsely elevated.' }];
const AMENDED_CR: Note[] = [{ time: '2026-07-24T10:30:00-04:00', text: 'Corrected result: previously reported 1.28 mg/dL on 07/20/2026. Specimen re-run after a calibration failure.' }];
const AMENDED_EGFR: Note[] = [{ time: '2026-07-24T10:30:00-04:00', text: 'Corrected result: previously reported 51 mL/min/1.73m2 on 07/20/2026, recalculated from the corrected creatinine.' }];
const MISLABELLED: Note[] = [{ time: '2026-10-15T09:20:00-04:00', text: 'Entered in error: specimen mislabelled, belongs to another patient.' }];
const LATE: Note[] = [{ time: '2025-10-27T10:15:00-04:00', text: 'Repeat analysis after an analyzer fault; reported late.' }];

const overlay: Overlay = {
  task: 'T6',
  names: {
    'org-t6-pharmacy': 'org-riverbend-pharmacy',
    'org-t6-harbor': 'org-harbor-lab',
    'org-t6-brigid-lab': 'org-st-brigid-lab',
  },
  build(world: WorldReader) {
    const dropped = new Set(DROP_ENCOUNTERS.map((id) => `Encounter/${id}`));
    const slots = new Set(Object.values(PT) as string[]);
    const ofSlot = (r: Resource) => [...patientRefs(r)].some((p) => slots.has(p));
    const codeOf = (r: Resource) => (r as { code?: { coding?: Array<{ code?: string }> } }).code?.coding?.[0]?.code ?? '';
    const all = [...world.resources()];
    const atDropped = all.filter((r) => {
      const enc = (r as { encounter?: { reference?: string } }).encounter?.reference;
      const ctx = (r as { context?: { encounter?: Array<{ reference?: string }> } }).context?.encounter ?? [];
      return (enc !== undefined && dropped.has(enc)) || ctx.some((e) => e.reference !== undefined && dropped.has(e.reference));
    });
    // Every Synthea note of the six, and the history-and-physical report beside it.
    const synthea = all.filter((r) => (r.resourceType === 'DocumentReference' || (r.resourceType === 'DiagnosticReport' && codeOf(r) === '34117-2')) && ofSlot(r));
    // Their metabolic panels with every result in them, and their kidney, potassium and HbA1c results.
    const memberIds = (r: Resource) => ((r as { result?: Array<{ reference?: string }> }).result ?? []).map((x) => x.reference ?? '').filter((x) => x.startsWith('Observation/'));
    const kept = new Set(all.filter((r) => r.resourceType === 'DiagnosticReport' && KEEP_PANELS.includes(r.id!)).flatMap(memberIds));
    const panels = all.filter((r) => r.resourceType === 'DiagnosticReport' && PANELS.includes(codeOf(r)) && ofSlot(r) && !KEEP_PANELS.includes(r.id!));
    const members = panels.flatMap(memberIds);
    const oldA1c = (r: Resource) => codeOf(r) === KEEP_BEFORE.code && ((r as { effectiveDateTime?: string }).effectiveDateTime ?? '9') < KEEP_BEFORE.before;
    const labs = all.filter((r) => r.resourceType === 'Observation' && (LAB_CODES.includes(codeOf(r)) || PANELS.includes(codeOf(r))) && ofSlot(r) && !kept.has(`Observation/${r.id}`) && !oldA1c(r));
    const remove = [
      ...REMOVE,
      ...DROP_ENCOUNTERS.map((id) => ({ resourceType: 'Encounter', id })),
      ...[...atDropped, ...synthea, ...panels, ...labs].map((r) => ({ resourceType: r.resourceType, id: r.id! })),
      ...members.map((m) => ({ resourceType: 'Observation', id: m.slice('Observation/'.length) })),
    ];
    const unique = [...new Map(remove.map((r) => [`${r.resourceType}/${r.id}`, r])).values()];

    const patients = (Object.keys(PT) as Who[]).map((who): Resource => {
      const p = world.get('Patient', PT[who]) as Extract<Resource, { resourceType: 'Patient' }>;
      const n = NAMES[who];
      return { ...p, name: [{ use: 'official', family: n.family, given: [n.given], prefix: [n.prefix] }], ...(n.gender ? { gender: n.gender } : {}), generalPractitioner: [OKAFOR] };
    });

    const amended = world.get('Observation', AMENDED_BASE.id) as Resource;
    const put: Resource[] = [
      ...patients,
      { ...amended, status: 'amended', note: [{ time: AMENDED_BASE.time, text: AMENDED_BASE.text }] } as Resource,
      ...ORGANIZATIONS,
      ...ITEMS.flatMap((i) => [message(i), inboxItem(i)]),

      // ---- Gloria Hayes: m1 (hemolyzed potassium on the newest BMP), m2 (her second message) ----
      encounter('enc-t6-hayes-0414', 'hayes', VISIT, '2026-04-14T09:00:00-04:00', '2026-04-14T09:25:00-04:00'),
      ...bmp('hayes-0414', 'hayes', '2026-04-14T09:10:00-04:00', '2026-04-14T13:40:00-04:00', 'enc-t6-hayes-0414', { na: 139, k: 4.6, cl: 103, co2: 25, bun: 14, cr: 0.84, glu: 94, ca: 9.4, egfr: 85 }),
      note('doc-t6-hayes-0414', 'hayes', '2026-04-14T09:30:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('hayes', 'Hypertension follow-up.\nBP 124/78 on lisinopril 20 mg daily and amlodipine 2.5 mg daily. No cough, no swelling.\nPlan: continue both. BMP today. Recheck in 6 months.'), 'enc-t6-hayes-0414'),
      encounter('enc-t6-hayes-1005', 'hayes', VISIT, '2026-10-05T08:40:00-04:00', '2026-10-05T09:05:00-04:00'),
      ...bmp('hayes-1005', 'hayes', '2026-10-05T08:50:00-04:00', '2026-10-05T14:05:00-04:00', 'enc-t6-hayes-1005', { na: 140, k: 6.1, cl: 104, co2: 24, bun: 15, cr: 0.86, glu: 91, ca: 9.6, egfr: 82 }, { k: HEMOLYZED }),
      note('doc-t6-hayes-1005', 'hayes', '2026-10-05T09:10:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('hayes', 'Hypertension follow-up.\nBP 126/80 on lisinopril 20 mg daily and amlodipine 2.5 mg daily. Feels well.\nPlan: continue both. BMP today.'), 'enc-t6-hayes-1005'),
      condition('cond-t6-hayes-htn', 'hayes', HTN[0], HTN[1], '2013-11-04T10:00:00-05:00'),
      medication('mr-t6-hayes-lisinopril', 'hayes', RX.lis20, 20, 'QD', '2025-10-27T09:15:00-04:00', 'Essential hypertension', YEAR),

      // ---- Frank Odum: m3 (hemolyzed outside BMP), m4 (filler: amlodipine) ----
      condition('cond-t6-odum-htn', 'odum', HTN[0], HTN[1], '2019-02-11T10:00:00-05:00'),
      encounter('enc-t6-odum-0120', 'odum', VISIT, '2026-01-20T10:00:00-05:00', '2026-01-20T10:30:00-05:00'),
      ...bmp('odum-0120', 'odum', '2026-01-20T10:10:00-05:00', '2026-01-20T15:20:00-05:00', 'enc-t6-odum-0120', { na: 139, k: 4.5, cl: 103, co2: 26, bun: 13, cr: 1.02, glu: 92, ca: 9.4, egfr: 90 }),
      note('doc-t6-odum-0120', 'odum', '2026-01-20T10:35:00-05:00', 'progress', OKAFOR, CLINIC, visitNote('odum', 'Hypertension follow-up.\nBP 130/82 on lisinopril 10 mg daily and amlodipine 5 mg daily.\nPlan: continue both. BMP today. Hernia repair being planned with General Surgery at St. Brigid.'), 'enc-t6-odum-0120'),
      note('doc-t6-odum-0827', 'odum', '2026-08-28T11:20:00-04:00', 'lab', BRIGID_LAB, BRIGID_LAB, ODUM_PREOP),
      medication('mr-t6-odum-lisinopril', 'odum', RX.lis10, 10, 'QD', '2025-11-03T09:15:00-05:00', 'Essential hypertension', YEAR),
      medication('mr-t6-odum-amlodipine', 'odum', RX.aml5, 5, 'QD', '2025-11-03T09:15:00-05:00', 'Essential hypertension', YEAR),

      // ---- Lena Park: m5 (outside BMP filed late), m6 (amended eGFR) ----
      condition('cond-t6-park-htn', 'park', HTN[0], HTN[1], '2021-05-24T10:00:00-04:00'),
      condition('cond-t6-park-t2dm', 'park', T2DM[0], T2DM[1], '2023-05-22T10:00:00-04:00'),
      ...PARK_EARLY.map(([date, author, text]) => note(parkId(date), 'park', date, text.startsWith('Annual physical') ? 'physical' : text.startsWith('Telephone') ? 'phone' : 'progress', author, CLINIC, text)),
      note('doc-t6-park-1002', 'park', '2025-11-03T14:10:00-05:00', 'lab', BRIGID_LAB, BRIGID_LAB, PARK_UC),
      encounter('enc-t6-park-0720', 'park', VISIT, '2026-07-20T09:00:00-04:00', '2026-07-20T09:30:00-04:00'),
      obs('obs-t6-park-a1c-0720', 'park', C.a1c, 7.4, '%', '2026-07-20T09:15:00-04:00', '2026-07-20T15:10:00-04:00', 'enc-t6-park-0720', { high: true }),
      obs('obs-t6-park-cr-0720', 'park', C.cr, 1.62, 'mg/dL', '2026-07-20T09:15:00-04:00', '2026-07-24T10:30:00-04:00', 'enc-t6-park-0720', { status: 'amended', note: AMENDED_CR, high: true }),
      egfr('obs-t6-park-egfr-0720', 'park', 39, '2026-07-20T09:15:00-04:00', '2026-07-24T10:30:00-04:00', 'enc-t6-park-0720', { status: 'amended', note: AMENDED_EGFR }),
      note('doc-t6-park-0720', 'park', '2026-07-20T16:40:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('park', 'Diabetes and hypertension follow-up.\nBP 128/80 on lisinopril 10 mg daily. HbA1c 7.4%, creatinine 1.28, eGFR 51 today.\nPlan: continue metformin 500 mg twice daily and lisinopril 10 mg daily. Recheck in 6 months.'), 'enc-t6-park-0720'),
      medication('mr-t6-park-lisinopril', 'park', RX.lis10, 10, 'QD', '2025-10-30T09:15:00-04:00', 'Essential hypertension', YEAR),
      medication('mr-t6-park-metformin', 'park', RX.met500, 500, 'BID', '2025-10-30T09:15:00-04:00', 'Type 2 diabetes mellitus', YEAR_BID),

      // ---- Evelyn Brooks: m7 (creatinine rise after a dose increase), m8 (outside HbA1c collected early) ----
      condition('cond-t6-brooks-htn', 'brooks', HTN[0], HTN[1], '2018-04-16T10:00:00-04:00'),
      condition('cond-t6-brooks-t2dm', 'brooks', T2DM[0], T2DM[1], '2022-07-30T10:00:00-04:00'),
      encounter('enc-t6-brooks-0112', 'brooks', VISIT, '2026-01-12T09:00:00-05:00', '2026-01-12T09:30:00-05:00'),
      obs('obs-t6-brooks-a1c-0112', 'brooks', C.a1c, 7.2, '%', '2026-01-12T09:15:00-05:00', '2026-01-12T15:00:00-05:00', 'enc-t6-brooks-0112', { high: true }),
      note('doc-t6-brooks-0412', 'brooks', '2026-05-04T11:00:00-04:00', 'lab', HARBOR, HARBOR, BROOKS_A1C),
      encounter('enc-t6-brooks-0921', 'brooks', PROBLEM, '2026-09-21T10:00:00-04:00', '2026-09-21T10:30:00-04:00'),
      ...bmp('brooks-0921', 'brooks', '2026-09-21T10:15:00-04:00', '2026-09-21T15:30:00-04:00', 'enc-t6-brooks-0921', { na: 139, k: 4.7, cl: 102, co2: 25, bun: 14, cr: 0.9, glu: 128, ca: 9.4, egfr: 79 }),
      note('doc-t6-brooks-0921', 'brooks', '2026-09-21T10:40:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('brooks', 'Hypertension follow-up.\nBP 148/92 and 146/90 on lisinopril 10 mg daily. Taking metformin 1000 mg twice daily.\nPlan: increase lisinopril to 20 mg daily (30-day supply). BMP today and again in 2 weeks.'), 'enc-t6-brooks-0921'),
      ...bmp('brooks-1008', 'brooks', '2026-10-08T16:15:00-04:00', '2026-10-08T21:40:00-04:00', null, { na: 138, k: 5.2, cl: 103, co2: 24, bun: 19, cr: 1.24, glu: 131, ca: 9.5, egfr: 54 }),
      medication('mr-t6-brooks-lisinopril10', 'brooks', RX.lis10, 10, 'QD', '2025-11-10T09:15:00-05:00', 'Essential hypertension', YEAR, 'stopped'),
      medication('mr-t6-brooks-lisinopril', 'brooks', RX.lis20, 20, 'QD', '2026-09-21T10:35:00-04:00', 'Essential hypertension', { days: 30, refills: 0, tablets: 30 }),
      medication('mr-t6-brooks-metformin', 'brooks', RX.met1000, 1000, 'BID', '2025-11-10T09:15:00-05:00', 'Type 2 diabetes mellitus', YEAR_BID),

      // ---- Samuel Price: m9 (creatinine rise under the line), m10 (outside HbA1c current), m11 (pharmacy duplicate) ----
      condition('cond-t6-price-htn', 'price', HTN[0], HTN[1], '2020-03-09T10:00:00-04:00'),
      condition('cond-t6-price-t2dm', 'price', T2DM[0], T2DM[1], '2024-02-12T10:00:00-05:00'),
      encounter('enc-t6-price-0330', 'price', VISIT, '2026-03-30T09:00:00-04:00', '2026-03-30T09:30:00-04:00'),
      obs('obs-t6-price-a1c-0330', 'price', C.a1c, 7.6, '%', '2026-03-30T09:10:00-04:00', '2026-03-30T14:30:00-04:00', 'enc-t6-price-0330', { high: true }),
      note('doc-t6-price-0819', 'price', '2026-09-02T10:45:00-04:00', 'lab', HARBOR, HARBOR, PRICE_A1C),
      encounter('enc-t6-price-0918', 'price', PROBLEM, '2026-09-18T14:00:00-04:00', '2026-09-18T14:30:00-04:00'),
      ...bmp('price-0918', 'price', '2026-09-18T14:10:00-04:00', '2026-09-18T18:40:00-04:00', 'enc-t6-price-0918', { na: 140, k: 4.9, cl: 103, co2: 26, bun: 16, cr: 1.1, glu: 134, ca: 9.3, egfr: 83 }),
      note('doc-t6-price-0918', 'price', '2026-09-18T14:40:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('price', 'Hypertension and diabetes follow-up.\nBP 146/90 on lisinopril 10 mg daily. Taking metformin 1000 mg twice daily.\nPlan: increase lisinopril to 20 mg daily (30-day supply). BMP today and again in 2 weeks.'), 'enc-t6-price-0918'),
      ...bmp('price-1006', 'price', '2026-10-06T17:05:00-04:00', '2026-10-06T22:30:00-04:00', null, { na: 139, k: 5.2, cl: 104, co2: 25, bun: 18, cr: 1.36, glu: 129, ca: 9.4, egfr: 65 }),
      medication('mr-t6-price-lisinopril10', 'price', RX.lis10, 10, 'QD', '2025-11-17T09:15:00-05:00', 'Essential hypertension', YEAR, 'stopped'),
      medication('mr-t6-price-lisinopril', 'price', RX.lis20, 20, 'QD', '2026-09-18T14:35:00-04:00', 'Essential hypertension', { days: 30, refills: 0, tablets: 30 }),
      medication('mr-t6-price-metformin', 'price', RX.met1000, 1000, 'BID', '2025-11-17T09:15:00-05:00', 'Type 2 diabetes mellitus', YEAR_BID),

      // ---- Marcus Webb: m12 (BMP collected before the line, issued after it), m13 (eGFR entered in error) ----
      condition('cond-t6-webb-t2dm', 'webb', T2DM[0], T2DM[1], '2023-09-11T10:00:00-04:00'),
      ...bmp('webb-1020', 'webb', '2025-10-20T08:40:00-04:00', '2025-10-27T10:15:00-04:00', null, { na: 141, k: 4.3, cl: 104, co2: 26, bun: 12, cr: 1.0, glu: 118, ca: 9.5, egfr: 94 }, { k: LATE, cr: LATE }),
      encounter('enc-t6-webb-0928', 'webb', VISIT, '2026-09-28T09:00:00-04:00', '2026-09-28T09:30:00-04:00'),
      obs('obs-t6-webb-a1c-0928', 'webb', C.a1c, 6.9, '%', '2026-09-28T09:10:00-04:00', '2026-09-28T14:20:00-04:00', 'enc-t6-webb-0928', { high: true }),
      obs('obs-t6-webb-cr-0928', 'webb', C.cr, 1.02, 'mg/dL', '2026-09-28T09:10:00-04:00', '2026-09-28T14:20:00-04:00', 'enc-t6-webb-0928'),
      egfr('obs-t6-webb-egfr-0928', 'webb', 92, '2026-09-28T09:10:00-04:00', '2026-09-28T14:20:00-04:00', 'enc-t6-webb-0928'),
      note('doc-t6-webb-0928', 'webb', '2026-09-28T09:40:00-04:00', 'progress', OKAFOR, CLINIC, visitNote('webb', 'Diabetes and hypertension follow-up.\nBP 128/82 on lisinopril 10 mg daily. Taking metformin 500 mg twice daily.\nPlan: continue both. HbA1c and creatinine today. Recheck in 6 months.'), 'enc-t6-webb-0928'),
      obs('obs-t6-webb-cr-1014', 'webb', C.cr, 2.1, 'mg/dL', '2026-10-14T15:05:00-04:00', '2026-10-15T09:20:00-04:00', null, { status: 'entered-in-error', note: MISLABELLED, high: true }),
      egfr('obs-t6-webb-egfr-1014', 'webb', 39, '2026-10-14T15:05:00-04:00', '2026-10-15T09:20:00-04:00', null, { status: 'entered-in-error', note: MISLABELLED }),
      medication('mr-t6-webb-lisinopril', 'webb', RX.lis10, 10, 'QD', '2025-10-27T09:15:00-04:00', 'Essential hypertension', YEAR),
      medication('mr-t6-webb-metformin', 'webb', RX.met500, 500, 'BID', '2025-10-27T09:15:00-04:00', 'Type 2 diabetes mellitus', YEAR_BID),

      // The year-before prescriptions each current order renewed, completed, written by whichever
      // clinic clinician saw the patient then; and Lena Park's coded "no known drug allergy".
      medication('mr-t6-hayes-lisinopril-24', 'hayes', RX.lis20, 20, 'QD', '2024-10-21T10:05:00-04:00', 'Essential hypertension', YEAR, 'completed', LIN),
      medication('mr-t6-odum-lisinopril-24', 'odum', RX.lis10, 10, 'QD', '2024-11-04T11:20:00-05:00', 'Essential hypertension', YEAR, 'completed', REYES),
      medication('mr-t6-odum-amlodipine-24', 'odum', RX.aml5, 5, 'QD', '2024-11-04T11:20:00-05:00', 'Essential hypertension', YEAR, 'completed', REYES),
      medication('mr-t6-park-lisinopril-24', 'park', RX.lis10, 10, 'QD', '2024-10-28T15:40:00-04:00', 'Essential hypertension', YEAR, 'completed', LIN),
      medication('mr-t6-park-metformin-24', 'park', RX.met500, 500, 'BID', '2024-10-28T15:40:00-04:00', 'Type 2 diabetes mellitus', YEAR_BID, 'completed', LIN),
      medication('mr-t6-brooks-metformin-24', 'brooks', RX.met1000, 1000, 'BID', '2024-11-11T14:10:00-05:00', 'Type 2 diabetes mellitus', YEAR_BID, 'completed', REYES),
      medication('mr-t6-price-metformin-24', 'price', RX.met1000, 1000, 'BID', '2024-11-18T16:30:00-05:00', 'Type 2 diabetes mellitus', YEAR_BID, 'completed', LIN),
      medication('mr-t6-webb-lisinopril-24', 'webb', RX.lis10, 10, 'QD', '2024-10-28T13:15:00-04:00', 'Essential hypertension', YEAR, 'completed', REYES),
      {
        resourceType: 'AllergyIntolerance',
        id: 'alg-t6-park-nkda',
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active', display: 'Active' }] },
        verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed', display: 'Confirmed' }] },
        category: ['medication'],
        code: { coding: [{ system: SNOMED, code: '409137002', display: 'No known drug allergy (situation)' }], text: 'No known drug allergy' },
        patient: subject('park'),
        recordedDate: '2019-03-04T10:00:00-05:00',
        recorder: OKAFOR,
      },
    ];
    return {
      put,
      remove: unique,
      lint: {
        thresholds: [
          // Ruling R7: each value an item turns on, the trap values included (the hemolyzed potassium,
          // the eGFR entered in error), clears its threshold by the lint margin.
          { quantity: 'potassium', threshold: 5.5, observation: 'obs-t6-hayes-1005-k' },
          { quantity: 'potassium', threshold: 5.5, observation: 'obs-t6-hayes-0414-k' },
          { quantity: 'potassium', threshold: 5.5, observation: 'obs-t6-odum-0120-k' },
          { quantity: 'potassium', threshold: 5.5, observation: 'obs-t6-brooks-1008-k' },
          { quantity: 'potassium', threshold: 5.5, observation: 'obs-t6-price-1006-k' },
          { quantity: 'egfr', threshold: 45, observation: 'obs-t6-park-egfr-0720' },
          { quantity: 'egfr', threshold: 45, observation: 'obs-t6-brooks-1008-egfr' },
          { quantity: 'egfr', threshold: 45, observation: 'obs-t6-price-1006-egfr' },
          { quantity: 'egfr', threshold: 45, observation: 'obs-t6-webb-egfr-0928' },
          { quantity: 'egfr', threshold: 45, observation: 'obs-t6-webb-egfr-1014' },
        ],
        windows: [
          {
            name: 'BMP within 12 months (collection date)',
            boundary: { months: 12 },
            resources: ['obs-t6-hayes-0414-k', 'obs-t6-odum-0120-k', 'doc-t6-park-1002', 'obs-t6-brooks-0921-k', 'obs-t6-price-0918-k', 'obs-t6-webb-1020-k'],
            traps: { 'doc-t6-park-1002': 'filed inside the window, collected outside it', 'obs-t6-webb-1020-k': 'collected outside the window, issued inside it' },
          },
          { name: 'Visit within 15 months', boundary: { months: 15 }, resources: ['enc-t6-park-0720', 'enc-t6-webb-0928', 'enc-t6-odum-0120'] },
          {
            name: 'HbA1c within 6 months (collection date)',
            boundary: { months: 6 },
            resources: ['obs-t6-park-a1c-0720', 'obs-t6-brooks-a1c-0112', 'doc-t6-brooks-0412', 'obs-t6-price-a1c-0330', 'doc-t6-price-0819', 'obs-t6-webb-a1c-0928'],
            traps: { 'doc-t6-brooks-0412': 'filed inside the window, collected outside it', 'obs-t6-price-a1c-0330': 'the in-house HbA1c just outside the window' },
          },
        ],
        leakage: { answers: ['1.62', '39'], distractors: [] },
      },
    };
  },
};

export default overlay;
