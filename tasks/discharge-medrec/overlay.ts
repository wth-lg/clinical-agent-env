// T4 discharge-medrec overlay (plan-amendment-worklist W1, T4 probe): Dr. Okafor's post-discharge
// worklist, four patients just back from St. Brigid, on T4's four slots, each with the clinic's
// outpatient orders, the hospital stay, its discharge summary, the pharmacy fill history the clinic
// pulled after discharge, and for two of them the post-discharge labs. Each patient's Synthea notes,
// note reports and active or held medications are removed (they name other drugs and stories, and
// each active order would be a home medication no discharge document addresses: an unplanned item),
// as are Synthea conditions the chart contradicts. Every patient keeps their Synthea age: the stories
// fit it (W1-0 F7), so no birth date moves except Walter Kim's (pre-probe T4).
//
// The worklist (PW4-E3 cut, plan-amendment-w4): 8 items (expected.ts), at least one instance of
// each probe class. Walter Kim, Terence Stark and Earnest Roberts are on it; Adelaide Thompson's chart
// stays in the world, off the list (her instance of each class she carried is cut, the other
// instance kept), so no id moves. Earnest Roberts keeps one item, the lisinopril resume: his
// discharge list continues rosuvastatin (no formulary substitution) and the outside pharmacy query
// finds no fills, so his formulary and fill-history instances are cut and Walter Kim's and Terence
// Stark's are kept.
//   source precedence     Walter furosemide: the signed addendum makes it 40 mg twice daily
//   fill history          Terence glipizide: filled from an outside prescriber, on no clinic order,
//                         not addressed by the discharge documents
//   formulary sub         Walter pantoprazole for omeprazole
//   brand and generic     Terence 'Coreg 12.5 mg twice daily' (home carvedilol 6.25)
//   fill gaps             Terence atorvastatin (24% of the 180 days before admission covered),
//                         continued by his summary
//   potassium rule        Walter lisinopril: resume line met by SCr 1.32, but potassium 5.4 in the
//                         outside report holds it; Earnest lisinopril: a clinic potassium of 5.3 on
//                         10/20, then 4.6 in the outside report of 10/22, the most recent: resume.
//                         His chart holds nothing else that bears on the resume (R16)
//   filler                Walter potassium chloride: stop
// Mid-trial events (events.ts) bring new records to these charts after the trial's first write on
// each patient; none is in the world.
// The decisive documents (addenda, lab reports, fill histories) are each longer than a search
// snippet, so a search row only references them; a read shows them. Each patient's fill history
// comes from two places: the clinic's own Riverbend Pharmacy dispensing record, and, where the
// patient fills elsewhere, a claims-network query for fills at other pharmacies. Each outside drug
// so has a record of its own, which its flag to the PCP links (R15).
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';

const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const NORTHGATE = { reference: 'Organization/org-t4-northgate' };

const practitioner = (id: string, given: string, family: string): Resource => ({ resourceType: 'Practitioner', id, active: true, name: [{ use: 'official', given: [given], family, suffix: ['MD'] }] });
const BOATENG = practitioner('pr-t4-boateng', 'Samuel', 'Boateng');
const MENSAH = practitioner('pr-t4-mensah', 'Grace', 'Mensah');
const FITZGERALD = practitioner('pr-t4-fitzgerald', 'Laura', 'Fitzgerald');
const HADDAD = practitioner('pr-t4-haddad', 'Omar', 'Haddad');
const refTo = (r: Resource) => ({ reference: `${r.resourceType}/${r.id}` });
// The outside lab that drew the post-discharge panels.
const OUTSIDE_LAB: Resource = { resourceType: 'Organization', id: 'org-t4-northgate', active: true, name: 'Northgate Outpatient Laboratory' };

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const FREQ = { QD: [1, 'daily', 'QD'], BID: [2, 'twice daily', 'BID'], TID: [3, 'three times daily', 'TID'], QHS: [1, 'at bedtime', 'BED'] } as const;
type Unit = 'mg' | 'meq' | 'units';
const UNIT = { mg: ['mg', 'mg'], meq: ['mEq', 'meq'], units: ['units', '[iU]'] } as const;

