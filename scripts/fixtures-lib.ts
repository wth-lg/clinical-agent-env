// Shared by the fixtures-* scripts: NDJSON and gzip in a form that rebuilds byte for byte.
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Resource } from '../packages/env/store.ts';

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

// UTF-16 code unit order. localeCompare follows the host's LC_ALL/LANG (a Danish collation
// sorts 'aa' after 'z'), so no fixtures script may sort with it.
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byTypeThenId = (a: Resource, b: Resource): number => cmp(a.resourceType, b.resourceType) || cmp(a.id!, b.id!);

// One resource per line, sorted by (resourceType, id), LF after every line.
export function toNdjson(resources: Iterable<Resource>): string {
  return [...resources].sort(byTypeThenId).map((r) => `${JSON.stringify(r)}\n`).join('');
}

// gzip with a fixed header: zlib writes mtime 0 but an OS byte that differs by platform
// (19 on macOS, 3 on Linux), so the byte is set to 255 ("unknown"). The deflate stream itself
// can still differ between zlib builds, which is why every check compares the decompressed
// NDJSON and never the .gz bytes.
export function gzip(text: string): Buffer {
  const out = gzipSync(text, { level: 9 });
  out[9] = 0xff;
  return out;
}

export const gunzip = (bytes: Uint8Array): Buffer => gunzipSync(bytes);

// World hygiene helpers (plan P17j JT2), shared by fixtures-build.ts and scripts/test/world-hygiene.test.ts.

export const MONTHS_12_MS = 365 * 24 * 3600 * 1000;

// A time's wall clock in the clinic's zone (US Eastern), as the base cohort writes it.
const EASTERN = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function easternParts(ms: number): { date: string; hour: number; weekday: number; time: string } {
  const p = Object.fromEntries(EASTERN.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: WEEKDAYS.indexOf(p.weekday!), time: `${p.hour}:${p.minute}:${p.second}` };
}
// The instant as ISO 8601 in Eastern local time with its offset (-04:00 or -05:00), to the second.
export function easternIso(ms: number): string {
  const { date, time } = easternParts(ms);
  const offsetMin = Math.round((Date.parse(`${date}T${time}Z`) - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${date}T${time}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// An order's ingredients, from its RxNorm text: per component (" / "), the first word that is not
// a number, a unit or a form qualifier, lower-cased ("24 HR metoprolol succinate 100 MG ..." gives
// metoprolol; "Acetaminophen 325 MG / Oxycodone ..." gives acetaminophen and oxycodone).
const SKIP = /^(\d.*|hr|day|actuat|ml|mg|unt|meq|abuse-deterrent|nda\d+|extended|release|delayed)$/;
export function ingredientsOf(text: string): string[] {
  const parts = text.replace(/\[[^\]]*\]/g, '').split(' / ');
  const out = parts.flatMap((part) => {
    const word = part.toLowerCase().split(/[\s,]+/).find((w) => w !== '' && !SKIP.test(w));
    return word === undefined ? [] : [word];
  });
  return [...new Set(out)];
}

// The acute classes the pass completes when stale: antibiotics, antihistamines and opioids for
// acute pain (immediate release; an extended-release opioid is chronic therapy and stays).
const ANTIBIOTICS = ['amoxicillin', 'clavulanate', 'ampicillin', 'penicillin', 'cephalexin', 'cefuroxime', 'cefdinir', 'doxycycline', 'azithromycin', 'erythromycin', 'clindamycin', 'ciprofloxacin', 'levofloxacin', 'nitrofurantoin', 'sulfamethoxazole', 'trimethoprim', 'metronidazole'];
const ANTIHISTAMINES = ['chlorpheniramine', 'diphenhydramine', 'fexofenadine', 'cetirizine', 'loratadine', 'doxylamine', 'hydroxyzine'];
const ACUTE_OPIOIDS = ['hydrocodone', 'oxycodone', 'codeine', 'tramadol', 'meperidine', 'hydromorphone', 'morphine', 'tapentadol'];
export function acuteClass(text: string): 'antibiotic' | 'antihistamine' | 'acute opioid' | null {
  const ings = ingredientsOf(text);
  if (ings.some((i) => ANTIBIOTICS.includes(i))) return 'antibiotic';
  if (ings.some((i) => ANTIHISTAMINES.includes(i))) return 'antihistamine';
  if (ings.some((i) => ACUTE_OPIOIDS.includes(i)) && !/extended release|\b(12|24) HR\b/i.test(text)) return 'acute opioid';
  return null;
}

export const activeOrderAuthored = (m: { authoredOn?: unknown }): number | null => (typeof m.authoredOn === 'string' ? Date.parse(m.authoredOn) : null);

// The wall time `${date}T${time}` in US Eastern as an instant, or null when the zone skips it.
function easternWall(date: string, time: string): number | null {
  for (const offset of ['-04:00', '-05:00']) {
    const ms = Date.parse(`${date}T${time}${offset}`);
    const p = easternParts(ms);
    if (p.date === date && p.time === time) return ms;
  }
  return null;
}
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?([+-]\d\d:\d\d|Z)$/;

// The fields that date a resource for its patient's order (the first present).
const TIME_FIELDS = ['effectiveDateTime', 'period.start', 'authoredOn', 'date', 'performedDateTime', 'performedPeriod.start', 'onsetDateTime', 'recordedDate', 'issued'];
const get = (r: Record<string, unknown>, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), r);
function timeOf(r: Resource): number | null {
  for (const f of TIME_FIELDS) {
    const v = get(r as unknown as Record<string, unknown>, f);
    if (typeof v === 'string' && ISO_TIME.test(v)) return Date.parse(v);
  }
  return null;
}
const patientOf = (r: Resource): string | null => {
  const x = r as unknown as { resourceType: string; id?: string; subject?: { reference?: string }; patient?: { reference?: string } };
  return x.resourceType === 'Patient' ? `Patient/${x.id}` : (x.subject?.reference ?? x.patient?.reference ?? null);
};
const encounterOf = (r: Resource): string | null => {
  const x = r as unknown as { encounter?: { reference?: string }; context?: { encounter?: Array<{ reference?: string }> } };
  return x.encounter?.reference ?? x.context?.encounter?.[0]?.reference ?? null;
};
// Every date-time string in v (deep) that lies in [lo, hi] shifted by delta, in Eastern local time.
function shiftWithin(v: unknown, lo: number, hi: number, delta: number): unknown {
  if (typeof v === 'string' && ISO_TIME.test(v)) {
    const ms = Date.parse(v);
    return ms >= lo && ms <= hi ? easternIso(ms + delta) : v;
  }
  if (Array.isArray(v)) return v.map((x) => shiftWithin(x, lo, hi, delta));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftWithin(x, lo, hi, delta)]));
  return v;
}
// Whether moving the members (indexes into before, replaced in after) keeps their patient's order of
// dated resources: against every other resource of the patient, each member stays on the same side
// (earlier, the same Eastern date, later). Times within a date do not count: a move within its date
// keeps the order.
function keepsOrder(before: readonly Resource[], after: readonly Resource[], members: readonly number[], patient: string): boolean {
  const day = (r: Resource) => { const t = timeOf(r); return t === null ? null : easternParts(t).date; };
  const others = before.flatMap((r, j) => (!members.includes(j) && patientOf(r) === patient && day(r) !== null ? [day(r)!] : []));
  return members.every((j) => {
    const a = day(before[j]!);
    const b = day(after[j]!);
    if (a === null || b === null || a === b) return true;
    return others.every((o) => Math.sign(cmp(a, o)) === Math.sign(cmp(b, o)));
  });
}

