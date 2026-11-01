// T5 contrast-ct-prep overlay, worklist probe (plan-amendment-worklist W1, builder-215): Dr.
// Okafor's CT list for Monday 10/26 at St. Brigid Imaging, seven studies, one per T5 slot, two
// instances of each kept item class and one filler. Each patient keeps the Synthea chart of the
// slot (only the age-matched histories were used, verifier-phase-P17i-W1-0-1 F7, so no birth date
// moves but Daniel Ferreira's, which the earlier T5 set); the overlay adds the booked appointment,
// the booking note and the class's records, and removes what would contradict the scenario.
//
//   08:00  pt-0047  Britt Mohr        egfr_window, stale lab: 26, type 2 diabetes on diet; latest
//                                      creatinine 2026-09-24 (outside lab), 29 days before NOW but 32
//                                      before the scan: a new one drawn before the scan (§4)
//   09:00  pt-0015  Daniel Ferreira   allergy_grade, moderate by the record: the allergy list carries
//                                      a later 'Anaphylaxis (patient report)'; the 2019 report of the
//                                      day grades a moderate reaction: premedicate for 09:00 (§2),
//                                      the 13-hour dose on Sunday evening; creatinine 10-14 current
//   10:00  pt-0048  Jamaal Schmitt    allergy_grade, severe by the record: the allergy list says
//                                      hives, mild (his own account in 2024); the 2023 radiology
//                                      report of the day grades a severe reaction (hypotension,
//                                      wheeze, epinephrine): no contrast, consult the radiologist (§3)
//   11:00  pt-0012  Eduardo Stracke   egfr_window, under the cutoff: creatinine 2.85 on 2026-10-13,
//                                      eGFR 24.5 (CKD-EPI 2021, male, 60); the July value outside the
//                                      window, 2.10, gives 35.4: saline before the scan (§5)
//   13:00  pt-0049  Anisha Schuster   metformin_hold, outside record: a faxed St. Brigid ED
//                                      summary of 10/05, prerenal AKI, creatinine 1.24 at discharge
//                                      against a baseline of about 0.7, no creatinine since: hold
//                                      metformin (§6), new creatinine (§4), saline (§5)
//   14:00  pt-0046  Lauren Beahan     filler: CT abdomen and pelvis without contrast; no preparation
//   15:00  pt-0050  Salvador Brakus   metformin_hold, by the creatinine rule: 0.98 on 10/19 (14:xx)
//                                      and 1.64 on 10/21 (10:xx), a rise of 0.66 within 44 hours and
//                                      1.67 times baseline, no later value: AKI (§4); hold metformin
//                                      (§6), new creatinine, saline
//
// Which slot takes which class follows the world-tells rules (scripts/test/world-tells.test.ts): a
// planted record goes on a chart that already holds generated records of its type, so the two
// allergy instances sit on the charts with Synthea allergies (Ferreira, Schmitt), and the filler,
// whose chart loses its 2026 pregnancy, gets only its appointment.
// Every value sits outside its lint margin (W1 probe rulings R7, verifier-W1-probe-T5-clinical-1
// F1): eGFR 24.5 and 35.4 against 30 (margin 5); Brakus's rise 0.66 against 0.3 and 1.64 against
// 1.5 x 0.98 = 1.47, the two draws 44 hours apart (the profile pass keeps a planted time in its
// hour, so the gap stays under 48 hours by more than 2); Schuster's discharge creatinine 1.24
// against her baseline 0.7 + 0.3 (margin 0.15). Mohr's 09-24 creatinine is the one date near the
// window edge, declared as its trap.
// Schuster's ED visit (10/04-10/05) is older than the newest notes of the clinic, so the newest-
// first note list does not show her ED summary on its first page (R6); she booked on 09/29, before
// it, so the booking screen's answers (her own account that day) say no kidney injury.
// Removed from the slot charts: Ferreira's Synthea diphenhydramine order and 'allergic disposition'
// entry (as before); Stracke's metformin and his Synthea creatinine and eGFR results (they disagree
// with each other on one day: an eGFR of 56 and of 15.7 beside one creatinine); Beahan's 2026
// pregnancy episode (a CT in pregnancy is another question than the task asks).
// Edited in the slot charts (R8, verifier-W1-probe-T5-clinical-1 F3): Stracke's kept notes no
// longer name metformin (six said he was started on it); Schmitt's notes after his 2023 reaction
// list the allergy-list entry instead of 'NKDA'; Schuster's and Brakus's kept notes written after
// their planted diabetes name it in the history, and metformin among the medicines once it was
// ordered (verifier-W1-probe-T5-clinical-4 C4-1). Schmitt's booking note is written at 09:20, so
// the profile pass's 15-minute note period does not end on the slot's 10:00 and rewrite the slot
// time in the text (it had turned '10:00 AM' into '10:09 AM'; a shared pass bug, listed for W1-T).
import type { Resource } from '../../packages/env/store.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const REYES = { reference: 'Practitioner/pr-reyes' };
const RADIOLOGIST = { reference: 'Practitioner/pr-t5-adeyemi' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const subject = (pt: string) => ({ reference: `Patient/${pt}` });

const RADIOLOGIST_RESOURCE: Resource = { resourceType: 'Practitioner', id: 'pr-t5-adeyemi', active: true, name: [{ use: 'official', given: ['Tunde'], family: 'Adeyemi', suffix: ['MD'] }] };
const ED_PHYSICIAN = { reference: 'Practitioner/pr-t5-castellano' };
const ED_PHYSICIAN_RESOURCE: Resource = { resourceType: 'Practitioner', id: 'pr-t5-castellano', active: true, name: [{ use: 'official', given: ['Owen'], family: 'Castellano', suffix: ['MD'] }] };
// The clinic PA who saw Leo Brakus on 10/21. Before the W1 train T6's overlay wrote her (as
// pr-marsh); the T6 probe no longer does, so T5 writes its own (W1-T, a dangling reference).
const PA = { reference: 'Practitioner/pr-t5-marsh' };
const PA_RESOURCE: Resource = { resourceType: 'Practitioner', id: 'pr-t5-marsh', active: true, name: [{ use: 'official', given: ['Helen'], family: 'Marsh', suffix: ['PA-C'] }] };
const OUTSIDE_LAB: Resource = { resourceType: 'Organization', id: 'org-t5-harbor', active: true, name: 'Harbor Diagnostic Laboratory' };

const encounter = (id: string, pt: string, cls: 'AMB' | 'EMER', type: [string, string], start: string, end: string, provider: { reference: string }, who: { reference: string }, reason?: string): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls, ...(cls === 'EMER' ? { display: 'emergency' } : {}) },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: subject(pt),
  participant: [{ individual: who }],
  period: { start, end },
  ...(reason ? { reasonCode: [{ text: reason }] } : {}),
  serviceProvider: provider,
});

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

