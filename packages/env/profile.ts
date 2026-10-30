// One record shape and one set of value forms for the whole world (builder-196, builder-203;
// verifier P17i W0 S2 and W0-1b F1, F4, F5). The overlays write resources in the write tools' EHR
// shape and on the clinic's clock (docStatus, dosage route and timing code, doses in mg, lab
// reference ranges and flags, times to the minute), and the Synthea cohort writes neither, so
// before these passes a reader could tell a planted record by its fields or the form of a value.
// fixtures:build runs four passes so that no field path and no value form appears only on planted
// resources, in the world or within one task chart (scripts/test/world-tells.test.ts):
//
//   syntheaForms   on every resource an overlay writes, before the world is numbered: times in
//                  Synthea's form (seconds, and milliseconds on the fields Synthea stamps with them).
//   profileBase    on the base cohort, before the overlays, keyed by base id, patients no task owns
//                  only. The resources and statuses a chart has now and then that a task patient's
//                  chart must not gain: a signed addendum, an NKDA entry, a radiology report, a lab
//                  panel filed with its values as components, an entry marked entered in error, a
//                  critical point-of-care glucose, a weight in pounds, a stopped or held order.
//   profileWorld   on every resource after the overlays: the fields an EHR records on every record of
//                  a type, derived from the record itself (coding displays, docStatus, the IHE format
//                  code, the note's period, encounter roles and discharge disposition, problem-list
//                  category, recorder and performer, lab reference ranges and flags, report category,
//                  a dosage on every order with route, timing, dose (in mg where the tablet's strength
//                  says so), sig text and coded indication, a dispense request on active orders,
//                  reaction severity). A field already present is never changed, except that a
//                  reaction of anaphylaxis or angioedema makes the allergy high criticality and a
//                  problem still open moves to the problem list.
//   profileRecords on every generated resource after profileWorld, in every chart alike: the
//                  occasional fields (a lab comment, a method, a report conclusion or rendered text,
//                  a note's signer, a renewal chain, an allergy onset, a procedure outcome, a note
//                  filed without its visit, ...) at one rate for every patient. In a task chart it
//                  leaves alone a record that shares a code with a planted one or that a planted one
//                  references, and then gives the chart's generated records any such field a planted
//                  record of their type carries and none of them does yet (a top-up). Each field is
//                  clinically neutral: none states a fact a task decides on, and none adds a resource.
//
// Selection is a hash of the base id, so the same resources are chosen on every build.
import type { Resource } from './store.ts';
import { eastern, NOW_MS } from './clock.ts';
import { CLINIC } from './world.ts';

type Json = Record<string, unknown>;
type Ref = { reference?: string };

const UCUM = 'http://unitsofmeasure.org';
const SNOMED = 'http://snomed.info/sct';
const LOINC = 'http://loinc.org';
const INTERP = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
const V2_0074 = 'http://terminology.hl7.org/CodeSystem/v2-0074';
const CONDITION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/condition-category';
const IHE_FORMAT = { system: 'http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode', code: 'urn:ihe:iti:xds:2017:mimeTypeSufficient', display: 'mimeType Sufficient' };
const HOME = { coding: [{ system: 'http://www.nubc.org/patient-discharge', code: '01', display: 'Discharged to home care or self care (routine discharge)' }], text: 'Discharged to home care or self care (routine discharge)' };
const PPRF = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF', display: 'primary performer' }], text: 'primary performer' }];
const ORDERED = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/dose-rate-type', code: 'ordered', display: 'Ordered' }] };
const CLASS_DISPLAY: Readonly<Record<string, string>> = { AMB: 'ambulatory', IMP: 'inpatient encounter', EMER: 'emergency', VR: 'virtual', HH: 'home health' };
const STATUS_DISPLAY: Readonly<Record<string, string>> = {
  active: 'Active', inactive: 'Inactive', resolved: 'Resolved', confirmed: 'Confirmed', unconfirmed: 'Unconfirmed', refuted: 'Refuted', 'entered-in-error': 'Entered in Error',
};
const CATEGORY_DISPLAY: Readonly<Record<string, string>> = { 'problem-list-item': 'Problem List Item', 'encounter-diagnosis': 'Encounter Diagnosis', 'health-concern': 'Health Concern' };
const INTERP_DISPLAY: Readonly<Record<string, string>> = { H: 'High', L: 'Low', N: 'Normal', HH: 'Critical high', LL: 'Critical low' };

// Adult reference ranges by LOINC code and unit, as a clinic laboratory reports them.
const RANGES: Readonly<Record<string, readonly [number, number, string]>> = {
  '2160-0': [0.74, 1.35, 'mg/dL'], '38483-4': [0.74, 1.35, 'mg/dL'],
  '2823-3': [3.5, 5.1, 'mmol/L'], '6298-4': [3.5, 5.1, 'mmol/L'],
  '2951-2': [135, 145, 'mmol/L'], '2947-0': [135, 145, 'mmol/L'],
  '2075-0': [98, 107, 'mmol/L'], '2069-3': [98, 107, 'mmol/L'],
  '2028-9': [22, 29, 'mmol/L'], '20565-8': [22, 29, 'mmol/L'],
  '3094-0': [7, 20, 'mg/dL'], '6299-2': [7, 20, 'mg/dL'],
  '2345-7': [70, 99, 'mg/dL'], '2339-0': [70, 99, 'mg/dL'],
  '17861-6': [8.6, 10.3, 'mg/dL'], '49765-1': [8.6, 10.3, 'mg/dL'],
  '4548-4': [4, 5.6, '%'],
  '2093-3': [100, 199, 'mg/dL'], '2085-9': [40, 100, 'mg/dL'], '18262-6': [0, 99, 'mg/dL'], '2571-8': [0, 149, 'mg/dL'],
  '718-7': [12, 17.5, 'g/dL'], '4544-3': [36, 50, '%'], '6690-2': [4, 11, '10*3/uL'], '789-8': [4.2, 5.9, '10*6/uL'],
  '777-3': [150, 400, '10*3/uL'], '785-6': [27, 33, 'pg'], '786-4': [32, 36, 'g/dL'], '787-2': [80, 100, 'fL'],
  '1742-6': [7, 56, 'U/L'], '1920-8': [10, 40, 'U/L'], '6768-6': [44, 147, 'U/L'], '1975-2': [0.1, 1.2, 'mg/dL'],
  '1751-7': [3.4, 5.4, 'g/dL'], '2885-2': [6, 8.3, 'g/dL'], '3016-3': [0.4, 4, 'm[IU]/L'], '19123-9': [1.7, 2.2, 'mg/dL'],
  '2777-1': [2.5, 4.5, 'mg/dL'], '6301-6': [0.8, 1.1, '{INR}'], '5902-2': [11, 13.5, 's'], '3173-2': [25, 35, 's'],
};

// What a drug is ordered for, as a problem's text: an order's coded reason comes from the chart.
const INDICATIONS: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/acetaminophen|ibuprofen|naproxen|hydrocodone|oxycodone|meperidine|tramadol|codeine/i, /pain|sprain|injury|laceration|fracture|fibromyalgia/i],
  [/amoxicillin|penicillin|sulfamethoxazole|cef[a-z]+|azithromycin|doxycycline|ciprofloxacin/i, /sinusitis|pharyngitis|sore throat|otitis|bronchitis|pneumonia|cystitis|infection/i],
  [/statin\b/i, /hyperlipidemia|hypertriglyceridemia/i],
  [/amlodipine|lisinopril|hydrochlorothiazide|metoprolol|ramipril|carvedilol/i, /hypertension/i],
  [/clopidogrel|prasugrel|nitroglycerin|aspirin 81/i, /coronary|myocardial|angina|ischemic heart/i],
  [/metformin|insulin/i, /diabetes/i],
  [/albuterol|fluticasone/i, /asthma|bronchitis|emphysema|obstructive/i],
  [/ferrous sulfate|vitamin b12/i, /anemia/i],
  [/fexofenadine|cetirizine|loratadine|chlorpheniramine|diphenhydramine/i, /rhinitis|allerg/i],
  [/epinephrine/i, /allerg|anaphyla/i],
  [/enoxaparin|warfarin|apixaban|rivaroxaban/i, /embolism|thrombosis|atrial fibrillation/i],
  [/alendron/i, /osteoporosis/i],
  [/sertraline/i, /depress|anxiety/i],
];

