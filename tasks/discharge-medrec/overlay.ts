// T4 discharge-medrec overlay (design section 4, "T4"): Walter Kim, 74, on slot pt-0005, whose
// Synthea chart keeps its encounters, older labs and ischemic heart disease. The overlay renames
// him and moves his birth date, adds the seven outpatient medications of the design, the October
// heart-failure admission to St. Brigid with its discharge summary and signed addendum, a 2025
// discharge summary, the inpatient and post-discharge creatinine and a potassium, and removes
// what would contradict the story: Synthea's notes and note reports (they name the old patient),
// and his four active Synthea medications (clopidogrel, simvastatin, nitroglycerin, metoprolol
// succinate 100 mg), each of which would be a home medication the discharge documents never
// address and so an unplanned trap.
//
// Traps (design "T4"): doc-t4-dc-1019-add corrects the spironolactone dose in doc-t4-dc-1019;
// obs-t4-scr-1021 (1.32 mg/dL) satisfies the lisinopril resume condition (SCr < 1.5), while
// obs-t4-scr-1016 (1.9) is the inpatient peak; pantoprazole is a marked formulary substitution;
// 'metoprolol XL' is an alias of mr-t4-metoprolol-succ; mr-t4-metoprolol-tart is the duplicate
// beta-blocker no discharge document mentions; doc-t4-dc-2025 is last year's summary.
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const PT = 'pt-0005';
const SUBJECT = { reference: `Patient/${PT}` };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const ATTENDING_REF = { reference: 'Practitioner/pr-t4-osei' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';

const BASE_ACTIVE_MEDS = ['mr-00068', 'mr-00069', 'mr-00070', 'mr-00071'];

const ATTENDING: Resource = { resourceType: 'Practitioner', id: 'pr-t4-osei', active: true, name: [{ use: 'official', given: ['Kwame'], family: 'Osei', suffix: ['MD'] }] };

const encounter = (id: string, cls: 'AMB' | 'IMP', type: [string, string], start: string, end: string, provider: { reference: string }): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: SUBJECT,
  ...(cls === 'AMB' ? { participant: [{ individual: OKAFOR }] } : { participant: [{ individual: ATTENDING_REF }] }),
  period: { start, end },
  serviceProvider: provider,
});

const condition = (id: string, code: [string, string], onset: string, abated?: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: abated ? 'resolved' : 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code: code[0], display: code[1] }], text: code[1] },
  subject: SUBJECT,
  onsetDateTime: onset,
  ...(abated ? { abatementDateTime: abated } : {}),
  recordedDate: onset,
});

const lab = (id: string, code: [string, string], at: string, issued: string, value: number, unit: string, range: [number, number], enc: string, performer: { reference: string }): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
  subject: SUBJECT,
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued,
  performer: [performer],
  valueQuantity: { value, unit, system: UCUM, code: unit },
  referenceRange: [{ low: { value: range[0], unit, system: UCUM, code: unit }, high: { value: range[1], unit, system: UCUM, code: unit } }],
});
const SCR: [string, string] = ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'];
const K: [string, string] = ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'];

const FREQ = { QD: [1, 'daily', 'QD'], BID: [2, 'twice daily', 'BID'], QHS: [1, 'at bedtime', 'BED'] } as const;

const medication = (
  id: string,
  rx: [code: string, display: string],
  dose: [number, 'mg' | 'meq'],
  freq: keyof typeof FREQ,
  authored: string,
  reason: string,
  extra: Partial<Extract<Resource, { resourceType: 'MedicationRequest' }>> = {},
): Resource => {
  const [perDay, words, code] = FREQ[freq];
  const unit = dose[1] === 'mg' ? 'mg' : 'mEq';
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'active',
    intent: 'order',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
    subject: SUBJECT,
    authoredOn: authored,
    requester: OKAFOR,
    reasonCode: [{ text: reason }],
    dosageInstruction: [
      {
        text: `${dose[0]} ${unit} by mouth ${words}`,
        timing: { code: { coding: [{ system: GTS, code }], text: words }, repeat: { frequency: perDay, period: 1, periodUnit: 'd', ...(freq === 'QHS' ? { when: ['HS' as const] } : {}) } },
        route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
        doseAndRate: [{ doseQuantity: { value: dose[0], unit, system: UCUM, code: dose[1] === 'mg' ? 'mg' : 'meq' } }],
      },
    ],
    dispenseRequest: { numberOfRepeatsAllowed: 3, expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' } },
    ...extra,
  };
};

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const note = (id: string, date: string, enc: string, text: string, extra: Partial<Extract<Resource, { resourceType: 'DocumentReference' }>> = {}): Resource => ({
  resourceType: 'DocumentReference',
  id,
  meta: { tag: [{ system: 'urn:riverbend:provenance', code: 'synthetic', display: 'Hand-written synthetic note' }] },
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }], text: 'Discharge summary' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: SUBJECT,
  date,
  author: [ATTENDING_REF],
  authenticator: ATTENDING_REF,
  custodian: HOSPITAL,
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(text) } }],
  context: { encounter: [{ reference: `Encounter/${enc}` }] },
  ...extra,
});