const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];

const creatinine = (id: string, pt: string, at: string, issued: string, value: number, extra: Partial<Extract<Resource, { resourceType: 'Observation' }>> = {}): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }], text: 'Creatinine [Mass/volume] in Serum or Plasma' },
  subject: subject(pt),
  effectiveDateTime: at,
  issued,
  valueQuantity: { value, unit: 'mg/dL', system: UCUM, code: 'mg/dL' },
  referenceRange: [{ low: { value: 0.6, unit: 'mg/dL', system: UCUM, code: 'mg/dL' }, high: { value: 1.3, unit: 'mg/dL', system: UCUM, code: 'mg/dL' } }],
  ...extra,
});

const CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';
const VERIFICATION = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';

type Reaction = { manifestation: [code: string, display: string]; severity: 'mild' | 'moderate' | 'severe'; description?: string; note?: { time: string; text: string } };
const allergy = (id: string, pt: string, substance: [system: string, code: string, display: string], onset: string, recorded: string, criticality: 'low' | 'high', reactions: Reaction[]): Resource => ({
  resourceType: 'AllergyIntolerance',
  id,
  clinicalStatus: { coding: [{ system: CLINICAL, code: 'active', display: 'Active' }] },
  verificationStatus: { coding: [{ system: VERIFICATION, code: 'confirmed', display: 'Confirmed' }] },
  type: 'allergy',
  category: ['medication'],
  criticality,
  code: { coding: [{ system: substance[0], code: substance[1], display: substance[2] }], text: substance[2] },
  patient: subject(pt),
  onsetDateTime: onset,
  recordedDate: recorded,
  reaction: reactions.map((r) => ({
    manifestation: [{ coding: [{ system: SNOMED, code: r.manifestation[0], display: r.manifestation[1] }], text: r.manifestation[1] }],
    ...(r.description ? { description: r.description } : {}),
    severity: r.severity,
    ...(r.note ? { note: [r.note] } : {}),
  })),
});

function unbase64(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}
function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const note = (id: string, pt: string, date: string, type: [string, string], enc: string | null, author: { reference: string }, custodian: { reference: string }, text: string): Resource => ({
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
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: base64(text) } }],
  ...(enc ? { context: { encounter: [{ reference: `Encounter/${enc}` }] } } : {}),
});
const PHONE: [string, string] = ['34748-4', 'Telephone encounter Note'];
const IMAGING: [string, string] = ['18748-4', 'Diagnostic imaging study'];
const PROGRESS: [string, string] = ['11506-3', 'Progress note'];
const ED_SUMMARY: [string, string] = ['59258-4', 'Emergency department Discharge summary'];

// A booked slot at St. Brigid Imaging on Monday 10/26, the reading radiologist on it.
// A study taken off the list (PW4-E3 list cut): the patient called to cancel, to be rebooked; the
// chart and the booking note stay as they were (the note records the booking, made before it).
type Cancelled = { on: string; why: string };
const appointment = (id: string, pt: string, hhmm: string, description: string, created: string, reason?: string, cancelled?: Cancelled): Resource => ({
  resourceType: 'Appointment',
  id,
  status: cancelled ? 'cancelled' : 'booked',
  ...(cancelled
    ? {
      cancelationReason: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason', code: 'pat', display: 'Patient' }], text: `Cancelled by the patient: ${cancelled.why}` },
      comment: `Cancelled on ${cancelled.on} at the patient's request (${cancelled.why}); to be rebooked. Jordan Reyes, NP`,
    }
    : {}),
  serviceType: [{ coding: [{ system: SNOMED, code: '77477000', display: 'Computed tomography' }], text: 'CT' }],
  ...(reason ? { reasonReference: [{ reference: reason }] } : {}),
  description: `${description}, St. Brigid Imaging`,
  start: `2026-10-26T${hhmm}:00-04:00`,
  end: `2026-10-26T${hhmm.slice(0, 2)}:30:00-04:00`,
  minutesDuration: 30,
  created,
  participant: [
    { actor: subject(pt), status: 'accepted' },
    { actor: RADIOLOGIST, status: 'accepted' },
  ],
});

const clock12 = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
};
// The imaging center's phone screen, asked at booking and answered from the patient's own account
// on that day (each later event is after it): the same three questions on every contrast booking.
type Screen = { reaction: string; kidney: string; diabetes: string };
const screen = (a: Screen) =>
  `\nContrast screening (St. Brigid Imaging phone form, as the patient reported): prior allergic-like reaction to contrast: ${a.reaction}. Kidney disease or acute kidney injury: ${a.kidney}. Diabetes or metformin: ${a.diabetes}.`;
