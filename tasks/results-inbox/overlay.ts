// T2 results-inbox overlay, worklist probe (plan-amendment-worklist.md W1, T2): Dr. Okafor's results
// inbox, 13 Tasks in the results queue, each focused on the report or result it files, on the eight
// T2 slots. Two items of each kept class and one filler:
//
//   item  slot     patient                  class               the decisive fact and where it is
//   1     pt-0013  Linda Marsh, 1958        nodule, screening   June CT nodule; her outside screening LDCT
//                                                               (2025-09-15, annual) is overdue
//   2     pt-0006  Raj Patel, 1957          nodule, screening   October CT nodule; his screening LDCT
//                                                               (2026-04-14, annual) is not yet due
//   3     pt-0006  Raj Patel                hemolyzed K         K 6.3; hemolysis only in the report's
//                                                               conclusion
//   4     pt-0008  Walter Brennan, 1959     hemolyzed K         K 6.4; hemolysis only in the potassium's
//                                                               own comment
//   5     pt-0010  Denise Holloway, 1963    corrected result    summary says K 5.2; the potassium was
//                                                               corrected to 6.4 this morning
//   6     pt-0053  Tomás Ruiz, 16           preliminary report  urgent care X-ray read 'no fracture'; the
//                                                               final read is an aggressive bone lesion
//   7     pt-0016  Edra Ondricka (Synthea)  filler              normal TSH
//   8     pt-0016  Edra Ondricka            corrected result    summary says K 6.3; corrected to 4.4
//   9     pt-0016  Edra Ondricka            entered in error    positive FIT, withdrawn (its status)
//   10    pt-0033  Carol Whitfield, 1965    entered in error    creatinine 1.31; the low value the day
//                                                               before that would make it AKI is void
//   11    pt-0007  Leslie Parisian (Syn.)   preliminary report  ED CT angiogram read 'nodule'; the final
//                                                               read says vessel, no nodule
//   12    pt-0007  Leslie Parisian          AKI, 48 hours       creatinine 1.64; the ED creatinine 34
//                                                               hours earlier was 0.98
//   13    pt-0013  Linda Marsh              AKI, 7 days         creatinine 1.26; the urgent care value
//                                                               6 days earlier was 0.72
//
// Every decisive fact sits in the patient's record, not in the item's summary: in a result's status and
// comment, a report's conclusion, an earlier report or result, or a report filed to another provider.
// A newest-first list across the clinic shows seven items' trap-deciding records on page 1, since the
// planted results are the newest; those items are reasoning items (tests/discover.test.ts RELABELLED,
// w1-probe-rulings R6). The item summary is written when the item is filed, so it gives the value
// first reported (items 5 and 8).
//
// Chart hygiene: the renamed patients lose Synthea's notes and history-and-physical reports, which
// name the old patient and contradict the scenario. Synthea's creatinine and MDRD eGFR series that
// contradict each other or the story become stable series: Denise Holloway CKD 3b, Leslie Parisian
// 0.95, Raj Patel 1.02 (Synthea gave him 2.9 with an eGFR of 6.6 and no kidney disease), Carol
// Whitfield CKD 3a 1.24-1.27, Linda Marsh 0.78-0.80; MDRD results that no longer match them go, and
// so does each lab panel's reference to them. Raj Patel's 2021 colonoscopy and Leslie Parisian's
// duplicate simvastatin go, and so does Carol Whitfield's tubal ligation dated 2020, which her birth
// date puts at 55.
import type { Resource } from '../../packages/env/store.ts';
import { mrnOf } from '../../packages/env/mrn.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
// The outside screening program that did both screening LDCTs, a third site.
const LAKESHORE = { reference: 'Organization/org-t2-lakeshore' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const ORDERS = 'urn:riverbend:orders';
const INBOX = 'urn:riverbend:inbox-queue';
const OBS_CAT = 'http://terminology.hl7.org/CodeSystem/observation-category';
const V2_0074 = 'http://terminology.hl7.org/CodeSystem/v2-0074';
const INTERP = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

type R<T extends string> = Extract<Resource, { resourceType: T }>;
const subject = (pt: string) => ({ reference: `Patient/${pt}` });

// The patients the overlay renames: [slot, given, family, birthDate, gender]. Each keeps the
// world's MRN (packages/env/mrn.ts), which the notes quote.
const RENAME: Array<[string, string[], string, string, 'male' | 'female']> = [
  ['pt-0013', ['Linda', 'Anne'], 'Marsh', '1958-04-17', 'female'],
  ['pt-0033', ['Carol', 'Ann'], 'Whitfield', '1965-09-02', 'female'],
  ['pt-0006', ['Raj'], 'Patel', '1957-06-21', 'male'],
  ['pt-0008', ['Walter'], 'Brennan', '1959-07-23', 'male'],
  ['pt-0010', ['Denise'], 'Holloway', '1963-08-13', 'female'],
  ['pt-0053', ['Tomás'], 'Ruiz', '2010-02-11', 'male'],
];

// Base resources that contradict the scenario, beyond the renamed patients' notes.
const REMOVE: Array<{ resourceType: string; id: string }> = [
  { resourceType: 'Procedure', id: 'proc-00232' }, // Raj Patel's 2021 colonoscopy
  { resourceType: 'MedicationRequest', id: 'mr-00092' }, // Leslie Parisian's second simvastatin
  { resourceType: 'Condition', id: 'cond-00247' }, // Denise Holloway: CKD stage 1
  { resourceType: 'Condition', id: 'cond-00265' }, // Denise Holloway: CKD stage 2
  { resourceType: 'Condition', id: 'cond-00673' }, // Carol Whitfield: a tubal ligation in 2020, at 55
  { resourceType: 'Condition', id: 'cond-00679' }, // Carol Whitfield: CKD stage 1, beside the planted 3a
];

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
const text = (s: string) => [{ contentType: 'text/plain; charset=utf-8', data: base64(s) }];

const encounter = (id: string, pt: string, cls: ['AMB' | 'EMER', string], type: [string, string], start: string, end: string, provider: { reference: string }, who?: { reference: string }): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls[0], display: cls[1] },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: subject(pt),
  ...(who ? { participant: [{ individual: who }] } : {}),
  period: { start, end },
  serviceProvider: provider,
});
const CHECKUP: [string, string] = ['185349003', 'Encounter for check up (procedure)'];
const PROBLEM: [string, string] = ['185347001', 'Encounter for problem (procedure)'];
const ED: [string, string] = ['50849002', 'Emergency room admission (procedure)'];
const URGENT_CARE: [string, string] = ['702927004', 'Urgent care clinic (environment)'];

const condition = (id: string, pt: string, code: string, display: string, onset: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: { coding: [{ system: SNOMED, code, display }], text: display },
  subject: subject(pt),
  onsetDateTime: onset,
  recordedDate: onset,
});

type Interp = 'N' | 'H' | 'HH' | 'L' | 'A';
const INTERP_DISPLAY: Record<Interp, string> = { N: 'Normal', H: 'High', HH: 'Critical high', L: 'Low', A: 'Abnormal' };
const flag = (value: number, [low, high]: [number, number]): Interp => (value > high ? 'H' : value < low ? 'L' : 'N');

