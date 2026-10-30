// T3 crc-care-gap overlay (design section 4, "T3"): the panel group 'Okafor CRC 2026' over the
// fourteen slots, each keeping its Synthea chart. The overlay adds the group, each case's
// screening history and exclusion facts, and moves six birth dates so the ages fit the design
// (E4 45 and E5 75 today, E7 72, E8 69, E15 72 and E16 68 at the end of 2026). It removes what would change a
// patient's answer or contradict the story: every Synthea colonoscopy on the slots (they would
// make the gap patients met), the colon-screening reason on Synthea check-ups (policy.test
// checks no slot resource outside the overlay mentions colon screening), the note reports, the
// 'MD' suffix on E5's name, and two conditions dated before the moved birth dates allow
// (pt-0023's 'received higher education' at 12, pt-0019's adolescent scoliosis at 27). Of
// Synthea's notes it keeps each slot's two newest that never mention the colon or screening for
// it, edited (editNote) so they state no Synthea age and agree with the coded chart, so
// search_notes has ordinary notes to wade through. It resolves leftovers a clinician would
// notice: active 'Full-time employment' on frail E7 and E8, a 1998 anemia on E3 whose 2025 hemoglobin is 14.1, a 2024
// alteplase dose on E12 still active, and 'Unemployed' on E15, who lives in a nursing home.
//
// Traps (design panel table): E2's colonoscopy (2016) and E3's sDNA-FIT (2023) fall just before
// their calendar-year windows; E10's FIT is from 2025; pt-0023 and pt-0011 sit either side of the
// age range at the end of 2026 but not today; a scanned operative note is the only record of E6's
// total colectomy; donepezil with frailty excludes E7, while frailty alone does not exclude E8;
// E11's FIT order is already active. E15 (P19) lives long term in a nursing home, recorded only as
// structured data: his newest housing status (LOINC 71802-3, the CMS130v14 assessment) says 'Lives
// in nursing home', his address is the facility and his last visit was a nursing facility visit;
// no note names it. E16 had a three-week skilled nursing rehab stay after a hip fracture and went
// home, which is not long-term residence: his discharge summary is the note a notes-only search
// finds, and his newest housing status says he lives in his own home.
//
// Ids (P19 hygiene): the resources this overlay adds carry the task tag the isolation rule needs
// (packages/env/overlay.ts) and an opaque number, never a case label or what the resource is, so
// no id sequence maps the traps (pilot-1 trials navigated by 'e1 through e12').
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const SLOTS = ['pt-0009', 'pt-0011', 'pt-0014', 'pt-0017', 'pt-0018', 'pt-0019', 'pt-0020', 'pt-0021', 'pt-0022', 'pt-0023', 'pt-0024', 'pt-0025', 'pt-0034', 'pt-0035'];
const E = { E1: 'pt-0014', E2: 'pt-0017', E3: 'pt-0018', E4: 'pt-0023', E5: 'pt-0011', E6: 'pt-0021', E7: 'pt-0009', E8: 'pt-0019', E9: 'pt-0020', E10: 'pt-0022', E11: 'pt-0024', E12: 'pt-0025', E15: 'pt-0034', E16: 'pt-0035' } as const;
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const subject = (pt: string) => ({ reference: `Patient/${pt}` });

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const UCUM = 'http://unitsofmeasure.org';
const COLONOSCOPY = '73761001';

