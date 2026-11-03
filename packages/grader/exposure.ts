// Steps and evidence exposure (design section 3, "Exposure tagging", and section 5,
// "Attribution"), read from the trajectory exactly as the tools tagged their results (P5):
// a resource counts as seen only when a result exposed it, i.e. it is in exposed_ids, or, for
// a note whose check declares a decisive phrase, when a step showed that phrase. The rule
// behind the tags is in packages/env/tools/registry.ts: a result exposes a resource when it
// shows the fields a clinician acts on. For a note or report that is its whole text: fhir_read
// returns it, and so does a search_notes row whose snippet is not cut (a note that fits in one
// snippet); a fhir_search row shows its size and a cut snippet an excerpt, so both only reference
// it. Each step also carries the text it showed (Step.shown: snippets, note
// texts read with fhir_read, policy texts, whitespace-collapsed), so a gate or attribution can
// ask whether a decisive phrase was shown (shows). Errors expose and show nothing. Writes are
// read from written_ids alone (P6), never inferred from a call's input.
//
// Steps are numbered by Step.n, from 1, and every helper here speaks that index: exposedAt and
// firstExposed return an n, lastWrite returns an n, and shows takes beforeStepN, the n of the
// step the text must be seen before, so "shown before the first write" is shows(ctx.steps, ref,
// firstWrite.n, phrase).
//
// Seen before is by turn, not by n (seenBefore, verifier-phase-P17i-P17-T5-1 F2): the calls of
// one answer run in order, but their results reach the model only with the next request, so a
// result counts as seen by a step only when it was returned in an earlier turn (Step.turn). A
// read issued in the same answer as an order has not been seen when the order is made, however
// early in the answer it stands. Every gate that asks whether a source was seen before a write
// asks seenBefore, and shows does too.
//
// Regrading an old record: exposed_ids and referenced_ids are read from the record as the tools
// tagged them then, while shown is derived now from the recorded content. Records made before
// GRADER_VERSION 5 were tagged under the older rule (a search_patients row did not expose its
// Patient), so their exposed_ids predate it while their shown text follows the current shapes;
// a gate comparing the two on such a record compares two rules. Before TOOLS_VERSION 3 no
// snippet exposed its note, even one showing the whole note; from 3 on an uncut snippet does.
import type { TrialEvent } from '../core/events.ts';
import { search, sortStart } from '../env/search.ts';
import type { Resource } from '../env/store.ts';
import { collapseWhitespace, shownText } from '../env/tools/registry.ts';
import type { Step, StepNotes, StepSearch } from './check.ts';

const SEARCH_KEYS = ['code', 'category', 'date_ge', 'date_le', 'status', 'sort'] as const;

// The filters of a successful fhir_search call, from its tool_call input (rulings R20, R27): the
// type, the patient as 'Patient/<id>', and the enumerated filter keys, each only when it is a
// string. offset comes from the input and next_offset from the result's paging field, each only
// when it is a number. sort is kept so a run of pages can be held to one order (ruling R27).
// Anything else in the input (count) is left out. total is the result's match count (builder-292
// G2: two pages whose filters nest and whose totals agree list the same records). whole says whether the page held every match:
// the call asked from the first match (offset 0 or none) and the result has no next_offset
// (read/page.ts: present whenever entries remain). On a sorted call, span is the earliest and
// latest instant the page's rows sort by (env search.ts sortStart, the key fhir_search orders by),
// over the rows that have one, so a gate can tell that a sorted run of pages has passed a window's
// edge (ruling R27, builder-273); absent without a sort or a dated row.
function searchOf(input: unknown, content: unknown): StepSearch | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  if (typeof i.resource_type !== 'string') return undefined;
  const out: StepSearch = { type: i.resource_type, whole: false };
  if (typeof i.patient === 'string') out.patient = i.patient.startsWith('Patient/') ? i.patient : `Patient/${i.patient}`;
  for (const k of SEARCH_KEYS) if (typeof i[k] === 'string') out[k] = i[k];
  const paging = content !== null && typeof content === 'object' ? (content as Record<string, unknown>) : {};
  if (typeof i.offset === 'number') out.offset = i.offset;
  if (typeof paging.next_offset === 'number') out.next_offset = paging.next_offset;
  if (typeof paging.total === 'number') out.total = paging.total;
  out.whole = (i.offset === undefined || i.offset === 0) && Array.isArray(paging.entries) && paging.next_offset === undefined;
  if (out.sort !== undefined && Array.isArray(paging.entries)) {
    const keys = paging.entries.map(rowStart).filter((k): k is number => k !== undefined);
    if (keys.length > 0) out.span = [Math.min(...keys), Math.max(...keys)];
  }
  return out;
}
// The instant a result row sorts by, or undefined when it has none or is not a resource.
function rowStart(row: unknown): number | undefined {
  if (row === null || typeof row !== 'object' || typeof (row as { resourceType?: unknown }).resourceType !== 'string') return undefined;
  try {
    return sortStart(row as Parameters<typeof sortStart>[0]);
  } catch {
    return undefined;
  }
}

