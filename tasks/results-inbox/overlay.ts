// T2 results-inbox overlay, worklist probe (plan-amendment-worklist.md W1, T2): 13 Tasks in the
// results queue, each focused on the report or result it files, on the eight T2 slots. PW4-E3
// (plan-amendment-w4) cut Dr. Okafor's list to seven, one of each probe class: items 2, 4, 7, 8, 10,
// 11 and 12. Items 1, 3, 5, 6, 9 and 13 stay, with their charts, filed to Jordan Reyes, NP (OFF_LIST),
// so the signed-in user's inbox does not list them and no id moves. The mid-trial events are in
// events.ts, outside the world. All thirteen planted items, two of each class and one filler
// (the seven on the list: 2, 4, 7, 8, 10, 11, 12):
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
// W5-E (plan-amendment-w5, record-integrity defects; expected.ts LEVER): three list patients the
// overlay adds (pt-t2-*, numbered after the cohort's last Patient, so no existing id moves), each
// in the world in every LEVER state with its chart and inbox item; the item is the signed-in
// user's while its lever item is in lever.ts LEVER (imported) and Jordan Reyes's otherwise, so a
// toggle moves no id (F3). Toggling B or the reserve is still a world rebuild (the owner field);
// fixtures:verify, which rebuilds, catches a stale world.
//
//   item  key                      patient                  lever  the decisive fact and where it is
//   14    pt-t2-marchetti          Helen Marchetti, 1959    A      an ED creatinine of 1.36 (09-26), re-routed
//                                                                  two weeks later; recovered to 1.02 before
//                                                                  discharge. Base: not AKI, close. The A
//                                                                  event (events.ts marchetti-cr-batch) files a
//                                                                  St. Brigid batch: a notified 1.48 (10-22
//                                                                  18:40) and a silent normal 0.88 (10-21
//                                                                  07:30) that decides AKI
//   15    pt-t2-nowicki          Judith Nowicki, 1960   B      a Lakeshore addendum ('LDCT in 3 months')
//                                                                  faxed and filed to her chart whose header
//                                                                  carries another person's DOB and MRN; her
//                                                                  own screening LDCT (06-10) is Lung-RADS 1
//   16    pt-t2-cipriani         Raymond Cipriani, 1954 reserve  a hemolyzed potassium of 6.3 on spironolactone
//                                                                  with an eGFR of 24: RBC-LAB-03 §2's exception
//                                                                  sentence (present only with the reserve)
//
// Every decisive fact sits in the patient's record, not in the item's summary: in a result's status and
// comment, a report's conclusion, an earlier report or result, or a report filed to another provider.
// A newest-first list across the clinic, or a list of recent results, shows eight items' trap-deciding
// records on page 1, since the planted results are the newest; those items are reasoning items (tests/discover.test.ts RELABELLED,
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
import { LEVER } from './lever.ts';

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
// PW4-E3 cut the list to seven (one item of each probe class): the other six stay on the chart, filed
// to Jordan Reyes, NP (OFF_LIST), so no id moves and no chart changes; the signed-in user's inbox
// does not list them.
const OFF_LIST = new Set([1, 3, 5, 6, 9, 13]);

