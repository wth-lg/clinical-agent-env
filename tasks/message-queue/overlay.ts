// T6 message-queue overlay (design section 4, "T6"): Dr. Okafor's messages queue of six items,
// each a portal or staff message (Communication) behind an inbox Task, on the six T6 slots:
//   M1 Gloria Hayes    pt-0026  lisinopril refill; last BMP 2025-09-08, last visit 2026-03-17
//   M2 Frank Odum      pt-0027  atorvastatin refill; a 2026-08-11 cardiology note stopped it
//   M3 Evelyn Brooks   pt-0029  black stools and lightheadedness on apixaban and naproxen
//   M4 Lena Park       pt-0028  NP Reyes asks for amoxicillin-clavulanate; coded NKDA, 31 notes,
//                               the reaction only in a scanned 2024-03-09 urgent-care note
//   M5 Samuel Price    pt-0030  metformin refill; A1c and eGFR on 2026-07-15
//   M6 Marcus Webb     pt-0031  asks to book a physical
// Each patient keeps the Synthea chart that fits, with the name and (Lena Park) the sex patched.
// The overlay removes what would contradict a scenario or start a question it does not ask:
// every Synthea note and its report (they name the old patients), Hayes's 2026 prenatal visits
// and everything recorded at them (an ACE inhibitor in pregnancy is another task), her OTC
// naproxen, Price's rheumatoid arthritis visit and drugs and his prediabetes entry, and Webb's
// 1985 chlorpheniramine and "allergic disposition".
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';
import { patientRefs } from '../../packages/env/overlay.ts';

const PT = { hayes: 'pt-0026', odum: 'pt-0027', park: 'pt-0028', brooks: 'pt-0029', price: 'pt-0030', webb: 'pt-0031' } as const;
type Who = keyof typeof PT;
const subject = (who: Who) => ({ reference: `Patient/${PT[who]}` });
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const REYES = { reference: 'Practitioner/pr-reyes' };
const LIN = { reference: 'Practitioner/pr-lin' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const CARDIOLOGIST = { reference: 'Practitioner/pr-t6-osei' };
const UC_DOCTOR = { reference: 'Practitioner/pr-t6-marsh' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
const INBOX = 'urn:riverbend:inbox-queue';

const NAMES: Record<Who, { given: string; family: string; prefix: string; gender?: 'female'; birthDate?: string }> = {
  hayes: { given: 'Gloria', family: 'Hayes', prefix: 'Ms.' },
  odum: { given: 'Frank', family: 'Odum', prefix: 'Mr.' },
  park: { given: 'Lena', family: 'Park', prefix: 'Ms.', gender: 'female' },
  brooks: { given: 'Evelyn', family: 'Brooks', prefix: 'Ms.' },
  price: { given: 'Samuel', family: 'Price', prefix: 'Mr.' },
  webb: { given: 'Marcus', family: 'Webb', prefix: 'Mr.' },
};

// Base resources that contradict a scenario. Encounters listed in DROP_ENCOUNTERS take every
// resource recorded at them along.
const DROP_ENCOUNTERS = ['enc-00154', 'enc-00155', 'enc-00156', 'enc-00178'];
const REMOVE: Array<{ resourceType: string; id: string }> = [
  ...['mr-00270', 'mr-00277', 'mr-00278', 'mr-00279'].map((id) => ({ resourceType: 'MedicationRequest', id })),
  ...['cond-00588', 'cond-00634', 'cond-00632'].map((id) => ({ resourceType: 'Condition', id })),
  { resourceType: 'AllergyIntolerance', id: 'alg-00021' },
];

const PRACTITIONERS: Resource[] = [
  { resourceType: 'Practitioner', id: 'pr-t6-osei', active: true, name: [{ use: 'official', given: ['Kwame'], family: 'Osei', suffix: ['MD'] }] },
  { resourceType: 'Practitioner', id: 'pr-t6-marsh', active: true, name: [{ use: 'official', given: ['Helen'], family: 'Marsh', suffix: ['PA-C'] }] },
];

const encounter = (id: string, who: Who, type: [string, string], start: string, end: string, provider = CLINIC, participant = OKAFOR): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: subject(who),
  participant: [{ individual: participant }],
  period: { start, end },
  serviceProvider: provider,
});
const VISIT: [string, string] = ['185349003', 'Encounter for check up (procedure)'];
const PROBLEM: [string, string] = ['185347001', 'Encounter for problem (procedure)'];