const NOTES_KEYS = ['date_ge', 'date_le', 'type'] as const;

// The filters of a successful search_notes call, from its tool_call input alone (as searchOf, from
// verifier-W1T-190-r2-clinical N2): the query as written, the patient as 'Patient/<id>', date_ge,
// date_le and type, each only when it is a string, and the paging: offset from the input,
// next_offset from the result, whole when the page asked from the first match and has no
// next_offset. Undefined when the input has no string query.
function notesOf(input: unknown, content: unknown): StepNotes | undefined {
  if (input === null || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  if (typeof i.query !== 'string') return undefined;
  const out: StepNotes = { query: i.query, whole: false };
  if (typeof i.patient === 'string') out.patient = i.patient.startsWith('Patient/') ? i.patient : `Patient/${i.patient}`;
  for (const k of NOTES_KEYS) if (typeof i[k] === 'string') out[k] = i[k];
  const paging = content !== null && typeof content === 'object' ? (content as Record<string, unknown>) : {};
  if (typeof i.offset === 'number') out.offset = i.offset;
  if (typeof paging.next_offset === 'number') out.next_offset = paging.next_offset;
  out.whole = (i.offset === undefined || i.offset === 0) && Array.isArray(paging.entries) && paging.next_offset === undefined;
  return out;
}

// The calls that ran, in order, numbered from 1; an env_event adds to its call's arrivals.
export function stepsOf(events: readonly TrialEvent[]): Step[] {
  const steps: Step[] = [];
  const inputs = new Map<string, unknown>();
  const byCall = new Map<string, { arrivals?: Array<{ spec: string; keys: readonly string[] }> }>();
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    if (e.type === 'env_event') {
      const at = byCall.get(e.tool_use_id);
      if (at !== undefined) (at.arrivals ??= []).push({ spec: e.spec, keys: [...e.keys] });
      continue;
    }
    if (e.type !== 'tool_result' || !e.executed) continue;
    const search = e.name === 'fhir_search' && !e.is_error && inputs.has(e.tool_use_id) ? searchOf(inputs.get(e.tool_use_id), e.content) : undefined;
    const notes = e.name === 'search_notes' && !e.is_error && inputs.has(e.tool_use_id) ? notesOf(inputs.get(e.tool_use_id), e.content) : undefined;
    steps.push({
      n: steps.length + 1,
      seq: e.seq,
      turn: e.turn,
      tool: e.name,
      is_error: e.is_error,
      error_code: e.error_code,
      exposed_ids: e.is_error ? [] : e.exposed_ids,
      referenced_ids: e.is_error ? [] : e.referenced_ids,
      written_ids: e.is_error ? [] : (e.written_ids ?? []),
      shown: e.is_error ? {} : shownText(e.content),
      ...(search ? { search } : {}),
      ...(notes ? { notes } : {}),
    });
    byCall.set(e.tool_use_id, steps.at(-1) as unknown as { arrivals?: Array<{ spec: string; keys: readonly string[] }> });
  }
  return steps;
}