// One patient's builders: everything they make references that patient.
function chart(pt: string) {
  const SUBJECT = { reference: `Patient/${pt}` };
  const encounter = (id: string, cls: 'AMB' | 'IMP', type: [string, string], start: string, end: string, provider: { reference: string }, who: { reference: string }): Resource => ({
    resourceType: 'Encounter',
    id,
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls },
    type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
    subject: SUBJECT,
    participant: [{ individual: who }],
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
  const lab = (id: string, code: [string, string], at: string, issued: string, value: number, unit: string, range: [number, number], enc: string | null, performer: { reference: string }): Resource => ({
    resourceType: 'Observation',
    id,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
    code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
    subject: SUBJECT,
    ...(enc ? { encounter: { reference: `Encounter/${enc}` } } : {}),
    effectiveDateTime: at,
    issued,
    performer: [performer],
    valueQuantity: { value, unit, system: UCUM, code: unit },
    referenceRange: [{ low: { value: range[0], unit, system: UCUM, code: unit }, high: { value: range[1], unit, system: UCUM, code: unit } }],
  });
  const medication = (
    id: string,
    rx: [code: string, display: string],
    dose: [number, Unit],
    freq: keyof typeof FREQ,
    authored: string,
    reason: string,
    extra: Partial<Extract<Resource, { resourceType: 'MedicationRequest' }>> = {},
  ): Resource => {
    const [perDay, words, code] = FREQ[freq];
    const [label, ucum] = UNIT[dose[1]];
    const route = dose[1] === 'units' ? { coding: [{ system: SNOMED, code: '34206005', display: 'Subcutaneous route' }], text: 'subcutaneous' } : { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' };
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
          text: dose[1] === 'units' ? `Inject ${dose[0]} ${label} under the skin ${words}` : `${dose[0]} ${label} by mouth ${words}`,
          timing: { code: { coding: [{ system: GTS, code }], text: words }, repeat: { frequency: perDay, period: 1, periodUnit: 'd' } },
          route,
          // Insulin as Synthea writes it: the dose in the sig, no coded dose quantity.
          ...(dose[1] === 'units' ? {} : { doseAndRate: [{ doseQuantity: { value: dose[0], unit: label, system: UCUM, code: ucum } }] }),
        },
      ],
      dispenseRequest: { numberOfRepeatsAllowed: 3, expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' } },
      ...extra,
    };
  };
  const doc = (id: string, type: [string, string], date: string, author: { reference: string }, custodian: { reference: string }, text: string, extra: Partial<Extract<Resource, { resourceType: 'DocumentReference' }>> = {}): Resource => ({
    resourceType: 'DocumentReference',
    id,
    status: 'current',
    docStatus: 'final',
    type: { coding: [{ system: LOINC, code: type[0], display: type[1] }], text: type[1] },
    category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
    subject: SUBJECT,
    date,
    author: [author],
    custodian,
    content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(text) } }],
    ...extra,
  });
  const summary = (id: string, date: string, enc: string, attending: Resource, text: string, extra: Partial<Extract<Resource, { resourceType: 'DocumentReference' }>> = {}): Resource =>
    doc(id, ['18842-5', 'Discharge summary'], date, refTo(attending), HOSPITAL, text, { authenticator: refTo(attending), context: { encounter: [{ reference: `Encounter/${enc}` }] }, ...extra });
  // The outside lab's report as the clinic filed it: scanned to the chart when it arrived.
  const labReport = (id: string, date: string, text: string): Resource => doc(id, ['11502-2', 'Laboratory report'], date, NORTHGATE, CLINIC, text, { description: 'Outside lab report (scanned)' });
  // The fill histories the clinic pulled after discharge (History of Medication use Narrative): its
  // own pharmacy's dispensing record, and the claims query for fills at other pharmacies.
  const fills = (id: string, date: string, text: string, outside = false): Resource =>
    doc(id, ['10160-0', 'History of Medication use Narrative'], date, OKAFOR, CLINIC, text, { description: outside ? 'Outside pharmacy fill history' : 'Riverbend Pharmacy fill history' });
  return { SUBJECT, encounter, condition, lab, medication, summary, labReport, fills };
}

// A base order the story ended: kept as stopped, so its chart keeps its order count and no later
// id moves (fixtures:build numbers every resource in (patient, date, code) order).
const stopped = (r: Resource): Resource => ({ ...r, status: 'stopped' } as Resource);
const byIds = (world: WorldReader, type: string, ids: readonly string[]) => ids.map((rid) => world.get(type, rid)!);

const ADMISSION: [string, string] = ['32485007', 'Hospital admission (procedure)'];
const SCR: [string, string] = ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'];
const K: [string, string] = ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'];
const NA: [string, string] = ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma'];

const FILL_HEADER = (name: string, dob: string, at: string, outside = false) => `${outside ? 'Outside medication history - pharmacy fill data' : 'Riverbend Pharmacy - dispensing history'}
Patient: ${name}   DOB ${dob}
Source: ${outside ? 'pharmacy claims network query' : 'Riverbend Pharmacy dispensing system'}, retrieved ${at} by Riverbend Family Medicine for post-discharge medication reconciliation.
Prescription fills from 12/01/2025 to the query date, ${outside ? 'all pharmacies other than Riverbend Pharmacy' : 'Riverbend Pharmacy only'}. Over-the-counter purchases do not appear.

Fill date    Medication                                    Qty   Days' supply   Prescriber                                  Pharmacy`;