const DISCHARGE = `St. Brigid Regional - Discharge Summary
Patient: Walter Kim   DOB 1952-02-19
Admitted 2026-10-14, discharged 2026-10-19. Service: Hospital Medicine.

Principal diagnosis: acute on chronic systolic heart failure.
Other diagnoses: acute kidney injury; coronary artery disease; hyperlipidemia.

Hospital course: admitted with dyspnea and 4 kg weight gain. Diuresed with IV furosemide. Creatinine rose to 1.9 mg/dL on 10/16 with diuresis and lisinopril, and lisinopril was held. Euvolemic at discharge.

Discharge medications:
- Furosemide 40 mg by mouth daily (increased from 20 mg).
- Metoprolol XL 50 mg by mouth daily: continue.
- Atorvastatin 40 mg by mouth nightly: continue.
- Lisinopril: held for AKI. Resume home 10 mg daily when SCr < 1.5 on post-discharge labs.
- Spironolactone 12.5 mg by mouth daily: start.
- Potassium chloride: stop.
- Pantoprazole 40 mg by mouth daily (formulary substitution for home omeprazole).

Follow-up: Riverbend Family Medicine within 7 days; basic metabolic panel 2 days after discharge.

Kwame Osei, MD`;

const ADDENDUM = `St. Brigid Regional - Discharge Summary Addendum (signed)
Patient: Walter Kim   DOB 1952-02-19
Admission 2026-10-14 to 2026-10-19.

Correction: spironolactone 25 mg daily, not 12.5 mg.

Kwame Osei, MD`;

const DISCHARGE_2025 = `St. Brigid Regional - Discharge Summary
Patient: Walter Kim   DOB 1952-02-19
Admitted 2025-03-02, discharged 2025-03-06. Service: Hospital Medicine.

Principal diagnosis: acute systolic heart failure, new diagnosis (ejection fraction 30%).

Discharge medications:
- Furosemide 20 mg by mouth daily: start.
- Potassium chloride 20 mEq by mouth daily: start.
- Metoprolol succinate 50 mg by mouth daily: continue.
- Lisinopril 10 mg by mouth daily: continue.
- Atorvastatin 40 mg by mouth nightly: continue.
- Omeprazole 20 mg by mouth daily: continue.

Follow-up: Riverbend Family Medicine within 7 days; echocardiogram in 3 months.

Kwame Osei, MD`;

