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
import { collapseWhitespace, shownText } from '../env/tools/registry.ts';
import type { Step, StepSearch } from './check.ts';

const SEARCH_KEYS = ['code', 'category', 'date_ge', 'date_le', 'status', 'sort'] as const;

// The filters of a successful fhir_search call, from its tool_call input (rulings R20, R27): the
// type, the patient as 'Patient/<id>', and the enumerated filter keys, each only when it is a
// string. offset comes from the input and next_offset from the result's paging field, each only
// when it is a number. sort is kept so a run of pages can be held to one order (ruling R27).
// Anything else in the input (count) is left out. whole says whether the page held every match:
// the call asked from the first match (offset 0 or none) and the result has no next_offset
// (read/page.ts: present whenever entries remain).
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
  out.whole = (i.offset === undefined || i.offset === 0) && Array.isArray(paging.entries) && paging.next_offset === undefined;
  return out;
}

// The calls that ran, in order, numbered from 1.
export function stepsOf(events: readonly TrialEvent[]): Step[] {
  const steps: Step[] = [];
  const inputs = new Map<string, unknown>();
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    if (e.type !== 'tool_result' || !e.executed) continue;
    const search = e.name === 'fhir_search' && !e.is_error && inputs.has(e.tool_use_id) ? searchOf(inputs.get(e.tool_use_id), e.content) : undefined;
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
    });
  }
  return steps;
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