// Birth dates the design's ages need (age today and at the end of 2026).
const BIRTH: Record<string, string> = { [E.E4]: '1980-12-15', [E.E5]: '1950-11-20', [E.E7]: '1954-05-10', [E.E8]: '1957-10-28', [E.E15]: '1954-03-22', [E.E16]: '1958-06-17' };
// Conditions dated before the moved birth date allows, and E5's miscarriage, which the moved
// birth date puts at age 61.
const REMOVE_CONDITIONS = ['cond-00518', 'cond-00437', 'cond-00283'];
// Synthea leftovers to resolve, with the date each ended: employment on E7 and E8 by their
// frailty, E3's anemia by his normal 2025 hemoglobin (obs-01452), and the full-time employment
// recorded for E5 at 75 in June 2026, and E15's unemployment by his nursing home housing status.
// E16's part-time work at 67 stays: it fits a man who goes home after rehab.
// E16's 2006 intimate partner abuse finding was left active by Synthea on a man who now lives
// alone; it is resolved as historical (verifier-phase-P19-T3-1 D3).
const RESOLVE_CONDITIONS: Record<string, string> = { 'cond-00231': '2025-09-16', 'cond-00452': '2026-03-04', 'cond-00425': '2025-07-06', 'cond-00296': '2026-09-01', 'cond-00699': '2026-02-10', 'cond-00703': '2009-05-01' };
const COMPLETE_MEDICATIONS = ['mr-00269'];
const SCREENING_FOR_COLON_CANCER = '275978004';
// A note that mentions the colon or a stool test would speak to a member's screening answer.
const ABOUT_COLON = /colon|colorectal|occult|fecal|sigmoid|stool|\bFIT\b|275978004/i;
const NOTES_KEPT = 2;

const SURGEON: Resource = { resourceType: 'Practitioner', id: 'pr-t3-7046', active: true, name: [{ use: 'official', given: ['Tolu'], family: 'Adeyemi', suffix: ['MD'] }] };

const group: Resource = {
  resourceType: 'Group',
  id: 'grp-t3-okafor-crc',
  active: true,
  type: 'person',
  actual: true,
  code: { text: 'Quality worklist: colorectal cancer screening, 2026' },
  name: 'Okafor CRC 2026',
  managingEntity: OKAFOR,
  quantity: SLOTS.length,
  member: SLOTS.map((pt) => ({ entity: subject(pt), period: { start: '2026-01-02' } })),
};

// A screening study's outcome says it was normal, so it reads as screening, not surveillance.
const procedure = (id: string, pt: string, code: [string, string], at: string, outcome?: string): Resource => ({
  resourceType: 'Procedure',
  id,
  status: 'completed',
  code: { coding: [{ system: SNOMED, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  performedDateTime: at,
  performer: [{ actor: HOSPITAL }],
  ...(outcome ? { outcome: { text: outcome } } : {}),
});
const NORMAL = 'Normal, no polyps';

const NEGATIVE = { coding: [{ system: SNOMED, code: '260385009', display: 'Negative' }], text: 'Negative' };
const stoolTest = (id: string, pt: string, code: [string, string], at: string, issued: string): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  effectiveDateTime: at,
  issued,
  performer: [CLINIC],
  valueCodeableConcept: NEGATIVE,
});

const condition = (id: string, pt: string, code: [string, string], onset: string, category: 'problem-list-item' | 'encounter-diagnosis' = 'problem-list-item'): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: category }] }],
  code: { coding: [{ system: SNOMED, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  onsetDateTime: onset,
  recordedDate: onset,
  recorder: OKAFOR,
});

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
const unbase64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

type Doc = Extract<Resource, { resourceType: 'DocumentReference' }>;
const noteText = (d: Doc) => d.content.map((c) => (c.attachment.data ? unbase64(c.attachment.data) : '')).join('\n');
// The edits a kept Synthea note gets. 'Marilu Blanca is a 61 year-old hispanic white female.'
// names the old age. E5's history lists a colon polyp that no coded resource records. E7's
// medication list predates the overlay's donepezil (authored 2025-06-10), which her later notes
// must list.
function editNote(text: string, pt: string, date: string): string {
  let t = text.replace(/ is an? \d+ year-old /g, ' is a ').replace(/, polyp of colon \(disorder\)/g, '');
  if (pt === E.E7 && date >= '2025-06-10') t = t.replace(/^(# Medications\n.+)$/m, '$1; donepezil hydrochloride 10 mg oral tablet');
  return t;
}

// E6's outside operative note, scanned into the chart: its text is what the scan's OCR gives.
const OPERATIVE_NOTE = `[Scanned outside record - received 2015-07-14 - text from scan]

St. Brigid Regional - Operative Report
Patient: Angela A. Vigil   DOB 09/24/1974
Date of surgery: 06/03/2015
Surgeon: Tolu Adeyemi, MD   Service: Colorectal Surgery

Preoperative diagnosis: ulcerative pancolitis, refractory to medical therapy.
Postoperative diagnosis: same.
Procedure: total proctocolectomy with end ileostomy (laparoscopic-assisted).

Findings: diffuse colitis from cecum to rectum. Entire colon and rectum removed.
Specimen: colon and rectum, to pathology; no dysplasia on frozen section.
Estimated blood loss 150 mL. No complications.

Disposition: to recovery in stable condition.
Tolu Adeyemi, MD`;

const opNote: Resource = {
  resourceType: 'DocumentReference',
  id: 'doc-t3-1856',
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11504-8', display: 'Surgical operation note' }], text: 'Surgical operation note' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: subject(E.E6),
  // Created when the outside report was scanned in; the surgery is the period it covers.
  date: '2015-07-14T11:05:00-04:00',
  author: [{ reference: 'Practitioner/pr-t3-7046' }],
  custodian: HOSPITAL,
  description: 'Scanned outside record',
  context: { period: { start: '2015-06-03T08:00:00-04:00', end: '2015-06-03T16:20:00-04:00' } },
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(OPERATIVE_NOTE), title: 'Outside operative report (scanned)' } }],
};

