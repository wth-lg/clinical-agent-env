// The read-only Chart tab's data (pre-audit S12, P17j JU10): a task's patients and a patient's chart,
// read from the FHIR R4 store the tools act on (the in-browser world), never from the grader's files.
// A task's overlay marks the resources it adds with its task number in their id (obs-t1-scr-1020,
// task-t2-inbox-4, grp-t3-okafor-crc), so a task's patients are the subjects of its marked
// resources and the members of its marked Groups (the panel task T3 names its patients by a Group).

// The overlay marker of each task (tasks/<id>/overlay.ts and its task.toml header name the T number).
const TASK_MARKER: Readonly<Record<string, string>> = {
  'renal-dose-review': 't1',
  'results-inbox': 't2',
  'crc-care-gap': 't3',
  'discharge-medrec': 't4',
  'contrast-ct-prep': 't5',
  'message-queue': 't6',
};

export type ChartResource = { resourceType: string; id: string; [field: string]: unknown } & {
  subject?: { reference?: string };
  patient?: { reference?: string };
};

const ref = (v: unknown): string | null => {
  const r = (v as { reference?: unknown } | undefined)?.reference;
  return typeof r === 'string' ? r : null;
};
const patientRef = (r: ChartResource): string | null => {
  for (const k of ['subject', 'patient', 'for'] as const) {
    const p = ref(r[k]);
    if (p?.startsWith('Patient/')) return p;
  }
  return null;
};

// The patients of a task, as Patient/<id>, sorted; none for a task with no marker.
export function taskPatients(resources: Iterable<ChartResource>, task: string): string[] {
  const marker = TASK_MARKER[task];
  if (marker === undefined) return [];
  const marked = new RegExp(`(?:^|-)${marker}(?:-|$)`);
  const out = new Set<string>();
  for (const r of resources) {
    if (!marked.test(r.id)) continue;
    const p = patientRef(r);
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
export const CHART_TYPES = ['Condition', 'MedicationRequest', 'AllergyIntolerance', 'Observation', 'DocumentReference'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const SECTION_TITLE: Readonly<Record<ChartType, string>> = {
  Condition: 'Problems',
  MedicationRequest: 'Medications',
  AllergyIntolerance: 'Allergies',
  Observation: 'Labs and results',
  DocumentReference: 'Notes',
};

export interface ChartRow {
  type: ChartType;
  id: string;
  text: string;
  detail: string;
  status: string;
  date: string;
}
export interface Chart {
  patient: { id: string; name: string; birthDate: string; gender: string } | null;
  rows: ChartRow[];
}

type Concept = { text?: string; coding?: { display?: string; code?: string }[] } | undefined;
const concept = (c: unknown): string => {
  const x = c as Concept;
  return x?.text ?? x?.coding?.[0]?.display ?? x?.coding?.[0]?.code ?? '';
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const statusCode = (v: unknown): string => (typeof v === 'string' ? v : concept(v));

function value(r: ChartResource): string {
  const q = r.valueQuantity as { value?: number; unit?: string } | undefined;
  if (q?.value !== undefined) return `${q.value}${q.unit ? ` ${q.unit}` : ''}`;
  if (typeof r.valueString === 'string') return r.valueString;
  if (r.valueCodeableConcept !== undefined) return concept(r.valueCodeableConcept);
  return '';
}

function row(r: ChartResource, type: ChartType): ChartRow {
  switch (type) {
    case 'Condition':
      return { type, id: r.id, text: concept(r.code), detail: '', status: statusCode(r.clinicalStatus), date: str(r.onsetDateTime) || str(r.recordedDate) };
    case 'MedicationRequest':
      return { type, id: r.id, text: concept(r.medicationCodeableConcept), detail: str((r.dosageInstruction as { text?: string }[] | undefined)?.[0]?.text), status: str(r.status), date: str(r.authoredOn) };
    case 'AllergyIntolerance':
      return { type, id: r.id, text: concept(r.code), detail: str(r.criticality), status: statusCode(r.clinicalStatus), date: str(r.recordedDate) };
    case 'Observation':
      return { type, id: r.id, text: concept(r.code), detail: value(r), status: str(r.status), date: str(r.effectiveDateTime) || str(r.issued) };
    case 'DocumentReference':
      return { type, id: r.id, text: str(r.description) || concept(r.type), detail: concept(r.type), status: str(r.docStatus) || str(r.status), date: str(r.date) };
  }
}

// Every chart resource of the patient (Patient/<id>), newest first in each section, with the patient.
export function chartOf(resources: Iterable<ChartResource>, patient: string): Chart {
  const id = patient.slice('Patient/'.length);
  let p: Chart['patient'] = null;
  const rows: ChartRow[] = [];
  for (const r of resources) {
    if (r.resourceType === 'Patient' && r.id === id) {
      const n = (r.name as { given?: string[]; family?: string }[] | undefined)?.[0];
      p = { id, name: [...(n?.given ?? []), n?.family ?? ''].join(' ').trim(), birthDate: str(r.birthDate), gender: str(r.gender) };
      continue;
    }
    const type = (CHART_TYPES as readonly string[]).includes(r.resourceType) ? (r.resourceType as ChartType) : null;
    if (type !== null && patientRef(r) === patient) rows.push(row(r, type));
  }
  rows.sort((a, b) => CHART_TYPES.indexOf(a.type) - CHART_TYPES.indexOf(b.type) || (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1));
  return { patient: p, rows };
}
