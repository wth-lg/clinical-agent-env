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
const DAY_MS = 24 * 3600 * 1000;

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

// An order's ingredients by full name, from its RxNorm text: per component (" / "), the words
// before the first strength, lower-cased, without commas, after any leading package volume or
// release qualifier ("24 HR metoprolol succinate 100 MG ..." gives metoprolol succinate;
// "insulin isophane, human 70 UNT/ML / insulin, regular, human ..." gives insulin isophane human
// and insulin regular human), so drugs that share a first word stay apart (verifier F3).
const LEADING = /^(\d.*|hr|ml|actuat|abuse-deterrent|nda\d+)$/;
export function ingredientsOf(text: string): string[] {
  const parts = text.replace(/\[[^\]]*\]/g, '').toLowerCase().split(/\s+\/\s+/);
  const out = parts.flatMap((part) => {
    const words = part.replace(/,/g, ' ').split(/\s+/).filter((w) => w !== '');
    let i = 0;
    while (i < words.length && LEADING.test(words[i]!)) i++;
    let j = i;
    while (j < words.length && !/^\d/.test(words[j]!)) j++;
    return j > i ? [words.slice(i, j).join(' ')] : [];
  });
  return [...new Set(out)];
}
// The RxNorm code of an order's drug, when it has one: two orders of one code are one drug.
export const rxnormOf = (c: { coding?: Array<{ system?: string; code?: string }> } | undefined): string | null =>
  c?.coding?.find((x) => x.system === 'http://www.nlm.nih.gov/research/umls/rxnorm' && typeof x.code === 'string')?.code ?? null;

// The acute classes the pass completes when stale: antibiotics, antihistamines and opioids for
// acute pain (immediate release; an extended-release opioid is chronic therapy and stays).
const ANTIBIOTICS = ['amoxicillin', 'clavulanate', 'ampicillin', 'penicillin', 'cephalexin', 'cefuroxime', 'cefdinir', 'doxycycline', 'azithromycin', 'erythromycin', 'clindamycin', 'ciprofloxacin', 'levofloxacin', 'nitrofurantoin', 'sulfamethoxazole', 'trimethoprim', 'metronidazole'];
const ANTIHISTAMINES = ['chlorpheniramine', 'diphenhydramine', 'fexofenadine', 'cetirizine', 'loratadine', 'doxylamine', 'hydroxyzine'];
const ACUTE_OPIOIDS = ['hydrocodone', 'oxycodone', 'codeine', 'tramadol', 'meperidine', 'hydromorphone', 'morphine', 'tapentadol'];
export function acuteClass(text: string): 'antibiotic' | 'antihistamine' | 'acute opioid' | null {
  const words = ingredientsOf(text).flatMap((i) => i.split(' '));
  if (words.some((w) => ANTIBIOTICS.includes(w))) return 'antibiotic';
  if (words.some((w) => ANTIHISTAMINES.includes(w))) return 'antihistamine';
  if (words.some((w) => ACUTE_OPIOIDS.includes(w)) && !/extended release|\b(12|24) HR\b/i.test(text)) return 'acute opioid';
  return null;
}

