// The read-only Chart tab's data (pre-audit S12, P17j JU10): a task's patients and a patient's chart,
// read from the FHIR R4 store the tools act on (the in-browser world), never from the grader's files.
// A task's planted resources are the ones its overlay adds, listed by world id in its id registry
// (tasks/<id>/ids.ts, packages/env/overlay.ts "Planted ids"; all six in tasks/planted.ts), so a task's patients are the patients
// of its planted resources and the members of its planted Groups (the panel task T3 names its
// patients by a Group). The world ids are numbered among the generated ones (packages/env/renumber.ts),
// so only the registry can say which task planted what.
import { PLANTED } from '../../../../tasks/planted.ts';

// The world ids each task planted (tasks/planted.ts); test/chart.test.ts checks every task has some.
export const TASK_PLANTED: Readonly<Record<string, ReadonlySet<string>>> = PLANTED;

export type FhirResource = { resourceType: string; id: string; [field: string]: unknown };

const ref = (v: unknown): string | null => {
  const r = (v as { reference?: unknown } | undefined)?.reference;
  return typeof r === 'string' ? r : null;
};

// The patient a resource is about: its subject, patient or for (a Task), or an Appointment's patient
// participant; null for none.
export function patientOf(r: FhirResource): string | null {
  for (const k of ['subject', 'patient', 'for'] as const) {
    const p = ref(r[k]);
    if (p?.startsWith('Patient/')) return p;
  }
  for (const part of (r.participant as { actor?: unknown }[] | undefined) ?? []) {
    const p = ref(part.actor);
    if (p?.startsWith('Patient/')) return p;
  }
  return null;
}

// The patients of a task, as Patient/<id>, sorted; none for a task with no registry.
export function taskPatients(resources: Iterable<FhirResource>, task: string): string[] {
  const planted = TASK_PLANTED[task];
  if (planted === undefined) return [];
  const out = new Set<string>();
  for (const r of resources) {
    if (!planted.has(r.id)) continue;
    const p = patientOf(r);
    if (p !== null) out.add(p);
    if (r.resourceType === 'Group') {
      for (const m of (r.member as { entity?: unknown }[] | undefined) ?? []) {
        const e = ref(m.entity);
        if (e?.startsWith('Patient/')) out.add(e);
      }
    }
  }
  return [...out].sort();
}

