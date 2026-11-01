// T1 renal-dose-review overlay, worklist probe (plan-amendment-worklist W1, builder-211): the
// clinic pharmacy's DOAC dose review list, nine patients on T1's slots, each taking apixaban or
// rivaroxaban for non-valvular atrial fibrillation. RBC-PHARM-07 gives each patient's dose from
// the inputs §1 picks. Two patients per kept item class, and one filler already on the right dose:
//
//   class                  slot     drug           what decides it                               dose now -> right dose
//   apixaban_two_of_three  pt-0001  apixaban       latest measured weight 57.6 kg (older 62.4)    5 -> 2.5 BID
//                          pt-0002  apixaban       weight back to 64.9 kg and SCr 1.21 after the  2.5 -> 5 BID
//                                                  February admission set 2.5 mg (57.0 kg, 1.71)
//   outside_scr_umol       pt-0040  apixaban       outside SCr 150 umol/L (1.70 mg/dL), newer      5 -> 2.5 BID
//                                                  than the clinic's 1.28 mg/dL
//                          pt-0003  rivaroxaban    outside SCr 160 umol/L (1.81 mg/dL): CrCl 44.2  20 -> 15 daily
//                                                  (the clinic's older 1.30 gives 61.5)
//   cg_crcl_weight_rule    pt-0038  rivaroxaban    actual weight 96 kg: CrCl 56.1; the May          15 -> 20 daily
//                                                  pharmacist note used ideal body weight (39)
//                          pt-0039  rivaroxaban    measured 59.0 kg: CrCl 44.0; a newer weight      20 -> 15 daily
//                                                  the patient gave by phone (168 lb) gives 56.8
//   pgp_cyp3a4_inhibitor   pt-0041  apixaban       itraconazole ordered by an outside dermatologist 5 -> 2.5 BID
//                          pt-0045  apixaban       ritonavir-boosted HIV regimen, in the outside   5 -> 2.5 BID
//                                                  infectious disease clinic's letter only
//   filler                 pt-0043  rivaroxaban    CrCl 59.2: 20 mg is right                       20 unchanged
//
// The seven slots W1-0 added are adults of 29-35 with short Synthea charts, and pt-0001 is 105
// (verifier-phase-P17i-W1-0-1 F7). Each chart is curated the way the single-patient T1 curated
// pt-0002 (curate() below): the Patient gets a name and a birth date that fit the scenario; the
// Synthea notes go (they state the old age and medication list), and so do the creatinine,
// eGFR, weight, height and BMI results (the overlay writes each chart's series), the active orders
// a DOAC review would contradict (NSAIDs, antiplatelets, opioids, a CP patient's atropine), the
// social and situation findings and the disorders that do not fit an older adult (pregnancy,
// cerebral palsy), and every visit about a pregnancy or still in progress, with what references it.
import type { Resource } from '../../packages/env/store.ts';
import { mrnOf } from '../../packages/env/mrn.ts';
import type { Overlay, WorldReader } from '../../packages/env/overlay.ts';

const OKAFOR = { reference: 'Practitioner/pr-okafor' };
const CLINIC = { reference: 'Organization/org-riverbend' };
const HOSPITAL = { reference: 'Organization/org-st-brigid' };

const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const UCUM = 'http://unitsofmeasure.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

type Obs = Extract<Resource, { resourceType: 'Observation' }>;
type R = Resource & { id?: string };
const subject = (pt: string) => ({ reference: `Patient/${pt}` });

// ---- Chart curation -----------------------------------------------------------------------------

// Results the overlay replaces with each chart's own series: creatinine (mass and molar), eGFR,
// body weight (measured and stated), height and BMI.
const SERIES_CODES = new Set(['2160-0', '38483-4', '14682-9', '33914-3', '62238-1', '98979-8', '29463-7', '3142-7', '8302-2', '39156-5']);
// Active orders a DOAC review list would not carry unremarked, or that do not fit the patient.
const DROP_MEDS = /ibuprofen|naproxen|aspirin|clopidogrel|prasugrel|carvedilol|oxycodone|hydrocodone|atropine|epinephrine/i;
// Findings and situations (social history the new age contradicts), and disorders that do not fit.
const DROP_CONDITIONS = /\((finding|situation|morphologic abnormality)\)$|pregnan|eclampsia|miscarriage|cerebral palsy|intellectual disability|salivation|tooth eruption|coronavirus|hypoxemia|pulmonary embolism|chronic kidney disease stage [12]|drug abuse|\bobesity\b/i;
// Results and procedures about a pregnancy.
const DROP_PREGNANCY = /pregnan|prenatal|postnatal|obstetric|fetal|gestation|amniotic|childbirth|cesarean|episiotomy/i;
// Visits about a pregnancy, and a stay still in progress.
const DROP_VISITS = /prenatal|postnatal|obstetric/i;

// A report whose text states the patient's age (a Synthea visit note kept as a report) states the old one.
const STATES_AGE = /\b\d{1,3}[ -](?:year|y\/o)/i;
const formText = (r: R): string =>
  ((r as { presentedForm?: Array<{ data?: string }> }).presentedForm ?? []).map((a) => (a.data ? new TextDecoder().decode(Uint8Array.from(atob(a.data), (ch) => ch.charCodeAt(0))) : '')).join('\n');
const textOf = (c: unknown): string => {
  const cc = c as { text?: string; coding?: Array<{ display?: string }> } | undefined;
  return cc?.text ?? cc?.coding?.[0]?.display ?? '';
};
const codeOf = (r: R): string | undefined => (r as { code?: { coding?: Array<{ code?: string }> } }).code?.coding?.[0]?.code;
const keyOf = (r: R) => `${r.resourceType}/${r.id}`;
const refsIn = (value: unknown, out: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) for (const v of value) refsIn(v, out);
  else if (value !== null && typeof value === 'object') {
    const ref = (value as { reference?: unknown }).reference;
    if (typeof ref === 'string') out.add(ref);
    for (const v of Object.values(value)) refsIn(v, out);
  }
  return out;
};

interface Curated {
  remove: Array<{ resourceType: string; id: string }>;
  put: Resource[];
}