// An order's authoredOn as an instant, or null when it is missing or cannot be read.
export const activeOrderAuthored = (m: { authoredOn?: unknown }): number | null => {
  const ms = typeof m.authoredOn === 'string' ? Date.parse(m.authoredOn) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

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
export function timeOf(r: Resource): number | null {
  for (const f of TIME_FIELDS) {
    const v = get(r as unknown as Record<string, unknown>, f);
    if (typeof v === 'string' && ISO_TIME.test(v)) return Date.parse(v);
  }
  return null;
}
export const patientOf = (r: Resource): string | null => {
  const x = r as unknown as { resourceType: string; id?: string; subject?: { reference?: string }; patient?: { reference?: string } };
  return x.resourceType === 'Patient' ? `Patient/${x.id}` : (x.subject?.reference ?? x.patient?.reference ?? null);
};
const encounterOf = (r: Resource): string | null => {
  const x = r as unknown as { encounter?: { reference?: string }; context?: { encounter?: Array<{ reference?: string }> } };
  return x.encounter?.reference ?? x.context?.encounter?.[0]?.reference ?? null;
};
// A date-time string shifted by delta, in Eastern local time, with its fraction of a second kept
// (a note dated 22:26:24.206 stays after the visit at 22:26:24).
function shiftTime(v: string, delta: number): string {
  const iso = easternIso(Date.parse(v) + delta);
  const fraction = /T\d\d:\d\d:\d\d(\.\d+)/.exec(v)?.[1] ?? '';
  return `${iso.slice(0, 19)}${fraction}${iso.slice(19)}`;
}
// v (deep) with each date-time string, at any path, replaced by fn of it.
function mapTimes(v: unknown, fn: (t: string) => string): unknown {
  if (typeof v === 'string') return ISO_TIME.test(v) ? fn(v) : v;
  if (Array.isArray(v)) return v.map((x) => mapTimes(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapTimes(x, fn)]));
  return v;
}
const timesIn = (r: Resource): string[] => (JSON.stringify(r).match(/"\d{4}-\d\d-\d\dT[^"]*"/g) ?? []).map((v) => JSON.parse(v) as string).filter((v) => ISO_TIME.test(v));
// A resource whose time moves to another Eastern day: each text attachment, at any path
// (DocumentReference.content[].attachment, DiagnosticReport.presentedForm[]), that leads with the old
// day leads with the new one. Only that leading date changes; a later mention of the day stays
// (verifier-phase-P17i-JT2r2-1 S1, JT2r3-1 N1 and m6).
function rewriteHeaderDate(before: Resource, after: Resource): Resource {
  const t0 = timeOf(before);
  const t1 = timeOf(after);
  if (t0 === null || t1 === null) return after;
  const from = easternParts(t0).date;
  const to = easternParts(t1).date;
  if (from === to) return after;
  const head = new RegExp(`^(\\s*)${from}(?!\\d)`);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) as Record<string, unknown>;
    if (typeof o.data === 'string' && /^text\//.test(String(o.contentType))) {
      const text = Buffer.from(o.data, 'base64').toString('utf8');
      if (head.test(text)) o.data = Buffer.from(text.replace(head, `$1${to}`), 'utf8').toString('base64');
    }
    return o;
  };
  return walk(after) as Resource;
}
// Whether moving the members (indexes into before, replaced in after) keeps their patient's order of
// dated resources: against every other dated resource of the patient, each member stays on the same
// side (earlier, at the same instant, later); and each member's own date-times (onset and abatement,
// for example) keep their order.
function keepsOrder(before: readonly Resource[], after: readonly Resource[], members: readonly number[], patient: string): boolean {
  const others = before.flatMap((r, j) => { const t = timeOf(r); return !members.includes(j) && patientOf(r) === patient && t !== null ? [t] : []; });
  return members.every((j) => {
    const a = timeOf(before[j]!);
    const b = timeOf(after[j]!);
    const was = timesIn(before[j]!).map((v) => Date.parse(v));
    const now = timesIn(after[j]!).map((v) => Date.parse(v));
    if (was.some((x, i) => was.slice(i + 1).some((y, k) => Math.sign(x - y) !== Math.sign(now[i]! - now[i + 1 + k]!)))) return false;
    if (a === null || b === null || a === b) return true;
    return others.every((o) => Math.sign(a - o) === Math.sign(b - o));
  });
}

export interface HygieneReport {
  moved: number;
  // Weekend encounters moved to the next weekday because the earlier one is in another month.
  movedLater: string[];
  completedAcute: string[];
  completedDuplicates: string[];
  // Encounters left where they are: why, by id.
  skipped: Record<string, string>;
  // Active orders whose authoredOn cannot be read: neither order rule touches them.
  unreadable: string[];
}