// ---------------------------------------------------------------- Walter Kim, pt-0005 (74, HF)
function walter(world: WorldReader) {
  const PT = 'pt-0005';
  const c = chart(PT);
  const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
  const SUMMARY = `St. Brigid Regional - Discharge Summary
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
- Potassium chloride: stop.
- Pantoprazole 40 mg by mouth daily.

Inpatient formulary substitution: pantoprazole 40 mg daily was given in place of home omeprazole 20 mg daily (St. Brigid formulary).

Follow-up: Riverbend Family Medicine within 7 days; basic metabolic panel 2 days after discharge.

Samuel Boateng, MD`;
  const ADDENDUM = `St. Brigid Regional - Discharge Summary Addendum (signed)
Patient: Walter Kim   DOB 1952-02-19
Admission 2026-10-14 to 2026-10-19. Service: Hospital Medicine.

Reason for addendum: the medication list in the discharge summary signed this morning was transcribed from the 10/18 plan; the diuretic dose was changed on the day of discharge after the final weight and exam, and the patient was taught the changed dose before he left.

Correction: furosemide 40 mg twice daily, not 40 mg daily.

All other discharge medications and follow-up are unchanged.

Samuel Boateng, MD`;
  const LAB = `Northgate Outpatient Laboratory - Final Report
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
  const FILLS = `${FILL_HEADER('Walter Kim', '1952-02-19', '10/20/2026 10:05')}
12/18/2025   omeprazole 20 mg DR capsule                    90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/12/2026   furosemide 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/12/2026   potassium chloride ER 20 mEq tablet            90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/12/2026   lisinopril 10 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/20/2026   metoprolol succinate ER 50 mg tablet           90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/25/2026   atorvastatin 40 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
03/17/2026   omeprazole 20 mg DR capsule                    90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/10/2026   furosemide 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/10/2026   potassium chloride ER 20 mEq tablet            90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/10/2026   lisinopril 10 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/18/2026   metoprolol succinate ER 50 mg tablet           90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/23/2026   atorvastatin 40 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
06/14/2026   omeprazole 20 mg DR capsule                    90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/09/2026   furosemide 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/09/2026   potassium chloride ER 20 mEq tablet            90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/09/2026   lisinopril 10 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/17/2026   metoprolol succinate ER 50 mg tablet           90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/22/2026   atorvastatin 40 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
09/11/2026   omeprazole 20 mg DR capsule                    90    90             Maya Okafor, MD                             Riverbend Pharmacy
10/06/2026   furosemide 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
10/06/2026   potassium chloride ER 20 mEq tablet            90    90             Maya Okafor, MD                             Riverbend Pharmacy`;
  const remove = [
    ...world.search('DocumentReference', { patient: PT }).resources,
    ...world.search('DiagnosticReport', { patient: PT }).resources.filter((r) => r.resourceType === 'DiagnosticReport' && (r.presentedForm ?? []).length > 0),
    // Synthea's clopidogrel, nitroglycerin and metoprolol succinate 100 mg (simvastatin is kept, stopped:
    // atorvastatin replaced it in 2022).
    ...byIds(world, 'MedicationRequest', ['mr-00068', 'mr-00070', 'mr-00071']),
    // Synthea's 'Anemia', 'Body mass index 30+ - obesity' and 'Full-time employment' (Hgb 17.3, BMI 27.6, EF 30% at 74).
    ...['cond-00139', 'cond-00141', 'cond-00151'].map((id) => world.get('Condition', id)!),
  ];
  const put: Resource[] = [
    { ...patient, name: [{ use: 'official', family: 'Kim', given: ['Walter'], prefix: ['Mr.'] }], birthDate: '1952-02-19', generalPractitioner: [OKAFOR] },
    stopped(world.get('MedicationRequest', 'mr-00069')!),
    c.encounter('enc-t4-kim-adm-2025', 'IMP', ADMISSION, '2025-03-02T16:40:00-05:00', '2025-03-06T12:10:00-05:00', HOSPITAL, refTo(BOATENG)),
    c.encounter('enc-t4-kim-adm', 'IMP', ADMISSION, '2026-10-14T19:05:00-04:00', '2026-10-19T11:30:00-04:00', HOSPITAL, refTo(BOATENG)),
    c.condition('cond-t4-kim-hf', ['441481004', 'Chronic systolic heart failure'], '2025-03-02T16:40:00-05:00'),
    c.condition('cond-t4-kim-aki', ['14669001', 'Acute kidney injury'], '2026-10-16T07:00:00-04:00'),
    c.condition('cond-t4-kim-hld', ['55822004', 'Hyperlipidemia'], '2022-01-11T10:00:00-05:00'),
    c.lab('obs-t4-kim-scr-1016', SCR, '2026-10-16T05:30:00-04:00', '2026-10-16T07:10:00-04:00', 1.9, 'mg/dL', [0.74, 1.35], 'enc-t4-kim-adm', HOSPITAL),
    c.medication('mr-t4-kim-furosemide', ['310429', 'furosemide 20 MG Oral Tablet'], [20, 'mg'], 'QD', '2025-03-10T10:00:00-04:00', 'Chronic systolic heart failure'),
    c.medication('mr-t4-kim-lisinopril', ['314076', 'lisinopril 10 MG Oral Tablet'], [10, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease', {
      status: 'on-hold',
      statusReason: { text: 'Held during the St. Brigid Regional admission for acute kidney injury (10/2026)' },
    }),
    c.medication('mr-t4-kim-kcl', ['198116', 'potassium chloride 20 MEQ Extended Release Oral Tablet'], [20, 'meq'], 'QD', '2025-03-10T10:00:00-04:00', 'Potassium replacement with furosemide'),
    c.medication('mr-t4-kim-metoprolol', ['866436', '24 HR metoprolol succinate 50 MG Extended Release Oral Tablet'], [50, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease'),
    c.medication('mr-t4-kim-omeprazole', ['198051', 'omeprazole 20 MG Delayed Release Oral Capsule'], [20, 'mg'], 'QD', '2022-01-11T10:00:00-05:00', 'Gastroesophageal reflux'),
    c.medication('mr-t4-kim-atorvastatin', ['617311', 'atorvastatin 40 MG Oral Tablet'], [40, 'mg'], 'QHS', '2022-01-11T10:00:00-05:00', 'Hyperlipidemia'),
    c.medication('mr-t4-kim-aspirin', ['243670', 'aspirin 81 MG Oral Tablet'], [81, 'mg'], 'QD', '2024-02-06T10:00:00-05:00', 'Ischemic heart disease'),
    c.summary('doc-t4-kim-dc', '2026-10-19T11:02:00-04:00', 'enc-t4-kim-adm', BOATENG, SUMMARY),
    c.summary('doc-t4-kim-add', '2026-10-19T18:40:00-04:00', 'enc-t4-kim-adm', BOATENG, ADDENDUM, { relatesTo: [{ code: 'appends', target: { reference: 'DocumentReference/doc-t4-kim-dc' } }], description: 'Signed addendum' }),
    c.fills('doc-t4-kim-fills', '2026-10-20T10:05:00-04:00', FILLS),
    c.labReport('doc-t4-kim-lab', '2026-10-21T15:40:00-04:00', LAB),
  ];
  return { put, remove };
}

// ------------------------------------------------- Terence Stark, pt-0004 (76, CAD, DM2, CKD 3)
function terence(world: WorldReader) {
  const PT = 'pt-0004';
  const c = chart(PT);
  const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
  const SUMMARY = `St. Brigid Regional - Discharge Summary
Patient: Terence Stark   DOB 1950-10-05
Admitted 2026-10-16, discharged 2026-10-20. Service: Hospital Medicine.

Principal diagnosis: chest pain with hypertensive urgency; acute coronary syndrome ruled out (serial troponins negative).
Other diagnoses: coronary artery disease with prior NSTEMI (2018); type 2 diabetes mellitus; chronic kidney disease stage 3.

Hospital course: presented with chest pressure and BP 192/104. Troponins negative x3; ECG unchanged from prior. Blood pressure and heart rate controlled after the beta-blocker dose was raised. Glucose 140-210 on home insulin. Stress test deferred to outpatient cardiology.

Discharge medications:
- Coreg 12.5 mg by mouth twice daily.
- Atorvastatin 80 mg by mouth nightly: continue.
- Aspirin 81 mg by mouth daily: continue.
- Insulin 70/30 18 units subcutaneously twice daily before breakfast and supper: continue.

Follow-up: Riverbend Family Medicine within 7 days; outpatient cardiology for stress testing within 4 weeks.

Grace Mensah, MD`;
  const FILLS = `${FILL_HEADER('Terence Stark', '1950-10-05', '10/21/2026 09:12')}
12/03/2025   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
01/15/2026   carvedilol 6.25 mg tablet                      180   90             Maya Okafor, MD                             Riverbend Pharmacy
02/02/2026   insulin 70/30 human 100 units/mL vial 10 mL    3     90             Maya Okafor, MD                             Riverbend Pharmacy
03/04/2026   atorvastatin 80 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
04/14/2026   carvedilol 6.25 mg tablet                      180   90             Maya Okafor, MD                             Riverbend Pharmacy
05/01/2026   insulin 70/30 human 100 units/mL vial 10 mL    3     90             Maya Okafor, MD                             Riverbend Pharmacy
07/13/2026   carvedilol 6.25 mg tablet                      180   90             Maya Okafor, MD                             Riverbend Pharmacy
07/29/2026   insulin 70/30 human 100 units/mL vial 10 mL    3     90             Maya Okafor, MD                             Riverbend Pharmacy
10/09/2026   carvedilol 6.25 mg tablet                      180   90             Maya Okafor, MD                             Riverbend Pharmacy`;
  const OUTSIDE_FILLS = `${FILL_HEADER('Terence Stark', '1950-10-05', '10/21/2026 09:14', true)}
07/30/2026   glipizide 5 mg tablet                          30    30             Anil Desai, MD (Valley Endocrinology)       Lakeview Drug
08/29/2026   glipizide 5 mg tablet                          30    30             Anil Desai, MD (Valley Endocrinology)       Lakeview Drug
09/28/2026   glipizide 5 mg tablet                          30    30             Anil Desai, MD (Valley Endocrinology)       Lakeview Drug`;
  // His Synthea notes go (two list medications the story does not have: ticagrelor, aspirin 325 mg,
  // naproxen; the rest tell a new diabetes the 2004 problem list contradicts). Four base orders go
  // (clopidogrel, prasugrel, metoprolol succinate 100 mg and ferrous sulfate, which the story
  // contradicts) and the other seven stay, stopped, so his chart keeps its order count.
  const STOP = ['mr-00053', 'mr-00054', 'mr-00056', 'mr-00057', 'mr-00058', 'mr-00059', 'mr-00066'];
  const remove = [
    ...world.search('DocumentReference', { patient: PT }).resources,
    ...byIds(world, 'MedicationRequest', ['mr-00051', 'mr-00052', 'mr-00055', 'mr-00060']),
    // Synthea's 'Full-time employment' at 76 and 'Has a criminal record': nothing in the story, the first contradicts it.
    ...world.search('Condition', { patient: PT }).resources.filter((r) => r.resourceType === 'Condition' && /full-time employment/i.test(r.code?.text ?? '')),
  ];
  const put: Resource[] = [
    { ...patient, generalPractitioner: [OKAFOR] },
    ...byIds(world, 'MedicationRequest', STOP).map(stopped),
    c.encounter('enc-t4-stark-adm', 'IMP', ADMISSION, '2026-10-16T14:20:00-04:00', '2026-10-20T12:15:00-04:00', HOSPITAL, refTo(MENSAH)),
    c.condition('cond-t4-stark-htn', ['59621000', 'Essential hypertension'], '2006-11-09T10:47:19-05:00'),
    c.medication('mr-t4-stark-carvedilol', ['200031', 'carvedilol 6.25 MG Oral Tablet'], [6.25, 'mg'], 'BID', '2018-03-24T09:00:00-04:00', 'Coronary artery disease; hypertension'),
    c.medication('mr-t4-stark-atorvastatin', ['259255', 'atorvastatin 80 MG Oral Tablet'], [80, 'mg'], 'QHS', '2018-03-24T09:00:00-04:00', 'Coronary artery disease'),
    c.medication('mr-t4-stark-aspirin', ['243670', 'aspirin 81 MG Oral Tablet'], [81, 'mg'], 'QD', '2018-03-24T09:00:00-04:00', 'Coronary artery disease'),
    c.medication('mr-t4-stark-insulin', ['106892', 'insulin isophane, human 70 UNT/ML / insulin, regular, human 30 UNT/ML Injectable Suspension [Humulin]'], [18, 'units'], 'BID', '2026-09-10T11:00:00-04:00', 'Type 2 diabetes mellitus'),
    c.summary('doc-t4-stark-dc', '2026-10-20T11:48:00-04:00', 'enc-t4-stark-adm', MENSAH, SUMMARY),
    c.fills('doc-t4-stark-fills', '2026-10-21T09:12:26-04:00', FILLS),
    c.fills('doc-t4-stark-outfills', '2026-10-21T09:14:41-04:00', OUTSIDE_FILLS, true),
  ];
  return { put, remove };
}

// -------------------------------------- Adelaide Thompson, pt-0042 (32, hypertension, hypothyroid)
function adelaide(world: WorldReader) {
  const PT = 'pt-0042';
  const c = chart(PT);
  const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
  const SUMMARY = `St. Brigid Regional - Discharge Summary
Patient: Adelaide Thompson   DOB 1994-06-10
Admitted 2026-10-13, discharged 2026-10-17. Service: Hospital Medicine.

Principal diagnosis: symptomatic hyponatremia (sodium 121 mmol/L on admission) with confusion and vomiting.
Other diagnoses: essential hypertension; hypothyroidism.

Hospital course: treated with fluid restriction and cautious hypertonic saline; sodium corrected at under 8 mmol/L per day to 133 on 10/17. TSH 7.9 mIU/L. Blood pressure rose to 160s/100 off diuretic and the calcium channel blocker dose was raised.

Discharge medications:
- Procardia XL 60 mg by mouth daily.
- Hydrochlorothiazide 25 mg by mouth daily: continue.
- Levothyroxine 100 mcg by mouth daily before breakfast: continue.

Follow-up: Riverbend Family Medicine within 7 days with a basic metabolic panel; TSH in 6 weeks.

Laura Fitzgerald, MD`;
  const ADDENDUM = `St. Brigid Regional - Discharge Summary Addendum (signed)
Patient: Adelaide Thompson   DOB 1994-06-10
Admission 2026-10-13 to 2026-10-17. Service: Hospital Medicine.

Reason for addendum: the discharge medication list was carried forward from the admission medication history and was not updated for the cause of this stay. The hyponatremia was attributed to the thiazide, which was held from admission and is not to be restarted.

Correction: hydrochlorothiazide: stop. Do not restart.

All other discharge medications and follow-up are unchanged.

Laura Fitzgerald, MD`;
  const FILLS = `${FILL_HEADER('Adelaide Thompson', '1994-06-10', '10/19/2026 14:30')}
12/15/2025   nifedipine ER 30 mg tablet                     90    90             Maya Okafor, MD                             Riverbend Pharmacy
12/29/2025   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
01/28/2026   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
02/27/2026   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
03/14/2026   nifedipine ER 30 mg tablet                     90    90             Maya Okafor, MD                             Riverbend Pharmacy
03/30/2026   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
04/20/2026   hydrochlorothiazide 25 mg tablet               90    90             Maya Okafor, MD                             Riverbend Pharmacy
06/11/2026   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
06/12/2026   nifedipine ER 30 mg tablet                     90    90             Maya Okafor, MD                             Riverbend Pharmacy
07/19/2026   hydrochlorothiazide 25 mg tablet               90    90             Maya Okafor, MD                             Riverbend Pharmacy
08/24/2026   levothyroxine 100 mcg tablet                   30    30             Maya Okafor, MD                             Riverbend Pharmacy
09/10/2026   nifedipine ER 30 mg tablet                     90    90             Maya Okafor, MD                             Riverbend Pharmacy`;
  // Her Synthea notes go (they list other medications and none of hers), and so do her four base
  // orders (contraception and short courses the notes explained).
  const remove = [
    ...world.search('DocumentReference', { patient: PT }).resources,
    ...byIds(world, 'MedicationRequest', ['mr-00335', 'mr-00336', 'mr-00337', 'mr-00338']),
  ];
  const put: Resource[] = [
    { ...patient, generalPractitioner: [OKAFOR] },
    c.encounter('enc-t4-thompson-adm', 'IMP', ADMISSION, '2026-10-13T21:40:00-04:00', '2026-10-17T13:05:00-04:00', HOSPITAL, refTo(FITZGERALD)),
    c.condition('cond-t4-thompson-htn', ['59621000', 'Essential hypertension'], '2024-05-14T10:00:00-04:00'),
    c.condition('cond-t4-thompson-hypothyroid', ['40930008', 'Hypothyroidism'], '2021-02-09T10:00:00-05:00'),
    c.condition('cond-t4-thompson-hyponatremia', ['89627008', 'Hyponatremia'], '2026-10-13T21:40:00-04:00'),
    c.lab('obs-t4-thompson-na-1013', NA, '2026-10-13T22:05:00-04:00', '2026-10-13T23:00:00-04:00', 121, 'mmol/L', [136, 145], null, HOSPITAL),
    c.medication('mr-t4-thompson-nifedipine', ['198034', '24 HR nifedipine 30 MG Extended Release Oral Tablet'], [30, 'mg'], 'QD', '2024-05-14T10:00:00-04:00', 'Essential hypertension'),
    c.medication('mr-t4-thompson-hctz', ['310798', 'hydrochlorothiazide 25 MG Oral Tablet'], [25, 'mg'], 'QD', '2026-04-20T10:00:00-04:00', 'Essential hypertension'),
    c.medication('mr-t4-thompson-levothyroxine', ['892246', 'levothyroxine sodium 0.1 MG Oral Tablet'], [0.1, 'mg'], 'QD', '2021-02-09T10:00:00-05:00', 'Hypothyroidism'),
    c.summary('doc-t4-thompson-dc', '2026-10-17T12:31:00-04:00', 'enc-t4-thompson-adm', FITZGERALD, SUMMARY),
    c.summary('doc-t4-thompson-add', '2026-10-17T17:55:00-04:00', 'enc-t4-thompson-adm', FITZGERALD, ADDENDUM, { relatesTo: [{ code: 'appends', target: { reference: 'DocumentReference/doc-t4-thompson-dc' } }], description: 'Signed addendum' }),
    c.fills('doc-t4-thompson-fills', '2026-10-19T14:30:00-04:00', FILLS),
  ];
  return { put, remove };
}

// ------------------------------------------- Earnest Roberts, pt-0044 (31, type 1 diabetes, DKD)
function earnest(world: WorldReader) {
  const PT = 'pt-0044';
  const c = chart(PT);
  const patient = world.get('Patient', PT) as Extract<Resource, { resourceType: 'Patient' }>;
  const SUMMARY = `St. Brigid Regional - Discharge Summary
Patient: Earnest Roberts   DOB 1995-06-05
Admitted 2026-10-15, discharged 2026-10-19. Service: Hospital Medicine.

Principal diagnosis: diabetic ketoacidosis, moderate, precipitated by missed insulin doses during a viral illness.
Other diagnoses: acute kidney injury (prerenal, creatinine 2.1 mg/dL on admission); type 1 diabetes mellitus with diabetic kidney disease; hypertension.

Hospital course: insulin infusion and IV fluids; anion gap closed on 10/16 and transitioned to subcutaneous insulin. Creatinine improved to 1.4 at discharge. Lisinopril held for AKI. Sick-day rules reviewed with the patient.

Discharge medications:
- Insulin glargine 22 units subcutaneously at bedtime: continue.
- Insulin lispro 6 units subcutaneously with meals: continue.
- Lisinopril: held for AKI. Resume home 20 mg daily when SCr < 1.3 on post-discharge labs.
- Rosuvastatin 10 mg by mouth daily: continue.

Follow-up: Riverbend Family Medicine within 7 days; basic metabolic panel within 1 week; endocrinology as scheduled.

Omar Haddad, MD`;
  const LAB = `Northgate Outpatient Laboratory - Final Report
Patient: Earnest Roberts   DOB 1995-06-05
Ordering provider: Omar Haddad, MD (St. Brigid Regional)   Copy to: Maya Okafor, MD (Riverbend Family Medicine)
Collected: 10/22/2026 07:50   Reported: 10/22/2026 12:40

Basic metabolic panel
Sodium            139 mmol/L    (136-145)
Potassium         4.6 mmol/L    (3.5-5.1)
Chloride          103 mmol/L    (98-107)
Carbon dioxide    25 mmol/L     (22-29)
Urea nitrogen     17 mg/dL      (8-23)
Creatinine        1.08 mg/dL    (0.74-1.35)
Glucose           168 mg/dL     (70-99)  H
Calcium           9.6 mg/dL     (8.6-10.3)`;
  const FILLS = `${FILL_HEADER('Earnest Roberts', '1995-06-05', '10/20/2026 16:20')}
12/12/2025   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
12/12/2025   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
01/11/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
01/11/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
01/20/2026   lisinopril 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
02/10/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
02/10/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
02/11/2026   rosuvastatin 10 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
03/12/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
03/12/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
04/11/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
04/11/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
04/19/2026   lisinopril 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
05/11/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
05/11/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
05/12/2026   rosuvastatin 10 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
06/10/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
06/10/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
07/10/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
07/10/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
07/18/2026   lisinopril 20 mg tablet                        90    90             Maya Okafor, MD                             Riverbend Pharmacy
08/09/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
08/09/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
08/10/2026   rosuvastatin 10 mg tablet                      90    90             Maya Okafor, MD                             Riverbend Pharmacy
09/08/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
09/08/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy
10/07/2026   insulin glargine 100 units/mL pen 15 mL        1     30             Maya Okafor, MD                             Riverbend Pharmacy
10/07/2026   insulin lispro 100 units/mL pen 15 mL          1     30             Maya Okafor, MD                             Riverbend Pharmacy`;
  const OUTSIDE_FILLS = `${FILL_HEADER('Earnest Roberts', '1995-06-05', '10/20/2026 16:23', true)}
No prescription fills found at pharmacies other than Riverbend Pharmacy for the query period.`;
  // His Synthea notes go (the two physicals list a history without his diabetes), and so do his two
  // completed base orders.
  const remove = [
    ...world.search('DocumentReference', { patient: PT }).resources,
    ...byIds(world, 'MedicationRequest', ['mr-00343', 'mr-00344']),
  ];
  const put: Resource[] = [
    { ...patient, generalPractitioner: [OKAFOR] },
    c.encounter('enc-t4-roberts-adm', 'IMP', ADMISSION, '2026-10-15T03:10:00-04:00', '2026-10-19T14:45:00-04:00', HOSPITAL, refTo(HADDAD)),
    // A lab draw only, not the post-discharge visit the reconciliation comes before (R8).
    c.encounter('enc-t4-roberts-lab', 'AMB', ['308335008', 'Patient encounter procedure (procedure)'], '2026-10-20T09:31:17-04:00', '2026-10-20T09:46:52-04:00', CLINIC, OKAFOR),
    c.condition('cond-t4-roberts-t1d', ['46635009', 'Diabetes mellitus type 1'], '2007-03-02T10:00:00-05:00'),
    c.condition('cond-t4-roberts-dkd', ['127013003', 'Disorder of kidney due to diabetes mellitus'], '2022-04-18T10:00:00-04:00'),
    c.condition('cond-t4-roberts-htn', ['59621000', 'Essential hypertension'], '2022-04-18T10:00:00-04:00'),
    c.condition('cond-t4-roberts-aki', ['14669001', 'Acute kidney injury'], '2026-10-15T03:10:00-04:00'),
    c.lab('obs-t4-roberts-scr-1015', SCR, '2026-10-15T03:40:00-04:00', '2026-10-15T04:30:00-04:00', 2.1, 'mg/dL', [0.74, 1.35], 'enc-t4-roberts-adm', HOSPITAL),
    // The clinic's own draw the day after discharge: its potassium is above 5.0, and it is not the latest.
    c.lab('obs-t4-roberts-k-1020', K, '2026-10-20T09:40:00-04:00', '2026-10-20T13:05:00-04:00', 5.3, 'mmol/L', [3.5, 5.1], 'enc-t4-roberts-lab', CLINIC),
    c.lab('obs-t4-roberts-scr-1020', SCR, '2026-10-20T09:40:00-04:00', '2026-10-20T13:05:00-04:00', 1.24, 'mg/dL', [0.74, 1.35], 'enc-t4-roberts-lab', CLINIC),
    c.medication('mr-t4-roberts-glargine', ['311041', 'insulin glargine 100 UNT/ML Injectable Solution'], [22, 'units'], 'QHS', '2019-06-03T11:25:00-04:00', 'Type 1 diabetes mellitus'),
    c.medication('mr-t4-roberts-lispro', ['242120', 'insulin lispro 100 UNT/ML Injectable Solution'], [6, 'units'], 'TID', '2019-06-03T10:00:00-04:00', 'Type 1 diabetes mellitus'),
    c.medication('mr-t4-roberts-lisinopril', ['314077', 'lisinopril 20 MG Oral Tablet'], [20, 'mg'], 'QD', '2022-04-18T10:00:00-04:00', 'Diabetic kidney disease; hypertension', {
      status: 'on-hold',
      statusReason: { text: 'Held during the St. Brigid Regional admission for acute kidney injury (10/2026)' },
    }),
    c.medication('mr-t4-roberts-rosuvastatin', ['859747', 'rosuvastatin calcium 10 MG Oral Tablet'], [10, 'mg'], 'QD', '2022-04-18T10:00:00-04:00', 'Type 1 diabetes mellitus; cardiovascular risk'),
    c.summary('doc-t4-roberts-dc', '2026-10-19T14:06:13-04:00', 'enc-t4-roberts-adm', HADDAD, SUMMARY),
    c.fills('doc-t4-roberts-fills', '2026-10-20T16:20:00-04:00', FILLS),
    c.fills('doc-t4-roberts-outfills', '2026-10-20T16:24:37-04:00', OUTSIDE_FILLS, true),
    c.labReport('doc-t4-roberts-lab', '2026-10-22T14:23:00-04:00', LAB),
  ];
  return { put, remove };
}

// A time written on the minute (':00' seconds) gets a second of its own, a hash of its resource and
// field, as a chart's clock has (generated times never stand on ':00'; scripts/test/world-tells).
const fnv = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
const ON_THE_MINUTE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d):00(\.\d+)?([-+]\d\d:\d\d|Z)$/;
function seconds(value: unknown, at: string): unknown {
  if (typeof value === 'string') {
    const m = ON_THE_MINUTE.exec(value);
    return m ? `${m[1]}:${String((fnv(at) % 59) + 1).padStart(2, '0')}${m[2] ?? ''}${m[3]}` : value;
  }
  if (Array.isArray(value)) return value.map((v, i) => seconds(v, `${at}[${i}]`));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, seconds(v, `${at}.${k}`)]));
  return value;
}

const overlay: Overlay = {
  task: 'T4',
  names: {
    'org-t4-northgate': 'org-northgate',
    'pr-t4-boateng': 'pr-boateng',
    'pr-t4-mensah': 'pr-mensah',
    'pr-t4-fitzgerald': 'pr-fitzgerald',
    'pr-t4-haddad': 'pr-haddad',
  },
  build(world: WorldReader) {
    const parts = [walter(world), terence(world), adelaide(world), earnest(world)];
    return {
      put: [BOATENG, MENSAH, FITZGERALD, HADDAD, OUTSIDE_LAB, ...parts.flatMap((p) => p.put)].map((r) => seconds(r, `${r.resourceType}/${r.id}`) as Resource),
      remove: parts.flatMap((p) => p.remove).map((r) => ({ resourceType: r.resourceType, id: r.id! })),
      lint: {
        thresholds: [
          { quantity: 'scr', threshold: 1.5, value: 1.32, label: 'creatinine in the Kim outside lab report' },
          { quantity: 'potassium', threshold: 5.0, value: 5.4, label: 'potassium in the Kim outside lab report' },
          { quantity: 'scr', threshold: 1.3, value: 1.08, label: 'creatinine in the Roberts outside lab report' },
          { quantity: 'potassium', threshold: 5.0, value: 4.6, label: 'potassium in the Roberts outside lab report' },
          { quantity: 'potassium', threshold: 5.0, value: 5.3, label: 'potassium in the Roberts clinic draw of 10/20' },
        ],
      },
    };
  },
};

export default overlay;
