// One record shape for the whole world (builder-196; verifier P17i W0 S2). The overlays write
// resources in the write tools' EHR shape (docStatus, dosage route and timing code, lab reference
// ranges and flags, performers, recorders), and the Synthea cohort lacks those fields, so before
// this pass a reader could tell a planted record by its fields alone. fixtures:build runs two passes
// so that no field path appears only on planted resources (scripts/test/world-tells.test.ts):
//
//   profileBase  on the base cohort, before the overlays, keyed by base id. Gives some resources of
//                the patients no task owns the occasional fields a real chart has and the planted
//                records use: a lab comment, a method, a report conclusion, a signed addendum, a
//                first-dose time, an allergy reaction note, an NKDA entry, a renewal chain, a note
//                filed without its visit, an uncoded problem. Each is clinically neutral: it states
//                nothing a task decides on, and no task patient's chart changes.
//   profileWorld on every resource after the overlays: the fields an EHR records on every record of
//                a type, derived from the record itself (coding displays, docStatus, the IHE format
//                code, the note's period, encounter participant roles, recorder and performer,
//                lab reference ranges and flags, dosage route, timing code and dose unit, a
//                dispense request on active orders). A field already present is never changed.
//
// Selection is a hash of the base id, so the same resources are chosen on every build.
import type { Resource } from './store.ts';
import { NOW_MS } from './clock.ts';
import { CLINIC } from './world.ts';

type Json = Record<string, unknown>;
type Ref = { reference?: string };

const UCUM = 'http://unitsofmeasure.org';
const SNOMED = 'http://snomed.info/sct';
const INTERP = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const GTS = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
const IHE_FORMAT = { system: 'http://ihe.net/fhir/ihe.formatcode.fhir/CodeSystem/formatcode', code: 'urn:ihe:iti:xds:2017:mimeTypeSufficient', display: 'mimeType Sufficient' };
const HOME = { coding: [{ system: 'http://www.nubc.org/patient-discharge', code: '01', display: 'Discharged to home care or self care (routine discharge)' }], text: 'Discharged to home care or self care (routine discharge)' };
const PPRF = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PPRF', display: 'primary performer' }], text: 'primary performer' }];
const CLASS_DISPLAY: Readonly<Record<string, string>> = { AMB: 'ambulatory', IMP: 'inpatient encounter', EMER: 'emergency', VR: 'virtual', HH: 'home health' };
const STATUS_DISPLAY: Readonly<Record<string, string>> = {
  active: 'Active', inactive: 'Inactive', resolved: 'Resolved', confirmed: 'Confirmed', unconfirmed: 'Unconfirmed', refuted: 'Refuted', 'entered-in-error': 'Entered in Error',
};
const CATEGORY_DISPLAY: Readonly<Record<string, string>> = { 'problem-list-item': 'Problem List Item', 'encounter-diagnosis': 'Encounter Diagnosis', 'health-concern': 'Health Concern' };
const INTERP_DISPLAY: Readonly<Record<string, string>> = { H: 'High', L: 'Low', N: 'Normal' };

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
  [/acetaminophen|ibuprofen|naproxen|hydrocodone|oxycodone|meperidine/i, /pain|sprain|injury|laceration|fracture|fibromyalgia/i],
  [/amoxicillin|penicillin|sulfamethoxazole|cef[a-z]+|azithromycin|doxycycline/i, /sinusitis|pharyngitis|sore throat|otitis|bronchitis|pneumonia|cystitis/i],
  [/statin\b/i, /hyperlipidemia|hypertriglyceridemia/i],
  [/fexofenadine|cetirizine|loratadine/i, /rhinitis|allerg/i],
  [/epinephrine/i, /allerg|anaphyla/i],
  [/enoxaparin|warfarin|apixaban|rivaroxaban/i, /embolism|thrombosis|atrial fibrillation/i],
];