// The world hygiene pass on the base cohort (plan P17j JT2), deterministic, before the overlays:
//   - a base ambulatory encounter that starts outside Monday to Friday 08:00-18:00 Eastern moves,
//     with the resources stamped at it, every date-time of each by the same delta: the resources
//     that reference it, and the patient's other resources dated in its window (its start to the
//     later of its end and the latest of the resources that reference it within a day) that
//     reference no other encounter. The hour goes into 08:00-17:59 on the same date (8 + hour mod 10, minutes kept); a
//     Saturday or Sunday goes to the nearest earlier weekday, or, only when that is in another
//     month, to the nearest later weekday in the same month (listed). It is left where it is,
//     with the reason, when a moved time would pass now or change month, when the patient's order
//     of dated resources (by instant) would change, when a task file that names the patient
//     writes its date as a literal (literalDates, by patient reference), or when a moved time
//     would leave a date any task file writes (anyLiteralDates), so no task names a date that moved;
//   - an active antibiotic, antihistamine or immediate-release opioid authored more than 12 months
//     before now is completed;
//   - of two active orders of a patient with one RxNorm code or one ingredient (by full name), the
//     older is completed;
//   - an active order whose authoredOn cannot be read is listed and left alone.
export function hygiene(resources: readonly Resource[], opts: { now: number; literalDates: ReadonlyMap<string, ReadonlySet<string>>; anyLiteralDates: ReadonlySet<string> }): { resources: Resource[]; report: HygieneReport } {
  const report: HygieneReport = { moved: 0, movedLater: [], completedAcute: [], completedDuplicates: [], skipped: {}, unreadable: [] };
  let out = resources.map((r) => r);
  // The resources that reference each encounter.
  const stamped = new Map<string, number[]>();
  out.forEach((r, i) => {
    const e = encounterOf(r);
    if (e !== null) stamped.set(e, [...(stamped.get(e) ?? []), i]);
  });
  for (let i = 0; i < out.length; i++) {
    const e = out[i]! as unknown as { resourceType: string; id: string; class?: { code?: string }; period?: { start?: string; end?: string } };
    if (e.resourceType !== 'Encounter' || e.class?.code !== 'AMB' || typeof e.period?.start !== 'string') continue;
    const start = Date.parse(e.period.start);
    const p = easternParts(start);
    const weekend = p.weekday === 0 || p.weekday === 6;
    if (!weekend && p.hour >= 8 && p.hour < 18) continue;
    const patient = patientOf(out[i]!);
    // Encounters of the patient that start at the same time move together, with what is stamped at them.
    const twins = out.flatMap((r, j) => {
      const x = r as unknown as { resourceType: string; id: string; period?: { start?: string } };
      return x.resourceType === 'Encounter' && patientOf(r) === patient && typeof x.period?.start === 'string' && Date.parse(x.period.start) === start ? [j] : [];
    });
    const refs = new Set(twins.map((j) => `Encounter/${(out[j] as unknown as { id: string }).id}`));
    const referencing = [...refs].flatMap((ref) => stamped.get(ref) ?? []);
    // A resource that references the encounter but is dated more than a day after it (Synthea dates
    // some conditions at a later visit) still moves with it, but does not widen the window.
    const ends = [...twins.map((j) => (out[j] as unknown as { period?: { end?: string } }).period?.end), ...referencing.map((j) => timeOf(out[j]!))]
      .map((v) => (typeof v === 'string' ? Date.parse(v) : v)).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v) && v - start <= DAY_MS);
    const windowEnd = Math.max(start, ...ends);
    const inWindow = patient === null ? [] : out.flatMap((r, j) => {
      if (r.resourceType === 'Encounter' || patientOf(r) !== patient) return [];
      const t = timeOf(r);
      const ref = encounterOf(r);
      return t !== null && t >= start && t <= windowEnd && (ref === null || refs.has(ref)) ? [j] : [];
    });
    const members = [...new Set([...twins, ...referencing, ...inWindow])];
    if (patient !== null && opts.literalDates.get(patient)?.has(p.date)) {
      report.skipped[e.id] = `its date ${p.date} is a literal in a task file about ${patient}`;
      continue;
    }
    // The date: its own; for a weekend, the nearest earlier weekday, or the nearest later one when
    // the earlier is in another month.
    const earlier = addDays(p.date, p.weekday === 6 ? -1 : -2);
    const later = addDays(p.date, p.weekday === 6 ? 2 : 1);
    const date = !weekend ? p.date : earlier.slice(0, 7) === p.date.slice(0, 7) ? earlier : later.slice(0, 7) === p.date.slice(0, 7) ? later : null;
    const hour = p.hour >= 8 && p.hour < 18 ? p.hour : 8 + (p.hour % 10);
    const target = date === null ? null : easternWall(date, `${String(hour).padStart(2, '0')}${p.time.slice(2)}`);
    if (date === null || target === null) {
      report.skipped[e.id] = date === null ? 'no weekday in its month' : 'its new time does not exist in US Eastern';
      continue;
    }
    const delta = target - start;
    // A date-time belongs to the encounter whose window [start, end] holds it (decisions.tsv
    // 2026-10-27T21:00Z): any date-time of the patient inside this window moves with it, such as an
    // abatement at its start or end; a member moves whole, but a date-time inside another
    // encounter's window stays with that encounter.
    const end = Math.max(start, ...twins.map((j) => Date.parse((out[j] as unknown as { period?: { end?: string } }).period?.end ?? '')).filter((v) => !Number.isNaN(v)));
    const inThis = (ms: number) => ms >= start && ms <= end;
    const others = out.flatMap((r, j) => {
      const x = r as unknown as { period?: { start?: string; end?: string } };
      if (r.resourceType !== 'Encounter' || twins.includes(j) || patientOf(r) !== patient || typeof x.period?.start !== 'string') return [];
      const s0 = Date.parse(x.period.start);
      return [[s0, Math.max(s0, Date.parse(x.period.end ?? '') || s0)] as const];
    });
    const elsewhere = (ms: number) => !inThis(ms) && others.some(([s0, e0]) => ms >= s0 && ms <= e0);
    const candidate = out.map((r, j) => {
      if (members.includes(j)) return rewriteHeaderDate(r, mapTimes(r, (t) => (elsewhere(Date.parse(t)) ? t : shiftTime(t, delta))) as Resource);
      if (patient === null || patientOf(r) !== patient || r.resourceType === 'Encounter') return r;
      const moved = mapTimes(r, (t) => (inThis(Date.parse(t)) ? shiftTime(t, delta) : t)) as Resource;
      return JSON.stringify(moved) === JSON.stringify(r) ? r : rewriteHeaderDate(r, moved);
    });
    const affected = out.flatMap((r, j) => (candidate[j] !== r ? [j] : []));
    // Each time that moves, before and after: none may pass now or change month, and none whose date
    // changes may leave a date that a task file writes.
    const shifted = affected.flatMap((j) => { const b = timesIn(candidate[j]!); return timesIn(out[j]!).map((v, k) => [v, b[k]!] as const).filter(([x, y]) => x !== y); });
    const why = shifted.some(([x, y]) => Date.parse(x) <= opts.now && Date.parse(y) > opts.now) ? 'the move would pass now'
      : shifted.some(([x, y]) => easternParts(Date.parse(x)).date.slice(0, 7) !== easternParts(Date.parse(y)).date.slice(0, 7)) ? 'a time of it would move to another month'
      : ((): string | null => {
        const literal = shifted.find(([x, y]) => x.slice(0, 10) !== y.slice(0, 10) && opts.anyLiteralDates.has(x.slice(0, 10)));
        return literal === undefined ? null : `a time of it on ${literal[0].slice(0, 10)}, a date a task file writes, would move`;
      })();
    if (why !== null) {
      report.skipped[e.id] = why;
      continue;
    }
    if (patient !== null && !keepsOrder(out, candidate, affected, patient)) {
      report.skipped[e.id] = 'the move would change its patient\'s order of dated resources';
      continue;
    }
    if (date !== p.date && date === later) report.movedLater.push(`${e.id} ${p.date} -> ${date}`);
    out = candidate;
    report.moved++;
  }

  // Orders: stale acute ones, then the older of two that share an RxNorm code or an ingredient.
  const meds = out.map((r, i) => ({ r: r as unknown as { resourceType: string; id: string; status?: string; authoredOn?: string; subject?: { reference?: string }; medicationCodeableConcept?: { text?: string; coding?: Array<{ system?: string; code?: string }> } }, i }))
    .filter(({ r }) => r.resourceType === 'MedicationRequest' && r.status === 'active');
  const complete = (i: number) => {
    out[i] = { ...(out[i] as object), status: 'completed' } as Resource;
  };
  const readable = meds.filter(({ r }) => {
    if (activeOrderAuthored(r) !== null) return true;
    report.unreadable.push(`${r.subject?.reference} ${r.id} authoredOn ${r.authoredOn ?? '(none)'}`);
    return false;
  });
  for (const { r, i } of readable) {
    const text = r.medicationCodeableConcept?.text ?? '';
    if (acuteClass(text) !== null && opts.now - activeOrderAuthored(r)! > MONTHS_12_MS) {
      complete(i);
      report.completedAcute.push(`${r.subject?.reference} ${r.id} ${text}`);
    }
  }
  const stillActive = readable.filter(({ i }) => (out[i] as unknown as { status?: string }).status === 'active')
    .sort((a, b) => activeOrderAuthored(b.r)! - activeOrderAuthored(a.r)! || cmp(a.r.id, b.r.id));
  const kept = new Map<string, Set<string>>();
  for (const { r, i } of stillActive) {
    const p = r.subject?.reference ?? '';
    const code = rxnormOf(r.medicationCodeableConcept);
    const keys = [...ingredientsOf(r.medicationCodeableConcept?.text ?? '').map((x) => `name ${x}`), ...(code === null ? [] : [`rxnorm ${code}`])];
    const have = kept.get(p) ?? new Set<string>();
    if (keys.some((x) => have.has(x))) {
      complete(i);
      report.completedDuplicates.push(`${p} ${r.id} ${r.medicationCodeableConcept?.text}`);
      continue;
    }
    for (const x of keys) have.add(x);
    kept.set(p, have);
  }
  return { resources: out, report };
}