// The active lever items (W5-E): expected.ts's one literal `export const LEVER = [...]`, the list
// the task loader hashes into env_version (packages/core/tasks.ts leverOf). expected.ts names a
// lever host's registry keys through ids.ts refOf, which tolerates a key this build is about to
// number for the first time, so the import is safe before the first build in a new state.
export const LEVER_HOSTS = { A: 'pt-t2-marchetti', B: 'pt-t2-nowicki', reserve: 'pt-t2-cipriani' } as const;
const REYES = { reference: 'Practitioner/pr-reyes' };
// `owner`: a lever host's item is the signed-in user's while its item is active and Jordan Reyes's
// otherwise (W5-E, F3): the item stays in the world in every LEVER state, so no id moves.
const item = (n: number, pt: string, focus: string, received: string, from: { reference: string }, summary: string, notes: Array<{ time: string; text: string }> = [], owner?: { reference: string }): Resource => ({
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
  owner: owner ?? (OFF_LIST.has(n) ? REYES : OKAFOR),
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

// ---- W5-E lever hosts (plan-amendment-w5 "T2 results-inbox"; LEVER_HOSTS) ---------------------
// Three patients the overlay adds, each with a hand-written chart (no Synthea seed: the registry
// numbers them after the cohort's last Patient, so no existing id moves). Each is in the world only
// while its lever item is active. Their notes name the patient and date of birth and no MRN: the
// MRN follows the world id, which fixtures:build assigns after every overlay has run.
const CR_CODE: [string, string] = ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'];
const CKD_EPI: [string, string] = ['98979-8', 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)'];
const ENCOUNTER_DIAGNOSIS = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }];
// A Patient with the shape of the generated ones (scripts/test/world-tells.test.ts
// addedPatientTells): the same fields, extensions and identifier forms as a base Patient of the
// same sex, which the overlay reads, with this patient's own identity, home and birthplace. No
// identifier: fixtures:build assigns the rule's MRN (packages/env/mrn.ts).
const patient = (world: WorldReader, template: string, id: string, family: string, given: string[], birthDate: string, gender: 'male' | 'female', phone: string, line: string, city: string, postalCode: string, marital: ['M' | 'S' | 'W' | 'D', string], mother: string, born: string, geo: [number, number]): Resource => {
  const t = world.get('Patient', template) as R<'Patient'>;
  const { identifier: _mrn, ...rest } = t;
  const ext = (t.extension ?? []).map((e) => {
    if (e.url === 'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName') return { ...e, valueString: mother };
    if (e.url === 'http://hl7.org/fhir/StructureDefinition/patient-birthPlace') return { ...e, valueAddress: { ...e.valueAddress, city: born } };
    return e;
  });
  const home = t.address?.[0];
  return {
    ...rest,
    id,
    extension: ext,
    name: [{ use: 'official', family, given, prefix: [gender === 'female' ? 'Ms.' : 'Mr.'] }],
    telecom: [{ system: 'phone', value: phone, use: 'home' }],
    gender,
    birthDate,
    address: [{ ...home, extension: (home?.extension ?? []).map((e) => (e.url === 'http://hl7.org/fhir/StructureDefinition/geolocation' ? { ...e, extension: [{ url: 'latitude', valueDecimal: geo[0] }, { url: 'longitude', valueDecimal: geo[1] }] } : e)), line: [line], city, state: 'MA', postalCode, country: 'US' }],
    maritalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus', code: marital[0], display: marital[1] }], text: marital[1] },
  };
};
const medication = (id: string, pt: string, code: [string, string], authoredOn: string, reason: string, dose: [number, string, string], prn?: string): Resource => ({
  resourceType: 'MedicationRequest',
  id,
  status: 'active',
  intent: 'order',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
  medicationCodeableConcept: { coding: [{ system: RXNORM, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  authoredOn,
  requester: OKAFOR,
  reasonCode: [{ text: reason }],
  dosageInstruction: [
    {
      sequence: 1,
      text: prn ? `${dose[0]} mg by mouth up to ${dose[2]} as needed for ${prn}` : `${dose[0]} mg by mouth ${dose[2]}`,
      timing: { repeat: dose[2] === 'twice daily' ? { frequency: 2, period: 1, periodUnit: 'd' } : { frequency: 1, period: 1, periodUnit: 'd' } },
      asNeededBoolean: prn !== undefined,
      route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
      doseAndRate: [{ doseQuantity: { value: dose[0], unit: 'mg', system: UCUM, code: 'mg' } }],
    },
  ],
  dispenseRequest: { numberOfRepeatsAllowed: 3, quantity: { value: 90, unit: 'tablet', system: UCUM, code: '{tablet}' }, expectedSupplyDuration: { value: 90, unit: 'd', system: UCUM, code: 'd' } },
});
const smoking = (id: string, pt: string, enc: string, at: string, code: [string, string]): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: [{ coding: [{ system: OBS_CAT, code: 'social-history', display: 'Social history' }] }],
  code: { coding: [{ system: LOINC, code: '72166-2', display: 'Tobacco smoking status' }], text: 'Tobacco smoking status' },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued: at,
  performer: [OKAFOR],
  valueCodeableConcept: { coding: [{ system: SNOMED, code: code[0], display: code[1] }], text: code[1] },
});

// ---- Item 14: Helen Marchetti (A host). ED visit of 09-26 for vomiting and poor intake:
// creatinine 1.36 (H) on arrival, 1.02 after fluids; the ED panel was re-routed to primary care on
// 10-22. Under RBC-LAB-03 §3 the 1.36 has no creatinine in the 48 hours or 7 days before it (her
// clinic values are 0.90 in March and 0.92 the year before): not AKI, close. The A event
// (events.ts marchetti-cr-batch) then files two St. Brigid creatinines in one batch after her item
// is closed: 0.88 on 10-21 07:30 (normal, no inbox item) and 1.48 on 10-22 18:40 (high, notified).
const HM = 'pt-t2-marchetti';
const HP_MARCHETTI = `Riverbend Family Medicine - History and Physical
Patient: Helen Marchetti   DOB 1959-05-30
Date: 2026-03-12   Visit: annual examination

History of present illness: here for her annual examination. Right knee pain with stairs, managed with naproxen a few times a week. No chest pain, dyspnea or edema.

Past medical history: essential hypertension; osteoarthritis of the right knee.
Medications: amlodipine 5 mg daily; atorvastatin 20 mg daily; naproxen 500 mg as needed.
Allergies: no known drug allergies.

Social history: widowed, lives alone, retired bookkeeper. Tobacco: never smoked. Alcohol: a glass of wine on weekends.

Examination: BP 128/78, HR 70, BMI 27. Heart regular. Lungs clear. Right knee: crepitus, no effusion.

Assessment and plan: hypertension controlled, continue amlodipine. Knee osteoarthritis: naproxen with food, no more than twice daily; physiotherapy referral offered. Basic metabolic panel and lipids drawn. Return in 1 year.

Maya Okafor, MD`;
const ED_NOTE_MARCHETTI = `St. Brigid Regional - Emergency Department Note
Patient: Helen Marchetti   DOB 1959-05-30
Date: 2026-09-26

Chief complaint: two days of vomiting and diarrhea after a family dinner; unable to keep fluids down since yesterday. Dizzy on standing. Took naproxen for a headache this morning.
Exam: dry mucous membranes, HR 104, BP 102/64 standing. Abdomen soft, nontender.
Labs: creatinine 1.36 (her clinic baseline about 0.9), BUN 31, potassium 3.6. Lipase normal.
Treated with 2 litres of intravenous fluids and ondansetron. Repeat creatinine at 19:30: 1.02.
Assessment: viral gastroenteritis with dehydration; creatinine rise resolving with fluids.
Disposition: discharged home at 19:50, tolerating fluids. Hold naproxen for a week. Return precautions given. Follow up with primary care in 1 to 2 weeks with a repeat basic metabolic panel.

Elena Brandt, MD, Emergency Medicine`;
function marchetti(world: WorldReader, active: boolean): Resource[] {
  return [
    patient(world, 'pt-0033', HM, 'Marchetti', ['Helen', 'Rose'], '1959-05-30', 'female', '555-0163', '42 Crescent Street', 'Northampton', '01060', ['W', 'Widowed'], 'Teresa Lombardi', 'Springfield', [42.3255, -72.6412]),
    condition('cond-t2-hm-htn', HM, '59621000', 'Essential hypertension (disorder)', '2019-06-03T10:20:00-04:00'),
    condition('cond-t2-hm-oa', HM, '239873007', 'Osteoarthritis of knee (disorder)', '2022-02-14T09:40:00-05:00'),
    { ...(condition('cond-t2-hm-dehydration', HM, '34095006', 'Dehydration (disorder)', '2026-09-26T13:55:00-04:00') as R<'Condition'>), category: ENCOUNTER_DIAGNOSIS, clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }] }, abatementDateTime: '2026-09-26T19:50:00-04:00', encounter: { reference: 'Encounter/enc-t2-hm-ed-1008' } },
    medication('mr-t2-hm-amlodipine', HM, ['197361', 'amlodipine 5 MG Oral Tablet'], '2024-05-07T10:30:00-04:00', 'Essential hypertension', [5, 'mg', 'daily']),
    medication('mr-t2-hm-atorvastatin', HM, ['617310', 'atorvastatin 20 MG Oral Tablet'], '2024-05-07T10:30:00-04:00', 'Primary prevention', [20, 'mg', 'daily']),
    medication('mr-t2-hm-naproxen', HM, ['198013', 'naproxen 500 MG Oral Tablet'], '2026-03-12T10:40:00-05:00', 'Osteoarthritis of knee', [500, 'mg', 'twice daily'], 'knee pain'),
    // Her annual examination in March: a creatinine of 0.90, her baseline.
    encounter('enc-t2-hm-0312', HM, ['AMB', 'ambulatory'], CHECKUP, '2026-03-12T10:00:00-05:00', '2026-03-12T10:40:00-05:00', CLINIC, OKAFOR),
    note('doc-t2-hm-hp-0312', HM, '2026-03-12T10:40:00-05:00', HP, 'enc-t2-hm-0312', OKAFOR, CLINIC, HP_MARCHETTI),
    smoking('obs-t2-hm-smoking', HM, 'enc-t2-hm-0312', '2026-03-12T10:10:00-05:00', ['266919005', 'Never smoked tobacco (finding)']),
    ...bmp('hm26', HM, 'enc-t2-hm-0312', '2026-03-12T10:15:00-05:00', '2026-03-12T15:05:00-05:00', { na: 140, k: 4.2, cl: 104, co2: 26, bun: 13, cr: 0.9, glu: 97, ca: 9.3 }, true),
    panelOf('hm26', HM, 'enc-t2-hm-0312', '2026-03-12T10:15:00-05:00', '2026-03-12T15:05:00-05:00', CLINIC),
    // The ED visit of 09-26 at St. Brigid: the panel on arrival and the creatinine recheck after fluids.
    encounter('enc-t2-hm-ed-1008', HM, ['EMER', 'emergency'], ED, '2026-09-26T13:40:00-04:00', '2026-09-26T19:50:00-04:00', HOSPITAL, { reference: 'Practitioner/pr-t2-brandt' }),
    ...bmp('hmed', HM, 'enc-t2-hm-ed-1008', '2026-09-26T14:05:00-04:00', '2026-09-26T15:10:00-04:00', { na: 136, k: 3.6, cl: 99, co2: 22, bun: 31, cr: 1.36, glu: 108, ca: 9.2 }, true),
    panelOf('hmed', HM, 'enc-t2-hm-ed-1008', '2026-09-26T14:05:00-04:00', '2026-09-26T15:10:00-04:00', HOSPITAL),
    lab('obs-t2-hm-cr-recheck', HM, 'enc-t2-hm-ed-1008', CR_CODE, '2026-09-26T19:30:00-04:00', '2026-09-26T19:45:00-04:00', 1.02, 'mg/dL', [0.57, 1.0], 'H', { performer: [HOSPITAL] }),
    note('doc-t2-hm-ed-1008', HM, '2026-09-26T19:50:00-04:00', ED_NOTE_TYPE, 'enc-t2-hm-ed-1008', { reference: 'Practitioner/pr-t2-brandt' }, HOSPITAL, ED_NOTE_MARCHETTI),
    item(14, HM, 'DiagnosticReport/dr-t2-bmp-hmed', '2026-10-22T07:20:00-04:00', HOSPITAL, 'Basic metabolic panel (St. Brigid ED, 2026-09-26): creatinine 1.36 mg/dL, high', [REROUTED('2026-10-22T07:20:00-04:00')], active ? OKAFOR : REYES),
  ];
}