// The sig an order Synthea wrote without a dosage was sent with, by drug.
type Repeat = { frequency: number; period: number; periodUnit: string; when?: string[] };
const QD: Repeat = { frequency: 1, period: 1, periodUnit: 'd' };
const BID: Repeat = { frequency: 2, period: 1, periodUnit: 'd' };
const QID: Repeat = { frequency: 4, period: 1, periodUnit: 'd' };
const SIGS: ReadonlyArray<{ drug: RegExp; text: string; repeat?: Repeat; dose?: number; prn?: boolean }> = [
  { drug: /^acetaminophen \d+ MG oral tablet/i, text: '2 tablets by mouth at bedtime as needed for pain', repeat: { ...QD, when: ['HS'] }, dose: 2, prn: true },
  { drug: /nitroglycerin.*spray/i, text: '1 spray under the tongue every 5 minutes as needed for chest pain, up to 3 doses', prn: true },
  { drug: /simvastatin|atorvastatin/i, text: '1 tablet by mouth at bedtime', repeat: { ...QD, when: ['HS'] }, dose: 1 },
  { drug: /metoprolol succinate|clopidogrel|aspirin 81|ferrous sulfate|prasugrel|alendron|sertraline/i, text: '1 tablet by mouth once daily', repeat: QD, dose: 1 },
  { drug: /metformin/i, text: '1 tablet by mouth once daily with the evening meal', repeat: QD, dose: 1 },
  { drug: /naproxen|ibuprofen/i, text: '1 tablet by mouth every 12 hours as needed for pain', repeat: { frequency: 1, period: 12, periodUnit: 'h' }, dose: 1, prn: true },
  { drug: /fluticasone.*salmeterol/i, text: '1 inhalation twice daily; rinse mouth after use', repeat: BID, dose: 1 },
  { drug: /insulin/i, text: 'Inject under the skin twice daily before breakfast and supper, dose as directed', repeat: BID },
  { drug: /vitamin b12.*inject/i, text: '1 mL into the muscle once a month', repeat: { frequency: 1, period: 1, periodUnit: 'mo' }, dose: 1 },
  { drug: /medroxyprogesterone/i, text: '1 mL (150 mg) into the muscle every 3 months', repeat: { frequency: 1, period: 3, periodUnit: 'mo' }, dose: 1 },
  { drug: /penicillin v/i, text: '1 tablet by mouth four times daily for 10 days', repeat: QID, dose: 1 },
  { drug: /amoxicillin|doxycycline|cephalexin|ciprofloxacin/i, text: '1 tablet by mouth twice daily for 10 days', repeat: BID, dose: 1 },
  { drug: /\bpack\b/i, text: '1 tablet by mouth daily', repeat: QD, dose: 1 },
  { drug: /dextromethorphan|chlorpheniramine/i, text: '10 mL by mouth every 6 hours as needed for cough', repeat: { frequency: 1, period: 6, periodUnit: 'h' }, prn: true },
  { drug: /tropicamide|atropine.*ophthalmic/i, text: '1 drop in each eye before the eye examination' },
  { drug: /implant|intrauterine|vaginal system/i, text: 'Placed in the office.' },
  { drug: /isoflurane|rocuronium|midazolam|alfentanil|sufentanil|diazepam|alteplase|heparin|sodium chloride|enoxaparin/i, text: 'Given during the hospital stay.' },
];

// Why a drug is ordered when the chart names no problem it treats: what the order itself says.
const ORDER_REASONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/statin\b/i, 'Primary prevention of cardiovascular disease'],
  [/metoprolol/i, 'Heart rate control'],
  [/\bpack\b|etonogestrel|levonorgestrel|medroxyprogesterone|nuvaring|norethindrone/i, 'Contraception'],
  [/tropicamide|atropine.*ophthalmic/i, 'Pupil dilation for eye examination'],
  [/nitroglycerin/i, 'Chest pain'],
  [/chlorpheniramine|diphenhydramine/i, 'Allergy symptoms'],
  [/dextromethorphan/i, 'Cough'],
  [/vitamin b12/i, 'Vitamin B12 supplementation'],
  [/ferrous sulfate/i, 'Iron supplementation'],
  [/^aspirin 325/i, 'Pain'],
  [/heparin|enoxaparin/i, 'Prevention of venous thromboembolism'],
  [/rocuronium|midazolam|alfentanil|sufentanil|isoflurane|propofol/i, 'Anesthesia for a procedure'],
];

// When in the day a drug is taken, where the clinic's sig says so: [drug, event code, words].
const WHEN: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/penicillin v/i, 'AC', 'before meals'],
  [/metformin/i, 'CV', 'with the evening meal'],
  [/ibuprofen|naproxen/i, 'C', 'with food'],
  [/amlodipine|lisinopril|hydrochlorothiazide|metoprolol|clopidogrel|aspirin 81/i, 'MORN', 'every morning'],
];

// The route an order's drug form gives: [form, SNOMED code, display, words in a sig].
const ROUTES: ReadonlyArray<readonly [RegExp, string, string, string]> = [
  [/\boral\b|\bpack\b|chewable/i, '26643006', 'Oral route', 'by mouth'],
  [/inhal/i, '447694001', 'Respiratory tract route', 'by inhalation'],
  [/ophthalmic/i, '54485002', 'Ophthalmic route', 'in the eye'],
  [/mucosal spray/i, '37839007', 'Sublingual route', 'under the tongue'],
  [/topical/i, '6064005', 'Topical route', 'to the skin'],
  [/transdermal/i, '45890007', 'Transdermal route', 'on the skin'],
  [/vaginal/i, '16857009', 'Vaginal route', 'vaginally'],
  [/intrauterine/i, '62226000', 'Intrauterine route', 'in the uterus'],
  [/implant/i, '263887005', 'Subdermal route', 'under the skin'],
  [/insulin|enoxaparin|heparin|auto-injector/i, '34206005', 'Subcutaneous route', 'under the skin'],
  [/vitamin b12|medroxyprogesterone/i, '78421000', 'Intramuscular route', 'into the muscle'],
  [/inject/i, '47625008', 'Intravenous route', 'intravenously'],
];

// Comments a laboratory attaches to routine results; none bears on a result's meaning.
const LAB_COMMENTS = ['Specimen received at room temperature.', 'Fasting status not stated on the requisition.', 'Result verified by repeat analysis.', 'Collected at the Riverbend clinic draw station.', 'Specimen collected by venipuncture.', 'Analyzed on the day of collection.'];
// Comments on a vital sign measured at the visit, by kind. Scores and derived values (pain, BMI) get none.
const MEASURED = new Set(['85354-9', '8867-4', '9279-1', '29463-7', '8302-2', '8310-5', '2708-6']);
const VITAL_COMMENTS = ['Measured in clinic.', 'Measured by the medical assistant.', 'Taken at check-in.'];
const BP_COMMENTS = ['Repeated after 5 minutes seated.', 'Left arm, seated.', 'Right arm, seated, adult cuff.'];
const REPORT_REVIEWED = ['Reviewed with the patient at the visit.', 'Discussed with the patient.', 'Reviewed; copy to the patient portal.'];
const WITHIN_RANGE = ['All reported values within the reference range.', 'No result outside the reference range.', 'Results within normal limits.'];
const OUTCOMES = ['Successful', 'Completed without complication', 'Completed as planned'];
const ADDENDA = [
  'Addendum: the plan above was reviewed with the patient by phone; no change.',
  'Addendum: patient called with a question about the plan; questions answered, plan unchanged.',
  'Addendum: patient education handout given at checkout.',
  'Addendum: note signed after review of the visit documentation.',
  'Addendum: follow-up visit scheduled as discussed.',
];
const STOP_REASONS = ['Dose changed', 'Side effect reported by the patient', 'Course completed early', 'Renewed as a new prescription'];
const HOLD_REASONS = ['Held before a scheduled procedure', 'Held while the patient is unwell', 'Held pending laboratory results'];

// FNV-1a over a string, for stable selection.
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const pick = (id: string, salt: string, every: number, of = 1) => fnv(`${salt}:${id}`) % every < of;
const one = <T>(id: string, salt: string, of: readonly T[]): T => of[fnv(`${salt}:${id}`) % of.length]!;