// The resource types a chart shows, in the order of its sections.
// Communication, ServiceRequest and EpisodeOfCare carry what T6, T3 and T2 turn on: the patient
// messages, the open orders and referrals, and a hospice episode (verifier-phase-P17j-retro-JU10-1 D1).
export const CHART_TYPES = ['Condition', 'EpisodeOfCare', 'MedicationRequest', 'AllergyIntolerance', 'ServiceRequest', 'Observation', 'DiagnosticReport', 'Procedure', 'DocumentReference', 'Communication', 'Task', 'Appointment'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const SECTION_TITLE: Readonly<Record<ChartType, string>> = {
  Condition: 'Problems',
  EpisodeOfCare: 'Episodes of care',
  MedicationRequest: 'Medications',
  AllergyIntolerance: 'Allergies',
  ServiceRequest: 'Orders and referrals',
  Observation: 'Labs and results',
  DiagnosticReport: 'Reports',
  Procedure: 'Procedures',
  DocumentReference: 'Notes',
  Communication: 'Messages',
  Task: 'Tasks and inbox items',
  Appointment: 'Appointments',
};

export interface ChartLine {
  type: ChartType;
  id: string;
  text: string;
  detail: string;
  status: string;
  date: string;
  // A note's, report's or message's full text, when the resource carries one (shown as an excerpt that expands).
  body: string;
  // An active, on-hold or open item, listed before the rest of its section.
  current: boolean;
}
export interface Chart {
  patient: { id: string; name: string; birthDate: string; gender: string } | null;
  rows: ChartLine[];
}

type Concept = { text?: string; coding?: { display?: string; code?: string }[] } | undefined;
const concept = (c: unknown): string => {
  const x = c as Concept;
  return x?.text ?? x?.coding?.[0]?.display ?? x?.coding?.[0]?.code ?? '';
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const statusCode = (v: unknown): string => (typeof v === 'string' ? v : concept(v));

const quantity = (q: unknown): string => {
  const x = q as { value?: number; unit?: string } | undefined;
  return x?.value === undefined ? '' : `${x.value}${x.unit ? ` ${x.unit}` : ''}`;
};
// An Observation's value: its quantity, string or concept, or its components (a blood pressure's
// systolic and diastolic), each with its name.
function value(r: FhirResource): string {
  const q = quantity(r.valueQuantity);
  if (q !== '') return q;
  if (typeof r.valueString === 'string') return r.valueString;
  if (r.valueCodeableConcept !== undefined) return concept(r.valueCodeableConcept);
  const parts = ((r.component as { code?: unknown; valueQuantity?: unknown }[] | undefined) ?? []).map((c) => `${concept(c.code)} ${quantity(c.valueQuantity)}`.trim()).filter((x) => x !== '');
  return parts.join(', ');
}

// Base64 text (a note's attachment), as UTF-8; empty when it is not base64.
function decoded(b64: unknown): string {
  if (typeof b64 !== 'string' || b64 === '') return '';
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}
const attachmentText = (r: FhirResource, field: 'content' | 'presentedForm'): string => {
  const list = (r[field] as Array<{ attachment?: { data?: unknown } } & { data?: unknown }> | undefined) ?? [];
  return list.map((x) => decoded(x.attachment?.data ?? x.data)).filter((x) => x !== '').join('\n\n');
};

const CURRENT = new Set(['active', 'on-hold', 'recurrence', 'relapse', 'requested', 'ready', 'received', 'accepted', 'in-progress', 'booked', 'pending', 'proposed', 'arrived']);

function row(r: FhirResource, type: ChartType): ChartLine {
  const base = (text: string, detail: string, status: string, date: string, body = ''): ChartLine => ({ type, id: r.id, text, detail, status, date, body, current: CURRENT.has(status) });
  switch (type) {
    case 'Condition':
      return base(concept(r.code), '', statusCode(r.clinicalStatus), str(r.onsetDateTime) || str(r.recordedDate));
    case 'MedicationRequest':
      return base(concept(r.medicationCodeableConcept), str((r.dosageInstruction as { text?: string }[] | undefined)?.[0]?.text), str(r.status), str(r.authoredOn));
    case 'AllergyIntolerance':
      return base(concept(r.code), str(r.criticality), statusCode(r.clinicalStatus), str(r.recordedDate));
    case 'Observation':
      return base(concept(r.code), value(r), str(r.status), str(r.effectiveDateTime) || str(r.issued));
    case 'DiagnosticReport':
      return base(concept(r.code), str(r.conclusion), str(r.status), str(r.effectiveDateTime) || str(r.issued), attachmentText(r, 'presentedForm'));
    case 'Procedure':
      return base(concept(r.code), '', str(r.status), str(r.performedDateTime) || str((r.performedPeriod as { start?: string } | undefined)?.start));
    case 'DocumentReference':
      return base(str(r.description) || concept(r.type), '', str(r.docStatus) || str(r.status), str(r.date), attachmentText(r, 'content'));
    case 'Task':
      return base(str(r.description) || concept(r.code), ((r.note as { text?: string }[] | undefined) ?? []).map((n) => str(n.text)).filter((x) => x !== '').join(' '), str(r.status), str(r.authoredOn));
    case 'EpisodeOfCare':
      return base(concept((r.type as unknown[] | undefined)?.[0]), '', str(r.status), str((r.period as { start?: string } | undefined)?.start));
    case 'ServiceRequest':
      return base(concept(r.code), ((r.reasonCode as unknown[] | undefined) ?? []).map(concept).filter((x) => x !== '').join('; '), str(r.status), str(r.authoredOn));
    case 'Communication':
      return base(concept(r.topic), '', str(r.status), str(r.sent), ((r.payload as { contentString?: unknown }[] | undefined) ?? []).map((x) => str(x.contentString)).filter((x) => x !== '').join('\n\n'));
    case 'Appointment':
      return base(str(r.description) || concept((r.serviceType as unknown[] | undefined)?.[0]), '', str(r.status), str(r.start));
  }
}

// Every chart resource of the patient (Patient/<id>), current items first and then newest first in
// each section, with the patient.
export function chartOf(resources: Iterable<FhirResource>, patient: string): Chart {
  const id = patient.slice('Patient/'.length);
  let p: Chart['patient'] = null;
  const rows: ChartLine[] = [];
  for (const r of resources) {
    if (r.resourceType === 'Patient' && r.id === id) {
      const n = (r.name as { given?: string[]; family?: string }[] | undefined)?.[0];
      p = { id, name: [...(n?.given ?? []), n?.family ?? ''].join(' ').trim(), birthDate: str(r.birthDate), gender: str(r.gender) };
      continue;
    }
    const type = (CHART_TYPES as readonly string[]).includes(r.resourceType) ? (r.resourceType as ChartType) : null;
    if (type !== null && patientOf(r) === patient) rows.push(row(r, type));
  }
  rows.sort((a, b) => CHART_TYPES.indexOf(a.type) - CHART_TYPES.indexOf(b.type) || Number(b.current) - Number(a.current) || (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1));
  return { patient: p, rows };
}