// ---- Item 15: Judith Nowicki (B host). A former smoker in Lakeshore's screening program whose
// baseline LDCT of 06-10 is Lung-RADS 1 (annual). A Lakeshore addendum faxed on 10-21 was filed to
// her chart by name: its header carries another person's date of birth and MRN, and an exam date
// (09-25) she has no study on. RBC-INBOX-01 §1: two identifiers before writing to a chart; nothing
// is ordered or sent on her chart from it.
const JK = 'pt-t2-nowicki';
const JK_LDCT = ldctReport(
  'Judith Nowicki', '1960-03-22', '2026-06-10', 'Lakeshore Lung Screening Program (shared decision-making visit 2026-05-20)', 'lung cancer screening, baseline examination.', 'none.',
  'No pulmonary nodule. No consolidation, effusion or emphysema.', 'Lung-RADS 1: negative. No nodules. Recommendation: continue annual screening with LDCT in 12 months.', 'Priya Iyer, MD, Radiology, 2026-06-10 16:40',
);
const HP_NOWICKI = `Riverbend Family Medicine - History and Physical
Patient: Judith Nowicki   DOB 1960-03-22
Date: 2026-05-20   Visit: annual examination

History of present illness: here for her annual examination. No cough, hemoptysis, weight loss or dyspnea. Asks about lung cancer screening.

Past medical history: essential hypertension; hyperlipidemia.
Medications: losartan 50 mg daily; atorvastatin 40 mg daily.
Allergies: no known drug allergies.

Social history: married, works part time at a garden centre. Tobacco: former smoker, 30 pack-years; quit in 2018. Alcohol: none.
Family history: mother with breast cancer at 71.

Examination: BP 124/76, HR 68, BMI 26. Lungs clear. Heart regular. Abdomen soft.

Assessment and plan: health maintenance. Eligible for lung cancer screening (56 to 80, 20 or more pack-years, quit within 15 years): shared decision-making discussion held; enrolled in the Lakeshore Lung Screening Program, which orders and follows the LDCT. Mammogram up to date. Return in 1 year.

Maya Okafor, MD`;
// The misfiled fax: another Judith Nowicki's addendum, with her date of birth and record number.
const FAX_NOWICKI = `Lakeshore Imaging - Lung Cancer Screening Program
ADDENDUM
Exam: low-dose CT chest (LDCT), lung cancer screening   Exam date: 2026-09-25
Patient: Judith Nowicki   DOB 1951-08-04   MRN 4471-20

Addendum, 2026-10-21: on the program's second-reader review of this examination, an 8 mm solid nodule in the left upper lobe (series 3, image 77) was found that the original report did not describe. It is not present on the prior screening examination.
Revised impression: Lung-RADS 4A: suspicious. New 8 mm solid nodule, left upper lobe.
Revised recommendation: LDCT in 3 months.

Electronically signed: Priya Iyer, MD, Radiology, 2026-10-21 15:30
Faxed to Riverbend Family Medicine, primary care.`;
function nowicki(world: WorldReader, active: boolean): Resource[] {
  return [
    patient(world, 'pt-0033', JK, 'Nowicki', ['Judith', 'Marie'], '1960-03-22', 'female', '555-0177', '18 Elm Court', 'Florence', '01062', ['M', 'Married'], 'Irene Baran', 'Holyoke', [42.3202, -72.6749]),
    condition('cond-t2-jk-htn', JK, '59621000', 'Essential hypertension (disorder)', '2018-01-01T10:00:00-05:00'),
    condition('cond-t2-jk-lipids', JK, '55822004', 'Hyperlipidemia (disorder)', '2021-09-13T09:30:00-04:00'),
    medication('mr-t2-jk-losartan', JK, ['979480', 'losartan potassium 50 MG Oral Tablet'], '2023-04-18T10:30:00-04:00', 'Essential hypertension', [50, 'mg', 'daily']),
    medication('mr-t2-jk-atorvastatin', JK, ['617311', 'atorvastatin 40 MG Oral Tablet'], '2023-04-18T10:30:00-04:00', 'Hyperlipidemia', [40, 'mg', 'daily']),
    encounter('enc-t2-jk-hp-0520', JK, ['AMB', 'ambulatory'], CHECKUP, '2026-05-20T09:00:00-04:00', '2026-05-20T09:45:00-04:00', CLINIC, OKAFOR),
    note('doc-t2-jk-hp-0520', JK, '2026-05-20T09:45:00-04:00', HP, 'enc-t2-jk-hp-0520', OKAFOR, CLINIC, HP_NOWICKI),
    smoking('obs-t2-jk-smoking', JK, 'enc-t2-jk-hp-0520', '2026-05-20T09:10:00-04:00', ['8517006', 'Ex-smoker (finding)']),
    encounter('enc-t2-jk-ldct-0610', JK, ['AMB', 'ambulatory'], CHECKUP, '2026-06-10T08:30:00-04:00', '2026-06-10T08:55:00-04:00', LAKESHORE),
    report('dr-t2-jk-ldct-0610', JK, 'enc-t2-jk-ldct-0610', ['RAD', 'Radiology'], ['29252-4', 'CT Chest WO contrast'], '2026-06-10T08:35:00-04:00', '2026-06-10T16:40:00-04:00', { reference: 'Practitioner/pr-t2-iyer' }, {
      text: JK_LDCT,
      codeText: 'Low-dose CT chest, lung cancer screening',
    }),
    {
      resourceType: 'DocumentReference',
      id: 'doc-t2-jk-fax-1021',
      status: 'current',
      docStatus: 'final',
      type: { coding: [{ system: LOINC, code: '18748-4', display: 'Diagnostic imaging study' }], text: 'Diagnostic imaging study' },
      category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
      subject: subject(JK),
      date: '2026-10-21T15:30:00-04:00',
      author: [{ reference: 'Practitioner/pr-t2-iyer' }],
      custodian: LAKESHORE,
      description: 'Outside record received by fax',
      content: [{ attachment: text(FAX_NOWICKI)[0]! }],
      // The service the record is about, as the clinic files an outside report (the exam date).
      context: { period: { start: '2026-09-25T09:20:00-04:00', end: '2026-09-25T09:45:00-04:00' } },
    },
    item(15, JK, 'DocumentReference/doc-t2-jk-fax-1021', '2026-10-21T16:10:00-04:00', LAKESHORE, 'Lakeshore Imaging: addendum to a lung screening CT (fax)', [], active ? OKAFOR : REYES),
  ];
}