const patientOf = (r: Json): string | undefined => ((r.subject ?? r.patient ?? r.for) as Ref | undefined)?.reference;
const codeOf = (r: Json): string | undefined => (r.code as { coding?: Array<{ code?: string }> } | undefined)?.coding?.[0]?.code;
const categoryOf = (r: Json): string | undefined => (r.category as Array<{ coding?: Array<{ code?: string }> }> | undefined)?.[0]?.coding?.[0]?.code;
const textOf = (cc: unknown): string => {
  const c = cc as { text?: string; coding?: Array<{ display?: string }> } | undefined;
  return c?.text ?? c?.coding?.[0]?.display ?? '';
};
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const day = (iso: string) => iso.slice(0, 10);
const key = (r: Json) => `${r.resourceType as string}/${r.id as string}`;

// A time as Synthea writes it: to the second, the seconds rarely 00, and on the fields Synthea
// stamps that way, to the millisecond. A time the clinic's clock wrote to the minute takes seconds
// (and milliseconds) from a hash of the time itself, so two fields that held the same time still
// do, and a time stays on its minute and never passes NOW.
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export function syntheaTime(v: string, millis: boolean): string {
  const m = STAMP.exec(v);
  if (!m) return v;
  let out = v;
  if (m[2] === '00' && m[3] === undefined) {
    const seconds = `${m[1]}:${String(1 + (fnv(`s:${v}`) % 59)).padStart(2, '0')}${m[4]}`;
    if (Date.parse(seconds) <= NOW_MS) out = seconds;
  }
  if (millis && m[3] === undefined) {
    const at = out.length - m[4]!.length;
    const withMs = `${out.slice(0, at)}.${String(fnv(`ms:${v}`) % 1000).padStart(3, '0')}${out.slice(at)}`;
    if (Date.parse(withMs) <= NOW_MS) out = withMs;
  }
  return out;
}
// The fields Synthea stamps to the millisecond, by type.
const MILLIS: Readonly<Record<string, ReadonlySet<string>>> = {
  Observation: new Set(['issued', 'note.time']),
  DiagnosticReport: new Set(['issued']),
  DocumentReference: new Set(['date']),
};
// The types the Synthea cohort generates; the others (Task, Communication, ...) only overlays write.
const GENERATED = new Set(['Observation', 'DiagnosticReport', 'DocumentReference', 'Encounter', 'Condition', 'Procedure', 'MedicationRequest', 'AllergyIntolerance']);

// Pass 0: Synthea's time forms on a resource an overlay writes.
export function syntheaForms<T extends Resource>(r: T): T {
  if (!GENERATED.has(r.resourceType)) return r;
  const millis = MILLIS[r.resourceType] ?? new Set<string>();
  const walk = (v: unknown, at: string): unknown => {
    if (typeof v === 'string') return syntheaTime(v, millis.has(at));
    if (Array.isArray(v)) return v.map((x) => walk(x, at));
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, at ? `${at}.${k}` : k)]));
    return v;
  };
  return walk(r, '') as T;
}

function rangeOf(r: Json): readonly [number, number, string] | undefined {
  const range = RANGES[codeOf(r) ?? ''];
  const unit = (r.valueQuantity as { unit?: string } | undefined)?.unit;
  return range && range[2] === unit ? range : undefined;
}
const flagOf = (value: number, [low, high]: readonly [number, number, string]) => (value > high ? 'H' : value < low ? 'L' : 'N');
const referenceRange = ([low, high, unit]: readonly [number, number, string]) => [{ low: { value: low, unit, system: UCUM, code: unit }, high: { value: high, unit, system: UCUM, code: unit } }];
// A result's name as a report prints it: the LOINC name before its property, or a short name where
// that alone would mislead (RDW is not 'Erythrocyte').
const SHORT: Readonly<Record<string, string>> = { '788-0': 'RDW', '21000-5': 'RDW', '32207-3': 'Platelet distribution width', '32623-1': 'Mean platelet volume', '33914-3': 'eGFR' };
const labelOf = (o: Json) => SHORT[codeOf(o) ?? ''] ?? textOf(o.code).split(' [')[0]!;
// A laboratory value as a report prints it: two decimals under 3, one under 20, else whole.
const printed = (v: number) => Number(v.toFixed(v < 3 ? 2 : v < 20 ? 1 : 0));

