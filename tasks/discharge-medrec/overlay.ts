// T4 discharge-medrec overlay (design section 4, "T4"): Walter Kim, 74, on slot pt-0005, whose
// Synthea chart keeps its encounters, older labs and ischemic heart disease. The overlay renames
// him and moves his birth date, adds the seven outpatient medications of the design, the October
// heart-failure admission to St. Brigid with its discharge summary and signed addendum, a 2025
// discharge summary, the inpatient creatinine, the outside lab's post-discharge report, and removes
// what would contradict the story: Synthea's notes and note reports (they name the old patient),
// his four active Synthea medications (clopidogrel, simvastatin, nitroglycerin, metoprolol
// succinate 100 mg), each of which would be a home medication the discharge documents never
// address and so an unplanned trap, and three active Synthea conditions the chart contradicts
// (obesity at BMI 27.6, anemia at Hgb 17.3, full-time employment at 74 with EF 30%). Dr. Okafor
// is his PCP (Patient.generalPractitioner), the one RBC-TOC-02 §5 has the agent message.
//
// Traps (design "T4"): doc-t4-dc-1019-add corrects the spironolactone dose in doc-t4-dc-1019;
// the post-discharge creatinine of 1.32 mg/dL satisfies the lisinopril resume condition (SCr <
// 1.5), while obs-t4-scr-1016 (1.9) is the inpatient peak; pantoprazole is a formulary
// substitution, marked in its own section of the summary;
// P18o lever R14-07: L1, the pantoprazole line carries no marker, and the substitution is stated
// in a section after the list; L2, the post-discharge BMP was drawn at an outside lab and is in
// the chart only as its scanned report (doc-t4-lab-1021), not as Observations, so a search of
// his results finds only the inpatient 1.9.
// P19 lever (researcher-16 T4 P1, amended): the same report's potassium is 5.4 mmol/L (H), a valid,
// unhemolysed result above RBC-TOC-02 §7's 5.0. It holds the spironolactone start and the
// lisinopril resume, although the creatinine of 1.32 still meets the resume line's own condition.
// 'metoprolol XL' is an alias of mr-t4-metoprolol-succ; mr-t4-metoprolol-tart is the duplicate
// beta-blocker no discharge document mentions; doc-t4-dc-2025 is last year's summary.
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const PT = 'pt-0005';
const SUBJECT = { reference: `Patient/${PT}` };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const ATTENDING_REF = { reference: 'Practitioner/pr-t4-boateng' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';

const BASE_ACTIVE_MEDS = ['mr-00068', 'mr-00069', 'mr-00070', 'mr-00071'];
// Synthea's 'Anemia', 'Body mass index 30+ - obesity' and 'Full-time employment'.
const CONTRADICTED_CONDITIONS = ['cond-00139', 'cond-00141', 'cond-00151'];

const ATTENDING: Resource = { resourceType: 'Practitioner', id: 'pr-t4-boateng', active: true, name: [{ use: 'official', given: ['Samuel'], family: 'Boateng', suffix: ['MD'] }] };
// The outside lab that drew the post-discharge BMP.
const OUTSIDE_LAB: Resource = { resourceType: 'Organization', id: 'org-t4-northgate', active: true, name: 'Northgate Outpatient Laboratory' };

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

const condition = (id: string, code: [string, string], onset: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code: code[0], display: code[1] }], text: code[1] },
  subject: SUBJECT,
  onsetDateTime: onset,
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
- Aspirin 81 mg by mouth daily: continue.
- Lisinopril: held for AKI. Resume home 10 mg daily when SCr < 1.5 on post-discharge labs.
- Spironolactone 12.5 mg by mouth daily: start.
- Potassium chloride: stop.
- Pantoprazole 40 mg by mouth daily.

Inpatient formulary substitutions: pantoprazole 40 mg daily was given in place of home omeprazole 20 mg daily (St. Brigid formulary).

Follow-up: Riverbend Family Medicine within 7 days; basic metabolic panel 2 days after discharge and 1 week after starting spironolactone.

Samuel Boateng, MD`;

const ADDENDUM = `St. Brigid Regional - Discharge Summary Addendum (signed)
Patient: Walter Kim   DOB 1952-02-19
Admission 2026-10-14 to 2026-10-19.

Correction: spironolactone 25 mg daily, not 12.5 mg.

Samuel Boateng, MD`;

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
- Aspirin 81 mg by mouth daily: continue.
- Omeprazole 20 mg by mouth daily: continue.

Follow-up: Riverbend Family Medicine within 7 days; echocardiogram in 3 months.

Samuel Boateng, MD`;

const LAB_REPORT = `Northgate Outpatient Laboratory - Final Report
Patient: Walter Kim   DOB 1952-02-19
Ordering provider: Samuel Boateng, MD (St. Brigid Regional)   Copy to: Maya Okafor, MD (Riverbend Family Medicine)
Collected: 10/21/2026 08:40   Reported: 10/21/2026 13:15

Basic metabolic panel
Sodium            138 mmol/L    (136-145)
Potassium         5.4 mmol/L    (3.5-5.1) H
Chloride          101 mmol/L    (98-107)
Carbon dioxide    26 mmol/L     (22-29)
Urea nitrogen     24 mg/dL      (8-23)   H
Creatinine        1.32 mg/dL    (0.74-1.35)
Glucose           112 mg/dL     (70-99)  H
Calcium           9.3 mg/dL     (8.6-10.3)`;