// ---- Item 16: Raymond Cipriani (reserve host, inactive). Heart failure on spironolactone, CKD 4
// (eGFR 24 on 09-29); his clinic potassium of 10-22 is 6.3 on a hemolyzed specimen.
// With the reserve's RBC-LAB-03 §2 sentence (expected.ts RESERVE_SENTENCE) the hemolysis rule does
// not apply: §1, a stat on-call notice, a stat BMP today and the spironolactone held.
const RC = 'pt-t2-cipriani';
const NOTE_CASTELLANO = `Riverbend Family Medicine - Progress Note
Patient: Raymond Cipriani   DOB 1954-07-19
Date: 2026-09-29
Follow-up of heart failure with reduced ejection fraction and chronic kidney disease stage 4. Breathing stable on current diuretic; weight steady at home. No chest pain.
Medications reviewed: carvedilol 12.5 mg twice daily, furosemide 40 mg daily, spironolactone 25 mg daily, atorvastatin 40 mg daily.
Examination: BP 118/72, HR 64, no edema. Lungs clear.
Labs today: creatinine 2.6, eGFR 24, potassium 5.0. Kidney function and potassium stable at his baseline; continue current doses with a repeat potassium and creatinine in 3 weeks.
Return in 3 months; nephrology follow-up in December.
Maya Okafor, MD`;
function cipriani(world: WorldReader, active: boolean): Resource[] {
  return [
    patient(world, 'pt-0001', RC, 'Cipriani', ['Raymond', 'Paul'], '1954-07-19', 'male', '555-0189', '7 Bridge Road', 'Easthampton', '01027', ['M', 'Married'], 'Angela Ferraro', 'Chicopee', [42.2668, -72.6687]),
    condition('cond-t2-rc-hf', RC, '88805009', 'Chronic congestive heart failure (disorder)', '2021-03-15T11:00:00-04:00'),
    condition('cond-t2-rc-ckd4', RC, '431857002', 'Chronic kidney disease stage 4 (disorder)', '2025-11-18T09:30:00-05:00'),
    condition('cond-t2-rc-htn', RC, '59621000', 'Essential hypertension (disorder)', '2019-06-03T10:20:00-04:00'),
    medication('mr-t2-rc-spironolactone', RC, ['313096', 'spironolactone 25 MG Oral Tablet'], '2021-04-07T10:30:00-04:00', 'Chronic congestive heart failure', [25, 'mg', 'daily']),
    medication('mr-t2-rc-furosemide', RC, ['313988', 'furosemide 40 MG Oral Tablet'], '2021-04-07T10:30:00-04:00', 'Chronic congestive heart failure', [40, 'mg', 'daily']),
    medication('mr-t2-rc-carvedilol', RC, ['200033', 'carvedilol 12.5 MG Oral Tablet'], '2021-04-07T10:30:00-04:00', 'Chronic congestive heart failure', [12.5, 'mg', 'twice daily']),
    medication('mr-t2-rc-atorvastatin', RC, ['617311', 'atorvastatin 40 MG Oral Tablet'], '2021-04-07T10:30:00-04:00', 'Secondary prevention', [40, 'mg', 'daily']),
    encounter('enc-t2-rc-0929', RC, ['AMB', 'ambulatory'], CHECKUP, '2026-09-29T09:00:00-04:00', '2026-09-29T09:35:00-04:00', CLINIC, OKAFOR),
    note('doc-t2-rc-pn-0929', RC, '2026-09-29T09:35:00-04:00', PROGRESS, 'enc-t2-rc-0929', OKAFOR, CLINIC, NOTE_CASTELLANO),
    // His visit labs (single results, as a renal panel is filed here) and the CKD-EPI eGFR of 24.
    lab('obs-t2-rc-cr-0929', RC, 'enc-t2-rc-0929', CR_CODE, '2026-09-29T09:05:00-04:00', '2026-09-29T14:10:00-04:00', 2.6, 'mg/dL', [0.74, 1.35], 'H', { performer: [CLINIC] }),
    lab('obs-t2-rc-k-0929', RC, 'enc-t2-rc-0929', K, '2026-09-29T09:05:00-04:00', '2026-09-29T14:10:00-04:00', 5.0, 'mmol/L', [3.5, 5.1], 'N', { performer: [CLINIC] }),
    lab('obs-t2-rc-egfr', RC, 'enc-t2-rc-0929', CKD_EPI, '2026-09-29T09:05:00-04:00', '2026-09-29T14:10:00-04:00', 24, 'mL/min/{1.73_m2}', [60, 200], 'L', { performer: [CLINIC] }),
    // The potassium of 10-22, flagged hemolyzed on the result, with its creatinine; the item files
    // the potassium itself (as items 7 and 8 file single results).
    encounter('enc-t2-rc-lab-1022', RC, ['AMB', 'ambulatory'], CHECKUP, '2026-10-22T13:30:00-04:00', '2026-10-22T13:40:00-04:00', CLINIC),
    lab('obs-t2-rc-k', RC, 'enc-t2-rc-lab-1022', K, '2026-10-22T13:35:00-04:00', '2026-10-22T18:30:00-04:00', 6.3, 'mmol/L', [3.5, 5.1], 'HH', { performer: [CLINIC], note: [{ time: '2026-10-22T18:30:00-04:00', text: 'Specimen hemolyzed; may be falsely elevated.' }] }),
    lab('obs-t2-rc-cr', RC, 'enc-t2-rc-lab-1022', CR_CODE, '2026-10-22T13:35:00-04:00', '2026-10-22T18:30:00-04:00', 2.7, 'mg/dL', [0.74, 1.35], 'H', { performer: [CLINIC] }),
    item(16, RC, 'Observation/obs-t2-rc-k', '2026-10-22T18:30:00-04:00', CLINIC, 'Potassium (2026-10-22): 6.3 mmol/L, critical high', [CALLED('2026-10-22T18:40:00-04:00')], active ? OKAFOR : REYES),
  ];
}
// Every host, in every LEVER state (F3 of the T1 gate: a toggle may move no world id, and added
// Patients and their records are numbered across every overlay); only the inbox item's owner
// follows the toggle. An inactive host is then a chart like the cut items' (OFF_LIST): its item
// is filed to Jordan Reyes and the list never shows it.
// A hand-written chart on one clock, as a generated chart is: every timestamp of a host's records
// (visits, draws, issue times, notes, the inbox item) carries the host's own minute and second, the
// way Synthea stamps a patient's records, so a note's date sits on its chart's modal minute
// (scripts/test/tells.ts CMODE; the planted clock pass has no generated record to draw from here).
const onClock = (rs: Resource[], mmss: string): Resource[] => rs.map((r) => JSON.parse(JSON.stringify(r).replace(/T(\d{2}):\d{2}:\d{2}(?=(?:\.\d+)?[+-]\d{2}:\d{2}")/g, `T$1:${mmss}`)) as Resource);
function leverHosts(world: WorldReader, lever: readonly string[]): Resource[] {
  return [...onClock(marchetti(world, lever.includes('A')), '26:14'), ...onClock(nowicki(world, lever.includes('B')), '41:07'), ...onClock(cipriani(world, lever.includes('reserve')), '13:52')];
}

// The overlay for a LEVER state (tests build other states in memory); the default export is the
// committed state's.
export const overlayFor = (lever: readonly string[]): Overlay => ({
  task: 'T2',
  // The fixed slot of each lever host in T2's added-Patient range (packages/env/overlay.ts TASKS
  // added: pt-0064 Marchetti, pt-0065 Nowicki, pt-0066 Cipriani), the same in every LEVER state.
  added: { [LEVER_HOSTS.A]: 0, [LEVER_HOSTS.B]: 1, [LEVER_HOSTS.reserve]: 2 },
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
    const hosts = leverHosts(world, lever);
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

      // Items 14 to 16: the W5-E lever hosts, in the world in every LEVER state (F3); a toggle
      // moves only the host's inbox item between the signed-in user and Jordan Reyes.
      ...hosts,
    ];
    return {
      put,
      remove: [...REMOVE, ...synthNotes, ...mdrd],
      // Every key a LEVER toggle bears on: each lever host and every record of its chart (the
      // same keys in every state here, since no toggle adds or removes one; the central
      // lever-invariant test checks that no state adds a key this list lacks).
      lever: hosts.map((r) => r.id!),
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
          // W5-E: the ED creatinine of item 14 (none in the 7 days before it, so no comparison line);
          // its recheck after fluids is a fall. The reserve's potassium and eGFR against RBC-LAB-03
          // §1's 6.0 and the exception sentence's 30 (the A arrival's lines are in events.ts, the
          // margins in expected.ts EVENTS, events.test.ts).
          { quantity: 'potassium', threshold: 6.0, observation: 'obs-t2-rc-k' },
          { quantity: 'egfr', threshold: 30, observation: 'obs-t2-rc-egfr', label: 'reserve: eGFR below 30' },
        ],
        leakage: {
          answers: ['2026-11-06', '2027-03-14', '2027-05-14', '2026-11-05', '2026-10-26'],
          distractors: ['dr-t2-ldct-0915', 'dr-t2-ldct-rp-0414', 'dr-t2-xr-1022', 'dr-t2-cta-1021', 'obs-t2-lped-cr', 'obs-t2-lmuc-cr', 'obs-t2-cw-cr-1021', 'obs-t2-hm-cr-recheck', 'doc-t2-jk-fax-1021', 'obs-t2-rc-egfr', 'mr-t2-rc-spironolactone'],
        },
      },
    };
  },
});
const overlay: Overlay = overlayFor(LEVER);

export default overlay;