const donepezil: Resource = {
  resourceType: 'MedicationRequest',
  id: 'mr-t3-3318',
  status: 'active',
  intent: 'order',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
  medicationCodeableConcept: { coding: [{ system: RXNORM, code: '997223', display: 'donepezil hydrochloride 10 MG Oral Tablet' }], text: 'donepezil hydrochloride 10 MG Oral Tablet' },
  subject: subject(E.E7),
  authoredOn: '2025-06-10T10:00:00-04:00',
  requester: OKAFOR,
  reasonCode: [{ text: 'Alzheimer dementia, mild (diagnosed by outside neurology)' }],
  dosageInstruction: [
    {
      text: '10 mg by mouth at bedtime',
      timing: { code: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation', code: 'BED' }], text: 'at bedtime' }, repeat: { frequency: 1, period: 1, periodUnit: 'd', when: ['HS'] } },
      route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
      doseAndRate: [{ doseQuantity: { value: 10, unit: 'mg', system: UCUM, code: 'mg' } }],
    },
  ],
  dispenseRequest: { numberOfRepeatsAllowed: 3, expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' } },
};

const hospice: Resource = {
  resourceType: 'EpisodeOfCare',
  id: 'eoc-t3-8215',
  status: 'active',
  type: [{ coding: [{ system: SNOMED, code: '385763009', display: 'Hospice care' }], text: 'Hospice care' }],
  diagnosis: [{ condition: { reference: 'Condition/cond-t3-0794' }, rank: 1 }],
  patient: subject(E.E9),
  managingOrganization: HOSPITAL,
  period: { start: '2026-08-20' },
  careManager: OKAFOR,
};

const activeFit: Resource = {
  resourceType: 'ServiceRequest',
  id: 'sr-t3-6648',
  status: 'active',
  intent: 'order',
  category: [{ coding: [{ system: SNOMED, code: '108252007', display: 'Laboratory procedure' }], text: 'lab' }],
  priority: 'routine',
  code: { coding: [{ system: 'urn:riverbend:orders', code: 'LAB-FIT-KIT', display: 'FIT kit, mailed (fecal immunochemical test for colorectal cancer screening)' }], text: 'FIT kit, mailed (fecal immunochemical test for colorectal cancer screening)' },
  subject: subject(E.E11),
  occurrencePeriod: { start: '2026-09-30', end: '2026-11-30' },
  authoredOn: '2026-09-30T10:15:00-04:00',
  requester: OKAFOR,
  reasonCode: [{ text: 'Colorectal cancer screening' }],
};

// E15 and E16 (P19, reports/researcher-16.md T3): the two care facilities, each the
// serviceProvider of its stay or visit.
const MAPLE_GROVE: Resource = { resourceType: 'Organization', id: 'org-t3-5520', active: true, name: 'Maple Grove Care Center', address: [{ line: ['1420 Maple Grove Road'], city: 'Fitchburg', state: 'MA', postalCode: '01420', country: 'US' }] };
const CEDAR_HILL: Resource = { resourceType: 'Organization', id: 'org-t3-3147', active: true, name: 'Cedar Hill Rehabilitation and Skilled Nursing', address: [{ line: ['88 Cedar Hill Drive'], city: 'Milford', state: 'MA', postalCode: '01757', country: 'US' }] };
// E15's long-term-care chart (verifier-phase-P19-T3-1 D4): the stroke of December 2025 that left
// him with a left hemiparesis, his hypertension, the medications he takes since, his vitals at the
// July facility visit, and his February sinusitis visit rewritten as Dr. Lin's visit at the facility. Nothing
// here names the nursing home: his residence stays in the housing status, the address and the
// visits' service provider.
// The note keeps its date line, so the world's clinic-hours hygiene can still move
// the visit (a date written here would pin it); its text says rounds and staff, not where.
const E15_VISIT_NOTE = 'doc-00204';
const E15_VISIT_TEXT = `# Chief Complaint
Nasal congestion and facial pressure for 5 days.

# History of Present Illness
Seen on rounds. Rickey is a nonhispanic white male with a left hemiparesis since his stroke in December 2025, and hypertension. Staff report clear nasal discharge and a mild cough, no fever, eating and sleeping as usual. He transfers with one assist and walks short distances with a walker.

# Social History
Patient has never smoked.
Patient has a high school education.
Patient currently has UnitedHealthcare.

# Allergies
No Known Allergies.

# Medications
clopidogrel 75 mg oral tablet; atorvastatin 40 mg oral tablet; amlodipine 5 mg oral tablet

# Assessment and Plan
Patient is presenting with viral sinusitis (disorder). Saline nasal spray and fluids; staff to call if fever, or no better in 10 days.
`;
// Everything before the first heading: Synthea's blank line and date line.
const dateLines = (text: string) => text.slice(0, text.indexOf('# Chief Complaint'));
const e15VisitNote = (d: Doc): Doc => ({
  ...d,
  content: d.content.map((c) => (c.attachment.data ? { ...c, attachment: { ...c.attachment, data: base64(`${dateLines(unbase64(c.attachment.data))}${E15_VISIT_TEXT}`) } } : c)),
});
const e15Medication = (id: string, rx: [string, string], dose: number, reason: string): Resource => ({
  resourceType: 'MedicationRequest',
  id,
  status: 'active',
  intent: 'order',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
  medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
  subject: subject(E.E15),
  authoredOn: '2025-12-12T11:00:00-05:00',
  requester: OKAFOR,
  reasonCode: [{ text: reason }],
  dosageInstruction: [
    {
      text: `${dose} mg by mouth once daily`,
      timing: { code: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation', code: 'QD' }], text: 'once daily' }, repeat: { frequency: 1, period: 1, periodUnit: 'd' } },
      route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
      doseAndRate: [{ doseQuantity: { value: dose, unit: 'mg', system: UCUM, code: 'mg' } }],
    },
  ],
  dispenseRequest: { numberOfRepeatsAllowed: 3, expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' } },
});
const VITAL = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital signs' }] }];
const MMHG = (value: number) => ({ value, unit: 'mm[Hg]', system: UCUM, code: 'mm[Hg]' });
const e15Vital = (id: string, code: [string, string], rest: object): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: VITAL,
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(E.E15),
  encounter: { reference: 'Encounter/enc-t3-7781' },
  effectiveDateTime: '2026-07-14T10:10:00-04:00',
  issued: '2026-07-14T10:12:00-04:00',
  ...rest,
} as Resource);
const strokeStay: Resource = {
  resourceType: 'Encounter',
  id: 'enc-t3-2087',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP' },
  type: [{ coding: [{ system: SNOMED, code: '32485007', display: 'Hospital admission (procedure)' }], text: 'Hospital admission (procedure)' }],
  subject: subject(E.E15),
  period: { start: '2025-12-04T07:40:00-05:00', end: '2025-12-12T11:00:00-05:00' },
  reasonCode: [{ coding: [{ system: SNOMED, code: '230690007', display: 'Cerebrovascular accident (disorder)' }], text: 'Cerebrovascular accident (disorder)' }],
  serviceProvider: HOSPITAL,
};
const e15Chart = (world: WorldReader): Resource[] => {
  const visit = world.get('Encounter', 'enc-00204') as Extract<Resource, { resourceType: 'Encounter' }>;
  return [
    strokeStay,
    { ...condition('cond-t3-3904', E.E15, ['230690007', 'Cerebrovascular accident (disorder)'], '2025-12-04T07:40:00-05:00', 'encounter-diagnosis'), encounter: { reference: 'Encounter/enc-t3-2087' } } as Resource,
    condition('cond-t3-6618', E.E15, ['50582007', 'Hemiplegia (disorder)'], '2025-12-04T07:40:00-05:00'),
    condition('cond-t3-9251', E.E15, ['59621000', 'Essential hypertension (disorder)'], '2016-04-11T10:00:00-04:00'),
    e15Medication('mr-t3-4436', ['309362', 'clopidogrel 75 MG Oral Tablet'], 75, 'Cerebrovascular accident, secondary prevention'),
    e15Medication('mr-t3-7725', ['617311', 'atorvastatin 40 MG Oral Tablet'], 40, 'Cerebrovascular accident, secondary prevention'),
    e15Medication('mr-t3-1580', ['197361', 'amlodipine 5 MG Oral Tablet'], 5, 'Essential hypertension'),
    e15Vital('obs-t3-5179', ['85354-9', 'Blood pressure panel with all children optional'], {
      component: [
        { code: { coding: [{ system: LOINC, code: '8462-4', display: 'Diastolic Blood Pressure' }], text: 'Diastolic Blood Pressure' }, valueQuantity: MMHG(78) },
        { code: { coding: [{ system: LOINC, code: '8480-6', display: 'Systolic Blood Pressure' }], text: 'Systolic Blood Pressure' }, valueQuantity: MMHG(132) },
      ],
    }),
    e15Vital('obs-t3-0632', ['8867-4', 'Heart rate'], { valueQuantity: { value: 72, unit: '/min', system: UCUM, code: '/min' } }),
    e15Vital('obs-t3-4851', ['29463-7', 'Body Weight'], { valueQuantity: { value: 79.4, unit: 'kg', system: UCUM, code: 'kg' } }),
    // His February sinusitis visit was Dr. Lin's at the facility.
    { ...visit, type: [{ coding: [{ system: SNOMED, code: '18170008', display: 'Subsequent nursing facility visit' }], text: 'Subsequent nursing facility visit' }], serviceProvider: { reference: 'Organization/org-t3-5520' } },
  ];
};

// E16's hip fracture as his discharge summary states it (verifier-phase-P19-T3-1 D3): the fall at
// home, the St. Brigid admission and the left hip hemiarthroplasty on 04/30, then the Cedar Hill
// stay; and the 2026-06-01 visit at which his housing status was taken.
const fractureStay: Resource = {
  resourceType: 'Encounter',
  id: 'enc-t3-5364',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP' },
  type: [{ coding: [{ system: SNOMED, code: '32485007', display: 'Hospital admission (procedure)' }], text: 'Hospital admission (procedure)' }],
  subject: subject(E.E16),
  period: { start: '2026-04-29T18:20:00-04:00', end: '2026-05-03T14:00:00-04:00' },
  reasonCode: [{ coding: [{ system: SNOMED, code: '5913000', display: 'Fracture of neck of femur (disorder)' }], text: 'Fracture of neck of femur (disorder)' }],
  hospitalization: {
    dischargeDisposition: { coding: [{ system: 'http://www.nubc.org/patient-discharge', code: '03', display: 'Discharged/transferred to skilled nursing facility' }], text: 'Discharged/transferred to skilled nursing facility' },
  },
  serviceProvider: HOSPITAL,
};
const e16Chart: Resource[] = [
  fractureStay,
  {
    ...condition('cond-t3-7419', E.E16, ['5913000', 'Fracture of neck of femur (disorder)'], '2026-04-29T18:20:00-04:00', 'encounter-diagnosis'),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }] },
    abatementDateTime: '2026-06-11T10:00:00-04:00',
    encounter: { reference: 'Encounter/enc-t3-5364' },
  } as Resource,
  {
    resourceType: 'Procedure',
    id: 'proc-t3-8836',
    status: 'completed',
    code: { text: 'Left hip hemiarthroplasty' },
    subject: subject(E.E16),
    encounter: { reference: 'Encounter/enc-t3-5364' },
    performedDateTime: '2026-04-30T10:00:00-04:00',
    performer: [{ actor: HOSPITAL }],
    reasonCode: [{ text: 'Fracture of neck of femur, left' }],
  },
  {
    resourceType: 'Encounter',
    id: 'enc-t3-9902',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    type: [{ coding: [{ system: SNOMED, code: '185347001', display: 'Encounter for problem (procedure)' }], text: 'Encounter for problem (procedure)' }],
    subject: subject(E.E16),
    participant: [{ individual: OKAFOR }],
    period: { start: '2026-06-01T09:30:00-04:00', end: '2026-06-01T10:00:00-04:00' },
    reasonCode: [{ text: 'Follow-up after skilled nursing facility discharge' }],
    serviceProvider: CLINIC,
  },
];