// Pass 1: what only the charts of patients no task owns get: whole resources and status changes.
// New resources take the <prefix>-9<4 digits> ids fixtures:build then numbers with the rest.
export function profileBase(base: readonly Resource[], taskPatients: ReadonlySet<string>): Resource[] {
  const free = (r: Json) => {
    const p = patientOf(r);
    return p !== undefined && p.startsWith('Patient/') && !taskPatients.has(p.slice(8));
  };
  const out = base.map((r) => structuredClone(r) as unknown as Json);
  const byId = new Map(out.map((r) => [key(r), r]));
  const added: Json[] = [];
  const pcp = new Map(out.filter((r) => r.resourceType === 'Patient').map((p) => [`Patient/${p.id as string}`, ((p.generalPractitioner as Ref[] | undefined)?.[0]) ?? { reference: 'Practitioner/pr-okafor' }]));
  const next: Record<string, number> = {};
  const newId = (prefix: string) => `${prefix}-9${String((next[prefix] = (next[prefix] ?? 0) + 1)).padStart(4, '0')}`;
  const diabetic = new Set(out.filter((c) => c.resourceType === 'Condition' && free(c) && /diabetes/i.test(textOf(c.code))).map((c) => patientOf(c)));
  const glucosePatients = new Set<string>();

  for (const r of [...out]) {
    if (!free(r)) continue;
    const id = r.id as string;
    switch (r.resourceType) {
      case 'Observation': {
        const cat = categoryOf(r);
        const value = (r.valueQuantity as { value?: number } | undefined)?.value;
        // A home weight in pounds.
        if (codeOf(r) === '29463-7' && value !== undefined && (r.valueQuantity as { unit?: string }).unit === 'kg' && pick(id, 'pounds', 12)) {
          r.valueQuantity = { value: Number((value * 2.20462).toFixed(1)), unit: 'lb', system: UCUM, code: '[lb_av]' };
        }
        // A result entered in error: filed to the wrong chart and replaced, or entered twice.
        if (cat === 'laboratory' && value !== undefined && pick(id, 'error', 60)) {
          const twice = pick(id, 'twice', 2);
          const shown = twice ? value : printed(value * (fnv(id) % 2 ? 1.18 : 0.84));
          added.push({
            ...structuredClone(r),
            id: newId('obs'),
            status: 'entered-in-error',
            valueQuantity: { ...(r.valueQuantity as Json), value: shown },
            note: [{ time: r.issued, text: twice ? 'Duplicate entry; see the verified result.' : 'Result filed to the wrong patient; removed from this chart.' }],
          });
        }
        // A critical point-of-care glucose, rechecked at the visit.
        const p = patientOf(r)!;
        if ((codeOf(r) === '2339-0' || codeOf(r) === '2345-7') && diabetic.has(p) && !glucosePatients.has(p) && pick(p, 'critical', 2) && r.encounter) {
          glucosePatients.add(p);
          const at = Date.parse(r.effectiveDateTime as string) + 1_200_000;
          if (at < NOW_MS) {
            const v = 400 + (fnv(id) % 80);
            added.push({
              resourceType: 'Observation',
              id: newId('obs'),
              status: 'final',
              category: r.category,
              code: { coding: [{ system: LOINC, code: '2339-0', display: 'Glucose [Mass/volume] in Blood' }], text: 'Glucose [Mass/volume] in Blood' },
              subject: r.subject,
              encounter: r.encounter,
              effectiveDateTime: eastern(at),
              issued: syntheaTime(eastern(at + 60_000), true),
              valueQuantity: { value: v, unit: 'mg/dL', system: UCUM, code: 'mg/dL' },
              interpretation: [{ coding: [{ system: INTERP, code: 'HH', display: 'Critical high' }] }],
              method: { text: 'Point-of-care' },
              note: [{ time: syntheaTime(eastern(at + 60_000), true), text: 'Critical value read back to the clinician.' }],
            });
          }
        }
        break;
      }
      case 'DiagnosticReport': {
        // The panel as one Observation with its values as components, as some interfaces file it.
        if (!/metabolic (2000 )?panel/i.test(textOf(r.code)) || !pick(id, 'panel', 2)) break;
        const parts = ((r.result as Ref[] | undefined) ?? []).flatMap((ref) => {
          const o = byId.get(ref.reference ?? '');
          const q = o?.valueQuantity as { value?: number; unit?: string; code?: string } | undefined;
          return o && q?.value !== undefined ? [{ code: o.code, valueQuantity: { value: printed(q.value), unit: q.unit, system: UCUM, code: q.code ?? q.unit } }] : [];
        });
        if (parts.length)
          added.push({ resourceType: 'Observation', id: newId('obs'), status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }], code: r.code, subject: r.subject, ...(r.encounter ? { encounter: r.encounter } : {}), effectiveDateTime: r.effectiveDateTime, issued: r.issued, component: parts });
        break;
      }
      case 'Procedure': {
        // A chest film read by radiology.
        if (codeOf(r) !== '399208008') break;
        const start = (r.performedPeriod as { start?: string } | undefined)?.start;
        if (!start) break;
        const issued = Date.parse(start) + 5_400_000 + (fnv(id) % 3_600_000);
        if (issued >= NOW_MS) break;
        const [findings, impression] = one(id, 'cxr', [
          ['Lungs are clear. Heart size is normal. No pleural effusion or pneumothorax.', 'No acute cardiopulmonary process.'],
          ['No focal consolidation. Cardiomediastinal silhouette within normal limits. Bones unremarkable.', 'Normal chest radiograph.'],
          ['Mild hyperinflation. No infiltrate, effusion or pneumothorax.', 'No acute findings. Mild hyperinflation.'],
        ] as const);
        added.push({
          resourceType: 'DiagnosticReport',
          id: newId('dr'),
          status: 'final',
          category: [{ coding: [{ system: V2_0074, code: 'RAD', display: 'Radiology' }] }],
          code: { coding: [{ system: LOINC, code: '36643-5', display: 'XR Chest 2 Views' }], text: 'XR Chest 2 Views' },
          subject: r.subject,
          ...(r.encounter ? { encounter: r.encounter } : {}),
          effectiveDateTime: start,
          issued: syntheaTime(eastern(issued), true),
          performer: [{ reference: `Organization/${CLINIC}` }],
          ...(pick(id, 'impression', 2) ? { conclusion: impression } : {}),
          presentedForm: [{ contentType: 'text/plain; charset=utf-8', data: b64(`XR CHEST 2 VIEWS\n\nFindings: ${findings}\n\nImpression: ${impression}\n`) }],
        });
        break;
      }
      case 'MedicationRequest': {
        if (r.status === 'completed' && pick(id, 'stopped', 10)) {
          r.status = 'stopped';
          r.statusReason = { text: one(id, 'why', STOP_REASONS) };
        } else if (r.status === 'active' && pick(id, 'hold', 8)) {
          r.status = 'on-hold';
          r.statusReason = { text: one(id, 'why', HOLD_REASONS) };
        }
        break;
      }
      case 'AllergyIntolerance': {
        // An onset the patient gave as a year or a month.
        if (r.onsetDateTime === undefined && typeof r.recordedDate === 'string' && pick(id, 'onset-partial', 3)) r.onsetDateTime = (r.recordedDate as string).slice(0, pick(id, 'onset-year', 2) ? 4 : 7);
        break;
      }
      case 'DocumentReference': {
        const when = Date.parse(r.date as string) + 3_600_000 + (fnv(id) % 86_400_000);
        if (pick(id, 'addendum', 25) && (r.author as Ref[] | undefined)?.length && when < NOW_MS) {
          const at = syntheaTime(eastern(when), true);
          const text = `\n${day(at)}\n\n${one(id, 'addendum-text', ADDENDA)}\n`;
          added.push({
            resourceType: 'DocumentReference',
            id: newId('doc'),
            status: 'current',
            type: r.type,
            category: r.category,
            subject: r.subject,
            date: at,
            author: r.author,
            authenticator: (r.author as Ref[])[0],
            custodian: r.custodian,
            description: 'Signed addendum',
            relatesTo: [{ code: 'appends', target: { reference: `DocumentReference/${id}` } }],
            content: [{ attachment: { contentType: 'text/plain; charset=utf-8', data: b64(text) } }],
            ...(r.context ? { context: r.context } : {}),
          });
        }
        break;
      }
    }
  }

  // A housing status from the yearly social needs screen, answered from the LOINC list.
  for (const p of out.filter((r) => r.resourceType === 'Patient' && !taskPatients.has(r.id as string) && pick(r.id as string, 'housing', 3))) {
    const ref = `Patient/${p.id as string}`;
    const visit = out.filter((r) => r.resourceType === 'Encounter' && patientOf(r) === ref && (r.class as { code?: string }).code === 'AMB').sort((a, b) => ((a.period as { start: string }).start < (b.period as { start: string }).start ? 1 : -1))[0];
    if (!visit) continue;
    const at = (visit.period as { start: string }).start;
    added.push({
      resourceType: 'Observation',
      id: newId('obs'),
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'social-history', display: 'Social history' }] }],
      code: { coding: [{ system: LOINC, code: '71802-3', display: 'Housing status' }], text: 'Housing status' },
      subject: { reference: ref },
      encounter: { reference: `Encounter/${visit.id as string}` },
      effectiveDateTime: at,
      issued: syntheaTime(at, true),
      performer: [pcp.get(ref)],
      valueCodeableConcept: { coding: [{ system: LOINC, code: 'LA18839-3', display: 'Patient lives in own home' }], text: 'Patient lives in own home' },
    });
  }

  // An NKDA entry for some patients whose chart lists no medication allergy.
  const withDrugAllergy = new Set(out.filter((r) => r.resourceType === 'AllergyIntolerance' && (r.category as string[] | undefined)?.includes('medication')).map((r) => patientOf(r)));
  for (const p of out.filter((r) => r.resourceType === 'Patient')) {
    const ref = `Patient/${p.id as string}`;
    if (taskPatients.has(p.id as string) || withDrugAllergy.has(ref) || !pick(p.id as string, 'nkda', 3)) continue;
    const first = out.filter((r) => r.resourceType === 'Encounter' && patientOf(r) === ref).map((e) => (e.period as { start?: string } | undefined)?.start ?? '').sort()[0];
    if (!first) continue;
    added.push({
      resourceType: 'AllergyIntolerance',
      id: newId('alg'),
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
      verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
      category: ['medication'],
      code: { coding: [{ system: SNOMED, code: '409137002', display: 'No known drug allergy (situation)' }], text: 'No known drug allergy' },
      patient: { reference: ref },
      recordedDate: first,
      recorder: pcp.get(ref),
    });
  }
  return [...out, ...added] as unknown as Resource[];
}