// Comments a laboratory attaches to routine results; none bears on a result's meaning.
const LAB_COMMENTS = ['Specimen received at room temperature.', 'Fasting status not stated on the requisition.', 'Result verified by repeat analysis.', 'Collected at the Riverbend clinic draw station.'];
const VITAL_COMMENT = 'Measured in clinic.';

// FNV-1a over a string, for stable selection.
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const pick = (id: string, salt: string, every: number) => fnv(`${salt}:${id}`) % every === 0;

const patientOf = (r: Json): string | undefined => ((r.subject ?? r.patient ?? r.for) as Ref | undefined)?.reference;
const codeOf = (r: Json): string | undefined => (r.code as { coding?: Array<{ code?: string }> } | undefined)?.coding?.[0]?.code;
const categoryOf = (r: Json): string | undefined => (r.category as Array<{ coding?: Array<{ code?: string }> }> | undefined)?.[0]?.coding?.[0]?.code;
const textOf = (cc: unknown): string => {
  const c = cc as { text?: string; coding?: Array<{ display?: string }> } | undefined;
  return c?.text ?? c?.coding?.[0]?.display ?? '';
};
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const day = (iso: string) => iso.slice(0, 10);

function rangeOf(r: Json): readonly [number, number, string] | undefined {
  const range = RANGES[codeOf(r) ?? ''];
  const unit = (r.valueQuantity as { unit?: string } | undefined)?.unit;
  return range && range[2] === unit ? range : undefined;
}
const flagOf = (value: number, [low, high]: readonly [number, number, string]) => (value > high ? 'H' : value < low ? 'L' : 'N');
const referenceRange = ([low, high, unit]: readonly [number, number, string]) => [{ low: { value: low, unit, system: UCUM, code: unit }, high: { value: high, unit, system: UCUM, code: unit } }];

