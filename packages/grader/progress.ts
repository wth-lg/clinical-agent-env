// Rule P-L (plan-amendment-worklist W0-A, "Attribution rule for stops"; hardened against padding
// in verifier-phase-P17i-W0-A-1 F3): whether a trial that reached a turn, cost or working-time cap
// was still making progress or was looping, from its trajectory alone, so a grade, an offline
// regrade and a replay give the same answer.
//   target        what a call acts on: its tool name and canonical JSON input without free text
//                 (FREE_TEXT: a note's text, a message body, a reason), paging (PAGING) or a field
//                 the tool's schema does not declare; so the same read with another note, or the
//                 same search one page on, is the same call
//   tail          the last PROGRESS_TAIL executed tool calls (all of them when fewer); a call
//                 recorded with executed false (after finish) is not a call that ran
//   repeats       tail calls whose target equals an earlier call's in the same trial (earlier in
//                 the tail included)
//   repeat_share  repeats / tail (0 for an empty tail)
//   new_ids       ids a tail call found that no earlier result had exposed or written: the ids
//                 its result exposed and the ids it wrote, only for a call that is not a repeat
//                 (a repeated write is not progress), and never an id the call's own input names
//                 (a read of an id the model supplied found nothing)
//   looping       repeat_share >= LOOP_REPEAT_SHARE, or new_ids < minNewIds(tail): fewer than a
//                 quarter of the tail's calls' worth (5 of 20; at least 1)
// A cap reached while progressing is the environment's (outcome.ts ENV_LIMIT, criterion E8): the
// cap the harness set was too small for the task. Reached while looping it is the model's (LIMIT,
// MF2). The thresholds were checked on every pilot-1 and pilot-2 trajectory truncated at 50%, 75%
// and 90% of its turns (198 truncations, all progressing: repeat share at most 0.17, at least 6
// new ids), on the padding probes g1-g7, and on synthetic tails that repeat one search or re-read
// only seen ids (test/progress.test.ts).
import type { EventBody } from '../core/events.ts';
import { TOOLS } from '../env/tools/write/index.ts';

export const PROGRESS_TAIL = 20;
export const LOOP_REPEAT_SHARE = 0.5;
export const MIN_NEW_SHARE = 0.25;
// The new ids a tail of `tail` calls needs to read as progressing.
export const minNewIds = (tail: number): number => Math.max(1, Math.ceil(MIN_NEW_SHARE * tail));
// The caps rule P-L decides; a context-window stop is always the environment's, a second
// max_tokens stop always the model's.
export const CAP_LIMITS: readonly string[] = ['turns', 'cost', 'wall_clock'];
// Input fields that are prose or paging, not what the call acts on (env/tools input schemas).
export const FREE_TEXT: readonly string[] = ['text', 'title', 'body', 'subject', 'reason', 'as_needed_reason', 'comment', 'description', 'summary'];
export const PAGING: readonly string[] = ['count', 'offset', 'sort'];

export interface Progress {
  tail: number;
  repeats: number;
  repeat_share: number;
  new_ids: number;
  looping: boolean;
}

// JSON with object keys sorted, so the same input in another key order is the same call.
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};

const declared = new Map(TOOLS.map((t) => [t.name, new Set(Object.keys(t.inputSchema.properties))]));
// The input fields a call targets; a tool outside env/tools keeps every field but free text and paging.
function targetInput(name: string, input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const fields = declared.get(name);
  return Object.fromEntries(Object.entries(input).filter(([k]) => !FREE_TEXT.includes(k) && !PAGING.includes(k) && (fields === undefined || fields.has(k))));
}
const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : typeof v === 'object' && v !== null ? Object.values(v).flatMap(strings) : []);
// An id <Type>/<id> the input names, whole or as its bare id.
const names = (input: ReadonlySet<string>, id: string): boolean => input.has(id) || input.has(id.slice(id.indexOf('/') + 1));

// A trajectory's events, stamped (TrialEvent) or not (the loop's EventBody).
export function progress(events: readonly EventBody[]): Progress {
  const inputs = new Map<string, unknown>();
  const ran: Array<{ target: string; named: ReadonlySet<string>; found: readonly string[] }> = [];
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    else if (e.type === 'tool_result' && e.executed) {
      const input = targetInput(e.name, inputs.get(e.tool_use_id) ?? null);
      ran.push({ target: `${e.name} ${canonical(input)}`, named: new Set(strings(input)), found: [...e.exposed_ids, ...(e.written_ids ?? [])] });
    }
  }
  const start = Math.max(0, ran.length - PROGRESS_TAIL);
  const tail = ran.slice(start);
  const targets = new Set(ran.slice(0, start).map((c) => c.target));
  const seen = new Set(ran.slice(0, start).flatMap((c) => c.found));
  let repeats = 0;
  let new_ids = 0;
  for (const c of tail) {
    const repeat = targets.has(c.target);
    if (repeat) repeats++;
    targets.add(c.target);
    for (const id of c.found) {
      if (!repeat && !seen.has(id) && !names(c.named, id)) new_ids++;
      seen.add(id);
    }
  }
  const repeat_share = tail.length === 0 ? 0 : repeats / tail.length;
  return { tail: tail.length, repeats, repeat_share, new_ids, looping: repeat_share >= LOOP_REPEAT_SHARE || new_ids < minNewIds(tail.length) };
}

// The P-L facts in words, for a criterion's evidence (outcomes.ts E8 and MF2); the new ids needed
// show only when too few were found, so an E8 reason stays within explain.ts REASON_WORDS.
export const progressText = (p: Progress): string => {
  const need = minNewIds(p.tail);
  return `last ${p.tail} call${p.tail === 1 ? '' : 's'}: ${p.repeats} repeat${p.repeats === 1 ? '' : 's'} (share ${p.repeat_share.toFixed(2)}), ${p.new_ids} new id${p.new_ids === 1 ? '' : 's'}${p.new_ids < need ? ` (${need} needed)` : ''}; ${p.looping ? 'looping' : 'progressing'}`;
};