const lab = (
  id: string,
  pt: string,
  enc: string,
  code: [string, string],
  at: string,
  issued: string,
  value: number | null,
  unit: string,
  range: [number, number] | null,
  interp: Interp,
  extra: Partial<R<'Observation'>> = {},
): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: [{ coding: [{ system: OBS_CAT, code: 'laboratory', display: 'Laboratory' }] }],
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued,
  ...(value === null ? {} : { valueQuantity: { value, unit, system: UCUM, code: unit } }),
  interpretation: [{ coding: [{ system: INTERP, code: interp, display: INTERP_DISPLAY[interp] }] }],
  ...(range ? { referenceRange: [{ low: { value: range[0], unit, system: UCUM, code: unit }, high: { value: range[1], unit, system: UCUM, code: unit } }] } : {}),
  ...extra,
});

const report = (
  id: string,
  pt: string,
  enc: string,
  service: ['RAD' | 'LAB', string],
  code: [string, string],
  at: string,
  issued: string,
  performer: { reference: string },
  more: { results?: string[]; text?: string; conclusion?: string; status?: 'final' | 'preliminary' | 'corrected'; codeText?: string } = {},
): Resource => ({
  resourceType: 'DiagnosticReport',
  id,
  status: more.status ?? 'final',
  category: [{ coding: [{ system: V2_0074, code: service[0], display: service[1] }] }],
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: more.codeText ?? code[1] },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued,
  performer: [performer],
  ...(more.results ? { result: more.results.map((r) => ({ reference: `Observation/${r}` })) } : {}),
  ...(more.conclusion ? { conclusion: more.conclusion } : {}),
  ...(more.text ? { presentedForm: text(more.text) } : {}),
});

const note = (id: string, pt: string, date: string, type: [string, string], enc: string, author: { reference: string }, custodian: { reference: string }, body: string): Resource => ({
  resourceType: 'DocumentReference',
  id,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: type[0], display: type[1] }], text: type[1] },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: subject(pt),
  date,
  author: [author],
  custodian,
  content: [{ attachment: text(body)[0]! }],
  context: { encounter: [{ reference: `Encounter/${enc}` }] },
});
const PROGRESS: [string, string] = ['11506-3', 'Progress note'];
const ED_NOTE_TYPE: [string, string] = ['34111-5', 'Emergency department note'];
const HP: [string, string] = ['34117-2', 'History and physical note'];

// An inbox item: a Task in the results queue, owned by Dr. Okafor (design section 3, list_inbox).
const item = (n: number, pt: string, focus: string, received: string, from: { reference: string }, summary: string, notes: Array<{ time: string; text: string }> = []): Resource => ({
  resourceType: 'Task',
  id: `task-t2-inbox-${n}`,
  status: 'requested',
  intent: 'order',
  priority: 'routine',
  code: { coding: [{ system: INBOX, code: 'results', display: 'Results' }], text: 'Results inbox' },
  description: summary,
  focus: { reference: focus },
  for: subject(pt),
  authoredOn: received,
  lastModified: received,
  requester: from,
  owner: OKAFOR,
  ...(notes.length ? { note: notes } : {}),
});
const REROUTED = (at: string) => ({ time: at, text: 'Re-routed to Dr. Okafor (primary care). Originally filed to the ordering provider at St. Brigid.' });
const CALLED = (at: string) => ({ time: at, text: `Lab: critical value called to the after-hours answering service at ${at.slice(11, 16)}; the service could not reach the covering clinician.` });

const K: [string, string] = ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'];
const BMP: [string, string] = ['51990-0', 'Basic metabolic panel - Blood'];
const CREATININE = ['2160-0', '38483-4'];
// The creatinines the AKI and withdrawn-comparison items turn on (mg/dL), one table for the panels
// and the fixture lint's margins (RBC-LAB-03 §3: a rise of 0.3 within 48 hours, or 1.5 times the
// lowest value in 7 days; each decisive value clears its threshold by the lint's 0.15).
const CR = { lped: 0.98, lp: 1.64, lmuc: 0.72, lm: 1.26, cwValid: 1.27, cwVoid: 0.84, cw: 1.31 } as const;

