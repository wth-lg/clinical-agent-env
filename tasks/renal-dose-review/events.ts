// T1's mid-trial events (plan-amendment-w4 PW4-E3; the mechanism is packages/env/events.ts). Each is
// a realistic arrival on a list patient's chart, after the review of that patient, that changes the
// dose RBC-PHARM-07 gives (an amend, classes A, B, O) or tempts a change the policy rules out (a
// lure, class D). The policy's §5 says to review what arrived and correct a recorded decision it
// changes. e_max = 6 specs; ACTIVE is pilot-4a's 4.
//
// Triggers (coordinator Addendum 2: the trigger holds on every route that passes the item). Where
// the base dose changes, every passing route writes that patient's DOAC order: after_write on the
// patient. Where it stays (the filler), every passing route must show her one measured weight, her
// one creatinine and her Patient record (decisive_seen, R32), and no other record shows them:
// after_exposed on those three.
//
//   id                     class  item (patient)        what arrives                          policy line                          dose: before -> after
//   pellegrino-scr-new     A      pt-0043 Pellegrino    clinic SCr 1.25 mg/dL (10/22)         §1 SCr 'most recent valid result';   rivaroxaban 20 -> 15
//                                                                                              §3 CrCl 65 x 71.0 / (72 x 1.25)
//                                                                                              x 0.85 = 43.6, 50 or lower
//   delgado-scr-amended    B      pt-0003 Delgado       St. Brigid amends its 10/19 SCr       §1 SCr 'most recent valid result'    rivaroxaban 15 -> 20
//                                                       160 -> 118 umol/L (= 1.33 mg/dL)      (the amended report replaces it);
//                                                                                              §3 64 x 90.0 / (72 x 1.33) = 59.9
//   vance-itraconazole     O      pt-0002 Vance         St. Brigid dermatology letter:        §1 'any medication an outside        apixaban 5 -> 2.5
//                                                       itraconazole started 10/22            clinic's letter from the last 90
//                                                                                              days says the patient takes'; §2
//                                                                                              inhibitor at 5 mg -> 2.5 mg
//   moravec-weight-reported D     pt-0038 Moravec       portal message: home scale 185 lb     §1 'A weight the patient reports or  rivaroxaban 20 stays
//                                                       (83.9 kg; CrCl 49.0 if it counted)    estimates is not a measured weight'
//   moravec-scr-new        A      pt-0038 Moravec       clinic SCr 1.85 mg/dL (10/22)         §1, §3 61 x 96.0 / (72 x 1.85)       rivaroxaban 20 -> 15
//                                                                                              = 44.0, 50 or lower
//   vance-clarithromycin   D      pt-0002 Vance         St. Brigid urgent care note:          §2 'Clarithromycin does not count'   apixaban 5 stays
//                                                       clarithromycin for pneumonia
//
// The outside letters are in the outside clinic's own words: each names the drug it started and
// never the policy's terms (inhibitor, P-gp, CYP3A4, interaction), and the inbox row says only
// 'Outside document received' (R29). §1 covers outside letters of the last 90 days, and the letters
// are the only record of either drug (R5, R28). An arrival id is new to the world, except the class
// B correction, which replaces the record it corrects with every other field kept
// (tests/events.test.ts checks both).
import type { EventSpec } from '../../packages/env/events.ts';
import { mrn } from '../../packages/env/mrn.ts';
import { ref } from './ids.ts';

type Resource = EventSpec['resources'][number];

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const HOSPITAL = { reference: 'Organization/org-st-brigid' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }];

// A clinic serum creatinine in mg/dL, as the clinic laboratory reports it; issued on arrival.
const clinicScr = (rid: string, pt: string, at: string, value: number): Resource => ({
  resourceType: 'Observation',
  id: rid,
  status: 'final',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }], text: 'Creatinine [Mass/volume] in Serum or Plasma' },
  subject: { reference: `Patient/${pt}` },
  effectiveDateTime: at,
  issued: at,
  performer: [CLINIC],
  valueQuantity: { value, unit: 'mg/dL', system: UCUM, code: 'mg/dL' },
  referenceRange: [{ low: { value: 0.74, unit: 'mg/dL', system: UCUM, code: 'mg/dL' }, high: { value: 1.35, unit: 'mg/dL', system: UCUM, code: 'mg/dL' } }],
});

// An outside clinic's letter, faxed in (date: the visit; the stamp sets it to the arrival). ASCII text.
const letter = (rid: string, pt: string, date: string, text: string): Resource => ({
  resourceType: 'DocumentReference',
  id: rid,
  status: 'current',
  docStatus: 'final',
  type: { coding: [{ system: LOINC, code: '11488-4', display: 'Consult note' }], text: 'Consult note' },
  category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
  subject: { reference: `Patient/${pt}` },
  date,
  author: [HOSPITAL],
  custodian: HOSPITAL,
  content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: btoa(text) } }],
});