// The turn of the trial's last response, 0 when none.
export function lastTurn(events: readonly TrialEvent[]): number {
  let turn = 0;
  for (const e of events) if (e.type === 'response' && e.turn > turn) turn = e.turn;
  return turn;
}

// Whether a sorted fhir_search page passed a window's edge (R35, R36): newest first, its earliest
// row is before the window opens; oldest first, its latest is after it closes. Later pages of the
// run sort further out (Step.search.span), so a run from offset 0 that reaches it reviewed the
// window. Only for a point date sortStart reads, not a period (an EpisodeOfCare). No sort: false.
export function passesWindow(s: StepSearch, opens: number, closes: number): boolean {
  if (s.span === undefined) return false;
  if (s.sort === '-date') return s.span[0] < opens;
  if (s.sort === 'date') return s.span[1] > closes;
  return false;
}

// R27 page runs, shared by every absence and window review (T3 absenceShownAt, T2 windowSearchedAt,
// T6 coveredAt; builder-292 G2, verifier-phase-P17i-S0-208-1 M2, M3; builder-294 G5). A run starts at
// a covering page at offset 0 and continues with covering pages, each at the previous page's
// next_offset (other calls may come between them). It is complete at a page with no next_offset, or
// at a sorted page that passes the window's edge (R36, `passes`: passesWindow with the caller's
// window). A whole page is complete by itself. The step of the first completion, or null.
//
// A later page continues the run when it has the same type, filters and order as the run's first
// page, or (G2; R34, R16: never stricter than the policy) the same type and order, filters that nest
// (one page's match set holds the other's: every filter the narrower sets, the wider sets the same or
// leaves out) and the same total. Two nested sets of one size are one set, so both pages list the
// same records in the same order and joined offsets show every one.
//
// A run that stops can be finished by a narrower query (G5, pilot-4b crc-care-gap/1). The run is
// sorted by date, explicitly; the later query has the same type, order and filters, except that it
// bounds the date on the side the run was heading to (newest first: date_le; oldest first: date_ge),
// and it starts at offset 0. The bound reaches the last row shown: newest first, a row dated at the
// last page's earliest instant matches date_le, as fhir_search reads the bound (a date-only bound
// covers its day in UTC); oldest first, a row at the last page's latest instant matches date_ge.
// Every row the run did not show sorts at or beyond that row, so the narrower query holds it (sort
// and date filter read the same date values: env search.ts sortStart, dateMatcher). The run's first
// page must carry a date filter: rows without a date sort last either way, and a date bound would
// hide them. The narrower query then runs as a run of its own, not held to `covers`, and its
// completion completes the review; it may stop and be finished by a narrower query again. A gap
// between the last row and the bound, another order, another non-date filter or a moved far-side
// bound proves nothing.
//
// Every join holds only if no record of the searched type entered the store between the two calls
// (M3; N1 for a run with the same filters, whose offsets an arrival would shift): it is refused when
// an arrival added one between them. An arrival lands after the call that fires it, so the steps
// from the earlier page's up to, not including, the later page's (for a narrower query, from the
// last page shown). It adds a record when its id of the searched type was not exposed or referenced
// by any step that ran (not a failed call: N4) up to the one that fired it; a class B correction
// that replaces a record in place (crc-b2 on its trigger page, pilot-4a crc-care-gap/2) keeps the set
// and its size. The check reads the searched query's patient (coordinator at the #208 handshake):
// when both pages name one patient, an arrival the caller's resolver (arrivalPatient: events.ts
// arrivalPatients over the task's specs) puts on another patient leaves her records as they were.
// An arrival it cannot place, or any arrival under a clinic-wide page, still counts. Filters that do
// not nest, and a nested page without a total, prove nothing.
const RUN_FILTERS = ['patient', 'code', 'category', 'date_ge', 'date_le', 'status'] as const;
export const runKey = (s: StepSearch): string => JSON.stringify([s.type, ...RUN_FILTERS.map((k) => s[k] ?? null), s.sort ?? 'date']);
const holdsAll = (wide: StepSearch, narrow: StepSearch) => RUN_FILTERS.every((k) => wide[k] === undefined || wide[k] === narrow[k]);
export type ArrivalPatient = (key: string) => string | undefined;
// Whether an arrival on a step from `from` up to, not including, `to` added a record of the
// searched type to the set the pages s0 and s list (M3, N1, N4).
function addedBetween(steps: readonly Step[], from: number, to: number, s0: StepSearch, s: StepSearch, arrivalPatient?: ArrivalPatient): boolean {
  const known = (k: string, at: number) => steps.some((st) => st.n <= at && !st.is_error && (st.exposed_ids.includes(k) || st.referenced_ids.includes(k)));
  const patient = s0.patient !== undefined && s.patient === s0.patient ? s0.patient : undefined;
  const elsewhere = (k: string) => patient !== undefined && arrivalPatient !== undefined && (arrivalPatient(k) ?? patient) !== patient;
  return steps.some((st) => st.n >= from && st.n < to && (st.arrivals ?? []).some((a) => a.keys.some((k) => k.startsWith(`${s0.type}/`) && !known(k, st.n) && !elsewhere(k))));
}
export function continuesRun(steps: readonly Step[], first: Step, later: Step, arrivalPatient?: ArrivalPatient): boolean {
  const s0 = first.search!;
  const s = later.search!;
  if (runKey(s) !== runKey(s0)) {
    if (s.type !== s0.type || (s.sort ?? 'date') !== (s0.sort ?? 'date') || s0.total === undefined || s.total !== s0.total) return false;
    if (!holdsAll(s, s0) && !holdsAll(s0, s)) return false;
  }
  return !addedBetween(steps, first.n, later.n, s0, s, arrivalPatient);
}
// Whether a row dated at instant t matches date_le (or date_ge) = value, read by fhir_search itself
// on a one-row probe, so the bound's precision and offset are read as the tool reads them. A value
// the search rejects matches nothing.
function boundHolds(key: 'date_le' | 'date_ge', value: string, t: number): boolean {
  // A row whose date Period has no start sorts at -Infinity (env search.ts sortStart): no bound
  // reaches it, and new Date(t) would throw (verifier-phase-P17i-G5-210-1 M1).
  if (!Number.isFinite(t)) return false;
  const row = { resourceType: 'Observation', id: 'edge', status: 'final', code: {}, effectiveDateTime: new Date(t).toISOString() } as unknown as Resource;
  try {
    return search<Resource>([row], 'Observation', { date: `${key === 'date_le' ? 'le' : 'ge'}${value}` }).total === 1;
  } catch {
    return false;
  }
}
// A run in progress: the first page of its current query, the last page it joined and the offset it
// expects next.
interface RunState { seg: Step; last: Step; next: number | undefined }
// Whether `later` starts a narrower query that holds every row run r did not show (G5).
function narrowsRest(steps: readonly Step[], r: RunState, later: Step, arrivalPatient?: ArrivalPatient): boolean {
  const b = r.seg.search!;
  const span = r.last.search!.span;
  const s = later.search!;
  const near = s.sort === '-date' ? 'date_le' : s.sort === 'date' ? 'date_ge' : undefined;
  if (near === undefined || (s.offset ?? 0) !== 0 || s.type !== b.type || s.sort !== b.sort || span === undefined) return false;
  if (b.date_ge === undefined && b.date_le === undefined) return false;
  if (RUN_FILTERS.some((k) => k !== near && s[k] !== b[k])) return false;
  const bound = s[near];
  if (bound === undefined || !boundHolds(near, bound, near === 'date_le' ? span[0] : span[1])) return false;
  return !addedBetween(steps, r.last.n, later.n, b, s, arrivalPatient);
}
export function runCompleteAt(steps: readonly Step[], covers: (s: StepSearch) => boolean, passes: (s: StepSearch) => boolean, arrivalPatient?: ArrivalPatient): number | null {
  const searches = steps.filter((st) => st.search !== undefined);
  let best: number | null = null;
  const done = (n: number) => { best = best === null ? n : Math.min(best, n); };
  for (const [i, first] of searches.entries()) {
    const s0 = first.search!;
    if (!covers(s0) || (s0.offset ?? 0) !== 0) continue;
    if (s0.whole || passes(s0)) { done(first.n); continue; }
    // Each narrower query opens a state of its own beside the run it would finish.
    let states: RunState[] = [{ seg: first, last: first, next: s0.next_offset }];
    run: for (const later of searches.slice(i + 1)) {
      const s = later.search!;
      const out: RunState[] = [];
      for (const r of states) {
        const joins = r.next !== undefined && s.offset === r.next && (r.seg !== first || covers(s)) && continuesRun(steps, r.seg, later, arrivalPatient);
        const opens = !joins && narrowsRest(steps, r, later, arrivalPatient);
        if ((joins || opens) && (s.next_offset === undefined || passes(s))) { done(later.n); break run; }
        if (joins) out.push({ seg: r.seg, last: later, next: s.next_offset });
        else out.push(r);
        if (opens) out.push({ seg: later, last: later, next: s.next_offset });
      }
      states = out;
    }
  }
  return best;
}