const condition = (id: string, who: Who, code: string, display: string, onset: string, abated?: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: abated ? 'resolved' : 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code, display }], text: display },
  subject: subject(who),
  onsetDateTime: onset,
  ...(abated ? { abatementDateTime: abated } : {}),
  recordedDate: onset,
});

const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];
const q = (value: number, unit: string, code = unit) => ({ value, unit, system: UCUM, code });
const lab = (id: string, who: Who, code: [string, string], at: string, issued: string, enc: string, value: { valueQuantity: ReturnType<typeof q> } | { component: unknown[] }): Resource =>
  ({
    resourceType: 'Observation',
    id,
    status: 'final',
    category: LAB,
    code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
    subject: subject(who),
    encounter: { reference: `Encounter/${enc}` },
    effectiveDateTime: at,
    issued,
    ...value,
  }) as Resource;
const component = (code: string, display: string, value: number, unit: string, ucum = unit) => ({ code: { coding: [{ system: LOINC, code, display }], text: display }, valueQuantity: q(value, unit, ucum) });

const FREQ = { QD: [1, 'once daily', 'QD'], BID: [2, 'twice daily', 'BID'], QHS: [1, 'at bedtime', 'BED'] } as const;
const medication = (
  id: string,
  who: Who,
  rx: [code: string, display: string],
  dose: number,
  freq: keyof typeof FREQ,
  authored: string,
  reason: string,
  dispense: { days: number; refills: number; tablets: number },
  extra: Partial<Extract<Resource, { resourceType: 'MedicationRequest' }>> = {},
): Resource => {
  const [perDay, words, gts] = FREQ[freq];
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'active',
    intent: 'order',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
    subject: subject(who),
    authoredOn: authored,
    requester: OKAFOR,
    reasonCode: [{ text: reason }],
    dosageInstruction: [
      {
        text: `${dose} mg by mouth ${words}`,
        timing: { code: { coding: [{ system: GTS, code: gts }], text: words }, repeat: { frequency: perDay, period: 1, periodUnit: 'd', ...(freq === 'QHS' ? { when: ['HS' as const] } : {}) } },
        route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
        doseAndRate: [{ doseQuantity: q(dose, 'mg') }],
      },
    ],
    dispenseRequest: { quantity: q(dispense.tablets, 'tablet', '{tablet}'), numberOfRepeatsAllowed: dispense.refills, expectedSupplyDuration: q(dispense.days, 'days', 'd') },
    ...extra,
  };
};

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
const NOTE_TYPES = { progress: ['11506-3', 'Progress note'], phone: ['34748-4', 'Telephone encounter Note'], consult: ['11488-4', 'Consult note'] } as const;
const note = (id: string, who: Who, date: string, type: keyof typeof NOTE_TYPES, author: { reference: string }, custodian: { reference: string }, text: string, enc?: string): Resource => ({
  resourceType: 'DocumentReference',
  id,
  meta: { tag: [{ system: 'urn:riverbend:provenance', code: 'synthetic', display: 'Hand-written synthetic note' }] },
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

// ---- the six messages and their inbox items ----

interface Item {
  n: number;
  who: Who;
  from: { reference: string };
  sent: string;
  subject: string;
  body: string;
}
const ITEMS: Item[] = [
  { n: 1, who: 'hayes', from: subject('hayes'), sent: '2026-10-21T19:12:00-04:00', subject: 'Refill request', body: 'Hi, could you please refill my lisinopril 20 mg? I have 3 pills left. Thank you, Gloria Hayes' },
  { n: 2, who: 'odum', from: subject('odum'), sent: '2026-10-22T07:40:00-04:00', subject: 'Refill request', body: "I'm almost out of my cholesterol pill, the atorvastatin. Can you send a refill to my pharmacy? Thanks, Frank Odum" },
  {
    n: 4,
    who: 'park',
    from: REYES,
    sent: '2026-10-22T16:55:00-04:00',
    subject: 'Rx for Lena Park',
    body: 'Please send amoxicillin-clavulanate 875/125 BID x7d for Lena Park (sinusitis) per RBC-CP-11. I saw her today; I am out until Monday. Thanks, Jordan',
  },
  { n: 5, who: 'price', from: subject('price'), sent: '2026-10-22T20:05:00-04:00', subject: 'Refill request', body: 'Need a refill of my metformin please. Samuel Price' },
  { n: 6, who: 'webb', from: subject('webb'), sent: '2026-10-22T21:30:00-04:00', subject: 'Appointment', body: 'Could I schedule my yearly physical for sometime in November? Mornings are best for me. Marcus Webb' },
  {
    n: 3,
    who: 'brooks',
    from: subject('brooks'),
    sent: '2026-10-23T06:52:00-04:00',
    subject: 'Feeling off since yesterday',
    body:
      'Since yesterday my stools have been black, and I get lightheaded when I stand up. I am still taking the Eliquis, and the naproxen the urgent care gave me on Tuesday for my back. ' +
      'Should I keep taking them? Evelyn Brooks',
  },
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
  description: `${i.from.reference.startsWith('Patient/') ? 'Portal message' : 'Staff message'}: ${i.subject}`,
  focus: { reference: `Communication/comm-t6-m${i.n}` },
  for: subject(i.who),
  authoredOn: i.sent,
  lastModified: i.sent,
  requester: i.from,
  owner: OKAFOR,
});

// ---- Lena Park's notes: 31 in all, 12 since 2023-10-23 ----

const PARK_PHYSICAL = (year: number, extra: string) =>
  `Annual physical - Riverbend Family Medicine\nLena Park, ${year - 1977} y/o F.\nAllergies: NKDA.\nMedications: none.\n${extra}\nPlan: routine screening up to date; return in 1 year.\n\nMaya Okafor, MD`;
const PARK_NOTES: Array<[date: string, type: keyof typeof NOTE_TYPES, author: { reference: string }, text: string]> = [
  ['2014-05-12T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2014, 'New patient. Healthy. Works as an accountant.')],
  ['2015-02-03T10:10:00-05:00', 'progress', LIN, 'Acute visit - Riverbend Family Medicine\nCough and congestion for 4 days, no fever. Viral upper respiratory infection. Supportive care.\n\nDaniel Lin, MD'],
  ['2015-05-18T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2015, 'No concerns.')],
  ['2016-05-23T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2016, 'Occasional low back pain after long days at a desk; stretching advised.')],
  ['2016-11-08T14:00:00-05:00', 'phone', REYES, 'Telephone note\nAsked about the flu vaccine; scheduled at the nurse clinic.\n\nJordan Reyes, NP'],
  ['2017-05-22T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2017, 'No concerns. BP 118/74.')],
  ['2018-01-15T11:00:00-05:00', 'progress', REYES, 'Acute visit\nSore throat for 2 days, no fever, no exudate, Centor score 0. Viral pharyngitis; no antibiotic.\n\nJordan Reyes, NP'],
  ['2018-05-21T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2018, 'No concerns.')],
  ['2019-03-04T10:00:00-05:00', 'progress', OKAFOR, PARK_PHYSICAL(2019, 'Allergy list reviewed with the patient: no known drug allergies recorded.')],
  ['2019-09-16T15:20:00-04:00', 'progress', LIN, 'Acute visit\nRight ankle sprain stepping off a curb. Ottawa rules negative. Rest, ice, compression; ibuprofen as needed.\n\nDaniel Lin, MD'],
  ['2020-06-08T09:30:00-04:00', 'phone', OKAFOR, 'Telephone visit\nAnnual review by phone. Feeling well. Labs ordered.\n\nMaya Okafor, MD'],
  ['2020-12-14T11:30:00-05:00', 'progress', REYES, 'Acute visit\nNasal congestion and facial pressure for 5 days, improving. Viral rhinosinusitis. Saline rinses.\n\nJordan Reyes, NP'],
  ['2021-05-24T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2021, 'No concerns.')],
  ['2021-10-11T13:00:00-04:00', 'phone', REYES, 'Telephone note\nCOVID-19 booster given at the pharmacy; record updated.\n\nJordan Reyes, NP'],
  ['2022-03-21T10:40:00-04:00', 'progress', LIN, 'Acute visit\nLow back strain after moving furniture. No red flags. Heat, stretching, acetaminophen.\n\nDaniel Lin, MD'],
  ['2022-05-23T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2022, 'No concerns.')],
  ['2022-11-07T16:10:00-05:00', 'phone', REYES, 'Telephone note\nAsked for a copy of her immunization record; sent through the portal.\n\nJordan Reyes, NP'],
  ['2023-05-22T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2023, 'No concerns. Screening mammogram ordered.')],
  ['2023-08-14T10:15:00-04:00', 'phone', REYES, 'Telephone note\nMammogram normal (BI-RADS 1); patient informed.\n\nJordan Reyes, NP'],
  // the 3-year window starts 2023-10-23
  ['2023-11-20T10:30:00-05:00', 'progress', REYES, 'Acute visit\nCough for 10 days after a cold, no fever, lungs clear. Post-viral cough. Honey, fluids.\n\nJordan Reyes, NP'],
  [
    '2024-03-09T18:30:00-05:00',
    'consult',
    UC_DOCTOR,
    'St. Brigid Regional Urgent Care - visit record (scanned outside record)\nPatient: Lena Park   DOB 1977-06-16   Date: 03/09/2024   Time in: 14:05\n\n' +
      'HPI: started Augmentin 875 mg twice daily this morning, prescribed by her dentist for a tooth infection. Took the first dose at 13:40. About 20 minutes later she noticed itching, then diffuse hives over the trunk and arms, lip and throat swelling and a hoarse voice.\n' +
      'Exam: diffuse urticarial wheals, lip edema, no stridor at rest. BP 102/64, HR 112, SpO2 96% on room air.\n' +
      'Treatment: epinephrine 0.3 mg IM to the thigh at 14:15; cetirizine 10 mg by mouth. Swelling and hives resolved over 2 hours; observed 4 hours.\n' +
      'Plan: stop Augmentin; dentist to choose another antibiotic. Return or call 911 for any recurrence.\n\nHelen Marsh, PA-C',
  ],
  ['2024-05-20T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2024, 'No concerns. Dental work completed this spring.')],
  ['2024-09-30T11:00:00-04:00', 'phone', REYES, 'Telephone note\nFlu vaccine given at the nurse clinic.\n\nJordan Reyes, NP'],
  ['2025-01-27T10:20:00-05:00', 'progress', LIN, 'Acute visit\nLeft knee pain after a hike. No effusion, ligaments stable. Patellofemoral pain; physical therapy referral.\n\nDaniel Lin, MD'],
  ['2025-05-19T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2025, 'Family history updated: mother - penicillin rash; father - hypertension, type 2 diabetes.')],
  ['2025-08-04T14:30:00-04:00', 'phone', REYES, 'Telephone note\nKnee better after 6 weeks of physical therapy; discharged from PT.\n\nJordan Reyes, NP'],
  ['2025-11-17T10:45:00-05:00', 'progress', REYES, 'Acute visit\nSneezing and runny nose for 3 days. Viral upper respiratory infection. Supportive care.\n\nJordan Reyes, NP'],
  ['2026-02-09T15:00:00-05:00', 'phone', REYES, 'Telephone note\nAsked about a shingles vaccine; eligible at 50, to discuss at her physical.\n\nJordan Reyes, NP'],
  ['2026-05-18T09:30:00-04:00', 'progress', OKAFOR, PARK_PHYSICAL(2026, 'No concerns.')],
  ['2026-07-27T11:30:00-04:00', 'phone', REYES, 'Telephone note\nPortal question about travel vaccines for a trip to Mexico; hepatitis A advised.\n\nJordan Reyes, NP'],
  [
    '2026-10-22T16:40:00-04:00',
    'progress',
    REYES,
    'Acute visit - Riverbend Family Medicine\nLena Park, 49 y/o F. Nasal congestion, purulent discharge and maxillary pain for 12 days, better on day 6 and worse again since day 9; temperature 38.4 C today.\n' +
      'Allergies: NKDA.\nAssessment: acute bacterial sinusitis (persistent and double-worsening course).\nPlan: antibiotic per RBC-CP-11, sent to Dr. Okafor to prescribe; saline rinses; return if not better in 3 days.\n\nJordan Reyes, NP',
  ],
];
const parkId = (date: string) => `doc-t6-park-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;

const HAYES_VISIT = `Progress note - Riverbend Family Medicine\nGloria Hayes. Follow-up of hypertension.\nBP 128/78 on lisinopril 20 mg daily and amlodipine 2.5 mg daily. No cough, no swelling.\nPlan: continue both. Labs at the next visit.\n\nMaya Okafor, MD`;
const ODUM_CARDIOLOGY = `St. Brigid Regional - Cardiology consult\nFrank Odum. Referred for hyperlipidemia and a family history of early coronary disease.\n` +
  `Muscle aches in both thighs for 2 months on atorvastatin 40 mg; CK normal. Atorvastatin stopped for myalgias. Started rosuvastatin 10 mg daily; prescription sent to his pharmacy.\n` +
  `Repeat lipid panel in 3 months. Copy to Dr. Okafor.\n\nKwame Osei, MD`;
const BROOKS_UC = `St. Brigid Regional Urgent Care - visit record\nEvelyn Brooks. Low back strain lifting a box 2 days ago. No leg weakness, no bladder or bowel change.\n` +
  `Plan: naproxen 500 mg twice daily for 10 days with food, heat, stretching.\n\nHelen Marsh, PA-C`;
const PRICE_VISIT = `Progress note - Riverbend Family Medicine\nSamuel Price. Type 2 diabetes follow-up.\nHbA1c 7.1%; eGFR 62. Feels well; walking daily.\nPlan: continue metformin 1000 mg twice daily. Recheck in 6 months.\n\nMaya Okafor, MD`;

const overlay: Overlay = {
  task: 'T6',
  build(world: WorldReader) {
    const dropped = new Set(DROP_ENCOUNTERS.map((id) => `Encounter/${id}`));
    const atDropped = [...world.resources()].filter((r) => {
      const enc = (r as { encounter?: { reference?: string } }).encounter?.reference;
      const ctx = (r as { context?: { encounter?: Array<{ reference?: string }> } }).context?.encounter ?? [];
      return (enc !== undefined && dropped.has(enc)) || ctx.some((e) => e.reference !== undefined && dropped.has(e.reference));
    });
    // Every Synthea note of the six, and the history-and-physical report beside it.
    const slots = new Set(Object.values(PT) as string[]);
    const synthea = [...world.resources()].filter(
      (r) =>
        (r.resourceType === 'DocumentReference' || (r.resourceType === 'DiagnosticReport' && (r as { code?: { coding?: Array<{ code?: string }> } }).code?.coding?.[0]?.code === '34117-2')) &&
        [...patientRefs(r)].some((p) => slots.has(p)),
    );
    const remove = [...REMOVE, ...DROP_ENCOUNTERS.map((id) => ({ resourceType: 'Encounter', id })), ...[...atDropped, ...synthea].map((r) => ({ resourceType: r.resourceType, id: r.id! }))];
    const unique = [...new Map(remove.map((r) => [`${r.resourceType}/${r.id}`, r])).values()];

    const patients = (Object.keys(PT) as Who[]).map((who): Resource => {
      const p = world.get('Patient', PT[who]) as Extract<Resource, { resourceType: 'Patient' }>;
      const n = NAMES[who];
      return { ...p, name: [{ use: 'official', family: n.family, given: [n.given], prefix: [n.prefix] }], ...(n.gender ? { gender: n.gender } : {}) };
    });

    const put: Resource[] = [
      ...patients,
      ...PRACTITIONERS,
      ...ITEMS.flatMap((i) => [message(i), inboxItem(i)]),

      // M1: hypertension on lisinopril; the last BMP is from 2025-09-08, the last visit 2026-03-17.
      encounter('enc-t6-hayes-0908', 'hayes', VISIT, '2025-09-08T10:00:00-04:00', '2025-09-08T10:30:00-04:00'),
      encounter('enc-t6-hayes-0317', 'hayes', VISIT, '2026-03-17T14:00:00-04:00', '2026-03-17T14:20:00-04:00'),
      lab('obs-t6-hayes-bmp-0908', 'hayes', ['24321-2', 'Basic metabolic 2000 panel - Serum or Plasma'], '2025-09-08T10:20:00-04:00', '2025-09-08T15:05:00-04:00', 'enc-t6-hayes-0908', {
        component: [
          component('2951-2', 'Sodium [Moles/volume] in Serum or Plasma', 139, 'mmol/L'),
          component('2823-3', 'Potassium [Moles/volume] in Serum or Plasma', 4.4, 'mmol/L'),
          component('2075-0', 'Chloride [Moles/volume] in Serum or Plasma', 103, 'mmol/L'),
          component('2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma', 25, 'mmol/L'),
          component('3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma', 14, 'mg/dL'),
          component('2160-0', 'Creatinine [Mass/volume] in Serum or Plasma', 0.82, 'mg/dL'),
          component('2345-7', 'Glucose [Mass/volume] in Serum or Plasma', 96, 'mg/dL'),
        ],
      }),
      medication('mr-t6-lisinopril', 'hayes', ['314077', 'lisinopril 20 MG Oral Tablet'], 20, 'QD', '2025-09-08T10:30:00-04:00', 'Essential hypertension', { days: 90, refills: 3, tablets: 90 }),
      note('doc-t6-hayes-0317', 'hayes', '2026-03-17T14:20:00-04:00', 'progress', OKAFOR, CLINIC, HAYES_VISIT, 'enc-t6-hayes-0317'),

      // M2: atorvastatin still active here; cardiology stopped it on 2026-08-11.
      condition('cond-t6-odum-hld', 'odum', '55822004', 'Hyperlipidemia (disorder)', '2019-02-11T10:00:00-05:00'),
      medication('mr-t6-atorvastatin', 'odum', ['617311', 'atorvastatin 40 MG Oral Tablet'], 40, 'QHS', '2025-01-08T10:36:00-05:00', 'Hyperlipidemia', { days: 90, refills: 3, tablets: 90 }),
      encounter('enc-t6-odum-0811', 'odum', ['11429006', 'Consultation (procedure)'], '2026-08-11T13:00:00-04:00', '2026-08-11T13:40:00-04:00', HOSPITAL, CARDIOLOGIST),
      note('doc-t6-odum-0811', 'odum', '2026-08-11T15:10:00-04:00', 'consult', CARDIOLOGIST, HOSPITAL, ODUM_CARDIOLOGY, 'enc-t6-odum-0811'),

      // M3: DVT in June on apixaban; naproxen from urgent care on Tuesday 2026-10-20.
      condition('cond-t6-brooks-dvt', 'brooks', '128053003', 'Deep venous thrombosis (disorder)', '2026-06-02T18:00:00-04:00'),
      medication('mr-t6-apixaban', 'brooks', ['1364445', 'apixaban 5 MG Oral Tablet'], 5, 'BID', '2026-06-12T10:00:00-04:00', 'Deep vein thrombosis of the left leg (06/2026)', { days: 90, refills: 1, tablets: 180 }),
      encounter('enc-t6-brooks-1020', 'brooks', PROBLEM, '2026-10-20T17:30:00-04:00', '2026-10-20T18:15:00-04:00', HOSPITAL, UC_DOCTOR),
      medication('mr-t6-naproxen', 'brooks', ['198014', 'naproxen 500 MG Oral Tablet'], 500, 'BID', '2026-10-20T18:10:00-04:00', 'Low back strain', { days: 10, refills: 0, tablets: 20 }, { requester: UC_DOCTOR }),
      note('doc-t6-brooks-1020', 'brooks', '2026-10-20T18:15:00-04:00', 'progress', UC_DOCTOR, HOSPITAL, BROOKS_UC, 'enc-t6-brooks-1020'),

      // M4: the coded NKDA from 2019 and the 31 notes.
      {
        resourceType: 'AllergyIntolerance',
        id: 'alg-t6-park-nkda',
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active', display: 'Active' }] },
        verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed', display: 'Confirmed' }] },
        // A drug-allergy statement: record_allergy takes the category of a code from the world.
        category: ['medication'],
        code: { coding: [{ system: SNOMED, code: '409137002', display: 'No known drug allergy (situation)' }], text: 'No known drug allergy' },
        patient: subject('park'),
        recordedDate: '2019-03-04T10:00:00-05:00',
        recorder: OKAFOR,
      },
      condition('cond-t6-park-sinusitis', 'park', '15805002', 'Acute sinusitis (disorder)', '2026-10-22T16:40:00-04:00'),
      ...PARK_NOTES.map(([date, type, author, text]) => note(parkId(date), 'park', date, type, author, author === UC_DOCTOR ? HOSPITAL : CLINIC, text)),

      // M5: type 2 diabetes on metformin; HbA1c and eGFR at the 2026-07-15 visit.
      condition('cond-t6-price-t2dm', 'price', '44054006', 'Diabetes mellitus type 2 (disorder)', '2024-02-12T10:00:00-05:00'),
      encounter('enc-t6-price-0715', 'price', VISIT, '2026-07-15T09:00:00-04:00', '2026-07-15T09:30:00-04:00'),
      lab('obs-t6-price-a1c-0715', 'price', ['4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'], '2026-07-15T09:10:00-04:00', '2026-07-15T14:30:00-04:00', 'enc-t6-price-0715', { valueQuantity: q(7.1, '%') }),
      lab('obs-t6-price-scr-0715', 'price', ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'], '2026-07-15T09:10:00-04:00', '2026-07-15T14:30:00-04:00', 'enc-t6-price-0715', { valueQuantity: q(1.41, 'mg/dL') }),
      lab(
        'obs-t6-price-egfr-0715',
        'price',
        ['98979-8', 'Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)/1.73 sq M'],
        '2026-07-15T09:10:00-04:00',
        '2026-07-15T14:30:00-04:00',
        'enc-t6-price-0715',
        { valueQuantity: q(62, 'mL/min/1.73m2', 'mL/min/{1.73_m2}') },
      ),
      medication('mr-t6-metformin', 'price', ['861004', 'metformin hydrochloride 1000 MG Oral Tablet'], 1000, 'BID', '2026-07-15T09:30:00-04:00', 'Type 2 diabetes mellitus', { days: 90, refills: 0, tablets: 180 }),
      note('doc-t6-price-0715', 'price', '2026-07-15T09:30:00-04:00', 'progress', OKAFOR, CLINIC, PRICE_VISIT, 'enc-t6-price-0715'),
    ];
    return {
      put,
      remove: unique,
      lint: {
        thresholds: [{ quantity: 'egfr', threshold: 45, observation: 'obs-t6-price-egfr-0715' }],
        windows: [
          { name: 'M1 BMP within 12 months', boundary: { months: 12 }, resources: ['obs-t6-hayes-bmp-0908'] },
          { name: 'M1 visit within 15 months', boundary: { months: 15 }, resources: ['enc-t6-hayes-0317', 'enc-t6-hayes-0908'] },
          { name: 'M5 HbA1c within 6 months', boundary: { months: 6 }, resources: ['obs-t6-price-a1c-0715'] },
          { name: 'M4 notes from the last 3 years', boundary: { years: 3 }, resources: PARK_NOTES.map(([date]) => parkId(date)) },
        ],
        leakage: { answers: ['doxycycline'], distractors: PARK_NOTES.map(([date]) => parkId(date)) },
      },
    };
  },
};

export default overlay;