// Pass 2: the fields every record of a type carries, derived from the record, on every resource.
export function profileWorld(resources: readonly Resource[]): Resource[] {
  const out = resources.map((r) => structuredClone(r) as unknown as Json);
  const byId = new Map(out.map((r) => [key(r), r]));
  const pcp = (r: Json): Ref | undefined => {
    const p = byId.get(patientOf(r) ?? '');
    return (p?.generalPractitioner as Ref[] | undefined)?.[0];
  };
  const displays = (cc: unknown, table: Readonly<Record<string, string>>) => {
    for (const c of (cc as { coding?: Array<{ code?: string; display?: string }> } | undefined)?.coding ?? []) {
      const d = c.code === undefined ? undefined : table[c.code];
      if (c.display === undefined && d !== undefined) c.display = d;
    }
  };
  const clinician = (r: Json): Ref | undefined => {
    const enc = byId.get((r.encounter as Ref | undefined)?.reference ?? '');
    return (enc?.participant as Array<{ individual?: Ref }> | undefined)?.[0]?.individual ?? pcp(r);
  };
  const problems = new Map<string, Json[]>();
  for (const c of out) if (c.resourceType === 'Condition') problems.set(patientOf(c) ?? '', [...(problems.get(patientOf(c) ?? '') ?? []), c]);
  // The patient's latest problem, onset on or before the order, that the drug treats (INDICATIONS).
  const indication = (mr: Json): Json | undefined => {
    const drug = textOf(mr.medicationCodeableConcept);
    const treats = INDICATIONS.find(([d]) => d.test(drug))?.[1];
    if (!treats) return undefined;
    return (problems.get(patientOf(mr) ?? '') ?? [])
      .filter((c) => treats.test(textOf(c.code)) && ((c.onsetDateTime as string | undefined) ?? '') <= ((mr.authoredOn as string | undefined) ?? ''))
      .sort((a, b) => ((a.onsetDateTime as string) < (b.onsetDateTime as string) ? 1 : -1))[0];
  };

  for (const r of out) {
    switch (r.resourceType) {
      case 'DocumentReference': {
        r.docStatus ??= 'final';
        const type = r.type as { text?: string; coding?: Array<{ display?: string }> };
        if (type.text === undefined && type.coding?.[0]?.display) type.text = type.coding[0].display;
        for (const c of r.content as Array<{ format?: unknown }>) c.format ??= { ...IHE_FORMAT };
        // The note's period: its visit's when it has one, else the time it was written.
        const ctx = (r.context ??= {}) as { encounter?: Ref; period?: { start?: string | undefined; end?: string | undefined } };
        const visit = (byId.get(ctx.encounter?.reference ?? '')?.period as { start?: string; end?: string } | undefined) ?? {};
        ctx.period ??= { start: visit.start ?? (r.date as string).replace(/\.\d+/, '') };
        ctx.period.end ??= visit.end ?? ctx.period.start;
        break;
      }
      case 'Encounter': {
        const cls = r.class as { code?: string; display?: string };
        const shown = cls.code === undefined ? undefined : CLASS_DISPLAY[cls.code];
        if (cls.display === undefined && shown !== undefined) cls.display = shown;
        for (const p of (r.participant as Json[] | undefined) ?? []) {
          p.type ??= structuredClone(PPRF);
          p.period ??= { ...(r.period as Json) };
        }
        for (const c of (r.reasonCode as Array<{ text?: string; coding?: Array<{ display?: string }> }> | undefined) ?? []) if (c.text === undefined && c.coding?.[0]?.display) c.text = c.coding[0].display;
        // A finished visit records where the patient went, as a claim's patient status does.
        if (r.status === 'finished' && r.hospitalization === undefined) r.hospitalization = { dischargeDisposition: structuredClone(HOME) };
        break;
      }
      case 'AllergyIntolerance': {
        displays(r.clinicalStatus, STATUS_DISPLAY);
        displays(r.verificationStatus, STATUS_DISPLAY);
        if (r.recorder === undefined && pcp(r)) r.recorder = pcp(r);
        // A reaction's severity from what it was: airway or circulation severe, breathing or hives
        // moderate, the rest mild; an allergy that caused anaphylaxis or angioedema is high criticality.
        let grave = false;
        for (const x of (r.reaction as Array<{ manifestation?: unknown[]; severity?: string }> | undefined) ?? []) {
          const what = (x.manifestation ?? []).map(textOf).join(' ');
          if (/anaphyla|angioedema/i.test(what)) grave = true;
          x.severity ??= /anaphyla|angioedema/i.test(what) ? 'severe' : /dyspnea|wheal|wheez|urticaria|vomiting/i.test(what) ? 'moderate' : 'mild';
        }
        if (grave) r.criticality = 'high';
        break;
      }
      case 'Condition':
        displays(r.clinicalStatus, STATUS_DISPLAY);
        displays(r.verificationStatus, STATUS_DISPLAY);
        // A problem still open is kept on the problem list; a resolved one stays a visit diagnosis.
        if (r.abatementDateTime === undefined && (r.clinicalStatus as { coding?: Array<{ code?: string }> } | undefined)?.coding?.[0]?.code === 'active') {
          for (const c of (r.category as Array<{ coding?: Array<{ system?: string; code?: string; display?: string }> }> | undefined) ?? []) {
            for (const x of c.coding ?? []) if (x.system === CONDITION_CATEGORY && x.code === 'encounter-diagnosis') Object.assign(x, { code: 'problem-list-item', display: CATEGORY_DISPLAY['problem-list-item'] });
          }
        }
        for (const c of (r.category as unknown[] | undefined) ?? []) displays(c, CATEGORY_DISPLAY);
        if (r.recorder === undefined && pcp(r)) r.recorder = pcp(r);
        break;
      case 'Observation': {
        const cat = categoryOf(r);
        if (r.performer === undefined) {
          const who = cat === 'laboratory' ? { reference: `Organization/${CLINIC}` } : clinician(r);
          if (who) r.performer = [who];
        }
        const range = cat === 'laboratory' ? rangeOf(r) : undefined;
        const value = (r.valueQuantity as { value?: number } | undefined)?.value;
        if (range && value !== undefined && r.referenceRange === undefined) {
          r.referenceRange = referenceRange(range);
          const flag = flagOf(value, range);
          if (r.interpretation === undefined && (flag !== 'N' || pick(r.id as string, 'normal', 2))) r.interpretation = [{ coding: [{ system: INTERP, code: flag, display: INTERP_DISPLAY[flag] }] }];
        }
        break;
      }
      case 'DiagnosticReport': {
        // A questionnaire's report is filed under Other, by the clinician who gave it.
        r.category ??= [{ coding: [{ system: V2_0074, code: 'OTH', display: 'Other' }] }];
        if (r.performer === undefined) {
          const who = clinician(r);
          if (who) r.performer = [who];
        }
        break;
      }
      case 'Procedure': {
        if (r.performer === undefined) {
          const enc = byId.get((r.encounter as Ref | undefined)?.reference ?? '');
          r.performer = [{ actor: (enc?.serviceProvider as Ref | undefined) ?? { reference: `Organization/${CLINIC}` } }];
        }
        break;
      }
      case 'MedicationRequest': {
        r.category ??= [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category', code: 'community', display: 'Community' }], text: 'Community' }];
        const drug = textOf(r.medicationCodeableConcept);
        const form = /\b(tablet|capsule)\b/i.exec(drug)?.[1]?.toLowerCase();
        // The strength of a single-drug tablet or capsule, so its dose reads in mg.
        const mg = !drug.includes('/') && (drug.match(/\d+(?:\.\d+)? MG\b/g) ?? []).length === 1 && form ? Number(/(\d+(?:\.\d+)?) MG\b/.exec(drug)![1]) : undefined;
        const route = ROUTES.find(([f]) => f.test(drug));
        // An order Synthea wrote without a dosage was sent with a sig all the same.
        if (!(r.dosageInstruction as unknown[] | undefined)?.length) {
          const sig = SIGS.find((s) => s.drug.test(drug));
          r.dosageInstruction = [{
            text: sig?.text ?? 'Take as directed.',
            ...(sig?.repeat ? { timing: { repeat: { ...sig.repeat } } } : {}),
            asNeededBoolean: sig?.prn ?? false,
            ...(sig?.dose !== undefined ? { doseAndRate: [{ doseQuantity: { value: sig.dose } }] } : {}),
          }];
        }
        for (const [i, d] of (r.dosageInstruction as Json[]).entries()) {
          d.sequence ??= i + 1;
          // A schedule Synthea gave only as an instruction, or the clinic's sig for the drug.
          if (d.timing === undefined && d.asNeededBoolean !== true) {
            const sig = SIGS.find((x) => x.drug.test(drug));
            const q4to6 = ((d.additionalInstruction as unknown[] | undefined) ?? []).some((c) => /four to six hours/i.test(textOf(c)));
            const repeat = q4to6 ? { frequency: 1, period: 4, periodMax: 6, periodUnit: 'h' } : sig?.repeat && !sig.prn ? { ...sig.repeat } : undefined;
            if (repeat) {
              d.timing = { repeat };
              if (d.doseAndRate === undefined && form) d.doseAndRate = [{ doseQuantity: { value: sig?.dose ?? 1 } }];
            }
          }
          if (d.asNeededBoolean === undefined && d.asNeededCodeableConcept === undefined) d.asNeededBoolean = false;
          if (d.route === undefined && route) d.route = { coding: [{ system: SNOMED, code: route[1], display: route[2] }], text: route[1] === '26643006' ? 'oral' : route[2].replace(/ route$/, '').toLowerCase() };
          const timing = (d.timing ??= d.asNeededBoolean === true && form ? { repeat: { frequency: 1, period: 6, periodUnit: 'h' } } : undefined) as { code?: unknown; repeat?: Repeat } | undefined;
          if (timing === undefined) delete d.timing;
          // A statin taken once a day is taken at bedtime.
          if (timing?.repeat?.frequency === 1 && timing.repeat.period === 1 && timing.repeat.periodUnit === 'd' && /statin\b/i.test(drug)) timing.repeat.when ??= ['HS'];
          const rep = timing?.repeat;
          if (timing && timing.code === undefined && rep?.period === 1 && rep.periodUnit === 'd') {
            const code = rep.when?.includes('HS') ? 'BED' : ({ 1: 'QD', 2: 'BID', 3: 'TID', 4: 'QID' } as Record<number, string>)[rep.frequency ?? 0];
            const words = ({ BED: 'at bedtime', QD: 'once daily', BID: 'twice daily', TID: 'three times daily', QID: 'four times daily' } as Record<string, string>)[code ?? ''];
            if (code && words) timing.code = { coding: [{ system: GTS, code }], text: words };
          }
          if (d.asNeededBoolean === true && timing && d.doseAndRate === undefined && form) d.doseAndRate = [{ doseQuantity: { value: 1 } }];
          for (const dr of (d.doseAndRate as Array<{ type?: unknown; doseQuantity?: { value?: number; unit?: string } }> | undefined) ?? []) {
            dr.type ??= structuredClone(ORDERED);
            if (dr.doseQuantity && dr.doseQuantity.unit === undefined && dr.doseQuantity.value !== undefined) {
              if (mg !== undefined) Object.assign(dr.doseQuantity, { value: Number((dr.doseQuantity.value * mg).toFixed(3)), unit: 'mg', system: UCUM, code: 'mg' });
              else if (form) Object.assign(dr.doseQuantity, { unit: form, system: UCUM, code: `{${form}}` });
              else if (/\bML\b|inject|solution/i.test(drug)) Object.assign(dr.doseQuantity, { unit: 'mL', system: UCUM, code: 'mL' });
              else if (/inhal/i.test(drug)) Object.assign(dr.doseQuantity, { unit: 'actuation', system: UCUM, code: '{actuat}' });
            }
          }
          // The sig as text: dose, route, schedule.
          if (d.text === undefined) {
            const q = (d.doseAndRate as Array<{ doseQuantity?: { value?: number; unit?: string } }> | undefined)?.[0]?.doseQuantity;
            const every = rep && rep.periodUnit === 'h' ? `every ${rep.period} hours` : rep?.periodUnit === 'mo' ? (rep.period === 1 ? 'once a month' : `every ${rep.period} months`) : undefined;
            d.text = [q?.value !== undefined ? `${q.value} ${q.unit ?? 'dose'}` : undefined, route?.[3], textOf(timing?.code) || every, d.asNeededBoolean === true ? 'as needed' : undefined].filter((x) => x).join(' ') || 'Take as directed.';
          }
        }
        // The indication as the order's reason text, from the problem the order names or the chart's.
        if (r.reasonCode === undefined) {
          const cond = byId.get((r.reasonReference as Ref[] | undefined)?.[0]?.reference ?? '') ?? indication(r);
          const said = ORDER_REASONS.find(([d]) => d.test(drug))?.[1];
          if (cond) r.reasonCode = [{ text: textOf(cond.code) }];
          else if (said) r.reasonCode = [{ text: said }];
        }
        delete r.reasonReference;
        // A community order, whatever its status now, was sent with a dispense request: 90 days with
        // refills on a schedule (an outpatient one too), a month's supply as needed.
        const community = (r.category as Array<{ coding?: Array<{ code?: string }> }>).some((c) => c.coding?.some((x) => x.code === 'community' || x.code === 'outpatient'));
        const scheduled = (r.dosageInstruction as Array<{ timing?: { repeat?: unknown } }>).some((d) => d.timing?.repeat !== undefined);
        if (categoryOf(r) === 'community' && !scheduled && r.intent === 'order' && r.dispenseRequest === undefined) r.dispenseRequest = { numberOfRepeatsAllowed: 1, expectedSupplyDuration: { value: 30, unit: 'days', system: UCUM, code: 'd' } };
        if (community && scheduled && r.intent === 'order' && r.dispenseRequest === undefined) {
          const rep = ((r.dosageInstruction as Array<{ timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } }; doseAndRate?: Array<{ doseQuantity?: { value?: number; unit?: string } }> }>)[0]);
          const q = rep?.doseAndRate?.[0]?.doseQuantity;
          const tablets = q?.value === undefined ? 0 : q.unit === form ? q.value : q.unit === 'mg' && mg ? q.value / mg : 0;
          const perDay = rep?.timing?.repeat?.period === 1 && rep.timing.repeat.periodUnit === 'd' && Number.isInteger(tablets) ? (rep.timing.repeat.frequency ?? 0) * tablets : 0;
          r.dispenseRequest = {
            ...(perDay > 0 && form && pick(r.id as string, 'quantity', 2) ? { quantity: { value: perDay * 90, unit: form, system: UCUM, code: `{${form}}` } } : {}),
            numberOfRepeatsAllowed: 3,
            expectedSupplyDuration: { value: 90, unit: 'days', system: UCUM, code: 'd' },
          };
        }
        break;
      }
    }
  }
  return out as unknown as Resource[];
}