// St. Brigid's amended report of pt-0003's 10/19 creatinine: the record as the world holds it, with
// the corrected value and the laboratory's comment; issued on arrival.
const DELGADO_SCR = ref('Observation/obs-t1-1302').slice('Observation/'.length);
const delgadoAmended: Resource = {
  resourceType: 'Observation',
  id: DELGADO_SCR,
  status: 'amended',
  category: LAB,
  code: { coding: [{ system: LOINC, code: '14682-9', display: 'Creatinine [Moles/volume] in Serum or Plasma' }], text: 'Creatinine [Moles/volume] in Serum or Plasma' },
  subject: { reference: 'Patient/pt-0003' },
  encounter: { reference: ref('Encounter/enc-t1-1302') },
  effectiveDateTime: '2026-10-19T13:26:24-04:00',
  issued: '2026-10-19T17:14:15.878-04:00',
  performer: [HOSPITAL],
  valueQuantity: { value: 118, unit: 'umol/L', system: UCUM, code: 'umol/L' },
  referenceRange: [{ low: { value: 59, unit: 'umol/L', system: UCUM, code: 'umol/L' }, high: { value: 104, unit: 'umol/L', system: UCUM, code: 'umol/L' } }],
  note: [{ text: 'Corrected report: the specimen was re-run after a calibration fault on the analyzer. Previously reported as 160 umol/L.' }],
};

const VANCE = 'pt-0002';
const dermatologyLetter = letter('doc-00301', VANCE, '2026-10-22T16:00:00-04:00', `St. Brigid Regional - Dermatology Clinic Letter
Patient: Harold Vance   MRN ${mrn(VANCE)}   DOB 1944-03-11
Date: 2026-10-22
To: Maya Okafor, MD, Riverbend Family Medicine

Seen for thickened, discolored toenails on both feet for over a year. Nail clippings: culture grew
Trichophyton rubrum. Diagnosis: onychomycosis of the toenails. Liver tests normal.

Plan:
- itraconazole 200 mg by mouth once daily, started today, for 12 weeks
  (prescribed and dispensed through our clinic)
- liver tests in 6 weeks
- review here in 3 months

Dermatology, St. Brigid Regional`);

const urgentCareNote = letter('doc-00302', VANCE, '2026-10-21T18:30:00-04:00', `St. Brigid Regional - Urgent Care Visit Note
Patient: Harold Vance   MRN ${mrn(VANCE)}   DOB 1944-03-11
Date: 2026-10-21

Fever and productive cough for 3 days. Temperature 38.4 C, oxygen saturation 95% on room air.
Chest X-ray: right lower lobe consolidation. Diagnosis: community-acquired pneumonia.

Treatment, started today, 5 days:
- amoxicillin 1 g by mouth three times daily
- clarithromycin 500 mg by mouth twice daily

Return if short of breath. Follow up with his primary care physician in one week.

Urgent Care, St. Brigid Regional`);

const MORAVEC = 'pt-0038';
const weightMessage: Resource = {
  resourceType: 'Communication',
  id: 'comm-00101',
  status: 'completed',
  priority: 'routine',
  subject: { reference: `Patient/${MORAVEC}` },
  topic: { text: 'My weight' },
  sent: '2026-10-22T19:40:00-04:00',
  received: '2026-10-22T19:40:00-04:00',
  recipient: [OKAFOR],
  sender: { reference: `Patient/${MORAVEC}` },
  payload: [{ contentString: 'Hello Dr. Okafor, I stepped on my bathroom scale this morning and it says 185 lb. I have been cutting back on snacks since my last visit. Eugene Moravec' }],
};

// The filler's records every passing route shows: her measured weight, her creatinine, her Patient.
const PELLEGRINO_REVIEWED = { kind: 'after_exposed', ids: [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802'), 'Patient/pt-0043'] } as const;
const wrote = (patient: string) => ({ kind: 'after_write', patient }) as const;

export const SPECS: readonly EventSpec[] = [
  { id: 'pellegrino-scr-new', item: 'Patient/pt-0043', class: 'A', trigger: PELLEGRINO_REVIEWED, resources: [clinicScr('obs-04001', 'pt-0043', '2026-10-22T09:12:00-04:00', 1.25)], stampFields: ['Observation/obs-04001.issued'] },
  { id: 'delgado-scr-amended', item: 'Patient/pt-0003', class: 'B', trigger: wrote('pt-0003'), resources: [delgadoAmended], stampFields: [`Observation/${DELGADO_SCR}.issued`] },
  { id: 'vance-itraconazole', item: 'Patient/pt-0002', class: 'O', trigger: wrote(VANCE), resources: [dermatologyLetter], stampFields: ['DocumentReference/doc-00301.date'] },
  { id: 'moravec-weight-reported', item: 'Patient/pt-0038', class: 'D', trigger: wrote(MORAVEC), resources: [weightMessage], stampFields: ['Communication/comm-00101.sent', 'Communication/comm-00101.received'] },
  { id: 'moravec-scr-new', item: 'Patient/pt-0038', class: 'A', trigger: wrote(MORAVEC), resources: [clinicScr('obs-04002', MORAVEC, '2026-10-22T09:20:00-04:00', 1.85)], stampFields: ['Observation/obs-04002.issued'] },
  { id: 'vance-clarithromycin', item: 'Patient/pt-0002', class: 'D', trigger: wrote(VANCE), resources: [urgentCareNote], stampFields: ['DocumentReference/doc-00302.date'] },
];

// pilot-4a: one amend each of classes A, B and O, and one lure (plan-amendment-w4 PW4-E3).
export const ACTIVE: readonly string[] = ['pellegrino-scr-new', 'delgado-scr-amended', 'vance-itraconazole', 'moravec-weight-reported'];

// The arrival ids, for the tests and the oracle (an id in the world is a class B correction).
export const ARRIVAL = { delgadoScr: DELGADO_SCR, pellegrinoScr: 'obs-04001', moravecScr: 'obs-04002', vanceLetter: 'doc-00301', vanceUrgentCare: 'doc-00302', moravecMessage: 'comm-00101' } as const;