// E15's home address is his room at Maple Grove.
const E15_ADDRESS = [{ use: 'home' as const, line: ['Maple Grove Care Center', '1420 Maple Grove Road, Room 214'], city: 'Fitchburg', state: 'MA', postalCode: '01420', country: 'US' }];

// CMS130v14's long-term nursing home exclusion reads the newest 'Housing status' assessment
// (LOINC 71802-3) on or before the end of the period, with the result 'Lives in nursing home
// (finding)' (SNOMED 160734000); E16's says he lives in his own home (LOINC answer LA18839-3).
const housingStatus = (id: string, pt: string, at: string, value: [system: string, code: string, display: string], enc?: string): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'social-history', display: 'Social history' }] }],
  code: { coding: [{ system: LOINC, code: '71802-3', display: 'Housing status' }], text: 'Housing status' },
  subject: subject(pt),
  ...(enc ? { encounter: { reference: `Encounter/${enc}` } } : {}),
  effectiveDateTime: at,
  issued: at,
  performer: [OKAFOR],
  valueCodeableConcept: { coding: [{ system: value[0], code: value[1], display: value[2] }], text: value[2] },
});

const nursingFacilityVisit: Resource = {
  resourceType: 'Encounter',
  id: 'enc-t3-7781',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  type: [{ coding: [{ system: SNOMED, code: '18170008', display: 'Subsequent nursing facility visit' }], text: 'Subsequent nursing facility visit' }],
  subject: subject(E.E15),
  participant: [{ type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF', display: 'primary performer' }], text: 'primary performer' }], individual: OKAFOR }],
  period: { start: '2026-07-14T10:00:00-04:00', end: '2026-07-14T10:30:00-04:00' },
  serviceProvider: { reference: 'Organization/org-t3-5520' },
};

// Synthea's own encounter type for a skilled nursing stay, and the world's routine-discharge code.
const rehabStay: Resource = {
  resourceType: 'Encounter',
  id: 'enc-t3-4609',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP' },
  type: [{ coding: [{ system: SNOMED, code: '25675004', display: 'Patient transfer to skilled nursing facility (procedure)' }], text: 'Patient transfer to skilled nursing facility (procedure)' }],
  subject: subject(E.E16),
  period: { start: '2026-05-03T15:00:00-04:00', end: '2026-05-24T11:00:00-04:00' },
  reasonCode: [{ text: 'Rehabilitation after left hip hemiarthroplasty for a femoral neck fracture' }],
  hospitalization: {
    dischargeDisposition: { coding: [{ system: 'http://www.nubc.org/patient-discharge', code: '01', display: 'Discharged to home care or self care (routine discharge)' }], text: 'Discharged to home care or self care (routine discharge)' },
  },
  serviceProvider: { reference: 'Organization/org-t3-3147' },
};

const DISCHARGE_SUMMARY = `[Outside record - received 2026-05-27]

Cedar Hill Rehabilitation and Skilled Nursing - Discharge Summary
Patient: Elvin L. Wolff   DOB 06/17/1958
Admitted: 05/03/2026, from St. Brigid Regional
Discharged: 05/24/2026
Level of care: skilled nursing facility, short-term rehabilitation

Reason for stay: rehabilitation after a left hip hemiarthroplasty on 04/30/2026 for a femoral
neck fracture after a fall at home.

Course: physical and occupational therapy 6 days a week. At discharge he walks 200 feet with a
rolling walker and manages stairs with a rail and standby help. Independent with dressing and
toileting. Incision healed. Pain controlled with acetaminophen.

Disposition: discharged home with daughter, who is staying with him for the first weeks. Home
physical therapy arranged.

Follow-up: primary care (Dr. Okafor) in 1-2 weeks; orthopedics at 6 weeks.
Medications at discharge: amlodipine 2.5 mg daily; acetaminophen 650 mg every 6 hours as needed.`;

const dischargeSummary: Resource = {
  resourceType: 'DocumentReference',
  id: 'doc-t3-6193',
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }], text: 'Discharge summary' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: subject(E.E16),
  date: '2026-05-27T09:20:00-04:00',
  custodian: { reference: 'Organization/org-t3-3147' },
  description: 'Outside record',
  context: { encounter: [{ reference: 'Encounter/enc-t3-4609' }], period: { start: '2026-05-03T15:00:00-04:00', end: '2026-05-24T11:00:00-04:00' } },
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(DISCHARGE_SUMMARY), title: 'SNF discharge summary' } }],
};