// The base resources of `pt` the scenario contradicts, removed; a DiagnosticReport that keeps
// other results loses only its removed ones. `extra` names more base resources to remove.
function curate(world: WorldReader, pt: string, extra: readonly string[] = []): Curated {
  const mine = [...world.resources()].filter((r) => r.resourceType !== 'Patient' && refsIn(r).has(`Patient/${pt}`)) as R[];
  const gone = new Set<string>(extra);
  for (const r of mine) {
    const t = r.resourceType;
    if (t === 'DocumentReference') gone.add(keyOf(r));
    if (t === 'MedicationRequest' && r.status === 'active' && DROP_MEDS.test(textOf((r as { medicationCodeableConcept?: unknown }).medicationCodeableConcept))) gone.add(keyOf(r));
    if (t === 'Observation' && SERIES_CODES.has(codeOf(r) ?? '')) gone.add(keyOf(r));
    if ((t === 'Observation' || t === 'Procedure') && DROP_PREGNANCY.test(textOf((r as { code?: unknown }).code))) gone.add(keyOf(r));
    if (t === 'Condition' && DROP_CONDITIONS.test(textOf((r as { code?: unknown }).code))) gone.add(keyOf(r));
    if (t === 'DiagnosticReport' && STATES_AGE.test(formText(r))) gone.add(keyOf(r));
    if (t === 'Encounter' && (r.status === 'in-progress' || DROP_VISITS.test(textOf((r as { type?: unknown[] }).type?.[0])))) gone.add(keyOf(r));
  }
  // Whatever references a removed visit goes with it, until nothing more does.
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of mine) {
      if (gone.has(keyOf(r)) || r.resourceType === 'DiagnosticReport') continue;
      const refs = refsIn(r);
      if ([...gone].some((g) => g.startsWith('Encounter/') && refs.has(g))) {
        gone.add(keyOf(r));
        changed = true;
      }
    }
  }
  const put: Resource[] = [];
  for (const r of mine) {
    if (r.resourceType !== 'DiagnosticReport' || gone.has(keyOf(r))) continue;
    const dr = r as Extract<Resource, { resourceType: 'DiagnosticReport' }>;
    if (dr.encounter?.reference && gone.has(dr.encounter.reference)) {
      gone.add(keyOf(r));
      continue;
    }
    const kept = (dr.result ?? []).filter((x) => !gone.has(x.reference ?? ''));
    if (kept.length === (dr.result ?? []).length) continue;
    if (kept.length === 0) gone.add(keyOf(r));
    else put.push({ ...dr, result: kept });
  }
  return {
    remove: [...gone].sort().map((k) => ({ resourceType: k.split('/')[0]!, id: k.split('/')[1]! })),
    put,
  };
}

// ---- Resource builders -------------------------------------------------------------------------

const encounter = (pt: string, id: string, cls: 'AMB' | 'IMP' | 'VR', type: [string, string], start: string, end: string, provider: { reference: string }, attended: { reference: string } | null = OKAFOR): Resource => ({
  resourceType: 'Encounter',
  id,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls },
  type: [{ coding: [{ system: SNOMED, code: type[0], display: type[1] }], text: type[1] }],
  subject: subject(pt),
  ...(attended ? { participant: [{ individual: attended }] } : {}),
  period: { start, end },
  serviceProvider: provider,
});
const CHECKUP: [string, string] = ['185349003', 'Encounter for check up (procedure)'];
const PROBLEM: [string, string] = ['185347001', 'Encounter for problem (procedure)'];
const PHONE: [string, string] = ['185317003', 'Telephone encounter (procedure)'];
const ADMISSION: [string, string] = ['32485007', 'Hospital admission (procedure)'];

const condition = (pt: string, id: string, code: string | null, display: string, onset: string, abated?: string): Resource => ({
  resourceType: 'Condition',
  id,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: abated ? 'resolved' : 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item', display: 'Problem List Item' }] }],
  code: code === null ? { text: display } : { coding: [{ system: SNOMED, code, display }], text: display },
  subject: subject(pt),
  onsetDateTime: onset,
  ...(abated ? { abatementDateTime: abated } : {}),
  recordedDate: onset,
});
const AF = (pt: string, id: string, onset: string) => condition(pt, id, '49436004', 'Atrial fibrillation (disorder)', onset);

const category = (code: string, display: string) => [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code, display }] }];
const RANGE_MGDL = { low: { value: 0.74, unit: 'mg/dL', system: UCUM, code: 'mg/dL' }, high: { value: 1.35, unit: 'mg/dL', system: UCUM, code: 'mg/dL' } };
const RANGE_UMOL = { low: { value: 59, unit: 'umol/L', system: UCUM, code: 'umol/L' }, high: { value: 104, unit: 'umol/L', system: UCUM, code: 'umol/L' } };

// A clinic serum creatinine in mg/dL (LOINC 2160-0).
const scr = (pt: string, id: string, at: string, issued: string, value: number, enc: string, extra: Partial<Obs> = {}): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: category('laboratory', 'Laboratory'),
  code: { coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }], text: 'Creatinine [Mass/volume] in Serum or Plasma' },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued,
  valueQuantity: { value, unit: 'mg/dL', system: UCUM, code: 'mg/dL' },
  referenceRange: [RANGE_MGDL],
  ...extra,
});
// An outside laboratory's serum creatinine in umol/L (LOINC 14682-9), performed by St. Brigid.
const scrUmol = (pt: string, id: string, at: string, issued: string, value: number, enc: string): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: category('laboratory', 'Laboratory'),
  code: { coding: [{ system: LOINC, code: '14682-9', display: 'Creatinine [Moles/volume] in Serum or Plasma' }], text: 'Creatinine [Moles/volume] in Serum or Plasma' },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued,
  performer: [HOSPITAL],
  valueQuantity: { value, unit: 'umol/L', system: UCUM, code: 'umol/L' },
  referenceRange: [RANGE_UMOL],
});