// The outside report as the clinic filed it: scanned to his chart when it arrived.
const LAB_DOC: Resource = {
  resourceType: 'DocumentReference',
  id: 'doc-t4-lab-1021',
  meta: { tag: [{ system: 'urn:riverbend:provenance', code: 'synthetic', display: 'Hand-written synthetic note' }] },
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11502-2', display: 'Laboratory report' }], text: 'Laboratory report' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: SUBJECT,
  date: '2026-10-21T15:40:00-04:00',
  author: [{ reference: 'Organization/org-t4-northgate' }],
  custodian: CLINIC,
  description: 'Outside lab report (scanned)',
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(LAB_REPORT) } }],
};

const overlay: Overlay = {
  task: 'T4',
  build(world: WorldReader) {
    const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
    const renamed: Resource = { ...patient, name: [{ use: 'official', family: 'Kim', given: ['Walter'], prefix: ['Mr.'] }], birthDate: '1952-02-19', generalPractitioner: [OKAFOR] };
    const remove = [
      ...world.search('DocumentReference', { patient: PT }).resources,
      ...world.search('DiagnosticReport', { patient: PT }).resources.filter((r) => r.resourceType === 'DiagnosticReport' && (r.presentedForm ?? []).length > 0),
      ...BASE_ACTIVE_MEDS.map((id) => world.get('MedicationRequest', id)!),
      ...CONTRADICTED_CONDITIONS.map((id) => world.get('Condition', id)!),
    ].map((r) => ({ resourceType: r.resourceType, id: r.id! }));

    const put: Resource[] = [
      renamed,
      ATTENDING,
      OUTSIDE_LAB,
      encounter('enc-t4-adm-2025', 'IMP', ['32485007', 'Hospital admission (procedure)'], '2025-03-02T16:40:00-05:00', '2025-03-06T12:10:00-05:00', HOSPITAL),
      encounter('enc-t4-adm-1014', 'IMP', ['32485007', 'Hospital admission (procedure)'], '2026-10-14T19:05:00-04:00', '2026-10-19T11:30:00-04:00', HOSPITAL),
      condition('cond-t4-hf', ['441481004', 'Chronic systolic heart failure'], '2025-03-02T16:40:00-05:00'),
      condition('cond-t4-aki', ['14669001', 'Acute kidney injury'], '2026-10-16T07:00:00-04:00'),
      condition('cond-t4-hld', ['55822004', 'Hyperlipidemia'], '2022-01-11T10:00:00-05:00'),
      lab('obs-t4-scr-1016', SCR, '2026-10-16T05:30:00-04:00', '2026-10-16T07:10:00-04:00', 1.9, 'mg/dL', [0.74, 1.35], 'enc-t4-adm-1014', HOSPITAL),
      medication('mr-t4-furosemide', ['310429', 'furosemide 20 MG Oral Tablet'], [20, 'mg'], 'QD', '2025-03-10T10:00:00-04:00', 'Chronic systolic heart failure'),
      medication('mr-t4-lisinopril', ['314076', 'lisinopril 10 MG Oral Tablet'], [10, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease', {
        status: 'on-hold',
        statusReason: { text: 'Held during the St. Brigid Regional admission for acute kidney injury (10/2026)' },
      }),
      medication('mr-t4-kcl', ['198116', 'potassium chloride 20 MEQ Extended Release Oral Tablet'], [20, 'meq'], 'QD', '2025-03-10T10:00:00-04:00', 'Potassium replacement with furosemide'),
      medication('mr-t4-metoprolol-succ', ['866436', '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'], [50, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease'),
      medication('mr-t4-metoprolol-tart', ['866924', 'metoprolol tartrate 25 MG Oral Tablet'], [25, 'mg'], 'BID', '2023-05-02T10:00:00-04:00', 'Palpitations'),
      medication('mr-t4-omeprazole', ['198051', 'omeprazole 20 MG Delayed Release Oral Capsule'], [20, 'mg'], 'QD', '2022-01-11T10:00:00-05:00', 'Gastroesophageal reflux'),
      medication('mr-t4-atorvastatin', ['617311', 'atorvastatin 40 MG Oral Tablet'], [40, 'mg'], 'QHS', '2022-01-11T10:00:00-05:00', 'Hyperlipidemia'),
      medication('mr-t4-aspirin', ['243670', 'aspirin 81 MG Oral Tablet'], [81, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease'),
      note('doc-t4-dc-2025', '2025-03-06T12:10:00-05:00', 'enc-t4-adm-2025', DISCHARGE_2025),
      note('doc-t4-dc-1019', '2026-10-19T11:02:00-04:00', 'enc-t4-adm-1014', DISCHARGE),
      LAB_DOC,
      note('doc-t4-dc-1019-add', '2026-10-19T18:40:00-04:00', 'enc-t4-adm-1014', ADDENDUM, { relatesTo: [{ code: 'appends', target: { reference: 'DocumentReference/doc-t4-dc-1019' } }], description: 'Signed addendum' }),
    ];
    return {
      put,
      remove,
      lint: {
        thresholds: [
          { quantity: 'scr', threshold: 1.5, value: 1.32, label: 'creatinine in doc-t4-lab-1021' },
          { quantity: 'potassium', threshold: 5.0, value: 5.4, label: 'potassium in doc-t4-lab-1021' },
        ],
      },
    };
  },
};

export default overlay;