// Whether <Type>/<id> names `id`, given bare or typed.
export const sameId = (key: string, id: string): boolean => (id.includes('/') ? key === id : key.slice(key.indexOf('/') + 1) === id);

export function firstExposed(steps: readonly Step[], id: string): number | null {
  return steps.find((s) => s.exposed_ids.some((k) => sameId(k, id)))?.n ?? null;
}

const comparable = (text: string) => collapseWhitespace(text).toLowerCase();

// Whether step `s` showed `phrase` in the text of `ref` (bare or typed). Each shown text is
// checked alone (Step.shown joins two with a newline, which collapsing leaves nowhere else), so
// a phrase never matches across two snippets.
function showedIn(s: Step, ref: string, phrase: string): boolean {
  const want = comparable(phrase);
  return want !== '' && Object.entries(s.shown).some(([k, t]) => sameId(k, ref) && t.split('\n').some((part) => comparable(part).includes(want)));
}

// The turn of step n. A number past the last step stands after every turn, and one before the
// first before every turn, so a check can ask about the end of a trial or its start.
function turnOf(steps: readonly Step[], n: number): number {
  const s = steps.find((x) => x.n === n);
  if (s !== undefined) return s.turn;
  return n > (steps.at(-1)?.n ?? 0) ? Infinity : -Infinity;
}