// One occasional field: on which type, which paths it adds, when it may apply, and how.
interface Occasional {
  type: string;
  salt: string;
  every: number;
  of?: number;
  adds: readonly string[];
  can(r: Json, ctx: Context): boolean;
  apply(r: Json, ctx: Context, id: string): void;
}
interface Context {
  byId: ReadonlyMap<string, Json>;
}

// What a reaction to a substance usually is: [SNOMED code, display, severity].
function reactionFor(r: Json): readonly [string, string, string] | undefined {
  const what = textOf(r.code);
  if (/no known/i.test(what)) return undefined;
  if (/mold|pollen|dust mite|dander|grass|tree|weed|ragweed/i.test(what)) return ['61582004', 'Allergic rhinitis (disorder)', 'mild'];
  if (/fish|shellfish|peanut|nut|egg|milk|wheat|soy/i.test(what)) return ['271807003', 'Eruption of skin (disorder)', 'mild'];
  if (/bee|wasp|venom/i.test(what)) return ['267038008', 'Edema (finding)', 'moderate'];
  if ((r.category as string[] | undefined)?.includes('medication') || /aspirin|penicillin|sulfa|cillin|cef|ibuprofen|naproxen/i.test(what)) return ['126485001', 'Urticaria (disorder)', 'moderate'];
  return undefined;
}

