// World ids (builder-196): after the overlays, fixtures:build numbers every numbered resource of
// the world by the rule scripts/fixtures-synthea.ts numbers the Synthea cohort with: per type, 1..N
// in (patient, date, code) order, as <prefix>-<5 digits>. Generated and planted resources share
// one sequence, so a planted Observation takes its place among its patient's Observations by
// date, never a number above the cohort's last, and its id says nothing its patient and date do
// not. The types only overlays write (Task, Communication, ...) are numbered by the same rule.
// The one exception is a Patient an overlay adds (packages/env/overlay.ts TASKS added, W5): its
// resources are numbered in a block of its slot, apart from the cohort's sequence (worldIds).
//
// What gets a number: every resource whose build id is numbered (obs-00040, as base.ndjson.gz has
// it) or is a registry key (obs-t1-scr-1020), apart from Patients (pt-0001 stays; the task slots
// name them) and the name-shaped Practitioner, Organization and Group ids. Ties in (patient, date,
// code) keep the build id's order, as Synthea's own uuid did; a resource about no patient sorts
// after every patient's.
import type { Resource } from './store.ts';

export const NUMBERED = /^([a-z]+)-(\d{5})$/;
// A registry key: <type prefix>-t<task>-<rest> (packages/env/overlay.ts).
export const REGISTRY_KEY = /^([a-z]+)-t\d+-[a-z0-9][a-z0-9-]*$/;
export const NAME_SHAPED = new Set(['Practitioner', 'Organization', 'Group']);

type Json = Record<string, unknown>;

// As scripts/fixtures-synthea.ts dateOf, plus the date fields of the types only overlays write
// (Communication.sent, Appointment.start), which no generated resource has.
function dateOf(r: Json): string | undefined {
  for (const k of ['effectiveDateTime', 'onsetDateTime', 'authoredOn', 'performedDateTime', 'recordedDate', 'date', 'sent', 'start']) {
    if (typeof r[k] === 'string') return r[k] as string;
  }
  for (const k of ['period', 'performedPeriod', 'effectivePeriod']) {
    const start = (r[k] as { start?: string } | undefined)?.start;
    if (start) return start;
  }
  return undefined;
}

// As scripts/fixtures-synthea.ts codeOf.
function codeOf(r: Json): string {
  for (const k of ['code', 'medicationCodeableConcept', 'type']) {
    const v = r[k];
    const cc = (Array.isArray(v) ? v[0] : v) as { coding?: Array<{ code?: string }> } | undefined;
    if (cc?.coding?.[0]?.code) return cc.coding[0].code;
  }
  return '';
}

const ms = (d: string | undefined): number => {
  const t = d ? Date.parse(d.length === 10 ? `${d}T00:00:00Z` : d) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

// The first Patient a resource references, at any depth.
function patientOf(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = patientOf(x);
      if (p !== undefined) return p;
    }
  } else if (v !== null && typeof v === 'object') {
    const ref = (v as { reference?: unknown }).reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) return ref.slice(8);
    for (const x of Object.values(v)) {
      const p = patientOf(x);
      if (p !== undefined) return p;
    }
  }
  return undefined;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Whether fixtures:build numbers this resource, and under which prefix.
export function numberedPrefix(r: Resource): string | null {
  if (r.resourceType === 'Patient' || NAME_SHAPED.has(r.resourceType)) return null;
  return (NUMBERED.exec(r.id ?? '') ?? REGISTRY_KEY.exec(r.id ?? ''))?.[1] ?? null;
}

// The most resources of one type an added Patient's slot holds, and the highest slot number: a
// block id is <prefix>-<2-digit slot><3 digits>, five digits like every generated id.
export const SLOT_BLOCK = 999;
const LAST_SLOT = 99;

// Build id -> world id for every numbered resource, keyed by Type/id. Throws when two resources
// of one type carry different prefixes. A resource of one of `addedPatients` (the world ids of the
// Patients the overlays add, W5 slots: packages/env/overlay.ts TASKS added) is numbered apart, in
// a block of its Patient's slot per type (pt-0070's Observations are obs-70001 on, in (date, code)
// order), so the cohort's sequence is what it is without it and no toggle moves another block;
// more than SLOT_BLOCK resources of a type for one such Patient, or a slot past 99, fails loudly.
export function worldIds(resources: readonly Resource[], addedPatients: ReadonlySet<string> = new Set()): Map<string, string> {
  type Row = { r: Resource; patient: string; date: number; code: string };
  const byType = new Map<string, Row[]>();
  const blocks = new Map<string, Row[]>(); // `${type}/${patient}` -> the added Patient's resources of the type
  const prefixes = new Map<string, string>();
  for (const r of resources) {
    const prefix = numberedPrefix(r);
    if (prefix === null) continue;
    const seen = prefixes.get(r.resourceType);
    if (seen !== undefined && seen !== prefix) throw new Error(`renumber: ${r.resourceType}/${r.id} has prefix ${prefix}, other ${r.resourceType} ids ${seen}`);
    prefixes.set(r.resourceType, prefix);
    const json = r as unknown as Json;
    const patient = patientOf(r) ?? '￿';
    const row: Row = { r, patient, date: ms(dateOf(json)), code: codeOf(json) };
    const into = addedPatients.has(patient) ? blocks : byType;
    const key = addedPatients.has(patient) ? `${r.resourceType}/${patient}` : r.resourceType;
    into.set(key, [...(into.get(key) ?? []), row]);
  }
  const order = (a: Row, b: Row) => cmp(a.patient, b.patient) || a.date - b.date || cmp(a.code, b.code) || cmp(a.r.id!, b.r.id!);
  const out = new Map<string, string>();
  for (const [type, list] of byType) {
    list.sort(order);
    list.forEach(({ r }, i) => out.set(`${type}/${r.id}`, `${prefixes.get(type)}-${String(i + 1).padStart(5, '0')}`));
  }
  for (const [key, list] of blocks) {
    const type = key.slice(0, key.indexOf('/'));
    const patient = key.slice(key.indexOf('/') + 1);
    const slot = Number(/^pt-(\d{4})$/.exec(patient)?.[1] ?? NaN);
    if (!(slot >= 1 && slot <= LAST_SLOT)) throw new Error(`renumber: Patient/${patient} is an added Patient whose slot is not 1 to ${LAST_SLOT}; its ${type} resources cannot take a block`);
    if (list.length > SLOT_BLOCK) throw new Error(`renumber: Patient/${patient}: ${list.length} ${type} resources, at most ${SLOT_BLOCK} in its slot`);
    list.sort(order);
    list.forEach(({ r }, i) => out.set(`${type}/${r.id}`, `${prefixes.get(type)}-${String(slot).padStart(2, '0')}${String(i + 1).padStart(3, '0')}`));
  }
  return out;
}