const MEASURED: [string, string] = ['29463-7', 'Body weight'];
const STATED: [string, string] = ['3142-7', 'Body weight Stated'];
const weight = (pt: string, id: string, at: string, value: number, unit: 'kg' | '[lb_av]', enc: string, code: [string, string] = MEASURED, extra: Partial<Obs> = {}): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: category('vital-signs', 'Vital signs'),
  code: { coding: [{ system: LOINC, code: code[0], display: code[1] }], text: code[1] },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued: at,
  valueQuantity: { value, unit: unit === 'kg' ? 'kg' : 'lb', system: UCUM, code: unit },
  ...extra,
});
const height = (pt: string, id: string, at: string, cm: number, enc: string): Resource => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  category: category('vital-signs', 'Vital signs'),
  code: { coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }], text: 'Body height' },
  subject: subject(pt),
  encounter: { reference: `Encounter/${enc}` },
  effectiveDateTime: at,
  issued: at,
  valueQuantity: { value: cm, unit: 'cm', system: UCUM, code: 'cm' },
});

export const RX = {
  apixaban2_5: ['1364435', 'apixaban 2.5 MG Oral Tablet'],
  apixaban5: ['1364445', 'apixaban 5 MG Oral Tablet'],
  rivaroxaban15: ['1232082', 'rivaroxaban 15 MG Oral Tablet'],
  rivaroxaban20: ['1232086', 'rivaroxaban 20 MG Oral Tablet'],
  itraconazole: ['311204', 'itraconazole 100 MG Oral Capsule'],
  metoprolol: ['866427', '24 HR metoprolol succinate 25 MG Extended Release Oral Tablet'],
  lisinopril: ['314076', 'lisinopril 10 MG Oral Tablet'],
  amlodipine: ['197361', 'amlodipine 5 MG Oral Tablet'],
  amoxicillin: ['308191', 'amoxicillin 500 MG Oral Capsule'],
} as const satisfies Record<string, readonly [string, string]>;

const FREQ = { BID: [2, 'twice daily'], TID: [3, 'three times daily'], QD: [1, 'once daily'], QPM: [1, 'once daily with the evening meal'] } as const;
const community = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }];

const medication = (
  pt: string,
  id: string,
  rx: readonly [string, string],
  dose: number,
  freq: keyof typeof FREQ,
  authored: string,
  reason: string,
  extra: Partial<Extract<Resource, { resourceType: 'MedicationRequest' }>> = {},
  // Fields this order leaves out (a finished short course names no supply, an old one no reason).
  omit: ReadonlyArray<'dispenseRequest' | 'reasonCode'> = [],
): Resource => {
  const [perDay, words] = FREQ[freq];
  const r: Record<string, unknown> = {
    resourceType: 'MedicationRequest',
    id,
    status: 'active',
    intent: 'order',
    category: community,
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: rx[0], display: rx[1] }], text: rx[1] },
    subject: subject(pt),
    authoredOn: authored,
    requester: OKAFOR,
    reasonCode: [{ text: reason }],
    dosageInstruction: [
      {
        text: `${dose} mg by mouth ${words}`,
        timing: { repeat: { frequency: perDay, period: 1, periodUnit: 'd' } },
        route: { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' },
        doseAndRate: [{ doseQuantity: { value: dose, unit: 'mg', system: UCUM, code: 'mg' } }],
      },
    ],
    dispenseRequest: { numberOfRepeatsAllowed: 3, expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' } },
    ...extra,
  };
  for (const field of omit) delete r[field];
  return r as unknown as Resource;
};
const NVAF = 'Non-valvular atrial fibrillation';

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const PROGRESS: [string, string] = ['11506-3', 'Progress note'];
const DISCHARGE: [string, string] = ['18842-5', 'Discharge summary'];
const CONSULT: [string, string] = ['11488-4', 'Consult note'];
const note = (pt: string, id: string, date: string, type: [string, string], enc: string, author: { reference: string }, custodian: { reference: string }, text: string): Resource => ({
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
  context: { encounter: [{ reference: `Encounter/${enc}` }] },
});

type Doac = [rx: readonly [string, string], dose: number, freq: keyof typeof FREQ];