// Whether the result of step `seen` (a Step.n, or null for never) had reached the model when it
// made step `act`: it was returned in an earlier turn. A step is never seen before another of
// its own answer.
export function seenBefore(steps: readonly Step[], seen: number | null, act: number): boolean {
  return seen !== null && turnOf(steps, seen) < turnOf(steps, act);
}

// Whether a step seen before step beforeStepN (seenBefore: returned in an earlier turn) showed
// `phrase` in the text of `ref`, given bare or typed. Both sides are whitespace-collapsed and
// compared ignoring case. Shown text comes from a search_notes snippet, a fhir_read of a note or
// report, or a whole policy (Step.shown); a resource of any other type is never shown, so this
// is false for it. An empty phrase is never shown.
export function shows(steps: readonly Step[], ref: string, beforeStepN: number, phrase: string): boolean {
  return seenBefore(steps, firstShown(steps, ref, phrase), beforeStepN);
}

// The first step that showed `phrase` in the text of `ref`, or null; shows(steps, ref, m,
// phrase) holds exactly for the steps m of a later turn than that n.
export function firstShown(steps: readonly Step[], ref: string, phrase: string): number | null {
  return steps.find((s) => showedIn(s, ref, phrase))?.n ?? null;
}

// The last step whose committed write touched any of `ids`, or null.
export function lastWrite(steps: readonly Step[], ids: readonly string[]): number | null {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]!.written_ids.some((k) => ids.some((id) => sameId(k, id)))) return steps[i]!.n;
  return null;
}