const booked = (study: string, hhmm: string, why: string, extra = '', screened?: Screen) =>
  `Telephone note - Riverbend Family Medicine\n${study} booked at St. Brigid Imaging for Monday 10/26 at ${clock12(hhmm)} (${why}). Called the patient to confirm the time.${extra}${screened ? screen(screened) : ''}\n\nJordan Reyes, NP`;

// ---- pt-0015 Daniel Ferreira, 64: pancreatic cyst surveillance; the latest creatinine is stale.
const FERREIRA = 'pt-0015';
const FERREIRA_REMOVE = [
  { resourceType: 'MedicationRequest', id: 'mr-00178' },
  { resourceType: 'AllergyIntolerance', id: 'alg-00006' },
  ...['cond-00368', 'cond-00369'].map((id) => ({ resourceType: 'Condition', id })),
  ...['doc-00085', 'doc-00086', 'doc-00087', 'doc-00088', 'doc-00089', 'doc-00090'].map((id) => ({ resourceType: 'DocumentReference', id })),
  { resourceType: 'DiagnosticReport', id: 'dr-00171' },
];
const CT_2019_FERREIRA = `St. Brigid Regional - Radiology Report
Patient: Daniel Ferreira   DOB 1962-03-30
Exam: CT abdomen and pelvis with IV contrast   Date: 2019-05-14

Indication: right lower quadrant pain for 3 days.
Technique: axial CT of the abdomen and pelvis after 100 mL iohexol (Omnipaque 350) IV.

Comparison: none.
Findings:
Lower chest: clear lung bases.
Liver: normal size and attenuation. Gallbladder: no stones. Bile ducts: not dilated.
Pancreas, spleen and adrenal glands: unremarkable.
Kidneys: symmetric enhancement, no stone, no hydronephrosis. Bladder: unremarkable.
Bowel: normal appendix. Sigmoid diverticulosis without inflammation. No free fluid or free air.
Bones and soft tissues: degenerative change of the lower lumbar spine.
Impression: no acute abnormality. Uncomplicated sigmoid diverticulosis.

Event during the exam: about 5 minutes after the injection the patient reported itching and developed diffuse hives over the trunk and all four limbs, with mild swelling of both eyelids. No throat tightness, no hoarseness, no dyspnea, no wheeze. BP 132/84, HR 92, SpO2 98% on room air. Diphenhydramine 50 mg given IV. The hives and eyelid swelling faded over 90 minutes; observed for 2 hours and discharged.
Classification: moderate allergic-like reaction to iohexol.

Radiologist: Tunde Adeyemi, MD`;
const CT_2023_FERREIRA = `St. Brigid Regional - Radiology Report
Patient: Daniel Ferreira   DOB 1962-03-30
Exam: CT abdomen and pelvis with IV contrast   Date: 2023-06-20

Indication: left lower quadrant pain; history of sigmoid diverticulosis.
Technique: axial CT of the abdomen and pelvis after 100 mL iohexol (Omnipaque 350) IV. The patient was premedicated for a prior contrast reaction; no allergic-like reaction today.

Findings: mild sigmoid diverticulosis without diverticulitis. A 1.3 cm well-circumscribed cystic lesion in the pancreatic body, without a solid component, wall thickening or main duct dilatation. Liver, spleen and kidneys are unremarkable.
Impression:
1. No diverticulitis.
2. 1.3 cm cystic lesion of the pancreatic body, likely a side-branch IPMN. Recommend surveillance imaging; GI referral.

Radiologist: Tunde Adeyemi, MD`;
const FERREIRA_0922 = `Telephone note - Riverbend Family Medicine
Letter from GI (St. Brigid Regional) received: the 1.3 cm pancreatic body cyst seen on CT in June 2023 is overdue for surveillance imaging. GI had asked for repeat imaging in 2024; the referral was not completed. GI recommends CT abdomen and pelvis with IV contrast, pancreatic protocol.
Called the patient. We discussed MRI as an alternative; he is claustrophobic and prefers CT, which GI accepts. Sent to scheduling to book at St. Brigid Imaging.

Maya Okafor, MD`;

// ---- pt-0048 Jamaal Schmitt, 24: the record of the day grades a severe reaction.
const SCHMITT = 'pt-0048';
const CT_2023_SCHMITT = `St. Brigid Regional - Radiology Report
Patient: Jamaal Schmitt   DOB 2001-11-26
Exam: CT abdomen and pelvis with IV contrast   Date: 2023-08-19   Emergency department

Indication: right lower quadrant pain for 1 day; appendicitis?
Technique: axial CT of the abdomen and pelvis after 100 mL iohexol (Omnipaque 300) IV.

Comparison: none.
Findings:
Lower chest: clear lung bases. Heart size normal.
Liver: normal size and attenuation, no focal lesion. Gallbladder: no stones or wall thickening. Bile ducts: not dilated.
Pancreas, spleen and adrenal glands: unremarkable.
Kidneys: symmetric enhancement, no stone, no hydronephrosis. Bladder: unremarkable.
Bowel: normal caliber small bowel. The appendix is normal in caliber (5 mm) and contains air, without surrounding stranding. Terminal ileum normal.
Several mildly enlarged right lower quadrant mesenteric lymph nodes, up to 11 mm short axis. No free fluid, free air or abscess.
Bones and soft tissues: no aggressive osseous lesion.
Impression:
1. No appendicitis.
2. Mildly enlarged right lower quadrant mesenteric lymph nodes; findings may represent mesenteric adenitis. Clinical correlation.

Event during the exam: about 3 minutes after the injection the patient developed diffuse hives, throat tightness and wheeze. BP fell to 78/42, HR 128, SpO2 89% on room air. Epinephrine 0.3 mg IM given twice, 1 L normal saline IV, albuterol by nebulizer and diphenhydramine 50 mg IV. BP 112/70 at 20 minutes. Observed in the emergency department for 6 hours and discharged with an epinephrine auto-injector.
Classification: severe allergic-like reaction to iohexol (anaphylaxis with hypotension and bronchospasm).

Radiologist: Tunde Adeyemi, MD`;