const isLab = (r: Json) => categoryOf(r) === 'laboratory' && r.valueQuantity !== undefined;
const OCCASIONAL: readonly Occasional[] = [
  { type: 'Observation', salt: 'note', every: 15, adds: ['note'], can: (r) => isLab(r) && r.note === undefined && r.status === 'final', apply: (r, _, id) => (r.note = [{ time: r.issued, text: one(id, 'lab-comment', LAB_COMMENTS) }]) },
  {
    type: 'Observation', salt: 'note', every: 25, adds: ['note'],
    can: (r) => categoryOf(r) === 'vital-signs' && MEASURED.has(codeOf(r) ?? '') && r.note === undefined,
    apply: (r, _, id) => (r.note = [{ time: r.issued, text: one(id, 'vital-comment', codeOf(r) === '85354-9' ? [...VITAL_COMMENTS, ...BP_COMMENTS] : VITAL_COMMENTS) }]),
  },
  { type: 'Observation', salt: 'method', every: 3, adds: ['method'], can: (r) => ['4548-4', '2339-0', '718-7'].includes(codeOf(r) ?? '') && r.method === undefined, apply: (r) => (r.method = { text: 'Point-of-care' }) },
  {
    // A flag on a qualitative result: abnormal when something is found, normal when not.
    type: 'Observation', salt: 'flag', every: 2, adds: ['interpretation'],
    can: (r) => categoryOf(r) === 'laboratory' && r.interpretation === undefined && /\bnot detected\b|\bnegative\b|\bno casts\b|\+|\bplus\b|\bdetected\b|\bpresence\b|\bpositive\b|^finding of\b/i.test(textOf(r.valueCodeableConcept)),
    apply: (r) => {
      const flag = /\bnot detected\b|\bnegative\b|\bno casts\b/i.test(textOf(r.valueCodeableConcept)) ? 'N' : 'A';
      r.interpretation = [{ coding: [{ system: INTERP, code: flag, display: flag === 'A' ? 'Abnormal' : 'Normal' }] }];
    },
  },
  {
    type: 'DiagnosticReport', salt: 'conclusion', every: 3, adds: ['conclusion'], can: (r) => r.conclusion === undefined,
    apply: (r, { byId }, id) => {
      const results = ((r.result as Ref[] | undefined) ?? []).flatMap((ref): Json[] => { const o = byId.get(ref.reference ?? ''); return o ? [o] : []; });
      if (categoryOf(r) === 'LAB') {
        const flagged = results.flatMap((o) => {
          const range = rangeOf(o);
          const v = (o.valueQuantity as { value?: number } | undefined)?.value;
          return range && v !== undefined && flagOf(v, range) !== 'N' ? [`${labelOf(o)} ${flagOf(v, range)}`] : [];
        });
        r.conclusion = flagged.length ? `${one(id, 'outside', ['Outside the reference range', 'Abnormal'])}: ${flagged.join(', ')}.` : results.every((o) => rangeOf(o)) && results.length ? one(id, 'within', WITHIN_RANGE) : one(id, 'reviewed', REPORT_REVIEWED);
      } else {
        // A questionnaire states its total; anything else was reviewed.
        const total = results.map((o) => (o.valueQuantity as { value?: number } | undefined)?.value).find((v) => v !== undefined);
        r.conclusion = total !== undefined && categoryOf(r) === 'OTH' ? `Total score ${total}. ${one(id, 'reviewed', REPORT_REVIEWED)}` : one(id, 'reviewed', REPORT_REVIEWED);
      }
    },
  },
  {
    // The report as the laboratory or the questionnaire prints it.
    type: 'DiagnosticReport', salt: 'printed', every: 3, adds: ['presentedForm'],
    can: (r, { byId }) => r.presentedForm === undefined && (categoryOf(r) === 'OTH' || ((r.result as Ref[] | undefined) ?? []).some((ref) => (byId.get(ref.reference ?? '')?.valueQuantity as { value?: number } | undefined)?.value !== undefined)),
    apply: (r, { byId }, id) => {
      if (categoryOf(r) === 'OTH') {
        // A questionnaire's form, as the clinic's forms system files it; its answers are not restated.
        const text = `${textOf(r.code)}\nCompleted ${day(r.effectiveDateTime as string)}.\n${one(id, 'form', ['Completed by the patient at check-in; reviewed by the clinician.', 'Administered by the medical assistant; reviewed at the visit.', 'Completed on the clinic tablet before the visit.'])}\n`;
        r.presentedForm = [{ contentType: 'text/plain; charset=utf-8', data: b64(text) }];
        return;
      }
      const lines = ((r.result as Ref[] | undefined) ?? []).flatMap((ref) => {
        const o = byId.get(ref.reference ?? '');
        const q = o?.valueQuantity as { value?: number; unit?: string } | undefined;
        if (!o || q?.value === undefined) return [];
        const range = rangeOf(o);
        const flag = range ? flagOf(q.value, range) : 'N';
        return [`${labelOf(o)}: ${printed(q.value)} ${q.unit ?? ''}${range ? ` (${range[0]}-${range[1]})` : ''}${flag !== 'N' ? ` ${flag}` : ''}`.replace(/ +/g, ' ').trim()];
      });
      const text = `${textOf(r.code).toUpperCase()}\nCollected ${day(r.effectiveDateTime as string)}\n\n${lines.join('\n')}\n`;
      r.presentedForm = [{ contentType: 'text/plain; charset=utf-8', data: b64(text) }];
    },
  },
  { type: 'DocumentReference', salt: 'signed', every: 4, adds: ['authenticator'], can: (r) => r.authenticator === undefined && Boolean((r.author as Ref[] | undefined)?.length), apply: (r) => (r.authenticator = (r.author as Ref[])[0]) },
  { type: 'DocumentReference', salt: 'description', every: 6, adds: ['description'], can: (r) => r.description === undefined, apply: (r) => (r.description = textOf(r.type) || 'Clinical note') },
  {
    type: 'DocumentReference', salt: 'title', every: 8, adds: ['content.attachment.title'],
    can: (r) => (r.content as Array<{ attachment: Json }>).every((c) => c.attachment.title === undefined),
    apply: (r) => {
      for (const c of r.content as Array<{ attachment: Json }>) c.attachment.title = textOf(r.type) || 'Clinical note';
    },
  },
  {
    // Filed without its visit, as a note migrated from an older system is; some also unsigned.
    type: 'DocumentReference', salt: 'unlinked', every: 3, adds: [],
    can: (r) => (r.context as { encounter?: unknown } | undefined)?.encounter !== undefined,
    apply: (r, _, id) => {
      delete (r.context as { encounter?: unknown }).encounter;
      if (pick(id, 'unsigned', 3)) {
        delete r.author;
        delete r.authenticator;
        r.description ??= textOf(r.type) || 'Clinical note';
      }
    },
  },
  {
    type: 'MedicationRequest', salt: 'event', every: 8, adds: ['dosageInstruction.timing.event'],
    can: (r) => (r.status === 'stopped' || r.status === 'completed') && (r.dosageInstruction as Array<{ timing?: { repeat?: unknown; event?: unknown } }>)[0]?.timing?.repeat !== undefined && (r.dosageInstruction as Array<{ timing?: { event?: unknown } }>)[0]?.timing?.event === undefined,
    apply: (r) => ((r.dosageInstruction as Array<{ timing: { event?: string[] } }>)[0]!.timing.event = [r.authoredOn as string]),
  },
  {
    type: 'MedicationRequest', salt: 'when', every: 2, adds: ['dosageInstruction.timing.repeat.when'],
    can: (r) => {
      const rep = (r.dosageInstruction as Array<{ timing?: { repeat?: Repeat } }>)[0]?.timing?.repeat;
      return rep !== undefined && rep.when === undefined && rep.periodUnit === 'd' && WHEN.some(([d]) => d.test(textOf(r.medicationCodeableConcept)));
    },
    apply: (r) => {
      const [, code, words] = WHEN.find(([d]) => d.test(textOf(r.medicationCodeableConcept)))!;
      const d = (r.dosageInstruction as Array<{ text?: string; timing: { repeat: Repeat; code?: { text?: string } } }>)[0]!;
      d.timing.repeat.when = [code];
      if (code === 'MORN' && d.text) d.text = d.text.replace('once daily', words);
      else if (d.text && !d.text.includes(words)) d.text = `${d.text} ${words}`;
    },
  },
  // A refill sent electronically between visits.
  { type: 'MedicationRequest', salt: 'refill', every: 2, adds: [], can: (r) => r.encounter !== undefined && r.status !== 'stopped' && categoryOf(r) === 'community', apply: (r) => delete r.encounter },
  {
    type: 'MedicationRequest', salt: 'ended', every: 12, adds: ['statusReason', 'statusReason.text'], can: (r) => r.status === 'completed' && r.statusReason === undefined,
    apply: (r, _, id) => (r.statusReason = { text: one(id, 'ended-why', ['Course completed', 'No longer needed', 'Completed as prescribed']) }),
  },
  {
    type: 'Procedure', salt: 'reason', every: 1, adds: ['reasonCode', 'reasonCode.text'],
    can: (r, { byId }) => r.reasonCode === undefined && byId.get((r.reasonReference as Ref[] | undefined)?.[0]?.reference ?? '') !== undefined,
    apply: (r, { byId }) => {
      r.reasonCode = [{ text: textOf(byId.get((r.reasonReference as Ref[])[0]!.reference!)!.code) }];
      delete r.reasonReference;
    },
  },
  {
    // A reaction the patient reported, by kind of substance.
    type: 'AllergyIntolerance', salt: 'reacted', every: 3, adds: ['reaction', 'reaction.manifestation', 'reaction.manifestation.coding', 'reaction.manifestation.text', 'reaction.severity'],
    can: (r) => !(r.reaction as unknown[] | undefined)?.length && reactionFor(r) !== undefined,
    apply: (r) => {
      const [code, display, severity] = reactionFor(r)!;
      r.reaction = [{ manifestation: [{ coding: [{ system: SNOMED, code, display }], text: display }], severity }];
    },
  },
  {
    type: 'AllergyIntolerance', salt: 'reaction', every: 3, adds: ['reaction.description', 'reaction.note'],
    can: (r) => Boolean((r.reaction as Json[] | undefined)?.length) && (r.reaction as Json[])[0]!.note === undefined,
    apply: (r) => {
      const reaction = (r.reaction as Json[])[0]!;
      reaction.description = 'Reported by the patient';
      reaction.note = [{ time: r.recordedDate, text: 'Patient report; not confirmed by testing.' }];
    },
  },
  {
    // An onset as the patient gave it: the day it was recorded
    // (the year or month alone only in profileBase, before the world is numbered by date).
    type: 'AllergyIntolerance', salt: 'onset', every: 2, adds: ['onsetDateTime'], can: (r) => r.onsetDateTime === undefined && typeof r.recordedDate === 'string',
    apply: (r) => (r.onsetDateTime = r.recordedDate),
  },
  {
    type: 'Procedure', salt: 'instant', every: 6, of: 5, adds: ['performedDateTime'],
    can: (r) => (r.performedPeriod as { start?: string } | undefined)?.start !== undefined,
    apply: (r) => {
      r.performedDateTime = (r.performedPeriod as { start: string }).start;
      delete r.performedPeriod;
    },
  },
  { type: 'Procedure', salt: 'outcome', every: 4, of: 3, adds: ['outcome', 'outcome.text'], can: (r) => r.outcome === undefined && r.status === 'completed', apply: (r, _, id) => (r.outcome = { text: one(id, 'outcome-text', OUTCOMES) }) },
  // A procedure entered in the history from the patient's account or an outside record, not at a visit.
  { type: 'Procedure', salt: 'history', every: 2, adds: [], can: (r) => r.encounter !== undefined, apply: (r) => delete r.encounter },
  { type: 'Procedure', salt: 'uncoded', every: 40, adds: [], can: (r) => Boolean((r.code as { coding?: unknown[] } | undefined)?.coding), apply: (r) => (r.code = { text: textOf(r.code) }) },
  { type: 'Condition', salt: 'uncoded', every: 40, adds: [], can: (r) => Boolean((r.code as { coding?: unknown[] } | undefined)?.coding), apply: (r) => (r.code = { text: textOf(r.code) }) },
  {
    // An emergency visit filed from the hospital's feed names no clinic clinician.
    type: 'Encounter', salt: 'unattended', every: 20, adds: [], can: (r) => r.participant !== undefined && (r.class as { code?: string }).code !== 'EMER',
    apply: (r) => delete r.participant,
  },
  { type: 'Encounter', salt: 'unattended', every: 2, adds: [], can: (r) => r.participant !== undefined && (r.class as { code?: string }).code === 'EMER', apply: (r) => delete r.participant },
  { type: 'Encounter', salt: 'reasonless', every: 3, adds: [], can: (r) => r.reasonCode !== undefined && (r.class as { code?: string }).code === 'EMER', apply: (r) => delete r.reasonCode },
];