// Last year's visit on a chart: a clinic creatinine and a measured weight, and the acute bronchitis
// treated then with a finished course of amoxicillin (a chart's history is not all current).
const lastYear = (pt: string, key: string, day: string, scrValue: number, kg: number, doac: Doac | null): Resource[] => {
  const end = new Date(Date.parse(`${day}T12:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  return [
    encounter(pt, `enc-t1-${key}`, 'AMB', CHECKUP, `${day}T09:00:00-04:00`, `${day}T09:30:00-04:00`, CLINIC),
    weight(pt, `obs-t1-${key}-wt`, `${day}T09:05:00-04:00`, kg, 'kg', `enc-t1-${key}`),
    scr(pt, `obs-t1-${key}-scr`, `${day}T09:15:00-04:00`, `${day}T13:20:00-04:00`, scrValue, `enc-t1-${key}`),
    condition(pt, `cond-t1-${key}`, '10509002', 'Acute bronchitis (disorder)', `${day}T09:20:00-04:00`, `${end}T10:00:00-04:00`),
    medication(pt, `mr-t1-${key}`, RX.amoxicillin, 500, 'TID', `${day}T09:25:00-04:00`, 'Acute bronchitis', { status: 'completed' }, ['dispenseRequest', 'reasonCode']),
    // Last year's renewal of the DOAC order, finished when this year's was written.
    ...(doac === null ? [] : [medication(pt, `mr-t1-${key}-doac`, doac[0], doac[1], doac[2], `${day}T09:28:00-04:00`, NVAF, { status: 'completed', statusReason: { text: 'Renewed' } })]),
  ];
};

// ---- People and the list ----------------------------------------------------------------------

const ATTENDING: Resource = { resourceType: 'Practitioner', id: 'pr-t1-raman', active: true, name: [{ use: 'official', given: ['Priya'], family: 'Raman', suffix: ['MD'] }] };
const PHARMACIST: Resource = { resourceType: 'Practitioner', id: 'pr-t1-lindqvist', active: true, name: [{ use: 'official', given: ['Grace'], family: 'Lindqvist', suffix: ['PharmD'] }] };
const DERMATOLOGIST: Resource = { resourceType: 'Practitioner', id: 'pr-t1-derm', active: true, name: [{ use: 'official', given: ['Anika'], family: 'Sorensen', suffix: ['MD'] }] };
const ID_PHYSICIAN: Resource = { resourceType: 'Practitioner', id: 'pr-t1-id', active: true, name: [{ use: 'official', given: ['Tomas'], family: 'Varga', suffix: ['MD'] }] };
const RAMAN = { reference: 'Practitioner/pr-t1-raman' };
const LIN = { reference: 'Practitioner/pr-lin' };
const REYES = { reference: 'Practitioner/pr-reyes' };
const LINDQVIST = { reference: 'Practitioner/pr-t1-lindqvist' };
const SORENSEN = { reference: 'Practitioner/pr-t1-derm' };
const VARGA = { reference: 'Practitioner/pr-t1-id' };

// The review list, in the order pharmacy built it (alphabetical by family name).
export const PANEL = ['pt-0040', 'pt-0039', 'pt-0003', 'pt-0041', 'pt-0001', 'pt-0045', 'pt-0038', 'pt-0043', 'pt-0002'] as const;

const PEOPLE: Record<string, { given: string[]; family: string; birthDate?: string; prefix: string }> = {
  'pt-0001': { given: ['Walter'], family: 'Kowalczyk', birthDate: '1942-02-14', prefix: 'Mr.' },
  'pt-0002': { given: ['Harold'], family: 'Vance', birthDate: '1944-03-11', prefix: 'Mr.' },
  'pt-0003': { given: ['Frank'], family: 'Delgado', prefix: 'Mr.' },
  'pt-0038': { given: ['Eugene'], family: 'Moravec', birthDate: '1947-07-30', prefix: 'Mr.' },
  'pt-0039': { given: ['Clarence'], family: 'Bauer', birthDate: '1945-09-12', prefix: 'Mr.' },
  'pt-0040': { given: ['Dorothy'], family: 'Ashworth', birthDate: '1943-05-19', prefix: 'Mrs.' },
  'pt-0041': { given: ['Raymond'], family: 'Duquette', birthDate: '1956-01-09', prefix: 'Mr.' },
  'pt-0043': { given: ['Marjorie'], family: 'Pellegrino', birthDate: '1951-04-03', prefix: 'Mrs.' },
  'pt-0045': { given: ['Gregory'], family: 'Lindahl', birthDate: '1960-06-21', prefix: 'Mr.' },
};

const GROUP: Resource = {
  resourceType: 'Group',
  id: 'grp-t1-doac',
  active: true,
  type: 'person',
  actual: true,
  code: { text: 'Pharmacy worklist: DOAC dose review' },
  name: 'DOAC dose review - week of 10/19/2026',
  managingEntity: LINDQVIST,
  quantity: PANEL.length,
  member: PANEL.map((pt) => ({ entity: subject(pt), period: { start: '2026-10-19' } })),
};

// ---- Per-patient charts -----------------------------------------------------------------------

// Each chart's own resources (keys carry the t1 tag), from the MRN the letters quote.
type Chart = (mrn: string) => Resource[];

const CHARTS: Record<string, Chart> = {
  // apixaban_two_of_three: 84; three measured weights falling to 57.6 kg; SCr 1.18. Age and weight
  // give two criteria: 2.5 mg. The oldest weight first (the default search order) gives one.
  'pt-0001': () => {
    const P = 'pt-0001';
    return [
      ...lastYear(P, '1125', '2025-04-11', 1.1, 64.8, [RX.apixaban5, 5, 'BID']),
      AF(P, 'cond-t1-1101', '2019-05-08T10:00:00-04:00'),
      condition(P, 'cond-t1-1102', '38341003', 'Hypertensive disorder, systemic arterial (disorder)', '2012-03-14T10:00:00-04:00'),
      encounter(P, 'enc-t1-1101', 'AMB', CHECKUP, '2026-04-17T09:00:00-04:00', '2026-04-17T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1102', 'AMB', PROBLEM, '2026-07-15T10:00:00-04:00', '2026-07-15T10:20:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1103', 'AMB', PROBLEM, '2026-10-14T09:40:00-04:00', '2026-10-14T10:00:00-04:00', CLINIC),
      weight(P, 'obs-t1-1101', '2026-04-17T09:05:00-04:00', 62.4, 'kg', 'enc-t1-1101'),
      weight(P, 'obs-t1-1102', '2026-07-15T10:05:00-04:00', 60.2, 'kg', 'enc-t1-1102'),
      weight(P, 'obs-t1-1103', '2026-10-14T09:45:00-04:00', 57.6, 'kg', 'enc-t1-1103'),
      scr(P, 'obs-t1-1104', '2026-04-17T09:15:00-04:00', '2026-04-17T13:00:00-04:00', 1.14, 'enc-t1-1101'),
      scr(P, 'obs-t1-1105', '2026-10-14T09:55:00-04:00', '2026-10-14T14:10:00-04:00', 1.18, 'enc-t1-1103'),
      medication(P, 'mr-t1-1101', RX.apixaban5, 5, 'BID', '2024-06-03T10:00:00-04:00', NVAF, { requester: LIN }),
      medication(P, 'mr-t1-1102', RX.metoprolol, 25, 'QD', '2019-05-08T10:00:00-04:00', 'Atrial fibrillation, rate control', { requester: REYES }),
      note(P, 'doc-t1-1101', '2026-10-14T10:20:00-04:00', PROGRESS, 'enc-t1-1103', OKAFOR, CLINIC, `Progress note - Riverbend Family Medicine
Follow-up: poor appetite since his wife's hospital stay in the summer; eating less, no nausea or GI bleeding. Weighed today.
AF: rate controlled on metoprolol, on apixaban. No bleeding.
Hypertension: controlled without medication changes.
Plan: dietitian referral; labs today; return in 6 weeks.

Maya Okafor, MD`),
    ];
  },
  // apixaban_two_of_three: Harold Vance, 82. The February admission (AKI) reduced apixaban to
  // 2.5 mg on 57.0 kg and SCr 1.71 with his age; his weight is back to 143 lb (64.9 kg) and SCr
  // 1.21: one criterion, 5 mg. The discharge summary keeps the old values.
  'pt-0002': (mrn) => {
    const P = 'pt-0002';
    return [
      ...lastYear(P, '1225', '2025-10-14', 1.12, 61.5, null),
      AF(P, 'cond-t1-1201', '2017-09-12T10:00:00-04:00'),
      condition(P, 'cond-t1-1202', '14669001', 'Acute kidney injury (disorder)', '2026-02-07T14:20:00-05:00', '2026-05-12T09:30:00-04:00'),
      encounter(P, 'enc-t1-0207', 'IMP', ADMISSION, '2026-02-07T14:20:00-05:00', '2026-02-12T11:30:00-05:00', HOSPITAL, null),
      encounter(P, 'enc-t1-0512', 'AMB', PROBLEM, '2026-05-12T09:30:00-04:00', '2026-05-12T10:00:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1020', 'AMB', CHECKUP, '2026-10-20T09:00:00-04:00', '2026-10-20T09:20:00-04:00', CLINIC),
      scr(P, 'obs-t1-scr-0209', '2026-02-09T06:10:00-05:00', '2026-02-09T07:45:00-05:00', 1.71, 'enc-t1-0207'),
      scr(P, 'obs-t1-scr-0512', '2026-05-12T09:40:00-04:00', '2026-05-12T13:20:00-04:00', 1.31, 'enc-t1-0512'),
      scr(P, 'obs-t1-scr-1020', '2026-10-20T09:15:00-04:00', '2026-10-20T13:05:00-04:00', 1.21, 'enc-t1-1020'),
      weight(P, 'obs-t1-wt-0210', '2026-02-10T07:00:00-05:00', 57.0, 'kg', 'enc-t1-0207'),
      weight(P, 'obs-t1-wt-0512', '2026-05-12T09:35:00-04:00', 134, '[lb_av]', 'enc-t1-0512'),
      weight(P, 'obs-t1-wt-1020', '2026-10-20T09:05:00-04:00', 143, '[lb_av]', 'enc-t1-1020'),
      medication(P, 'mr-t1-apixaban-5', RX.apixaban5, 5, 'BID', '2017-09-12T10:00:00-04:00', NVAF, { status: 'stopped', statusReason: { text: 'Dose reduced at discharge' } }),
      medication(P, 'mr-t1-apixaban', RX.apixaban2_5, 2.5, 'BID', '2026-02-12T11:30:00-05:00', NVAF, { requester: RAMAN}),
      note(P, 'doc-t1-dc-0212', '2026-02-12T11:30:00-05:00', DISCHARGE, 'enc-t1-0207', RAMAN, HOSPITAL, `St. Brigid Regional - Discharge Summary
Patient: Harold Vance   MRN ${mrn}   DOB 1944-03-11
Admitted 2026-02-07, discharged 2026-02-12. Service: Hospital Medicine.

Principal diagnosis: acute kidney injury (prerenal), with dehydration after viral gastroenteritis.
Other diagnoses: atrial fibrillation on anticoagulation; coronary artery disease, remote STEMI.

Hospital course: four days of vomiting and poor intake before admission. Creatinine 1.71 mg/dL on 2/9. IV fluids; renal function improving at discharge.

Weight 57.0 kg on 2/10.

Anticoagulation: apixaban reduced from 5 mg to 2.5 mg twice daily (age 81, weight 57.0 kg, creatinine 1.71 mg/dL).

Follow-up: Riverbend Family Medicine within 1 week; repeat creatinine and weight.

Attending: Priya Raman, MD`),
      note(P, 'doc-t1-pn-0512', '2026-05-12T10:00:00-04:00', PROGRESS, 'enc-t1-0512', OKAFOR, CLINIC, `Progress note - Riverbend Family Medicine
Follow-up after the February admission to St. Brigid Regional for acute kidney injury.
Feels well, eating normally and regaining weight. No bleeding.
AF: rate controlled, on apixaban since discharge.
Plan: repeat creatinine and weight in the fall.

Maya Okafor, MD`),
    ];
  },
  // outside_scr_umol: 76, CKD 3a. The clinic's SCr 1.30 (July); St. Brigid's 160 umol/L (10/19)
  // is newer: 1.81 mg/dL, CrCl 44.2 on 90 kg: 15 mg.
  'pt-0003': () => {
    const P = 'pt-0003';
    return [
      ...lastYear(P, '1325', '2025-07-15', 1.24, 92.5, [RX.rivaroxaban20, 20, 'QPM']),
      AF(P, 'cond-t1-1301', '2023-01-18T10:00:00-05:00'),
      condition(P, 'cond-t1-1302', '700378005', 'Chronic kidney disease stage 3a (disorder)', '2024-06-11T10:00:00-04:00'),
      encounter(P, 'enc-t1-1301', 'AMB', CHECKUP, '2026-07-21T09:00:00-04:00', '2026-07-21T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1302', 'AMB', PROBLEM, '2026-10-19T13:00:00-04:00', '2026-10-19T13:40:00-04:00', HOSPITAL, null),
      encounter(P, 'enc-t1-1303', 'AMB', PROBLEM, '2026-10-21T09:00:00-04:00', '2026-10-21T09:20:00-04:00', CLINIC),
      scr(P, 'obs-t1-1301', '2026-07-21T09:15:00-04:00', '2026-07-21T13:40:00-04:00', 1.3, 'enc-t1-1301'),
      scrUmol(P, 'obs-t1-1302', '2026-10-19T13:20:00-04:00', '2026-10-19T17:05:00-04:00', 160, 'enc-t1-1302'),
      weight(P, 'obs-t1-1303', '2026-07-21T09:05:00-04:00', 91.2, 'kg', 'enc-t1-1301'),
      weight(P, 'obs-t1-1304', '2026-10-21T09:05:00-04:00', 90.0, 'kg', 'enc-t1-1303'),
      medication(P, 'mr-t1-1301', RX.rivaroxaban20, 20, 'QPM', '2023-01-18T10:00:00-05:00', NVAF, { requester: REYES }),
      note(P, 'doc-t1-1301', '2026-10-21T09:30:00-04:00', PROGRESS, 'enc-t1-1303', OKAFOR, CLINIC, `Progress note - Riverbend Family Medicine
Follow-up after his visit to the St. Brigid nephrology clinic on 10/19, where labs were drawn; results are in the chart.
AF: no palpitations, no bleeding on rivaroxaban.
CKD: nephrology to see him again in 3 months.
Weighed today. Plan: continue current care.

Maya Okafor, MD`),
    ];
  },
  // cg_crcl_weight_rule: 79, 96 kg, 170 cm, SCr 1.45: CrCl 56.1 on actual weight: 20 mg. The May
  // pharmacist note reduced him to 15 mg on ideal body weight (CrCl 39).
  'pt-0038': () => {
    const P = 'pt-0038';
    return [
      ...lastYear(P, '1425', '2025-05-02', 1.38, 98.4, null),
      AF(P, 'cond-t1-1401', '2021-11-02T10:00:00-04:00'),
      condition(P, 'cond-t1-1402', '44054006', 'Diabetes mellitus type 2 (disorder)', '2014-04-09T10:00:00-04:00'),
      encounter(P, 'enc-t1-1401', 'AMB', CHECKUP, '2026-05-06T09:00:00-04:00', '2026-05-06T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1402', 'AMB', CHECKUP, '2026-10-09T09:00:00-04:00', '2026-10-09T09:30:00-04:00', CLINIC),
      height(P, 'obs-t1-1401', '2026-05-06T09:04:00-04:00', 170, 'enc-t1-1401'),
      weight(P, 'obs-t1-1402', '2026-05-06T09:05:00-04:00', 97.1, 'kg', 'enc-t1-1401'),
      scr(P, 'obs-t1-1403', '2026-05-06T09:15:00-04:00', '2026-05-06T13:30:00-04:00', 1.44, 'enc-t1-1401'),
      weight(P, 'obs-t1-1404', '2026-10-09T09:05:00-04:00', 96.0, 'kg', 'enc-t1-1402'),
      scr(P, 'obs-t1-1405', '2026-10-09T09:15:00-04:00', '2026-10-09T13:50:00-04:00', 1.45, 'enc-t1-1402'),
      medication(P, 'mr-t1-1401-20', RX.rivaroxaban20, 20, 'QPM', '2021-11-02T10:00:00-04:00', NVAF, { status: 'stopped', statusReason: { text: 'Dose reduced, pharmacy renal review' } }),
      medication(P, 'mr-t1-1401', RX.rivaroxaban15, 15, 'QPM', '2026-05-08T10:00:00-04:00', NVAF, { requester: OKAFOR}),
      medication(P, 'mr-t1-1402', RX.lisinopril, 10, 'QD', '2016-02-10T10:00:00-05:00', 'Hypertension', { requester: LIN }),
      note(P, 'doc-t1-1401', '2026-05-07T15:30:00-04:00', PROGRESS, 'enc-t1-1401', LINDQVIST, CLINIC, `Riverbend Family Medicine - Clinical Pharmacist Note
Rivaroxaban renal screen after labs of 5/6/2026.
SCr 1.44 mg/dL. Height 170 cm. Ideal body weight 66 kg. Age 78.
CrCl by Cockcroft-Gault on ideal body weight: 39 mL/min.
Rivaroxaban 20 mg daily: suggest 15 mg daily with the evening meal (CrCl 50 or lower).
Discussed with Dr. Okafor; dose changed.

Grace Lindqvist, PharmD`),
    ];
  },
  // cg_crcl_weight_rule: 81, measured 59.0 kg, SCr 1.10: CrCl 44.0: 15 mg. A newer weight he gave
  // by phone (168 lb, Body weight Stated) gives 56.8.
  'pt-0039': () => {
    const P = 'pt-0039';
    return [
      ...lastYear(P, '1525', '2025-04-24', 1.02, 63.1, [RX.rivaroxaban20, 20, 'QPM']),
      AF(P, 'cond-t1-1501', '2020-02-19T10:00:00-05:00'),
      condition(P, 'cond-t1-1502', '38341003', 'Hypertensive disorder, systemic arterial (disorder)', '2010-07-01T10:00:00-04:00'),
      encounter(P, 'enc-t1-1501', 'AMB', CHECKUP, '2026-04-22T09:00:00-04:00', '2026-04-22T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1502', 'AMB', PROBLEM, '2026-10-14T11:00:00-04:00', '2026-10-14T11:20:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1503', 'VR', PHONE, '2026-10-21T15:10:00-04:00', '2026-10-21T15:20:00-04:00', CLINIC),
      weight(P, 'obs-t1-1501', '2026-04-22T09:05:00-04:00', 61.8, 'kg', 'enc-t1-1501'),
      scr(P, 'obs-t1-1502', '2026-04-22T09:15:00-04:00', '2026-04-22T13:10:00-04:00', 1.06, 'enc-t1-1501'),
      weight(P, 'obs-t1-1503', '2026-10-14T11:05:00-04:00', 59.0, 'kg', 'enc-t1-1502'),
      scr(P, 'obs-t1-1504', '2026-10-14T11:15:00-04:00', '2026-10-14T15:20:00-04:00', 1.1, 'enc-t1-1502'),
      weight(P, 'obs-t1-1505', '2026-10-21T15:15:00-04:00', 168, '[lb_av]', 'enc-t1-1503', STATED, { note: [{ time: '2026-10-21T15:15:00-04:00', text: 'Patient report by phone, not weighed.' }] }),
      medication(P, 'mr-t1-1501', RX.rivaroxaban20, 20, 'QPM', '2020-02-19T10:00:00-05:00', NVAF, { requester: LIN }),
      medication(P, 'mr-t1-1502', RX.amlodipine, 5, 'QD', '2010-07-01T10:00:00-04:00', 'Hypertension'),
    ];
  },
  // outside_scr_umol: Dorothy Ashworth, 83, 68 kg. The clinic's SCr 1.28 (August); the St. Brigid
  // cardiology clinic's 150 umol/L (October) is newer: 1.70 mg/dL. Age and SCr: 2.5 mg.
  'pt-0040': () => {
    const P = 'pt-0040';
    return [
      ...lastYear(P, '1625', '2025-08-19', 1.18, 70.2, [RX.apixaban5, 5, 'BID']),
      AF(P, 'cond-t1-1601', '2022-08-30T10:00:00-04:00'),
      condition(P, 'cond-t1-1602', '84114007', 'Heart failure (disorder)', '2024-03-05T10:00:00-05:00'),
      encounter(P, 'enc-t1-1601', 'AMB', CHECKUP, '2026-08-11T09:00:00-04:00', '2026-08-11T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1602', 'AMB', PROBLEM, '2026-10-02T10:00:00-04:00', '2026-10-02T10:20:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1603', 'AMB', PROBLEM, '2026-10-15T14:00:00-04:00', '2026-10-15T14:40:00-04:00', HOSPITAL, null),
      scr(P, 'obs-t1-1601', '2026-08-11T09:15:00-04:00', '2026-08-11T13:25:00-04:00', 1.28, 'enc-t1-1601'),
      weight(P, 'obs-t1-1602', '2026-08-11T09:05:00-04:00', 68.9, 'kg', 'enc-t1-1601'),
      weight(P, 'obs-t1-1603', '2026-10-02T10:05:00-04:00', 68.0, 'kg', 'enc-t1-1602'),
      scrUmol(P, 'obs-t1-1604', '2026-10-15T14:25:00-04:00', '2026-10-15T18:10:00-04:00', 150, 'enc-t1-1603'),
      medication(P, 'mr-t1-1601', RX.apixaban5, 5, 'BID', '2022-08-30T10:00:00-04:00', NVAF, { requester: REYES }),
      medication(P, 'mr-t1-1602', RX.metoprolol, 25, 'QD', '2022-08-30T10:00:00-04:00', 'Atrial fibrillation, rate control'),
      note(P, 'doc-t1-1601', '2026-10-02T10:30:00-04:00', PROGRESS, 'enc-t1-1602', OKAFOR, CLINIC, `Progress note - Riverbend Family Medicine
Ankle swelling for two weeks, mild. Heart failure follow-up arranged with St. Brigid cardiology for 10/15, with labs there.
AF: rate controlled, on apixaban, no bleeding.
Weighed today.

Maya Okafor, MD`),
    ];
  },
  // pgp_cyp3a4_inhibitor: 70, SCr 0.98, 84 kg: no criterion, 5 mg; itraconazole (an outside
  // dermatologist's order) makes it 2.5 mg.
  'pt-0041': () => {
    const P = 'pt-0041';
    return [
      ...lastYear(P, '1725', '2025-08-12', 0.95, 85.1, [RX.apixaban5, 5, 'BID']),
      AF(P, 'cond-t1-1701', '2023-04-25T10:00:00-04:00'),
      condition(P, 'cond-t1-1702', '414941008', 'Onychomycosis due to dermatophyte (disorder)', '2026-09-24T10:00:00-04:00'),
      encounter(P, 'enc-t1-1701', 'AMB', CHECKUP, '2026-08-19T09:00:00-04:00', '2026-08-19T09:30:00-04:00', CLINIC),
      encounter(P, 'enc-t1-1702', 'AMB', PROBLEM, '2026-10-06T11:00:00-04:00', '2026-10-06T11:30:00-04:00', HOSPITAL, SORENSEN),
      weight(P, 'obs-t1-1701', '2026-08-19T09:05:00-04:00', 84.0, 'kg', 'enc-t1-1701'),
      scr(P, 'obs-t1-1702', '2026-08-19T09:15:00-04:00', '2026-08-19T13:05:00-04:00', 0.98, 'enc-t1-1701'),
      medication(P, 'mr-t1-1701', RX.apixaban5, 5, 'BID', '2023-04-25T10:00:00-04:00', NVAF, { requester: LIN }),
      medication(P, 'mr-t1-1702', RX.lisinopril, 10, 'QD', '2019-01-15T10:00:00-05:00', 'Hypertension', { requester: REYES }),
      medication(P, 'mr-t1-1703', RX.itraconazole, 200, 'QD', '2026-10-06T11:20:00-04:00', 'Onychomycosis of toenails, 12 weeks', { requester: SORENSEN }),
    ];
  },
  // filler: Marjorie Pellegrino, 75, 71 kg, SCr 0.92: CrCl 59.2 (x 0.85): 20 mg is right.
  'pt-0043': () => {
    const P = 'pt-0043';
    return [
      ...lastYear(P, '1825', '2025-10-03', 0.9, 71.8, [RX.rivaroxaban20, 20, 'QPM']),
      AF(P, 'cond-t1-1801', '2021-03-16T10:00:00-04:00'),
      condition(P, 'cond-t1-1802', '38341003', 'Hypertensive disorder, systemic arterial (disorder)', '2015-05-20T10:00:00-04:00'),
      encounter(P, 'enc-t1-1801', 'AMB', CHECKUP, '2026-10-07T09:00:00-04:00', '2026-10-07T09:30:00-04:00', CLINIC),
      weight(P, 'obs-t1-1801', '2026-10-07T09:05:00-04:00', 71.0, 'kg', 'enc-t1-1801'),
      scr(P, 'obs-t1-1802', '2026-10-07T09:15:00-04:00', '2026-10-07T13:15:00-04:00', 0.92, 'enc-t1-1801'),
      medication(P, 'mr-t1-1801', RX.rivaroxaban20, 20, 'QPM', '2021-03-16T10:00:00-04:00', NVAF, { requester: REYES }),
      medication(P, 'mr-t1-1802', RX.lisinopril, 10, 'QD', '2015-05-20T10:00:00-04:00', 'Hypertension'),
    ];
  },
  // pgp_cyp3a4_inhibitor: Gregory Lindahl, 66, SCr 1.02, 78 kg: no criterion, 5 mg; his HIV regimen
  // (darunavir boosted with ritonavir), prescribed by St. Brigid's infectious disease clinic and on
  // no clinic order, is in that clinic's September letter: 2.5 mg.
  'pt-0045': (mrn) => {
    const P = 'pt-0045';
    return [
      ...lastYear(P, '1925', '2025-09-10', 0.98, 77.2, null),
      AF(P, 'cond-t1-1901', '2026-10-02T10:00:00-04:00'),
      condition(P, 'cond-t1-1902', '86406008', 'Human immunodeficiency virus infection (disorder)', '2009-05-14T10:00:00-04:00'),
      // The October note scores CHA2DS2-VASc with a hypertension history (verifier-W1-probe-T1-clinical-1 F3, rulings R8).
      condition(P, 'cond-t1-1903', '38341003', 'Hypertensive disorder, systemic arterial (disorder)', '2018-04-10T10:00:00-04:00'),
      encounter(P, 'enc-t1-1901', 'AMB', PROBLEM, '2026-09-17T14:00:00-04:00', '2026-09-17T14:40:00-04:00', HOSPITAL, VARGA),
      encounter(P, 'enc-t1-1902', 'AMB', PROBLEM, '2026-10-02T10:00:00-04:00', '2026-10-02T10:30:00-04:00', CLINIC),
      weight(P, 'obs-t1-1901', '2026-10-02T10:05:00-04:00', 78.0, 'kg', 'enc-t1-1902'),
      scr(P, 'obs-t1-1902', '2026-10-02T10:15:00-04:00', '2026-10-02T14:30:00-04:00', 1.02, 'enc-t1-1902'),
      medication(P, 'mr-t1-1901', RX.apixaban5, 5, 'BID', '2026-10-02T10:30:00-04:00', NVAF),
      note(P, 'doc-t1-1901', '2026-09-18T09:00:00-04:00', CONSULT, 'enc-t1-1901', VARGA, HOSPITAL, `St. Brigid Regional - Infectious Disease Clinic Letter
Patient: Gregory Lindahl   MRN ${mrn}
Date: 2026-09-18
To: Maya Okafor, MD, Riverbend Family Medicine

Seen for HIV care. Viral load undetectable, CD4 612. Adherent; no missed doses.

Current antiretroviral regimen (prescribed and dispensed through our clinic):
- darunavir 800 mg by mouth once daily
- ritonavir 100 mg by mouth once daily
- emtricitabine 200 mg / tenofovir alafenamide 25 mg by mouth once daily

Please check with us before starting new medicines; his regimen has many interactions.
Review here in 6 months.

Tomas Varga, MD
Infectious Disease`),
      note(P, 'doc-t1-1902', '2026-10-02T10:40:00-04:00', PROGRESS, 'enc-t1-1902', OKAFOR, CLINIC, `Progress note - Riverbend Family Medicine
Palpitations for a week. ECG today: atrial fibrillation, rate 96. Echo: structurally normal valves.
CHA2DS2-VASc 2 (age, hypertension history). Started anticoagulation; reviewed bleeding risk.
HIV: followed at St. Brigid infectious disease.

Maya Okafor, MD`),
    ];
  },
};

// Charts whose generated results name no visit (Synthea kept pt-0040's results, not their visits):
// the planted results there name none either.
const NO_VISIT_RESULTS = new Set(['pt-0040']);
const withoutVisit = (r: Resource): Resource => {
  if (r.resourceType !== 'Observation') return r;
  const { encounter: _drop, ...rest } = r;
  return rest as Resource;
};

// Extra base resources to remove: a duplicate statin order on pt-0003; the lone generated order on
// pt-0039 (monthly B12 injections) and pt-0045 (an old ibuprofen course), whose timing has none of
// the fields the world profile gives every planted order, so each would single the planted orders
// out within its chart (scripts/test/world-tells.test.ts); those two charts' orders are all
// planted, a named residual like the other charts with no generated resource of a type.
const EXTRA_REMOVE: Record<string, string[]> = { 'pt-0003': ['MedicationRequest/mr-00034'], 'pt-0039': ['MedicationRequest/mr-00317'], 'pt-0045': ['MedicationRequest/mr-00346'] };

const overlay: Overlay = {
  task: 'T1',
  names: {
    'grp-t1-doac': 'grp-doac-review',
    'pr-t1-derm': 'pr-sorensen',
    'pr-t1-id': 'pr-varga',
    'pr-t1-lindqvist': 'pr-lindqvist',
    'pr-t1-raman': 'pr-raman',
  },
  build(world: WorldReader) {
    const put: Resource[] = [GROUP, ATTENDING, PHARMACIST, DERMATOLOGIST, ID_PHYSICIAN];
    const remove: Array<{ resourceType: string; id: string }> = [];
    for (const pt of PANEL) {
      const patient = world.get('Patient', pt) as Extract<Resource, { resourceType: 'Patient' }>;
      const who = PEOPLE[pt]!;
      put.push({ ...patient, name: [{ use: 'official', family: who.family, given: who.given, prefix: [who.prefix] }], ...(who.birthDate ? { birthDate: who.birthDate } : {}) });
      const curated = curate(world, pt, EXTRA_REMOVE[pt] ?? []);
      const chart = CHARTS[pt]!(mrnOf(patient)!);
      put.push(...curated.put, ...(NO_VISIT_RESULTS.has(pt) ? chart.map(withoutVisit) : chart));
      remove.push(...curated.remove);
    }
    return {
      put,
      remove,
      lint: {
        thresholds: [
          { quantity: 'weight', threshold: 60, observation: 'obs-t1-1103' },
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t1-1105' },
          { quantity: 'weight', threshold: 60, observation: 'obs-t1-wt-1020' },
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t1-scr-1020' },
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t1-1604' },
          { quantity: 'weight', threshold: 60, observation: 'obs-t1-1603' },
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t1-1702' },
          { quantity: 'weight', threshold: 60, observation: 'obs-t1-1701' },
          { quantity: 'scr', threshold: 1.5, observation: 'obs-t1-1902' },
          { quantity: 'weight', threshold: 60, observation: 'obs-t1-1901' },
          { quantity: 'crcl', threshold: 50, value: 44.2, label: 'CrCl of pt-0003 from obs-t1-1302 and obs-t1-1304' },
          { quantity: 'crcl', threshold: 50, value: 56.1, label: 'CrCl of pt-0038 from obs-t1-1405 and obs-t1-1404' },
          { quantity: 'crcl', threshold: 50, value: 44.0, label: 'CrCl of pt-0039 from obs-t1-1504 and obs-t1-1503' },
          { quantity: 'crcl', threshold: 50, value: 59.2, label: 'CrCl of pt-0043 from obs-t1-1802 and obs-t1-1801' },
        ],
        ages: [
          { patient: 'pt-0001', threshold: 80 },
          { patient: 'pt-0002', threshold: 80 },
          { patient: 'pt-0040', threshold: 80 },
          { patient: 'pt-0041', threshold: 80 },
          { patient: 'pt-0045', threshold: 80 },
        ],
        leakage: { answers: ['44.2', '56.1', '43.9', '59.2', '1.70', '1.81'], distractors: ['doc-t1-dc-0212', 'doc-t1-1401', 'obs-t1-1505', 'obs-t1-wt-0210'] },
      },
    };
  },
};

export default overlay;