// ---- pt-0012 Eduardo Stracke, 60, diabetic CKD: the eGFR inside the window is under 30.
const STRACKE = 'pt-0012';

// ---- pt-0049 Anisha Schuster, 23, type 2 diabetes on metformin: AKI in an outside ED summary.
const SCHUSTER = 'pt-0049';
const ED_1017 = `St. Brigid Regional - Emergency Department Discharge Summary
Patient: Anisha Schuster   DOB 2003-10-16   Sex: F
Arrived: 2026-10-04 21:05   Discharged: 2026-10-05 07:20
Primary care: Maya Okafor, MD, Riverbend Family Medicine (copy by fax)

Chief complaint: vomiting and watery diarrhea for 2 days; lightheaded on standing.
History of present illness: 22-year-old woman with type 2 diabetes. Several coworkers had the same illness last week. Unable to keep fluids down since 10/03, six to eight loose stools a day. No blood in the stool, no fever, no abdominal pain beyond cramping, no urinary symptoms. Last menstrual period 09/22; urine pregnancy test negative.
Past medical history: type 2 diabetes (2024), obesity, chronic low back pain, recurrent sinusitis.
Medications: metformin 500 mg twice daily (took this morning's dose), acetaminophen as needed. Allergies: none known.
Social history: works in a warehouse; no tobacco; occasional alcohol.
Review of systems: positive for nausea, thirst and dizziness on standing; negative for chest pain, shortness of breath, headache, rash.
Exam: tired, dry mucous membranes, capillary refill 3 seconds. BP 98/60 lying, 88/56 standing; HR 112; temperature 37.4 C; SpO2 99%. Heart regular, lungs clear. Abdomen soft, mildly tender diffusely, no guarding or rebound, bowel sounds active.
Labs on arrival: sodium 134 mmol/L, potassium 3.6 mmol/L, chloride 101 mmol/L, bicarbonate 19 mmol/L, BUN 34 mg/dL, Cr 1.52 mg/dL (baseline about 0.7 mg/dL on prior results), glucose 211 mg/dL, lactate 1.4 mmol/L, lipase 32 U/L. WBC 11.2, hemoglobin 14.8, platelets 288. Urinalysis: specific gravity 1.030, ketones 1+, no leukocytes, no nitrite. Stool studies sent.
ECG: sinus tachycardia, 110, normal intervals.

Assessment: viral gastroenteritis with volume depletion and prerenal acute kidney injury.
Course: 2 L normal saline IV and ondansetron 4 mg IV. Tolerated oral fluids and crackers without vomiting by 05:00; orthostatic signs resolved. Glucose 164 mg/dL in the morning.
Cr at discharge: 1.24 mg/dL, improving, not back to baseline.

Disposition: discharged home in stable condition. Resume home medications. Drink plenty of fluids; oral rehydration solution as tolerated. Return for persistent vomiting, blood in the stool, fainting or no urine for 12 hours. See your primary care provider in 1 week for repeat blood tests.

ED physician: Owen Castellano, MD`;

// ---- pt-0046 Lauren Beahan, 26: CT without contrast (the filler).
const BEAHAN = 'pt-0046';

// ---- pt-0050 Salvador Brakus, 22, type 2 diabetes on metformin: AKI by the creatinine rule.
const BRAKUS = 'pt-0050';
const URGENT_1021 = `Progress note - Riverbend Family Medicine (same-day visit)
Low back pain after lifting boxes at work on 10/17. Taking ibuprofen 800 mg three times daily since then. Vomited twice yesterday; eating and drinking little. No leg weakness, no numbness, no bladder or bowel change.
Exam: tender right paraspinal muscles, straight leg raise negative, strength and reflexes normal. Mucous membranes dry. BP 118/72, HR 98.
Basic metabolic panel drawn today; results to follow.
Plan: stop ibuprofen; acetaminophen for pain; fluids; heat; back to light duty. Call if the vomiting continues.

Helen Marsh, PA-C`;
const VISIT_1019 = `Progress note - Riverbend Family Medicine
Type 2 diabetes follow-up. Taking metformin 1000 mg twice daily; home glucose 110-160. No hypoglycemia. Weight stable.
Labs today: basic metabolic panel, A1c.
Plan: continue metformin. Adrenal nodule follow-up CT is booked for 10/26.

Maya Okafor, MD`;

// ---- pt-0047 Britt Mohr, 26, type 2 diabetes on diet: the latest creatinine is stale.
const MOHR = 'pt-0047';

// A metformin order in the cohort's own shape, with the sig the chart's notes state, written as the
// profile pass writes a generated order's (a repeat, no timing code); the pass adds the dispense.
const metforminOrder = (id: string, pt: string, status: 'active' | 'completed', rx: [code: string, display: string], mg: number, perDay: 1 | 2, authored: string, requester: { reference: string }, reason: string): Resource => ({
  resourceType: 'MedicationRequest',
  id,
  status,
  intent: 'order',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }],
  medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
  subject: subject(pt),
  authoredOn: authored,
  requester,
  reasonReference: [{ reference: `Condition/${reason}` }],
  dosageInstruction: [
    {
      sequence: 1,
      text: `${mg} mg by mouth ${perDay === 2 ? 'twice daily with meals' : 'once daily with the evening meal'}`,
      timing: { repeat: { frequency: perDay, period: 1, periodUnit: 'd' } },
      asNeededBoolean: false,
      route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
      doseAndRate: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/dose-rate-type', code: 'ordered', display: 'Ordered' }] }, doseQuantity: { value: mg, unit: 'mg', system: UCUM, code: 'mg' } }],
    },
  ],
});