// Every key path of a resource (arrays flattened): 'code', 'code.coding', 'code.coding.system', ...
function paths(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) paths(x, at, out);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const p = at ? `${at}.${k}` : k;
      out.add(p);
      paths(x, p, out);
    }
  }
  return out;
}
// Every code a resource's code, drug or type carries.
function codes(r: Json): string[] {
  return ['code', 'medicationCodeableConcept', 'type'].flatMap((k) => {
    const v = r[k];
    return (Array.isArray(v) ? v : [v]).flatMap((cc) => [...((cc as { coding?: Array<{ code?: string }> } | undefined)?.coding ?? []).flatMap((c) => (c.code ? [c.code] : [])), ...((cc as { text?: string } | undefined)?.text ? [(cc as { text: string }).text] : [])]);
  });
}
// Every Type/id a resource references.
function refs(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) refs(x, out);
  else if (v !== null && typeof v === 'object') {
    const ref = (v as { reference?: unknown }).reference;
    if (typeof ref === 'string') out.add(ref);
    for (const x of Object.values(v)) refs(x, out);
  }
  return out;
}

// Pass 3: the occasional fields on every generated resource, in every chart alike. planted names
// the resources the overlays added (Type/id); stable maps a world Type/id to the id selection
// hashes (the base id, so selection does not move when the world is renumbered).
export function profileRecords(resources: readonly Resource[], planted: ReadonlySet<string>, stable: ReadonlyMap<string, string>): Resource[] {
  const out = resources.map((r) => structuredClone(r) as unknown as Json);
  const byId = new Map(out.map((r) => [key(r), r]));
  const ctx: Context = { byId };
  const plantedRs = out.filter((r) => planted.has(key(r)));
  const charts = new Set(plantedRs.map(patientOf).filter((p): p is string => p !== undefined));
  // In a task chart, a generated record near a planted one keeps what Synthea wrote: one that shares
  // a code (or a drug, a test, a coded text) with any planted record, one a planted record
  // references, and a report whose results are such.
  const plantedCodes = new Set(plantedRs.filter((r) => r.resourceType !== 'DocumentReference').flatMap(codes));
  const referenced = new Set(plantedRs.flatMap((r) => [...refs(r)]));
  const near = (r: Json): boolean =>
    charts.has(patientOf(r) ?? '') &&
    (referenced.has(key(r)) || (r.resourceType !== 'DocumentReference' && r.resourceType !== 'Encounter' && codes(r).some((c) => plantedCodes.has(c))) || ((r.result as Ref[] | undefined) ?? []).some((ref) => near(byId.get(ref.reference ?? '') ?? {})));
  const generated = out.filter((r) => !planted.has(key(r)) && patientOf(r)?.startsWith('Patient/') && !near(r));
  const idOf = (r: Json) => stable.get(key(r)) ?? (r.id as string);

  // Renewal chains: a later order of the same drug for the same patient names the one it renews, a
  // completed earlier one says why it ended, and some renewals were sent without a visit.
  const chains = new Map<string, Json[]>();
  for (const r of generated) if (r.resourceType === 'MedicationRequest') chains.set(`${patientOf(r)}|${codes(r)[0]}`, [...(chains.get(`${patientOf(r)}|${codes(r)[0]}`) ?? []), r]);
  for (const chain of chains.values()) {
    chain.sort((a, b) => ((a.authoredOn as string) < (b.authoredOn as string) ? -1 : 1));
    for (let i = 1; i < chain.length; i++) {
      const [prev, next] = [chain[i - 1]!, chain[i]!];
      if ((next.authoredOn as string) === (prev.authoredOn as string)) continue;
      if (pick(idOf(next), 'renews', 4)) next.priorPrescription ??= { reference: `MedicationRequest/${prev.id as string}` };
      if (prev.status === 'completed' && pick(idOf(prev), 'renewed', 5)) prev.statusReason ??= { text: 'Renewed as a new prescription' };
      if (pick(idOf(next), 'phone', 3, 2)) delete next.encounter;
    }
  }

  for (const rule of OCCASIONAL) for (const r of generated) if (r.resourceType === rule.type && rule.can(r, ctx) && pick(idOf(r), rule.salt, rule.every, rule.of)) rule.apply(r, ctx, idOf(r));

  // The top-up: in each task chart, a field a planted record carries that no generated record of
  // its type there carries goes on the first generated record (by id) the field's rule fits.
  for (const p of [...charts].sort()) {
    for (const type of new Set(plantedRs.filter((r) => patientOf(r) === p).map((r) => r.resourceType as string))) {
      const mine = generated.filter((r) => r.resourceType === type && patientOf(r) === p).sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1));
      if (!mine.length) continue;
      const want = new Set(plantedRs.filter((r) => r.resourceType === type && patientOf(r) === p).flatMap((r) => [...paths(r)]));
      for (const rule of OCCASIONAL.filter((x) => x.type === type)) {
        const missing = () => rule.adds.filter((a) => want.has(a) && !mine.some((r) => paths(r).has(a)));
        if (!missing().length) continue;
        const target = mine.find((r) => rule.can(r, ctx));
        if (target) rule.apply(target, ctx, idOf(target));
      }
    }
  }
  return out as unknown as Resource[];
}