export interface HygieneReport {
  moved: number;
  completedAcute: string[];
  completedDuplicates: string[];
  // Encounters left where they are: why, by id.
  skipped: Record<string, string>;
}

// The world hygiene pass on the base cohort (plan P17j JT2), deterministic, before the overlays:
//   - a base ambulatory encounter that starts outside Monday to Friday 08:00-18:00 Eastern moves,
//     with every date-time of the resources stamped at it (they reference it and lie within its
//     period): the hour into 08:00-17:59 on the same date (8 + hour mod 10, minutes kept), and a
//     Saturday or Sunday to the nearest earlier weekday in the same month (else the nearest later
//     one when the earlier would change the patient's order); never after now, never to another
//     month or year, and only when the patient keeps the order of their dated resources; an
//     encounter whose date a task file that names its patient writes as a literal (literalDates,
//     by patient reference) is left out, and so is a weekend move from a date any task file writes
//     (anyLiteralDates), so no task names a date that moved; a move that would carry any of the
//     encounter's times (an end after midnight) into another month is not made;
//   - an active antibiotic, antihistamine or immediate-release opioid authored more than 12 months
//     before now is completed;
//   - of two active orders of a patient that share an ingredient, the older is completed.
export function hygiene(resources: readonly Resource[], opts: { now: number; literalDates: ReadonlyMap<string, ReadonlySet<string>>; anyLiteralDates: ReadonlySet<string> }): { resources: Resource[]; report: HygieneReport } {
  const report: HygieneReport = { moved: 0, completedAcute: [], completedDuplicates: [], skipped: {} };
  let out = resources.map((r) => r);
  // The resources stamped at an encounter: those that reference it, and those of its patient whose
  // time is its start (the base cohort leaves out the reference on many orders and conditions).
  const stamped = new Map<string, number[]>();
  const atStart = new Map<string, number[]>();
  out.forEach((r, i) => {
    const e = encounterOf(r);
    if (e !== null) stamped.set(e, [...(stamped.get(e) ?? []), i]);
    const t = timeOf(r);
    const p = patientOf(r);
    if (t !== null && p !== null && r.resourceType !== 'Encounter') atStart.set(`${p} ${t}`, [...(atStart.get(`${p} ${t}`) ?? []), i]);
  });
  for (let i = 0; i < out.length; i++) {
    const e = out[i]! as unknown as { resourceType: string; id: string; class?: { code?: string }; period?: { start?: string; end?: string } };
    if (e.resourceType !== 'Encounter' || e.class?.code !== 'AMB' || typeof e.period?.start !== 'string') continue;
    const start = Date.parse(e.period.start);
    const end = typeof e.period.end === 'string' ? Date.parse(e.period.end) : start;
    const p = easternParts(start);
    const weekend = p.weekday === 0 || p.weekday === 6;
    if (!weekend && p.hour >= 8 && p.hour < 18) continue;
    const patient = patientOf(out[i]!);
    // Encounters of the patient that start at the same time move together, with what is stamped at them.
    const twins = out.flatMap((r, j) => {
      const x = r as unknown as { resourceType: string; id: string; period?: { start?: string } };
      return x.resourceType === 'Encounter' && patientOf(r) === patient && typeof x.period?.start === 'string' && Date.parse(x.period.start) === start ? [j] : [];
    });
    const members = [...new Set([...twins, ...twins.flatMap((j) => stamped.get(`Encounter/${(out[j] as unknown as { id: string }).id}`) ?? []), ...(patient === null ? [] : (atStart.get(`${patient} ${start}`) ?? []))])];
    if (patient !== null && opts.literalDates.get(patient)?.has(p.date)) {
      report.skipped[e.id] = `its date ${p.date} is a literal in a task file about ${patient}`;
      continue;
    }
    // The dates to try: its own; for a weekend, the nearest earlier weekday, then the nearest later
    // one, each in its month.
    const dates = !weekend ? [p.date] : [addDays(p.date, p.weekday === 6 ? -1 : -2), addDays(p.date, p.weekday === 6 ? 2 : 1)].filter((d) => d.slice(0, 7) === p.date.slice(0, 7));
    const hour = p.hour >= 8 && p.hour < 18 ? p.hour : 8 + (p.hour % 10);
    let why = 'no weekday in its month';
    let next: Resource[] | null = null;
    for (const date of dates) {
      const target = easternWall(date, `${String(hour).padStart(2, '0')}${p.time.slice(2)}`);
      if (target === null) continue;
      if (target > opts.now) {
        why = 'the move would pass now';
        continue;
      }
      // Each time that moves, before and after: none may change month, and none whose date changes may
      // leave a date that a task file writes.
      const delta = target - start;
      const shifted = members.flatMap((j) => (JSON.stringify(out[j]).match(/"\d{4}-\d\d-\d\dT[^"]*"/g) ?? []).map((v) => JSON.parse(v) as string))
        .filter((v) => { const ms = Date.parse(v); return ms >= start && ms <= end; })
        .map((v) => [v.slice(0, 10), easternIso(Date.parse(v) + delta).slice(0, 10)] as const);
      if (shifted.some(([a, b]) => a.slice(0, 7) !== b.slice(0, 7))) {
        why = 'a time of it would move to another month';
        continue;
      }
      const literal = shifted.find(([a, b]) => a !== b && opts.anyLiteralDates.has(a));
      if (literal !== undefined) {
        why = `a time of it on ${literal[0]}, a date a task file writes, would move`;
        continue;
      }
      const candidate = out.map((r, j) => (members.includes(j) ? (shiftWithin(r, start, end, delta) as Resource) : r));
      if (patient !== null && !keepsOrder(out, candidate, members, patient)) {
        why = 'the move would change its patient\'s order of dated resources';
        continue;
      }
      next = candidate;
      break;
    }
    if (next === null) {
      report.skipped[e.id] = why;
      continue;
    }
    out = next;
    report.moved++;
  }

  // Orders: stale acute ones, then the older of two that share an ingredient.
  const meds = out.map((r, i) => ({ r: r as unknown as { resourceType: string; id: string; status?: string; authoredOn?: string; subject?: { reference?: string }; medicationCodeableConcept?: { text?: string } }, i }))
    .filter(({ r }) => r.resourceType === 'MedicationRequest' && r.status === 'active');
  const complete = (i: number) => {
    out[i] = { ...(out[i] as object), status: 'completed' } as Resource;
  };
  for (const { r, i } of meds) {
    const text = r.medicationCodeableConcept?.text ?? '';
    const authored = typeof r.authoredOn === 'string' ? Date.parse(r.authoredOn) : null;
    if (acuteClass(text) !== null && authored !== null && opts.now - authored > MONTHS_12_MS) {
      complete(i);
      report.completedAcute.push(`${r.subject?.reference} ${r.id} ${text}`);
    }
  }
  const stillActive = meds.filter(({ i }) => (out[i] as unknown as { status?: string }).status === 'active')
    .sort((a, b) => Date.parse(b.r.authoredOn ?? '') - Date.parse(a.r.authoredOn ?? '') || cmp(a.r.id, b.r.id));
  const kept = new Map<string, Set<string>>();
  for (const { r, i } of stillActive) {
    const p = r.subject?.reference ?? '';
    const ings = ingredientsOf(r.medicationCodeableConcept?.text ?? '');
    const have = kept.get(p) ?? new Set<string>();
    if (ings.some((x) => have.has(x))) {
      complete(i);
      report.completedDuplicates.push(`${p} ${r.id} ${r.medicationCodeableConcept?.text}`);
      continue;
    }
    for (const x of ings) have.add(x);
    kept.set(p, have);
  }
  return { resources: out, report };
}