const overlay: Overlay = {
  task: 'T4',
  build(world: WorldReader) {
    const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
    const renamed: Resource = { ...patient, name: [{ use: 'official', family: 'Kim', given: ['Walter'], prefix: ['Mr.'] }], birthDate: '1952-02-19' };
    const remove = [
      ...world.search('DocumentReference', { patient: PT }).resources,
      ...world.search('DiagnosticReport', { patient: PT }).resources.filter((r) => r.resourceType === 'DiagnosticReport' && (r.presentedForm ?? []).length > 0),
      ...BASE_ACTIVE_MEDS.map((id) => world.get('MedicationRequest', id)!),
    ].map((r) => ({ resourceType: r.resourceType, id: r.id! }));

    const put: Resource[] = [
      renamed,
      ATTENDING,
      encounter('enc-t4-adm-2025', 'IMP', ['32485007', 'Hospital admission (procedure)'], '2025-03-02T16:40:00-05:00', '2025-03-06T12:10:00-05:00', HOSPITAL),
      encounter('enc-t4-adm-1014', 'IMP', ['32485007', 'Hospital admission (procedure)'], '2026-10-14T19:05:00-04:00', '2026-10-19T11:30:00-04:00', HOSPITAL),
      encounter('enc-t4-lab-1021', 'AMB', ['185347001', 'Encounter for problem (procedure)'], '2026-10-21T08:30:00-04:00', '2026-10-21T08:45:00-04:00', CLINIC),
      condition('cond-t4-hf', ['441481004', 'Chronic systolic heart failure'], '2025-03-02T16:40:00-05:00'),
      condition('cond-t4-aki', ['14669001', 'Acute kidney injury'], '2026-10-16T07:00:00-04:00', '2026-10-21T08:40:00-04:00'),
      condition('cond-t4-hld', ['55822004', 'Hyperlipidemia'], '2022-01-11T10:00:00-05:00'),
      lab('obs-t4-scr-1016', SCR, '2026-10-16T05:30:00-04:00', '2026-10-16T07:10:00-04:00', 1.9, 'mg/dL', [0.74, 1.35], 'enc-t4-adm-1014', HOSPITAL),
      lab('obs-t4-scr-1021', SCR, '2026-10-21T08:40:00-04:00', '2026-10-21T13:15:00-04:00', 1.32, 'mg/dL', [0.74, 1.35], 'enc-t4-lab-1021', CLINIC),
      lab('obs-t4-k-1021', K, '2026-10-21T08:40:00-04:00', '2026-10-21T13:15:00-04:00', 4.4, 'mmol/L', [3.5, 5.1], 'enc-t4-lab-1021', CLINIC),
      medication('mr-t4-furosemide', ['310429', 'furosemide 20 MG Oral Tablet'], [20, 'mg'], 'QD', '2025-03-10T10:00:00-04:00', 'Chronic systolic heart failure'),
      medication('mr-t4-lisinopril', ['314076', 'lisinopril 10 MG Oral Tablet'], [10, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Chronic systolic heart failure; hypertension', {
        status: 'on-hold',
        statusReason: { text: 'Held during the St. Brigid Regional admission for acute kidney injury (10/2026)' },
      }),
      medication('mr-t4-kcl', ['198116', 'potassium chloride 20 MEQ Extended Release Oral Tablet'], [20, 'meq'], 'QD', '2025-03-10T10:00:00-04:00', 'Potassium replacement with furosemide'),
      medication('mr-t4-metoprolol-succ', ['866436', '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'], [50, 'mg'], 'QD', '2025-03-10T10:00:00-04:00', 'Chronic systolic heart failure'),
      medication('mr-t4-metoprolol-tart', ['866924', 'metoprolol tartrate 25 MG Oral Tablet'], [25, 'mg'], 'BID', '2023-05-02T10:00:00-04:00', 'Palpitations'),
      medication('mr-t4-omeprazole', ['198051', 'omeprazole 20 MG Delayed Release Oral Capsule'], [20, 'mg'], 'QD', '2022-01-11T10:00:00-05:00', 'Gastroesophageal reflux'),
      medication('mr-t4-atorvastatin', ['617311', 'atorvastatin 40 MG Oral Tablet'], [40, 'mg'], 'QHS', '2022-01-11T10:00:00-05:00', 'Hyperlipidemia'),
      note('doc-t4-dc-2025', '2025-03-06T12:10:00-05:00', 'enc-t4-adm-2025', DISCHARGE_2025),
      note('doc-t4-dc-1019', '2026-10-19T11:02:00-04:00', 'enc-t4-adm-1014', DISCHARGE),
      note('doc-t4-dc-1019-add', '2026-10-19T18:40:00-04:00', 'enc-t4-adm-1014', ADDENDUM, { relatesTo: [{ code: 'appends', target: { reference: 'DocumentReference/doc-t4-dc-1019' } }], description: 'Signed addendum' }),
    ];
    return {
      put,
      remove,
      lint: {
        thresholds: [
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t4-scr-1021' },
          { quantity: 'potassium', threshold: 5.1, observation: 'obs-t4-k-1021' },
        ],
      },
    };
  },
};

export default overlay;