// When a planted diabetes began, and each metformin order by the day it was written (R8,
// verifier-W1-probe-T5-clinical-4 C4-1). The overlay's Condition and MedicationRequest entries
// below use the same days and drug texts.
type Since = { diabetes: string; metformin: ReadonlyArray<readonly [from: string, drug: string]> };
const METFORMIN_500 = 'metformin hydrochloride 500 MG Oral Tablet';
const METFORMIN_1000 = 'metformin hydrochloride 1000 MG Oral Tablet';
const SCHUSTER_SINCE: Since = { diabetes: '2024-06-18', metformin: [['2024-06-18', METFORMIN_500]] };
const BRAKUS_SINCE: Since = { diabetes: '2025-04-14', metformin: [['2025-04-14', METFORMIN_500], ['2026-05-28', METFORMIN_1000]] };
// A Synthea visit note of that day in its raw form (its first line is the day): the history gains
// the diabetes, and the medicines the metformin ordered by then, in Synthea's own words.
const withDiabetes = (since: Since) => (t: string): string => {
  const day = /^\s*(\d{4}-\d{2}-\d{2})/.exec(t)?.[1];
  if (day === undefined) return t;
  let out = day >= since.diabetes ? t.replace(/Patient has a history of (?!type 2 diabetes)/, 'Patient has a history of type 2 diabetes (disorder), ') : t;
  const drug = since.metformin.filter(([from]) => from <= day).at(-1)?.[1];
  if (drug !== undefined) {
    out = out.replace(/(# Medications\n)([^\n]*)/, (whole, head: string, list: string) =>
      /metformin/i.test(list) ? whole : `${head}${list.trim() === '' || /^no active medications/i.test(list.trim()) ? drug : `${list}; ${drug}`}`,
    );
  }
  return out;
};

// Every base resource of a patient that a predicate picks, as a removal.
function pick(world: WorldReader, pt: string, keep: (r: Resource) => boolean): Array<{ resourceType: string; id: string }> {
  const out: Array<{ resourceType: string; id: string }> = [];
  for (const r of world.resources()) {
    if (r.resourceType === 'Patient' || !JSON.stringify(r).includes(`"Patient/${pt}"`)) continue;
    if (keep(r)) out.push({ resourceType: r.resourceType, id: r.id! });
  }
  return out;
}
const text = (r: Resource) => JSON.stringify((r as { code?: unknown; medicationCodeableConcept?: unknown; type?: unknown }).code ?? (r as { medicationCodeableConcept?: unknown }).medicationCodeableConcept ?? (r as { type?: unknown }).type ?? '').toLowerCase();

const overlay: Overlay = {
  task: 'T5',
  names: {
    'org-t5-harbor': 'org-harbor',
    'pr-t5-adeyemi': 'pr-tunde-adeyemi',
    'pr-t5-castellano': 'pr-castellano',
    'pr-t5-marsh': 'pr-marsh',
  },
  build(world: WorldReader) {
    const patient = world.get('Patient', FERREIRA) as Extract<Resource, { resourceType: 'Patient' }>;
    const ferreira: Resource = { ...patient, name: [{ use: 'official', family: 'Ferreira', given: ['Daniel'], prefix: ['Mr.'] }], birthDate: '1962-03-30' };

    // Stracke: his Synthea metformin, and his creatinine and eGFR results, which disagree with one
    // another on one day.
    const kidneyLab = (r: Resource) => r.resourceType === 'Observation' && !text(r).includes('urine') && (text(r).includes('creatinine [mass/volume]') || text(r).includes('glomerular filtration'));
    const strackeRemove = pick(world, STRACKE, (r) => (r.resourceType === 'MedicationRequest' && text(r).includes('metformin')) || kidneyLab(r));
    // The panels that reported them keep their other results.
    const gone = new Set(strackeRemove.map((r) => `${r.resourceType}/${r.id}`));
    const strackePanels = pick(world, STRACKE, (r) => r.resourceType === 'DiagnosticReport' && ((r as { result?: Array<{ reference?: string }> }).result ?? []).some((x) => gone.has(x.reference ?? ''))).map((k) => {
      const dr = world.get('DiagnosticReport', k.id) as Extract<Resource, { resourceType: 'DiagnosticReport' }>;
      return { ...dr, result: (dr.result ?? []).filter((x) => !gone.has(x.reference ?? '')) } as Resource;
    });
    // Beahan: the 2026 pregnancy (the condition, the prenatal visits and every record of them).
    const prenatal = new Set(pick(world, BEAHAN, (r) => r.resourceType === 'Encounter' && text(r).includes('prenatal')).map((r) => `Encounter/${r.id}`));
    const beahanRemove = pick(world, BEAHAN, (r) => {
      if (r.resourceType === 'Encounter') return prenatal.has(`Encounter/${r.id}`);
      if (r.resourceType === 'Condition' && text(r).includes('pregnancy')) return true;
      const s = JSON.stringify(r);
      return [...prenatal].some((e) => s.includes(`"${e}"`));
    });

    // Kept Synthea text of a slot chart, edited before the profile pass writes it in the clinic's
    // form (R8: a kept record may not contradict the item): a visit note's text and the same note
    // as its report's printed form.
    type Texted = { content?: Array<{ attachment: { data?: string } }>; presentedForm?: Array<{ data?: string }> };
    const texts = (r: Resource) => [...((r as Texted).content ?? []).map((c) => c.attachment.data), ...((r as Texted).presentedForm ?? []).map((f) => f.data)].map((d) => unbase64(d ?? ''));
    const editText = (r: Resource, edit: (text: string) => string): Resource => {
      const t = r as Resource & Texted;
      return {
        ...t,
        ...(t.content ? { content: t.content.map((c) => ({ ...c, attachment: { ...c.attachment, ...(c.attachment.data ? { data: base64(edit(unbase64(c.attachment.data))) } : {}) } })) } : {}),
        ...(t.presentedForm ? { presentedForm: t.presentedForm.map((f) => ({ ...f, ...(f.data ? { data: base64(edit(unbase64(f.data))) } : {}) })) } : {}),
      } as Resource;
    };
    const edits = (pt: string, edit: (text: string) => string, skip: ReadonlySet<string>) =>
      pick(world, pt, (r) => !skip.has(`${r.resourceType}/${r.id}`) && texts(r).some((t) => edit(t) !== t)).map((k) => editText(world.get(k.resourceType, k.id) as Resource, edit));
    // Stracke has no metformin (removed above, his eGFR under 30): his visit notes stop listing it.
    const noMetformin = (t: string) => t.replace(/^- [^\n]*metformin[^\n]*\n?/gim, '').replace(/; [^;\n]*metformin[^;\n]*/gi, '').replace(/^[^;\n]*metformin[^;\n]*; /gim, '');
    const panels = strackePanels.map((r) => editText(r, noMetformin));
    const strackeNotes = edits(STRACKE, noMetformin, new Set(panels.map((r) => `${r.resourceType}/${r.id}`)));
    for (const r of [...panels, ...strackeNotes]) if (texts(r).some((t) => /metformin/i.test(t))) throw new Error(`T5 overlay: ${r.id} still names metformin`);
    // Schmitt's visit notes after his 2023 reaction carry the allergy list's entry, not 'No Known
    // Allergies'.
    const REACTION_2023 = '2023-08-20';
    const later = (r: Resource) => (((r as { date?: string; effectiveDateTime?: string }).date ?? (r as { effectiveDateTime?: string }).effectiveDateTime ?? '') >= REACTION_2023);
    const schmittNotes = pick(world, SCHMITT, (r) => later(r) && texts(r).some((t) => /# Allergies\nNo Known Allergies\./.test(t))).map((k) =>
      editText(world.get(k.resourceType, k.id) as Resource, (t) => t.replace(/# Allergies\nNo Known Allergies\./, '# Allergies\niohexol (CT contrast), hives.')),
    );
    // Schuster's and Brakus's visit notes written after their planted diabetes carry it in the
    // history, and those written while metformin was ordered carry it among the medicines, as the
    // order of that day names it (the profile pass then writes the order's sig).
    const diabetesNotes = (pt: string, since: Since) => edits(pt, withDiabetes(since), new Set());
    const schusterNotes = diabetesNotes(SCHUSTER, SCHUSTER_SINCE);
    const brakusNotes = diabetesNotes(BRAKUS, BRAKUS_SINCE);

    const put: Resource[] = [
      ferreira,
      ...strackeNotes,
      ...schmittNotes,
      ...schusterNotes,
      ...brakusNotes,
      ...panels,
      RADIOLOGIST_RESOURCE,
      ED_PHYSICIAN_RESOURCE,
      PA_RESOURCE,
      OUTSIDE_LAB,

      // Mohr, 08:00; diabetic, latest creatinine 09-24 at an outside lab.
      condition('cond-t5-mohr-t2dm', MOHR, '44054006', 'Diabetes mellitus type 2 (disorder)', '2025-11-03T17:54:00-05:00'),
      creatinine('obs-t5-scr-0924', MOHR, '2026-09-24T10:05:00-04:00', '2026-09-24T16:30:00-04:00', 0.94, {
        performer: [{ reference: 'Organization/org-t5-harbor' }],
        note: [{ time: '2026-09-24T17:05:00-04:00', text: 'Outside result: Harbor Diagnostic Laboratory, comprehensive metabolic panel. Entered from the faxed report.' }],
      }),
      appointment('appt-t5-mohr', MOHR, '08:00', 'CT abdomen and pelvis with IV contrast (right upper quadrant pain, raised liver enzymes)', '2026-10-08T11:05:00-04:00'),
      note('doc-t5-mohr-1008', MOHR, '2026-10-08T11:10:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen and pelvis with IV contrast', '08:00', 'right upper quadrant pain and raised liver enzymes', '', { reaction: 'no', kidney: 'no', diabetes: 'yes, diet only' })),

      // Ferreira, 09:00; moderate reaction by the record of the day, 'anaphylaxis' added later.
      encounter('enc-t5-0514', FERREIRA, 'AMB', ['77477000', 'Computed tomography (procedure)'], '2019-05-14T10:00:00-04:00', '2019-05-14T12:40:00-04:00', HOSPITAL, RADIOLOGIST),
      encounter('enc-t5-0620', FERREIRA, 'AMB', ['77477000', 'Computed tomography (procedure)'], '2023-06-20T14:00:00-04:00', '2023-06-20T14:45:00-04:00', HOSPITAL, RADIOLOGIST),
      condition('cond-t5-pcyst', FERREIRA, '31258000', 'Cyst of pancreas (disorder)', '2023-06-20T14:45:00-04:00'),
      allergy('alg-t5-iohexol', FERREIRA, [RXNORM, '5956', 'iohexol'], '2019-05-14T10:20:00-04:00', '2019-05-14T12:30:00-04:00', 'high', [
        { manifestation: ['126485001', 'Urticaria'], severity: 'moderate' },
        { manifestation: ['39579001', 'Anaphylaxis'], description: 'Anaphylaxis (patient report)', severity: 'severe' },
      ]),
      creatinine('obs-t5-scr-1014', FERREIRA, '2026-10-14T10:05:00-04:00', '2026-10-14T15:40:00-04:00', 0.98),
      appointment('appt-t5-1026', FERREIRA, '09:00', 'CT abdomen and pelvis with IV contrast (pancreatic cyst surveillance)', '2026-10-09T10:15:00-04:00', 'Condition/cond-t5-pcyst'),
      note('doc-t5-ct-2019', FERREIRA, '2019-05-14T12:40:00-04:00', IMAGING, 'enc-t5-0514', RADIOLOGIST, HOSPITAL, CT_2019_FERREIRA),
      note('doc-t5-ct-2023', FERREIRA, '2023-06-20T16:30:00-04:00', IMAGING, 'enc-t5-0620', RADIOLOGIST, HOSPITAL, CT_2023_FERREIRA),
      note('doc-t5-tel-0922', FERREIRA, '2026-09-22T15:10:00-04:00', PHONE, null, OKAFOR, CLINIC, FERREIRA_0922),
      note('doc-t5-tel-1009', FERREIRA, '2026-10-09T10:20:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen and pelvis with IV contrast', '09:00', 'pancreatic cyst surveillance', ' He asked whether he needs to do anything before the scan; told him Dr. Okafor will send instructions.', { reaction: 'yes, a reaction to CT dye in 2019 (on the allergy list)', kidney: 'no', diabetes: 'no' })),

      // Schmitt, 10:00; severe reaction by the record of the day, 'mild' on the list.
      encounter('enc-t5-schmitt-0819', SCHMITT, 'EMER', ['50849002', 'Emergency room admission (procedure)'], '2023-08-19T13:10:00-04:00', '2023-08-19T21:40:00-04:00', HOSPITAL, RADIOLOGIST, 'Right lower quadrant pain'),
      allergy('alg-t5-schmitt-iohexol', SCHMITT, [SNOMED, '109218004', 'iohexol'], '2023-08-19T13:40:00-04:00', '2024-02-05T10:20:00-05:00', 'low', [
        { manifestation: ['126485001', 'Urticaria'], severity: 'mild' },
      ]),
      note('doc-t5-schmitt-ct', SCHMITT, '2023-08-19T18:30:00-04:00', IMAGING, 'enc-t5-schmitt-0819', RADIOLOGIST, HOSPITAL, CT_2023_SCHMITT),
      appointment('appt-t5-schmitt', SCHMITT, '10:00', 'CT abdomen and pelvis with IV contrast (recurrent right lower quadrant pain)', '2026-10-07T09:15:00-04:00', undefined, { on: '10/21', why: 'out of town for work that week' }),
      note('doc-t5-schmitt-1007', SCHMITT, '2026-10-07T09:20:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen and pelvis with IV contrast', '10:00', 'recurrent right lower quadrant pain since August', '', { reaction: 'yes, hives with CT dye in 2023 (on the allergy list)', kidney: 'no', diabetes: 'no' })),

      // Stracke, 11:00; eGFR under 30 inside the window, over 30 before it.
      creatinine('obs-t5-stracke-0720', STRACKE, '2026-07-20T09:15:00-04:00', '2026-07-20T14:40:00-04:00', 2.1),
      creatinine('obs-t5-stracke-1013', STRACKE, '2026-10-13T09:25:00-04:00', '2026-10-13T15:05:00-04:00', 2.85),
      appointment('appt-t5-stracke', STRACKE, '11:00', 'CT abdomen and pelvis with IV contrast (unintentional weight loss)', '2026-10-14T13:20:00-04:00', undefined, { on: '10/20', why: 'a family commitment that day' }),
      note('doc-t5-stracke-1014', STRACKE, '2026-10-14T13:25:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen and pelvis with IV contrast', '11:00', 'unintentional weight loss of 6 kg since July', '', { reaction: 'no', kidney: 'yes, chronic kidney disease, followed by Dr. Okafor', diabetes: 'yes, insulin' })),

      // Schuster, 13:00; metformin, and AKI in the faxed ED summary of 10/05.
      condition('cond-t5-schuster-t2dm', SCHUSTER, '44054006', 'Diabetes mellitus type 2 (disorder)', '2024-06-18T09:00:00-04:00'),
      metforminOrder('mr-t5-schuster-metformin-start', SCHUSTER, 'completed', ['861007', METFORMIN_500], 500, 1, '2024-06-18T09:30:00-04:00', REYES, 'cond-t5-schuster-t2dm'),
      metforminOrder('mr-t5-schuster-metformin', SCHUSTER, 'active', ['861007', METFORMIN_500], 500, 2, '2024-09-17T10:10:00-04:00', REYES, 'cond-t5-schuster-t2dm'),
      encounter('enc-t5-schuster-ed', SCHUSTER, 'EMER', ['50849002', 'Emergency room admission (procedure)'], '2026-10-04T21:05:00-04:00', '2026-10-05T07:20:00-04:00', HOSPITAL, ED_PHYSICIAN, 'Vomiting and diarrhea for 2 days'),
      note('doc-t5-schuster-ed', SCHUSTER, '2026-10-05T08:00:00-04:00', ED_SUMMARY, 'enc-t5-schuster-ed', ED_PHYSICIAN, HOSPITAL, ED_1017),
      appointment('appt-t5-schuster', SCHUSTER, '13:00', 'CT abdomen and pelvis with IV contrast (chronic left lower quadrant pain)', '2026-09-29T10:00:00-04:00'),
      note('doc-t5-schuster-1006', SCHUSTER, '2026-09-29T10:05:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen and pelvis with IV contrast', '13:00', 'chronic left lower quadrant pain', '', { reaction: 'no', kidney: 'no', diabetes: 'yes, metformin' })),

      // Beahan, 14:00, CT abdomen and pelvis without contrast.
      appointment('appt-t5-beahan', BEAHAN, '14:00', 'CT abdomen and pelvis without contrast (stone protocol: recurrent right flank pain)', '2026-10-05T10:00:00-04:00'),

      // Brakus, 15:00; metformin, and a creatinine rise of 0.66 within 44 hours.
      condition('cond-t5-brakus-t2dm', BRAKUS, '44054006', 'Diabetes mellitus type 2 (disorder)', '2025-04-14T10:00:00-04:00'),
      condition('cond-t5-brakus-adrenal', BRAKUS, '237783006', 'Adrenal mass (disorder)', '2026-02-23T17:25:00-05:00'),
      metforminOrder('mr-t5-brakus-metformin-start', BRAKUS, 'completed', ['861007', METFORMIN_500], 500, 2, '2025-04-14T10:30:00-04:00', OKAFOR, 'cond-t5-brakus-t2dm'),
      metforminOrder('mr-t5-brakus-metformin', BRAKUS, 'active', ['861004', METFORMIN_1000], 1000, 2, '2026-05-28T11:40:00-04:00', OKAFOR, 'cond-t5-brakus-t2dm'),
      encounter('enc-t5-brakus-1019', BRAKUS, 'AMB', ['185349003', 'Encounter for check up (procedure)'], '2026-10-19T14:00:00-04:00', '2026-10-19T14:30:00-04:00', CLINIC, OKAFOR),
      creatinine('obs-t5-brakus-1019', BRAKUS, '2026-10-19T14:20:00-04:00', '2026-10-19T18:45:00-04:00', 0.98, { encounter: { reference: 'Encounter/enc-t5-brakus-1019' } }),
      note('doc-t5-brakus-1019', BRAKUS, '2026-10-19T14:40:00-04:00', PROGRESS, 'enc-t5-brakus-1019', OKAFOR, CLINIC, VISIT_1019),
      encounter('enc-t5-brakus-1021', BRAKUS, 'AMB', ['185345009', 'Encounter for symptom (procedure)'], '2026-10-21T10:10:00-04:00', '2026-10-21T10:40:00-04:00', CLINIC, PA),
      creatinine('obs-t5-brakus-1021', BRAKUS, '2026-10-21T10:30:00-04:00', '2026-10-21T16:10:00-04:00', 1.64, { encounter: { reference: 'Encounter/enc-t5-brakus-1021' } }),
      note('doc-t5-brakus-1021', BRAKUS, '2026-10-21T10:50:00-04:00', PROGRESS, 'enc-t5-brakus-1021', PA, CLINIC, URGENT_1021),
      appointment('appt-t5-brakus', BRAKUS, '15:00', 'CT abdomen with IV contrast (adrenal protocol: 1.8 cm left adrenal nodule follow-up)', '2026-10-02T14:00:00-04:00', 'Condition/cond-t5-brakus-adrenal', { on: '10/22', why: 'asked for a date in November' }),
      note('doc-t5-brakus-1002', BRAKUS, '2026-10-02T14:05:00-04:00', PHONE, null, REYES, CLINIC, booked('CT abdomen with IV contrast, adrenal protocol', '15:00', 'follow-up of the 1.8 cm left adrenal nodule seen in February', '', { reaction: 'no', kidney: 'no', diabetes: 'yes, metformin' })),
    ];
    return {
      put,
      remove: [...FERREIRA_REMOVE, ...strackeRemove, ...beahanRemove],
      lint: {
        ages: [{ patient: FERREIRA, threshold: 60 }],
        thresholds: [
          { quantity: 'egfr', threshold: 30, value: 24.5, label: 'eGFR (CKD-EPI 2021) from obs-t5-stracke-1013' },
          { quantity: 'egfr', threshold: 30, value: 35.4, label: 'eGFR (CKD-EPI 2021) from obs-t5-stracke-0720' },
          // §4 acute kidney injury, Brakus: the rise 0.98 to 1.64 against 0.3 within 48 hours (the
          // draws 44 hours apart), and 1.64 against 1.5 x 0.98 = 1.47.
          { quantity: 'scr', threshold: 0.3, value: 0.66, label: 'creatinine rise obs-t5-brakus-1019 to obs-t5-brakus-1021' },
          { quantity: 'scr', threshold: 1.47, value: 1.64, label: '1.5 x baseline 0.98, obs-t5-brakus-1021' },
          // Schuster: the ED discharge creatinine 1.24 against her baseline 0.7 + 0.3 (not back at baseline).
          { quantity: 'scr', threshold: 1.0, value: 1.24, label: 'discharge creatinine in doc-t5-schuster-ed against baseline 0.7 + 0.3' },
        ],
        // RBC-RAD-07 §4: a creatinine within 30 days before the 2026-10-26 scans. obs-t5-scr-0924
        // sits 2 days outside it on purpose: within 30 days of NOW, not of the scan.
        windows: [
          {
            name: 'creatinine within 30 days of the 2026-10-26 scans',
            boundary: '2026-09-26',
            resources: ['obs-t5-scr-0924', 'obs-t5-scr-1014', 'obs-t5-stracke-0720', 'obs-t5-stracke-1013', 'obs-t5-brakus-1019', 'obs-t5-brakus-1021'],
            traps: { 'obs-t5-scr-0924': 'scr_counted_from_today' },
          },
        ],
        timeWindows: [{ name: 'premedication through the last scan', start: '2026-10-25T20:00:00-04:00', end: '2026-10-26T15:30:00-04:00' }],
        leakage: {
          answers: ['8:00 PM', '2:00 AM', '2026-10-25T20:00', '2026-10-26T02:00'],
          distractors: ['alg-t5-iohexol', 'alg-t5-schmitt-iohexol', 'doc-t5-ct-2019', 'doc-t5-ct-2023', 'doc-t5-schmitt-ct', 'doc-t5-schuster-ed', 'obs-t5-scr-0924', 'obs-t5-stracke-1013', 'obs-t5-brakus-1021', 'appt-t5-1026', 'doc-t5-tel-1009'],
        },
      },
    };
  },
};

export default overlay;