const overlay: Overlay = {
  task: 'T3',
  build(world: WorldReader) {
    const ofSlots = (type: string) => SLOTS.flatMap((pt) => world.search(type, { patient: pt }).resources);
    const edited = (d: Doc): Doc => (d.id === E15_VISIT_NOTE ? e15VisitNote(d) : {
      ...d,
      content: d.content.map((c) => (c.attachment.data ? { ...c, attachment: { ...c.attachment, data: base64(editNote(unbase64(c.attachment.data), d.subject!.reference!.slice(8), d.date ?? '')) } } : c)),
    });
    const kept = SLOTS.flatMap((pt) =>
      (world.search('DocumentReference', { patient: pt }).resources as Doc[])
        .map(edited)
        .filter((d) => !ABOUT_COLON.test(noteText(d)))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        .slice(0, NOTES_KEPT),
    );
    const keptIds = new Set(kept.map((d) => d.id));
    const checkups = (ofSlots('Encounter') as Array<Extract<Resource, { resourceType: 'Encounter' }>>)
      .filter((e) => (e.reasonCode ?? []).some((rc) => (rc.coding ?? []).some((c) => c.code === SCREENING_FOR_COLON_CANCER)))
      .map((e): Resource => {
        const reasonCode = (e.reasonCode ?? []).filter((rc) => !(rc.coding ?? []).some((c) => c.code === SCREENING_FOR_COLON_CANCER));
        const { reasonCode: _old, ...rest } = e;
        return reasonCode.length ? { ...rest, reasonCode } : rest;
      });
    const resolved = Object.entries(RESOLVE_CONDITIONS).map(([id, ended]): Resource => {
      const c = world.get('Condition', id) as Extract<Resource, { resourceType: 'Condition' }>;
      return { ...c, clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }] }, abatementDateTime: ended };
    });
    const completed = COMPLETE_MEDICATIONS.map((id): Resource => ({ ...(world.get('MedicationRequest', id) as Extract<Resource, { resourceType: 'MedicationRequest' }>), status: 'completed' }));
    const remove = [
      ...ofSlots('DocumentReference').filter((r) => !keptIds.has(r.id)),
      ...ofSlots('DiagnosticReport').filter((r) => r.resourceType === 'DiagnosticReport' && (r.presentedForm ?? []).length > 0),
      ...ofSlots('Procedure').filter((r) => r.resourceType === 'Procedure' && (r.code?.coding ?? []).some((c) => c.system === SNOMED && c.code === COLONOSCOPY)),
      ...REMOVE_CONDITIONS.map((id) => world.get('Condition', id)!),
    ].map((r) => ({ resourceType: r.resourceType, id: r.id! }));

    const patients = Object.entries(BIRTH).map(([pt, birthDate]): Resource => {
      const p = world.get('Patient', pt) as Extract<Resource, { resourceType: 'Patient' }>;
      return { ...p, birthDate, name: (p.name ?? []).map(({ suffix: _suffix, ...n }) => n), ...(pt === E.E15 ? { address: E15_ADDRESS } : {}) };
    });

    const put: Resource[] = [
      ...patients,
      ...kept,
      ...checkups,
      ...resolved,
      ...completed,
      SURGEON,
      group,
      procedure('proc-t3-4170', E.E1, [COLONOSCOPY, 'Colonoscopy'], '2018-05-21T09:30:00-04:00', NORMAL),
      procedure('proc-t3-2591', E.E2, [COLONOSCOPY, 'Colonoscopy'], '2016-11-15T08:45:00-05:00', NORMAL),
      stoolTest('obs-t3-7342', E.E3, ['77354-9', 'Noninvasive colorectal cancer DNA and occult blood screening [Presence] in Stool'], '2023-11-20T09:00:00-05:00', '2023-11-29T14:10:00-05:00'),
      opNote,
      condition('cond-t3-6027', E.E7, ['248279007', 'Frailty'], '2025-09-16T10:00:00-04:00'),
      donepezil,
      condition('cond-t3-5463', E.E8, ['248279007', 'Frailty'], '2026-03-04T10:00:00-05:00'),
      condition('cond-t3-0794', E.E9, ['363418001', 'Malignant neoplasm of pancreas'], '2026-05-12T10:00:00-04:00'),
      hospice,
      stoolTest('obs-t3-3906', E.E10, ['29771-3', 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay'], '2025-12-03T08:00:00-05:00', '2025-12-05T11:30:00-05:00'),
      stoolTest('obs-t3-1279', E.E11, ['2335-8', 'Hemoglobin [Presence] in Stool from gastrointestinal'], '2024-06-11T08:00:00-04:00', '2024-06-13T10:45:00-04:00'),
      activeFit,
      procedure('proc-t3-5032', E.E12, ['418714002', 'Virtual CT colonoscopy'], '2022-03-08T10:00:00-05:00', NORMAL),
      MAPLE_GROVE,
      CEDAR_HILL,
      housingStatus('obs-t3-2465', E.E15, '2026-02-10T11:00:00-05:00', [SNOMED, '160734000', 'Lives in nursing home (finding)']),
      nursingFacilityVisit,
      rehabStay,
      dischargeSummary,
      housingStatus('obs-t3-8852', E.E16, '2026-06-01T09:40:00-04:00', [LOINC, 'LA18839-3', 'Patient lives in own home'], 'enc-t3-9902'),
      ...e15Chart(world),
      ...e16Chart,
    ];
    return {
      put,
      remove,
      lint: {
        // Age today against the thresholds, for the members whose age is not the trap. E4 and
        // E5 are the age traps: their thresholds apply at the end of the measurement period,
        // which this rule does not model, so they are not declared.
        ages: [
          ...[E.E1, E.E2, E.E3, E.E6, E.E9, E.E10, E.E11, E.E12].map((patient) => ({ patient, threshold: 46 })),
          ...[E.E7, E.E8].map((patient) => ({ patient, threshold: 66 })),
          ...[E.E15, E.E16].flatMap((patient) => [66, 76].map((threshold) => ({ patient, threshold }))),
        ],
        windows: [
          { name: 'colonoscopy 2017-2026', boundary: '2017-01-01', resources: ['proc-t3-4170', 'proc-t3-2591'], traps: { 'proc-t3-2591': 'colonoscopy_ten_years' } },
          { name: 'sDNA-FIT 2024-2026', boundary: '2024-01-01', resources: ['obs-t3-7342'], traps: { 'obs-t3-7342': 'sdna_calendar_year' } },
          { name: 'FOBT 2026', boundary: '2026-01-01', resources: ['obs-t3-3906', 'obs-t3-1279'], traps: { 'obs-t3-3906': 'prior_year_fit' } },
          { name: 'CT colonography 2022-2026', boundary: '2022-01-01', resources: ['proc-t3-5032'] },
        ],
      },
    };
  },
};

export default overlay;