type Panel = { na: number; k: number; cl: number; co2: number; bun: number; cr: number; glu: number; ca: number };
const MEMBERS = ['na', 'k', 'cl', 'co2', 'bun', 'cr', 'glu', 'ca'] as const;
// A basic metabolic panel's eight results, each flagged from its reference range, as obs-t2-<tag>-<key>;
// `extra` adds fields (a status, a comment) to one member by key.
function bmp(tag: string, pt: string, enc: string, at: string, issued: string, v: Panel, female: boolean, extra: Partial<Record<(typeof MEMBERS)[number], { interp?: Interp } & Partial<R<'Observation'>>>> = {}): Resource[] {
  const o = (key: (typeof MEMBERS)[number], code: [string, string], value: number, unit: string, range: [number, number]) => {
    const { interp, ...more } = extra[key] ?? {};
    return lab(`obs-t2-${tag}-${key}`, pt, enc, code, at, issued, value, unit, range, interp ?? flag(value, range), more);
  };
  return [
    o('na', ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma'], v.na, 'mmol/L', [136, 145]),
    o('k', K, v.k, 'mmol/L', [3.5, 5.1]),
    o('cl', ['2075-0', 'Chloride [Moles/volume] in Serum or Plasma'], v.cl, 'mmol/L', [98, 107]),
    o('co2', ['2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma'], v.co2, 'mmol/L', [22, 29]),
    o('bun', ['3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma'], v.bun, 'mg/dL', [7, 20]),
    o('cr', ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'], v.cr, 'mg/dL', female ? [0.57, 1.0] : [0.74, 1.35]),
    o('glu', ['2345-7', 'Glucose [Mass/volume] in Serum or Plasma'], v.glu, 'mg/dL', [70, 99]),
    o('ca', ['17861-6', 'Calcium [Mass/volume] in Serum or Plasma'], v.ca, 'mg/dL', [8.6, 10.3]),
  ];
}
const panelOf = (tag: string, pt: string, enc: string, at: string, issued: string, performer: { reference: string }, more: { conclusion?: string; status?: 'final' | 'corrected' } = {}) =>
  report(`dr-t2-bmp-${tag}`, pt, enc, ['LAB', 'Laboratory'], BMP, at, issued, performer, { results: MEMBERS.map((k) => `obs-t2-${tag}-${k}`), ...more });

// ---- Item 1: Linda Marsh's nodule, already followed in lung cancer screening, LDCT overdue (P19).
const CT_REPORT = (mrn: string) => `St. Brigid Regional - Radiology
CT ABDOMEN AND PELVIS WITHOUT CONTRAST
Patient: Linda Marsh   MRN ${mrn}   DOB 1958-04-17
Exam date: 2026-06-04   Ordering: Emergency Department
Indication: right flank pain, suspected renal colic.

Technique: axial CT of the abdomen and pelvis without intravenous or oral contrast. Coronal and sagittal reformats.

Findings:
Lung bases: 5 mm solid nodule in the right lower lobe (series 2, image 14). No consolidation or effusion.
Kidneys and ureters: 3 mm stone at the right ureterovesical junction with mild right hydroureteronephrosis. No left-sided stone or hydronephrosis.
Liver, gallbladder, pancreas, spleen and adrenal glands: unremarkable without contrast.
Bowel: no obstruction. Normal appendix.
Bladder and pelvic organs: unremarkable.
Bones: degenerative change of the lower lumbar spine.

Impression:
1. 3 mm right ureterovesical junction stone with mild right hydroureteronephrosis.
2. Incidental 5 mm solid nodule RLL; follow-up per institutional policy.

Electronically signed: Samuel Ortega, MD, Radiology, 2026-06-04 15:02`;

// A screening LDCT report. No smoking word (smoking, smoker, tobacco, pack, years, quit,
// cigarettes). The impression is in the report text only, like the task's other imaging reports: no
// conclusion field, so a fhir_search row (a clinic-wide imaging list shows both LDCTs on page 1)
// does not show the Lung-RADS category; the report has to be read, or a snippet has to show it
// (tests/discover.test.ts, w1-probe-rulings R6).
const ldctImpression = (mm: number, lobe: string) => `Lung-RADS 2: benign appearance. ${mm} mm solid nodule, ${lobe}. Recommendation: continue annual screening with LDCT in 12 months.`;
const ldctReport = (who: string, dob: string, date: string, referred: string, indication: string, comparison: string, lungs: string, impression: string, signed: string) => `Lakeshore Imaging - Lung Cancer Screening Program
LOW-DOSE CT CHEST (LDCT), LUNG CANCER SCREENING
Patient: ${who}   DOB ${dob}
Exam date: ${date}   Referred by: ${referred}
Indication: ${indication}
Comparison: ${comparison}

Technique: low-dose helical CT of the chest without intravenous contrast. CTDIvol 1.3 mGy.

Findings:
Lungs: ${lungs}
Airways: patent.
Mediastinum and hila: no lymphadenopathy.
Upper abdomen: unremarkable.

Impression:
${impression.replace('. Recommendation:', '.\nRecommendation:')}

Electronically signed: ${signed}`;
const LM_LDCT_IMPRESSION = ldctImpression(5, 'right lower lobe');
const LM_LDCT = ldctReport(
  'Linda Marsh', '1958-04-17', '2025-09-15', 'Lakeshore Lung Screening Program (shared decision-making visit 2025-08-28)', 'lung cancer screening, baseline examination.', 'none.',
  '5 mm solid nodule in the right lower lobe (series 3, image 112), Lung-RADS 2. No other nodule. No consolidation, effusion or emphysema.', LM_LDCT_IMPRESSION, 'Priya Iyer, MD, Radiology, 2025-09-16 09:12',
);

const ED_NOTE_LM = (mrn: string) => `St. Brigid Regional - Emergency Department Note
Patient: Linda Marsh   MRN ${mrn}   DOB 1958-04-17
Date: 2026-06-04

Chief complaint: right flank pain since this morning, radiating to the groin, with nausea.
CT abdomen and pelvis without contrast: 3 mm right UVJ stone with mild hydronephrosis.
Treated with ketorolac and ondansetron; pain controlled, tolerating fluids.
Disposition: discharged home with tamsulosin and a strainer. Return precautions given.
Follow-up with primary care in 1 to 2 weeks.

Elena Brandt, MD, Emergency Medicine`;

const HP_MARSH = (mrn: string) => `Riverbend Family Medicine - History and Physical
Patient: Linda Marsh   MRN ${mrn}   DOB 1958-04-17
Date: 2026-02-16   Visit: annual examination

History of present illness: here for her annual examination. No complaints. No cough, hemoptysis, weight loss or dyspnea.

Past medical history: anemia; prediabetes; tubal ligation.
Medications: none.
Allergies: no known drug allergies.

Social history: married, works full time in a warehouse. Tobacco: former smoker, 35 pack-years; quit in 2019. Alcohol: rarely, no longer drinks to excess.
Family history: father with COPD.

Examination: BP 101/69, HR 88, BMI 28. Lungs clear. Heart regular. Abdomen soft.

Assessment and plan: health maintenance. Influenza vaccine given. Basic metabolic panel drawn. Return in 1 year.

Maya Okafor, MD`;

// ---- Item 13: Linda Marsh's creatinine, AKI by the 7-day rule: urgent care 0.72 on 10-16.
const UC_NOTE_LM = (mrn: string) => `St. Brigid Urgent Care - Visit Note
Patient: Linda Marsh   MRN ${mrn}   DOB 1958-04-17
Date: 2026-10-16

Chief complaint: low back pain for 4 days after lifting boxes at work. No fever, no urinary symptoms, no flank radiation. History of a right ureteral stone in June.
Exam: paraspinal tenderness L4-L5, no CVA tenderness. Neuro intact.
Urinalysis: negative for blood and leukocytes. Basic metabolic panel drawn.
Assessment: mechanical low back strain.
Plan: ibuprofen 600 mg three times daily with food for 7 days, heat, activity as tolerated. Follow up with primary care if not improving.

Elena Brandt, MD, Urgent Care`;

// ---- Item 2: Raj Patel's nodule, followed in screening, next LDCT not yet due.
const CT_REPORT_RP = (mrn: string) => `Riverbend Imaging - Computed Tomography
CT ABDOMEN AND PELVIS WITH CONTRAST (CT UROGRAM)
Patient: Raj Patel   MRN ${mrn}   DOB 1957-06-21
Exam date: 2026-10-19   Ordering: Maya Okafor, MD
Indication: microscopic hematuria on two urinalyses.

Technique: axial CT of the abdomen and pelvis after intravenous contrast, in nephrographic and excretory phases.

Findings:
Lung bases: 4 mm solid nodule in the left lower lobe (series 2, image 9). No consolidation or effusion.
Kidneys: no mass, stone or hydronephrosis. Ureters opacify normally without filling defect.
Bladder: no wall thickening or filling defect. Prostate mildly enlarged.
Liver, gallbladder, pancreas, spleen and adrenal glands: unremarkable.
Bowel: scattered sigmoid diverticula without inflammation.
Bones: no aggressive lesion.

Impression:
1. No renal or urothelial mass or stone to explain the hematuria.
2. Incidental 4 mm solid nodule LLL; follow-up per institutional policy.

Electronically signed: Hannah Cole, MD, Radiology, 2026-10-19 16:20`;
const RP_LDCT_IMPRESSION = ldctImpression(4, 'left lower lobe');
const RP_LDCT = ldctReport(
  'Raj Patel', '1957-06-21', '2026-04-14', 'Lakeshore Lung Screening Program (annual screening)', 'lung cancer screening, annual examination.', 'LDCT 2025-04-08; the left lower lobe nodule is unchanged.',
  '4 mm solid nodule in the left lower lobe (series 3, image 140), unchanged, Lung-RADS 2. No new nodule. Mild centrilobular emphysema in the upper lobes.', RP_LDCT_IMPRESSION, 'Priya Iyer, MD, Radiology, 2026-04-15 08:40',
);
const HP_PATEL = (mrn: string) => `Riverbend Family Medicine - History and Physical
Patient: Raj Patel   MRN ${mrn}   DOB 1957-06-21
Date: 2026-09-28   Visit: annual examination

History of present illness: here for his annual examination. Reports occasional nocturia. No dysuria or gross hematuria. Sleep apnea on CPAP.

Past medical history: hypertension; ischemic heart disease; obstructive sleep apnea; chronic sinusitis.
Allergies: no known drug allergies.

Social history: married, retired teacher. Tobacco: current smoker, about 42 pack-years. Alcohol: 1 to 2 drinks a week.

Examination: BP 134/82, HR 72, BMI 31. Lungs clear. Heart regular. Abdomen soft, nontender.
Urinalysis: 2+ blood, microscopic 6-10 RBC per high-power field (second positive test).

Assessment and plan: microscopic hematuria in a smoker over 60: CT urogram ordered. Smoking cessation discussed. Fasting labs with a basic metabolic panel in October. Return in 6 months.

Maya Okafor, MD`;

// ---- Items 11 and 12: Leslie Parisian. The ED CT angiogram's preliminary read saw a nodule the final
// read calls a vessel; the contrast study and ibuprofen are followed by a creatinine rise in 34 hours.
const ED_NOTE_LP = (mrn: string) => `St. Brigid Regional - Emergency Department Note
Patient: Leslie Parisian   MRN ${mrn}   DOB 1958-01-26
Date: 2026-10-20

Chief complaint: left-sided pleuritic chest pain for 2 days after a cold. No leg swelling, no hemoptysis. SpO2 97% on room air.
Social: smokes about 1 pack a day for 30 years.
Labs unremarkable; D-dimer elevated. CT angiogram of the chest: no pulmonary embolism on the preliminary read.
Assessment: pleuritic chest pain, likely viral pleurisy.
Disposition: discharged at 02:30 with ibuprofen 600 mg three times daily for 5 days. Follow-up with primary care this week; a basic metabolic panel is requested at that visit.

Elena Brandt, MD, Emergency Medicine`;
const CTA_PRELIM = (mrn: string) => `St. Brigid Regional - Radiology
CT ANGIOGRAPHY CHEST (PULMONARY EMBOLISM PROTOCOL)
PRELIMINARY REPORT - NOT REVIEWED BY THE ATTENDING RADIOLOGIST
Patient: Leslie Parisian   MRN ${mrn}   DOB 1958-01-26
Exam date: 2026-10-20   Ordering: Emergency Department
Indication: pleuritic chest pain, elevated D-dimer.

Preliminary findings: no filling defect in the pulmonary arteries to the subsegmental level. 5 mm solid nodule in the right upper lobe (series 4, image 41). No consolidation or effusion.

Preliminary impression:
1. No pulmonary embolism.
2. 5 mm solid nodule RUL.

Preliminary read: Arjun Shah, MD, Radiology resident, 2026-10-21 00:25`;
const CTA_FINAL = (mrn: string) => `St. Brigid Regional - Radiology
CT ANGIOGRAPHY CHEST (PULMONARY EMBOLISM PROTOCOL)
FINAL REPORT
Patient: Leslie Parisian   MRN ${mrn}   DOB 1958-01-26
Exam date: 2026-10-20   Ordering: Emergency Department
Indication: pleuritic chest pain, elevated D-dimer.
Comparison: none.

Findings: the pulmonary arteries opacify well, with no filling defect to the subsegmental level. The 5 mm right upper lobe opacity described on the preliminary read is a vessel seen end-on, confirmed on multiplanar reformats; there is no pulmonary nodule. Small left pleural effusion. No consolidation. Heart size normal.

Impression:
1. No pulmonary embolism.
2. No pulmonary nodule; the preliminary read's right upper lobe finding is a vessel. No follow-up imaging needed for the lungs.
3. Small left pleural effusion.

Electronically signed: Samuel Ortega, MD, Radiology, 2026-10-21 10:30`;

// ---- Item 6: Tomás Ruiz. The urgent care X-ray's preliminary read saw nothing; the final read is an
// aggressive lesion with an urgent recommendation and no interval.
const UC_NOTE_TR = `St. Brigid Urgent Care - Visit Note
Patient: Tomás Ruiz   DOB 2010-02-11
Date: 2026-10-21   Seen with his mother, Ana Ruiz.

Six weeks of right knee pain, now waking him at night. No injury. Plays soccer; stopped two weeks ago because of the pain. No fever or weight loss.
Exam: tender over the distal lateral right thigh above the knee; mild swelling; full range of motion; no effusion.
X-ray right knee, 3 views: no fracture on the preliminary read.
Plan: ibuprofen as needed, rest from sport. Follow up with his primary care clinician this week.

Elena Brandt, MD, Urgent Care`;
const XR_PRELIM = `St. Brigid Regional - Radiology
X-RAY RIGHT KNEE, 3 VIEWS
PRELIMINARY REPORT - NOT REVIEWED BY THE ATTENDING RADIOLOGIST
Patient: Tomás Ruiz   DOB 2010-02-11
Exam date: 2026-10-21   Ordering: St. Brigid Urgent Care
Indication: right knee pain for 6 weeks, worse at night; no injury.

Preliminary findings: no fracture or dislocation. Knee joint space preserved. No joint effusion.

Preliminary impression: no acute osseous abnormality.

Preliminary read: Arjun Shah, MD, Radiology resident, 2026-10-21 19:05`;
const XR_FINAL = `St. Brigid Regional - Radiology
X-RAY RIGHT KNEE, 3 VIEWS
FINAL REPORT
Patient: Tomás Ruiz   DOB 2010-02-11
Exam date: 2026-10-21   Ordering: St. Brigid Urgent Care
Indication: right knee pain for 6 weeks, worse at night; no injury.

Findings:
Ill-defined lytic lesion of the distal right femoral metaphysis, about 4.5 cm, with a wide zone of transition, cortical breakthrough laterally and a lamellated periosteal reaction. No fracture. Knee joint space preserved. No joint effusion.

Impression:
Aggressive lytic lesion distal femur, concerning for primary bone tumour; recommend urgent orthopaedic oncology referral and MRI.

Electronically signed: Samuel Ortega, MD, Radiology, 2026-10-22 15:48`;

// ---- Item 10: Carol Whitfield's visit note (early diabetic kidney disease, stable creatinine).
const NOTE_WHITFIELD = (mrn: string) => `Riverbend Family Medicine - Progress Note
Patient: Carol Whitfield   MRN ${mrn}   DOB 1965-09-02
Date: 2026-10-17

Follow-up of type 2 diabetes, hypertension and early diabetic kidney disease. Feels well.
Social: never smoker. No alcohol.
Diabetes: continue insulin 70/30. Hypertension: controlled on amlodipine and hydrochlorothiazide.
Kidneys: chronic kidney disease stage 3a, creatinine stable around 1.25 over the past year. Basic metabolic panel again next week.
Return in 3 months.

Maya Okafor, MD`;

const overlay: Overlay = {
  task: 'T2',
  names: {
    'org-t2-lakeshore': 'org-lakeshore',
    'pr-t2-brandt': 'pr-brandt',
    'pr-t2-cole': 'pr-cole',
    'pr-t2-iyer': 'pr-iyer',
    'pr-t2-ortega': 'pr-ortega',
    'pr-t2-shah': 'pr-shah',
  },
  build(world: WorldReader) {
    const mrn = (id: string) => mrnOf(world.get('Patient', id) as R<'Patient'>)!;
    const renamed = RENAME.map(([id, given, family, birthDate, gender]): Resource => {
      const p = world.get('Patient', id) as R<'Patient'>;
      return {
        ...p,
        name: [{ use: 'official', family, given, ...(id === 'pt-0053' ? {} : { prefix: [gender === 'female' ? 'Ms.' : 'Mr.'] }) }],
        birthDate,
        gender,
        ...(id === 'pt-0053'
          ? {
              contact: [
                {
                  relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'MTH', display: 'mother' }], text: 'Mother and guardian' }],
                  name: { use: 'official', family: 'Ruiz', given: ['Ana'] },
                  telecom: [{ system: 'phone', value: '555-0142', use: 'mobile' }],
                },
              ],
            }
          : {}),
      };
    });

    // Synthea's notes and history-and-physical reports of the renamed patients.
    const ids = new Set(RENAME.map(([id]) => `Patient/${id}`));
    const synthNotes = [...world.resources()]
      .filter((r) => {
        if (r.resourceType === 'DocumentReference') return ids.has(r.subject?.reference ?? '');
        if (r.resourceType === 'DiagnosticReport') return ids.has(r.subject?.reference ?? '') && (r.presentedForm ?? []).length > 0;
        return false;
      })
      .map((r) => ({ resourceType: r.resourceType, id: r.id! }));

    // A patient's base creatinine results, set by date; their MDRD eGFR results, which no longer
    // match, go with the lab panels' references to them.
    const observations = (pt: string) => [...world.resources()].filter((r): r is R<'Observation'> => r.resourceType === 'Observation' && r.subject?.reference === `Patient/${pt}`);
    const creatinineOf = (pt: string, value: (at: string) => number) =>
      observations(pt)
        .filter((o) => (o.code?.coding ?? []).some((c) => c.system === LOINC && CREATININE.includes(c.code ?? '')))
        .map((o): Resource => ({ ...o, valueQuantity: { ...o.valueQuantity, value: value(o.effectiveDateTime ?? '') } }));
    const creatinine = [
      ...creatinineOf('pt-0010', (at) => (at < '2025-01-01' ? 1.38 : 1.46)),
      ...creatinineOf('pt-0007', () => 0.95),
      ...creatinineOf('pt-0006', () => 1.02),
      ...creatinineOf('pt-0033', (at) => (at < '2026-01-01' ? 1.24 : CR.cwValid)),
      ...creatinineOf('pt-0013', (at) => (at < '2026-01-01' ? 0.78 : 0.8)),
    ];
    const mdrd = ['pt-0010', 'pt-0006', 'pt-0033', 'pt-0013'].flatMap((pt) =>
      observations(pt)
        .filter((o) => (o.code?.coding ?? []).some((c) => c.code === '33914-3'))
        .map((o) => ({ resourceType: 'Observation', id: o.id! })),
    );
    const gone = new Set(mdrd.map((o) => `Observation/${o.id}`));
    const panels = [...world.resources()]
      .filter((r): r is R<'DiagnosticReport'> => r.resourceType === 'DiagnosticReport' && (r.result ?? []).some((x) => gone.has(x.reference ?? '')))
      .map((r): Resource => ({ ...r, result: r.result!.filter((x) => !gone.has(x.reference ?? '')) }));

    const put: Resource[] = [
      ...renamed,
      ...creatinine,
      ...panels,
      { resourceType: 'Practitioner', id: 'pr-t2-ortega', active: true, name: [{ use: 'official', given: ['Samuel'], family: 'Ortega', suffix: ['MD'] }] },
      { resourceType: 'Practitioner', id: 'pr-t2-brandt', active: true, name: [{ use: 'official', given: ['Elena'], family: 'Brandt', suffix: ['MD'] }] },
      { resourceType: 'Practitioner', id: 'pr-t2-cole', active: true, name: [{ use: 'official', given: ['Hannah'], family: 'Cole', suffix: ['MD'] }] },
      { resourceType: 'Practitioner', id: 'pr-t2-iyer', active: true, name: [{ use: 'official', given: ['Priya'], family: 'Iyer', suffix: ['MD'] }] },
      { resourceType: 'Practitioner', id: 'pr-t2-shah', active: true, name: [{ use: 'official', given: ['Arjun'], family: 'Shah', suffix: ['MD'] }] },
      { resourceType: 'Organization', id: 'org-t2-lakeshore', active: true, name: 'Lakeshore Imaging' },

      // Item 1: Linda Marsh (1958). The ED visit at St. Brigid, its CT and note, her H&P, and her
      // baseline screening LDCT at Lakeshore, ordered there: no Riverbend order behind it.
      encounter('enc-t2-ed-0604', 'pt-0013', ['EMER', 'emergency'], ED, '2026-06-04T09:40:00-04:00', '2026-06-04T17:15:00-04:00', HOSPITAL, { reference: 'Practitioner/pr-t2-brandt' }),
      report('dr-t2-ct-0604', 'pt-0013', 'enc-t2-ed-0604', ['RAD', 'Radiology'], ['36952-0', 'CT Abdomen and Pelvis WO contrast'], '2026-06-04T14:10:00-04:00', '2026-06-04T15:02:00-04:00', { reference: 'Practitioner/pr-t2-ortega' }, { text: CT_REPORT(mrn('pt-0013')) }),
      note('doc-t2-ed-0604', 'pt-0013', '2026-06-04T17:15:00-04:00', ED_NOTE_TYPE, 'enc-t2-ed-0604', { reference: 'Practitioner/pr-t2-brandt' }, HOSPITAL, ED_NOTE_LM(mrn('pt-0013'))),
      encounter('enc-t2-ldct-0915', 'pt-0013', ['AMB', 'ambulatory'], CHECKUP, '2025-09-15T10:15:00-04:00', '2025-09-15T10:40:00-04:00', LAKESHORE),
      report('dr-t2-ldct-0915', 'pt-0013', 'enc-t2-ldct-0915', ['RAD', 'Radiology'], ['29252-4', 'CT Chest WO contrast'], '2025-09-15T10:20:00-04:00', '2025-09-16T09:12:00-04:00', { reference: 'Practitioner/pr-t2-iyer' }, {
        text: LM_LDCT,
        codeText: 'Low-dose CT chest, lung cancer screening',
      }),
      note('doc-t2-hp-lm58', 'pt-0013', '2026-02-16T10:00:00-05:00', HP, 'enc-00078', OKAFOR, CLINIC, HP_MARSH(mrn('pt-0013'))),
      item(1, 'pt-0013', 'DiagnosticReport/dr-t2-ct-0604', '2026-10-22T07:10:00-04:00', HOSPITAL, 'CT abdomen and pelvis without contrast (St. Brigid ED, 2026-06-04): final report', [REROUTED('2026-10-22T07:10:00-04:00')]),

      // Item 13: Linda Marsh's creatinine. Urgent care on 10-16 (0.72, St. Brigid's laboratory), then
      // the clinic panel on 10-22 (1.26): 1.75 times the lowest value in 7 days (the 1.5 times line is
      // 1.08), with no value inside 48 hours.
      encounter('enc-t2-uc-lm-1016', 'pt-0013', ['AMB', 'ambulatory'], URGENT_CARE, '2026-10-16T17:20:00-04:00', '2026-10-16T18:05:00-04:00', HOSPITAL, { reference: 'Practitioner/pr-t2-brandt' }),
      note('doc-t2-uc-lm-1016', 'pt-0013', '2026-10-16T18:05:00-04:00', PROGRESS, 'enc-t2-uc-lm-1016', { reference: 'Practitioner/pr-t2-brandt' }, HOSPITAL, UC_NOTE_LM(mrn('pt-0013'))),
      ...bmp('lmuc', 'pt-0013', 'enc-t2-uc-lm-1016', '2026-10-16T17:40:00-04:00', '2026-10-16T19:10:00-04:00', { na: 140, k: 4.2, cl: 104, co2: 25, bun: 12, cr: CR.lmuc, glu: 96, ca: 9.3 }, true),
      panelOf('lmuc', 'pt-0013', 'enc-t2-uc-lm-1016', '2026-10-16T17:40:00-04:00', '2026-10-16T19:10:00-04:00', HOSPITAL),
      encounter('enc-t2-lab-lm-1022', 'pt-0013', ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T09:00:00-04:00', '2026-10-22T09:10:00-04:00', CLINIC),
      ...bmp('lm', 'pt-0013', 'enc-t2-lab-lm-1022', '2026-10-22T09:05:00-04:00', '2026-10-22T13:20:00-04:00', { na: 138, k: 4.9, cl: 103, co2: 23, bun: 24, cr: CR.lm, glu: 104, ca: 9.4 }, true),
      panelOf('lm', 'pt-0013', 'enc-t2-lab-lm-1022', '2026-10-22T09:05:00-04:00', '2026-10-22T13:20:00-04:00', CLINIC),
      item(13, 'pt-0013', 'DiagnosticReport/dr-t2-bmp-lm', '2026-10-22T13:20:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-22): creatinine 1.26 mg/dL, high'),

      // Items 2 and 3: Raj Patel. His October CT urogram, his annual screening LDCT of April (the next
      // one due April 2027), his H&P (current smoker), and his hemolyzed October panel.
      encounter('enc-t2-ct-rp-1019', 'pt-0006', ['AMB', 'ambulatory'], PROBLEM, '2026-10-19T14:30:00-04:00', '2026-10-19T15:20:00-04:00', CLINIC),
      report('dr-t2-ct-rp-1019', 'pt-0006', 'enc-t2-ct-rp-1019', ['RAD', 'Radiology'], ['36813-4', 'CT Abdomen and Pelvis W contrast IV'], '2026-10-19T14:45:00-04:00', '2026-10-19T16:20:00-04:00', { reference: 'Practitioner/pr-t2-cole' }, { text: CT_REPORT_RP(mrn('pt-0006')) }),
      encounter('enc-t2-ldct-rp-0414', 'pt-0006', ['AMB', 'ambulatory'], CHECKUP, '2026-04-14T09:30:00-04:00', '2026-04-14T09:55:00-04:00', LAKESHORE),
      report('dr-t2-ldct-rp-0414', 'pt-0006', 'enc-t2-ldct-rp-0414', ['RAD', 'Radiology'], ['29252-4', 'CT Chest WO contrast'], '2026-04-14T09:35:00-04:00', '2026-04-15T08:40:00-04:00', { reference: 'Practitioner/pr-t2-iyer' }, {
        text: RP_LDCT,
        codeText: 'Low-dose CT chest, lung cancer screening',
      }),
      encounter('enc-t2-hp-rp-0928', 'pt-0006', ['AMB', 'ambulatory'], CHECKUP, '2026-09-28T10:00:00-04:00', '2026-09-28T10:40:00-04:00', CLINIC, OKAFOR),
      note('doc-t2-hp-rp57', 'pt-0006', '2026-09-28T10:40:00-04:00', HP, 'enc-t2-hp-rp-0928', OKAFOR, CLINIC, HP_PATEL(mrn('pt-0006'))),
      item(2, 'pt-0006', 'DiagnosticReport/dr-t2-ct-rp-1019', '2026-10-19T16:20:00-04:00', CLINIC, 'CT abdomen and pelvis, CT urogram (2026-10-19): final report'),
      encounter('enc-t2-lab-rp-1021', 'pt-0006', ['AMB', 'ambulatory'], CHECKUP, '2026-10-21T08:10:00-04:00', '2026-10-21T08:20:00-04:00', CLINIC),
      ...bmp('rp', 'pt-0006', 'enc-t2-lab-rp-1021', '2026-10-21T08:15:00-04:00', '2026-10-21T15:30:00-04:00', { na: 140, k: 6.3, cl: 103, co2: 26, bun: 15, cr: 1.04, glu: 101, ca: 9.6 }, false, { k: { interp: 'HH' } }),
      panelOf('rp', 'pt-0006', 'enc-t2-lab-rp-1021', '2026-10-21T08:15:00-04:00', '2026-10-21T15:30:00-04:00', CLINIC, { conclusion: 'Specimen moderately hemolyzed; potassium may be falsely elevated.' }),
      item(3, 'pt-0006', 'DiagnosticReport/dr-t2-bmp-rp', '2026-10-21T15:30:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-21): potassium 6.3 mmol/L, critical high', [CALLED('2026-10-21T15:40:00-04:00')]),
      // A GI consultation referral for his reflux, placed in September: context, no item.
      {
        resourceType: 'ServiceRequest',
        id: 'sr-t2-gi-1020',
        status: 'active',
        intent: 'order',
        category: [{ coding: [{ system: SNOMED, code: '3457005', display: 'Patient referral' }], text: 'referral' }],
        priority: 'routine',
        code: { coding: [{ system: ORDERS, code: 'REF-GI', display: 'Gastroenterology referral, consultation' }], text: 'Gastroenterology referral, consultation' },
        subject: subject('pt-0006'),
        occurrencePeriod: { start: '2026-09-28', end: '2026-12-28' },
        authoredOn: '2026-09-28T10:40:00-04:00',
        requester: OKAFOR,
        reasonCode: [{ text: 'Heartburn for 6 months despite omeprazole' }],
      },

      // Item 4: Walter Brennan, hemolyzed potassium: the comment is on the potassium result only.
      encounter('enc-t2-lab-c-1022', 'pt-0008', ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T14:30:00-04:00', '2026-10-22T14:40:00-04:00', CLINIC),
      ...bmp('c', 'pt-0008', 'enc-t2-lab-c-1022', '2026-10-22T14:35:00-04:00', '2026-10-22T18:40:00-04:00', { na: 139, k: 6.4, cl: 102, co2: 25, bun: 16, cr: 1.02, glu: 128, ca: 9.4 }, false, {
        k: { interp: 'HH', note: [{ time: '2026-10-22T18:40:00-04:00', text: 'Specimen hemolyzed; may be falsely elevated.' }] },
      }),
      report('dr-t2-bmp-c-1022', 'pt-0008', 'enc-t2-lab-c-1022', ['LAB', 'Laboratory'], BMP, '2026-10-22T14:35:00-04:00', '2026-10-22T18:40:00-04:00', CLINIC, { results: MEMBERS.map((k) => `obs-t2-c-${k}`) }),
      item(4, 'pt-0008', 'DiagnosticReport/dr-t2-bmp-c-1022', '2026-10-22T18:40:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-22): potassium 6.4 mmol/L, critical high', [CALLED('2026-10-22T18:50:00-04:00')]),

      // Item 5: Denise Holloway, CKD 3b, lisinopril started on 10-06. Her potassium was first reported
      // as 5.2; the laboratory corrected it to 6.4 this morning (not hemolyzed).
      condition('cond-t2-ckd3b', 'pt-0010', '700379002', 'Chronic kidney disease stage 3B (disorder)', '2026-02-03T09:00:00-05:00'),
      {
        resourceType: 'MedicationRequest',
        id: 'mr-t2-lisinopril',
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: { coding: [{ system: RXNORM, code: '314076', display: 'lisinopril 10 MG Oral Tablet' }], text: 'lisinopril 10 MG Oral Tablet' },
        subject: subject('pt-0010'),
        authoredOn: '2026-10-06T10:00:00-04:00',
        requester: OKAFOR,
        reasonCode: [{ text: 'Microalbuminuria due to type 2 diabetes mellitus' }],
        dosageInstruction: [
          {
            text: '10 mg by mouth once daily',
            timing: { repeat: { frequency: 1, period: 1, periodUnit: 'd' } },
            route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
            doseAndRate: [{ doseQuantity: { value: 10, unit: 'mg', system: UCUM, code: 'mg' } }],
          },
        ],
      },
      encounter('enc-t2-lab-d-1022', 'pt-0010', ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T15:10:00-04:00', '2026-10-22T15:20:00-04:00', CLINIC),
      ...bmp('d', 'pt-0010', 'enc-t2-lab-d-1022', '2026-10-22T15:15:00-04:00', '2026-10-22T18:45:00-04:00', { na: 137, k: 6.4, cl: 106, co2: 20, bun: 34, cr: 1.58, glu: 162, ca: 9.1 }, true, {
        k: {
          interp: 'HH',
          status: 'corrected',
          issued: '2026-10-23T07:40:00-04:00',
          note: [{ time: '2026-10-23T07:40:00-04:00', text: 'Corrected result: first reported as 5.2 mmol/L in error (dilution error on the analyzer). Corrected value 6.4 mmol/L, verified on repeat analysis of the same specimen. Specimen not hemolyzed.' }],
        },
      }),
      report('dr-t2-bmp-d-1022', 'pt-0010', 'enc-t2-lab-d-1022', ['LAB', 'Laboratory'], BMP, '2026-10-22T15:15:00-04:00', '2026-10-23T07:40:00-04:00', CLINIC, { results: MEMBERS.map((k) => `obs-t2-d-${k}`), status: 'corrected' }),
      item(5, 'pt-0010', 'DiagnosticReport/dr-t2-bmp-d-1022', '2026-10-22T18:45:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-22): potassium 5.2 mmol/L, high'),

      // Item 6: Tomás Ruiz, 16. Urgent care on 10-21 with his mother; the preliminary read of the knee
      // X-ray came to the inbox, the final read went back to urgent care.
      condition('cond-t2-knee-pain', 'pt-0053', '30989003', 'Knee pain (finding)', '2026-10-21T18:30:00-04:00'),
      encounter('enc-t2-uc-tr-1021', 'pt-0053', ['AMB', 'ambulatory'], URGENT_CARE, '2026-10-21T17:50:00-04:00', '2026-10-21T19:20:00-04:00', HOSPITAL, { reference: 'Practitioner/pr-t2-brandt' }),
      note('doc-t2-pn-tr-1022', 'pt-0053', '2026-10-21T19:20:00-04:00', PROGRESS, 'enc-t2-uc-tr-1021', { reference: 'Practitioner/pr-t2-brandt' }, HOSPITAL, UC_NOTE_TR),
      report('dr-t2-xr-prelim-1021', 'pt-0053', 'enc-t2-uc-tr-1021', ['RAD', 'Radiology'], ['37758-0', 'XR Knee - right Views'], '2026-10-21T18:20:00-04:00', '2026-10-21T19:05:00-04:00', { reference: 'Practitioner/pr-t2-shah' }, { text: XR_PRELIM, status: 'preliminary' }),
      report('dr-t2-xr-1022', 'pt-0053', 'enc-t2-uc-tr-1021', ['RAD', 'Radiology'], ['37758-0', 'XR Knee - right Views'], '2026-10-21T18:20:00-04:00', '2026-10-22T15:48:00-04:00', { reference: 'Practitioner/pr-t2-ortega' }, { text: XR_FINAL }),
      item(6, 'pt-0053', 'DiagnosticReport/dr-t2-xr-prelim-1021', '2026-10-22T07:05:00-04:00', HOSPITAL, 'X-ray right knee, 3 views (St. Brigid Urgent Care, 2026-10-21): preliminary report', [
        { time: '2026-10-22T07:05:00-04:00', text: 'Urgent care visit results copied to the primary care clinician.' },
      ]),

      // Items 7, 8 and 9: Edra Ondricka. A normal TSH; a potassium first reported as 6.3, corrected to
      // 4.4; a positive FIT withdrawn as entered in error (its status says so; a FIT result carries no
      // comment field on this chart's profile).
      encounter('enc-t2-lab-eo-1020', 'pt-0016', ['AMB', 'ambulatory'], CHECKUP, '2026-10-20T08:20:00-04:00', '2026-10-20T08:30:00-04:00', CLINIC),
      lab('obs-t2-tsh-1020', 'pt-0016', 'enc-t2-lab-eo-1020', ['3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma'], '2026-10-20T08:25:00-04:00', '2026-10-20T16:10:00-04:00', 2.1, 'm[IU]/L', [0.4, 4.5], 'N'),
      item(7, 'pt-0016', 'Observation/obs-t2-tsh-1020', '2026-10-20T16:10:00-04:00', CLINIC, 'TSH (2026-10-20): final'),
      lab('obs-t2-eo-k-1020', 'pt-0016', 'enc-t2-lab-eo-1020', K, '2026-10-20T08:25:00-04:00', '2026-10-21T09:05:00-04:00', 4.4, 'mmol/L', [3.5, 5.1], 'N', {
        status: 'corrected',
        note: [{ time: '2026-10-21T09:05:00-04:00', text: 'Corrected result: first reported as 6.3 mmol/L in error (calibration fault on analyzer 2). Corrected value 4.4 mmol/L on repeat analysis of the same specimen.' }],
      }),
      item(8, 'pt-0016', 'Observation/obs-t2-eo-k-1020', '2026-10-20T16:12:00-04:00', CLINIC, 'Potassium (2026-10-20): 6.3 mmol/L, critical high', [CALLED('2026-10-20T16:20:00-04:00')]),
      encounter('enc-t2-fit-eo-1019', 'pt-0016', ['AMB', 'ambulatory'], PROBLEM, '2026-10-19T08:00:00-04:00', '2026-10-19T08:05:00-04:00', CLINIC),
      lab('obs-t2-eo-fit-1019', 'pt-0016', 'enc-t2-fit-eo-1019', ['29771-3', 'Hemoglobin [Presence] in Stool from gastrointestinal lower by Immunoassay'], '2026-10-16T07:00:00-04:00', '2026-10-19T14:20:00-04:00', null, '', null, 'A', {
        status: 'entered-in-error',
        valueCodeableConcept: { coding: [{ system: SNOMED, code: '10828004', display: 'Positive (qualifier value)' }], text: 'Positive' },
      }),
      item(9, 'pt-0016', 'Observation/obs-t2-eo-fit-1019', '2026-10-19T14:20:00-04:00', CLINIC, 'Fecal immunochemical test (collected 2026-10-16): abnormal'),

      // Item 10: Carol Whitfield (1965), CKD 3a. Her October visit note, the clinic panel of 10-22
      // (creatinine 1.31), and a creatinine of 0.84 posted to her chart on 10-21 from another
      // patient's specimen, withdrawn as entered in error. Her valid values are 1.27 (10-17) and 1.31.
      condition('cond-t2-ckd3a', 'pt-0033', '700378005', 'Chronic kidney disease stage 3A (disorder)', '2025-11-12T09:00:00-05:00'),
      encounter('enc-t2-cw-1017', 'pt-0033', ['AMB', 'ambulatory'], CHECKUP, '2026-10-17T09:00:00-04:00', '2026-10-17T09:25:00-04:00', CLINIC, OKAFOR),
      note('doc-t2-pn-lm65', 'pt-0033', '2026-10-17T09:25:00-04:00', PROGRESS, 'enc-t2-cw-1017', OKAFOR, CLINIC, NOTE_WHITFIELD(mrn('pt-0033'))),
      encounter('enc-t2-lab-cw-1021', 'pt-0033', ['AMB', 'ambulatory'], CHECKUP, '2026-10-21T10:30:00-04:00', '2026-10-21T10:35:00-04:00', CLINIC),
      lab('obs-t2-cw-cr-1021', 'pt-0033', 'enc-t2-lab-cw-1021', ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'], '2026-10-21T10:30:00-04:00', '2026-10-21T14:10:00-04:00', CR.cwVoid, 'mg/dL', [0.57, 1.0], 'N', {
        status: 'entered-in-error',
        note: [{ time: '2026-10-22T08:10:00-04:00', text: 'Entered in error: specimen belonged to another patient (labelling error). Result withdrawn.' }],
      }),
      encounter('enc-t2-lab-cw-1022', 'pt-0033', ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T10:00:00-04:00', '2026-10-22T10:10:00-04:00', CLINIC),
      ...bmp('cw', 'pt-0033', 'enc-t2-lab-cw-1022', '2026-10-22T10:05:00-04:00', '2026-10-22T15:00:00-04:00', { na: 139, k: 4.7, cl: 101, co2: 24, bun: 22, cr: CR.cw, glu: 148, ca: 9.5 }, true),
      panelOf('cw', 'pt-0033', 'enc-t2-lab-cw-1022', '2026-10-22T10:05:00-04:00', '2026-10-22T15:00:00-04:00', CLINIC),
      item(10, 'pt-0033', 'DiagnosticReport/dr-t2-bmp-cw', '2026-10-22T15:00:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-22): creatinine 1.31 mg/dL, high'),

      // Items 11 and 12: Leslie Parisian. The ED visit of 10-20 with its panel (creatinine 0.98) and CT
      // angiogram (preliminary and final reads), and the clinic panel of 10-22 (creatinine 1.64): a rise
      // of 0.66 in 34 hours (the 0.3 line is 1.28), which is also 1.67 times the ED value (line 1.47).
      encounter('enc-t2-ed-lp-1020', 'pt-0007', ['EMER', 'emergency'], ED, '2026-10-20T21:40:00-04:00', '2026-10-21T02:30:00-04:00', HOSPITAL, { reference: 'Practitioner/pr-t2-brandt' }),
      note('doc-t2-ed-lp-1020', 'pt-0007', '2026-10-21T02:30:00-04:00', ED_NOTE_TYPE, 'enc-t2-ed-lp-1020', { reference: 'Practitioner/pr-t2-brandt' }, HOSPITAL, ED_NOTE_LP(mrn('pt-0007'))),
      ...bmp('lped', 'pt-0007', 'enc-t2-ed-lp-1020', '2026-10-20T22:30:00-04:00', '2026-10-20T23:15:00-04:00', { na: 138, k: 4.3, cl: 102, co2: 24, bun: 14, cr: CR.lped, glu: 112, ca: 9.2 }, false),
      panelOf('lped', 'pt-0007', 'enc-t2-ed-lp-1020', '2026-10-20T22:30:00-04:00', '2026-10-20T23:15:00-04:00', HOSPITAL),
      report('dr-t2-cta-prelim-1020', 'pt-0007', 'enc-t2-ed-lp-1020', ['RAD', 'Radiology'], ['36266-5', 'CTA Chest vessels W contrast IV'], '2026-10-20T23:40:00-04:00', '2026-10-21T00:25:00-04:00', { reference: 'Practitioner/pr-t2-shah' }, { text: CTA_PRELIM(mrn('pt-0007')), status: 'preliminary' }),
      report('dr-t2-cta-1021', 'pt-0007', 'enc-t2-ed-lp-1020', ['RAD', 'Radiology'], ['36266-5', 'CTA Chest vessels W contrast IV'], '2026-10-20T23:40:00-04:00', '2026-10-21T10:30:00-04:00', { reference: 'Practitioner/pr-t2-ortega' }, { text: CTA_FINAL(mrn('pt-0007')) }),
      item(11, 'pt-0007', 'DiagnosticReport/dr-t2-cta-prelim-1020', '2026-10-21T07:15:00-04:00', HOSPITAL, 'CT angiography chest (St. Brigid ED, 2026-10-20): preliminary report', [REROUTED('2026-10-21T07:15:00-04:00')]),
      encounter('enc-t2-lab-lp-1022', 'pt-0007', ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T08:25:00-04:00', '2026-10-22T08:35:00-04:00', CLINIC),
      ...bmp('lp', 'pt-0007', 'enc-t2-lab-lp-1022', '2026-10-22T08:30:00-04:00', '2026-10-22T12:45:00-04:00', { na: 137, k: 4.8, cl: 101, co2: 23, bun: 26, cr: CR.lp, glu: 99, ca: 9.3 }, false),
      panelOf('lp', 'pt-0007', 'enc-t2-lab-lp-1022', '2026-10-22T08:30:00-04:00', '2026-10-22T12:45:00-04:00', CLINIC),
      item(12, 'pt-0007', 'DiagnosticReport/dr-t2-bmp-lp', '2026-10-22T12:45:00-04:00', CLINIC, 'Basic metabolic panel (2026-10-22): final'),
    ];
    return {
      put,
      remove: [...REMOVE, ...synthNotes, ...mdrd],
      lint: {
        thresholds: [
          { quantity: 'potassium', threshold: 6.0, observation: 'obs-t2-c-k' },
          { quantity: 'potassium', threshold: 6.0, observation: 'obs-t2-rp-k' },
          { quantity: 'potassium', threshold: 6.0, observation: 'obs-t2-d-k' },
          // RBC-LAB-03 §3 (R7): each AKI branch an item turns on, met or missed by the lint margin.
          { quantity: 'scr', threshold: CR.lped + 0.3, observation: 'obs-t2-lp-cr', label: 'aki_48h: rise over the ED value' },
          { quantity: 'scr', threshold: 1.5 * CR.lped, observation: 'obs-t2-lp-cr', label: 'aki_48h: 1.5 times the ED value' },
          { quantity: 'scr', threshold: 1.5 * CR.lmuc, observation: 'obs-t2-lm-cr', label: 'aki_7day: 1.5 times the urgent care value' },
          { quantity: 'scr', threshold: CR.cwValid + 0.3, observation: 'obs-t2-cw-cr', label: 'eie_baseline: rise over the valid value' },
          { quantity: 'scr', threshold: 1.5 * CR.cwValid, observation: 'obs-t2-cw-cr', label: 'eie_baseline: 1.5 times the valid value' },
          { quantity: 'scr', threshold: CR.cwVoid + 0.3, observation: 'obs-t2-cw-cr', label: 'eie_baseline: rise over the withdrawn value (the trap)' },
        ],
        leakage: {
          answers: ['2026-11-06', '2027-03-14', '2027-05-14', '2026-11-05', '2026-10-26'],
          distractors: ['dr-t2-ldct-0915', 'dr-t2-ldct-rp-0414', 'dr-t2-xr-1022', 'dr-t2-cta-1021', 'obs-t2-lped-cr', 'obs-t2-lmuc-cr', 'obs-t2-cw-cr-1021'],
        },
      },
    };
  },
};

export default overlay;