// Pass 1: occasional fields on base resources of patients no task owns. New resources take the
// <prefix>-9<4 digits> ids fixtures:build then numbers with the rest.
export function profileBase(base: readonly Resource[], taskPatients: ReadonlySet<string>): Resource[] {
  const free = (r: Json) => {
    const p = patientOf(r);
    return p !== undefined && p.startsWith('Patient/') && !taskPatients.has(p.slice(8));
  };
  const out = base.map((r) => structuredClone(r) as unknown as Json);
  const byId = new Map(out.map((r) => [`${r.resourceType as string}/${r.id as string}`, r]));
  const added: Json[] = [];
  const pcp = new Map(out.filter((r) => r.resourceType === 'Patient').map((p) => [`Patient/${p.id as string}`, ((p.generalPractitioner as Ref[] | undefined)?.[0]) ?? { reference: 'Practitioner/pr-okafor' }]));

  // Renewal chains: a later order of the same drug for the same patient names the one it renews,
  // and a stopped or completed earlier order says why it ended.
  const chains = new Map<string, Json[]>();
  for (const r of out) {
    if (r.resourceType !== 'MedicationRequest' || !free(r)) continue;
    const k = `${patientOf(r)}|${(r.medicationCodeableConcept as { coding?: Array<{ code?: string }> } | undefined)?.coding?.[0]?.code}`;
    chains.set(k, [...(chains.get(k) ?? []), r]);
  }
  const inChain = new Set<string>();
  for (const chain of chains.values()) {
    if (chain.length > 1) for (const r of chain) inChain.add(r.id as string);
    chain.sort((a, b) => ((a.authoredOn as string) < (b.authoredOn as string) ? -1 : 1));
    for (let i = 1; i < chain.length; i++) {
      const [prev, next] = [chain[i - 1]!, chain[i]!];
      if ((next.authoredOn as string) === (prev.authoredOn as string)) continue;
      next.priorPrescription = { reference: `MedicationRequest/${prev.id as string}` };
      if (prev.status === 'stopped' || prev.status === 'completed') prev.statusReason = { text: 'Renewed as a new prescription' };
      // Some renewals are sent without a visit.
      if (pick(next.id as string, 'phone', 2)) delete next.encounter;
    }
  }

  // The patient's latest problem, onset on or before the order, that the drug treats (INDICATIONS).
  const problems = new Map<string, Json[]>();
  for (const c of out) if (c.resourceType === 'Condition' && free(c)) problems.set(patientOf(c)!, [...(problems.get(patientOf(c)!) ?? []), c]);
  const indication = (mr: Json): Json | undefined => {
    const drug = textOf(mr.medicationCodeableConcept);
    const treats = INDICATIONS.find(([d]) => d.test(drug))?.[1];
    if (!treats) return undefined;
    return (problems.get(patientOf(mr)!) ?? [])
      .filter((c) => treats.test(textOf(c.code)) && ((c.onsetDateTime as string | undefined) ?? '') <= (mr.authoredOn as string))
      .sort((a, b) => ((a.onsetDateTime as string) < (b.onsetDateTime as string) ? 1 : -1))[0];
  };

  let nextAlg = 0;
  let nextDoc = 0;
  for (const r of [...out]) {
    if (!free(r)) continue;
    const id = r.id as string;
    switch (r.resourceType) {
      case 'Observation': {
        const cat = categoryOf(r);
        if (cat === 'laboratory' && pick(id, 'note', 15)) r.note = [{ time: r.issued, text: LAB_COMMENTS[fnv(id) % LAB_COMMENTS.length] }];
        if (cat === 'vital-signs' && pick(id, 'note', 25)) r.note = [{ time: r.issued, text: VITAL_COMMENT }];
        if ((codeOf(r) === '4548-4' || codeOf(r) === '2339-0') && pick(id, 'method', 3)) r.method = { text: 'Point-of-care' };
        // A flag on a qualitative result: abnormal when something is found, normal when not.
        const found = textOf(r.valueCodeableConcept);
        if (cat === 'laboratory' && found && pick(id, 'flag', 2)) {
          const flag = /\bnot detected\b|\bnegative\b|\bno casts\b/i.test(found) ? 'N' : /\+|\bplus\b|\bdetected\b|\bpresence\b|\bpositive\b|^finding of\b/i.test(found) ? 'A' : null;
          if (flag) r.interpretation = [{ coding: [{ system: INTERP, code: flag, display: flag === 'A' ? 'Abnormal' : 'Normal' }] }];
        }
        break;
      }
      case 'DiagnosticReport': {
        if (!pick(id, 'conclusion', 3)) break;
        if (r.presentedForm) r.conclusion = 'Reviewed with the patient at the visit.';
        else {
          const flagged = ((r.result as Ref[] | undefined) ?? []).flatMap((ref) => {
            const o = byId.get(ref.reference ?? '');
            const range = o && rangeOf(o);
            const v = (o?.valueQuantity as { value?: number } | undefined)?.value;
            return o && range && v !== undefined && flagOf(v, range) !== 'N' ? [`${textOf(o.code).split(' [')[0]} ${flagOf(v, range)}`] : [];
          });
          r.conclusion = flagged.length ? `Outside the reference range: ${flagged.join(', ')}.` : 'All reported values within the reference range.';
        }
        break;
      }
      case 'DocumentReference': {
        const t = r.type as { text?: string; coding?: Array<{ display?: string }> };
        const type = t.text ?? t.coding?.[0]?.display ?? 'Clinical note';
        if (pick(id, 'signed', 4)) r.authenticator = (r.author as Ref[] | undefined)?.[0];
        if (pick(id, 'description', 6)) r.description = type;
        if (pick(id, 'title', 8)) for (const c of r.content as Array<{ attachment: Json }>) c.attachment.title = type;
        if (pick(id, 'unlinked', 12)) {
          // Filed without its visit, as a note migrated from an older system is.
          const ctx = r.context as { encounter?: unknown; period?: Json } | undefined;
          r.context = { period: ctx?.period ?? { start: r.date } };
          if (pick(id, 'unsigned', 3)) {
            delete r.author;
            delete r.authenticator;
            r.description = type;
          }
        }
        const when = new Date(Date.parse(r.date as string) + 3_600_000).toISOString();
        if (pick(id, 'addendum', 25) && (r.author as Ref[] | undefined)?.length && Date.parse(when) < NOW_MS) {
          const text = `\n${day(r.date as string)}\n\nAddendum: the plan above was reviewed with the patient by phone; no change to the plan.\n`;
          added.push({
            resourceType: 'DocumentReference',
            id: `doc-9${String(++nextDoc).padStart(4, '0')}`,
            status: 'current',
            type: r.type,
            category: r.category,
            subject: r.subject,
            date: `${when.slice(0, 19)}Z`,
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
      case 'MedicationRequest': {
        const dosage = (r.dosageInstruction as Array<{ timing?: { repeat?: Json; event?: string[] } }> | undefined)?.[0];
        if (dosage?.timing?.repeat && (r.status === 'stopped' || r.status === 'completed') && pick(id, 'event', 8)) dosage.timing.event = [r.authoredOn as string];
        if (dosage?.timing?.repeat && dosage.timing.repeat.frequency === 1 && /statin\b/i.test(textOf(r.medicationCodeableConcept))) dosage.timing.repeat.when = ['HS'];
        // The indication as a coded reason, not a link to the problem, as an order entered from a
        // pick list carries it.
        const cond = byId.get((r.reasonReference as Ref[] | undefined)?.[0]?.reference ?? '') ?? indication(r);
        if (cond && r.reasonCode === undefined && (inChain.has(id) || pick(id, 'reason', 2))) {
          r.reasonCode = [{ ...(cond.code as Json) }];
          delete r.reasonReference;
        }
        break;
      }
      case 'AllergyIntolerance': {
        const reaction = (r.reaction as Json[] | undefined)?.[0];
        if (reaction && pick(id, 'reaction', 3)) {
          reaction.description = 'Reported by the patient';
          reaction.note = [{ time: r.recordedDate, text: 'Patient report; not confirmed by testing.' }];
        }
        if (pick(id, 'onset', 3)) r.onsetDateTime = r.recordedDate;
        break;
      }
      case 'Procedure': {
        const period = r.performedPeriod as { start?: string; end?: string } | undefined;
        if (period?.start && pick(id, 'instant', 3)) {
          r.performedDateTime = period.start;
          delete r.performedPeriod;
          if (pick(id, 'reason', 2) && (r.reasonReference as Ref[] | undefined)?.length) {
            const cond = byId.get((r.reasonReference as Ref[])[0]!.reference ?? '');
            if (cond) {
              r.reasonCode = [{ text: textOf(cond.code) }];
              delete r.reasonReference;
            }
          }
        }
        if (pick(id, 'outcome', 10)) r.outcome = { text: 'Successful' };
        if (pick(id, 'uncoded', 40)) r.code = { text: textOf(r.code) };
        break;
      }
      case 'Condition': {
        if (pick(id, 'uncoded', 40)) r.code = { text: textOf(r.code) };
        break;
      }
      case 'Encounter': {
        // An emergency visit filed from the hospital's feed names no clinic clinician.
        const emer = (r.class as { code?: string }).code === 'EMER';
        if (pick(id, 'unattended', emer ? 2 : 20)) delete r.participant;
        if (emer && pick(id, 'reasonless', 3)) delete r.reasonCode;
        break;
      }
    }
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
      id: `alg-9${String(++nextAlg).padStart(4, '0')}`,
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
  const byId = new Map(out.map((r) => [`${r.resourceType as string}/${r.id as string}`, r]));
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

  for (const r of out) {
    switch (r.resourceType) {
      case 'DocumentReference': {
        r.docStatus ??= 'final';
        const type = r.type as { text?: string; coding?: Array<{ display?: string }> };
        if (type.text === undefined && type.coding?.[0]?.display) type.text = type.coding[0].display;
        for (const c of r.content as Array<{ format?: unknown }>) c.format ??= { ...IHE_FORMAT };
        const ctx = (r.context ??= {}) as { period?: Json };
        ctx.period ??= { start: r.date };
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
        // An emergency visit that ended without admission went home.
        if (cls.code === 'EMER' && r.status === 'finished' && r.hospitalization === undefined) r.hospitalization = { dischargeDisposition: structuredClone(HOME) };
        break;
      }
      case 'AllergyIntolerance':
        displays(r.clinicalStatus, STATUS_DISPLAY);
        displays(r.verificationStatus, STATUS_DISPLAY);
        if (r.recorder === undefined && pcp(r)) r.recorder = pcp(r);
        break;
      case 'Condition':
        displays(r.clinicalStatus, STATUS_DISPLAY);
        displays(r.verificationStatus, STATUS_DISPLAY);
        for (const c of (r.category as unknown[] | undefined) ?? []) displays(c, CATEGORY_DISPLAY);
        if (r.recorder === undefined && pcp(r)) r.recorder = pcp(r);
        break;
      case 'Observation': {
        const cat = categoryOf(r);
        if (r.performer === undefined) {
          const enc = byId.get((r.encounter as Ref | undefined)?.reference ?? '');
          const who = cat === 'laboratory' ? { reference: `Organization/${CLINIC}` } : ((enc?.participant as Array<{ individual?: Ref }> | undefined)?.[0]?.individual ?? pcp(r));
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
        for (const d of (r.dosageInstruction as Json[] | undefined) ?? []) {
          if (d.route === undefined && /\boral\b/i.test(drug)) d.route = { coding: [{ system: SNOMED, code: '26643006', display: 'Oral route' }], text: 'oral' };
          const timing = d.timing as { code?: unknown; repeat?: { frequency?: number; period?: number; periodUnit?: string; when?: string[] } } | undefined;
          const rep = timing?.repeat;
          if (timing && timing.code === undefined && rep?.period === 1 && rep.periodUnit === 'd') {
            const code = rep.when?.includes('HS') ? 'BED' : ({ 1: 'QD', 2: 'BID', 3: 'TID', 4: 'QID' } as Record<number, string>)[rep.frequency ?? 0];
            const words = ({ BED: 'at bedtime', QD: 'once daily', BID: 'twice daily', TID: 'three times daily', QID: 'four times daily' } as Record<string, string>)[code ?? ''];
            if (code && words) timing.code = { coding: [{ system: GTS, code }], text: words };
          }
          for (const dr of (d.doseAndRate as Array<{ doseQuantity?: { value?: number; unit?: string } }> | undefined) ?? []) {
            if (dr.doseQuantity && dr.doseQuantity.unit === undefined && form) Object.assign(dr.doseQuantity, { unit: form, system: UCUM, code: `{${form}}` });
          }
        }
        // A community order on a schedule, whatever its status now, was sent with a dispense request.
        const community = (r.category as Array<{ coding?: Array<{ code?: string }> }>).some((c) => c.coding?.some((x) => x.code === 'community' || x.code === 'outpatient'));
        const scheduled = (r.dosageInstruction as Array<{ timing?: { repeat?: unknown } }> | undefined)?.some((d) => d.timing?.repeat !== undefined);
        if (community && scheduled && r.intent === 'order' && r.dispenseRequest === undefined) {
          const rep = ((r.dosageInstruction as Array<{ timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } }; doseAndRate?: Array<{ doseQuantity?: { value?: number } }> }>)[0]);
          const perDay = rep?.timing?.repeat?.period === 1 && rep.timing.repeat.periodUnit === 'd' ? (rep.timing.repeat.frequency ?? 0) * (rep.doseAndRate?.[0]?.doseQuantity?.value ?? 0) : 0;
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
