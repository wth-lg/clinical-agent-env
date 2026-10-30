// Rule P-L (plan-amendment-worklist W0-A, "Attribution rule for stops"): whether a trial that
// reached a turn, cost or working-time cap was still making progress or was looping, from its
// trajectory alone, so a grade, an offline regrade and a replay give the same answer.
//   tail          the last PROGRESS_TAIL executed tool calls (all of them when fewer); a call
//                 recorded with executed false (after finish) is not a call that ran
//   repeats       tail calls whose tool name and canonical JSON input equal an earlier call's in
//                 the same trial (earlier in the tail included)
//   repeat_share  repeats / tail (0 for an empty tail)
//   new_ids       ids a tail result exposed that no result before the tail had, plus the ids the
//                 tail wrote
//   looping       repeat_share >= LOOP_REPEAT_SHARE, or new_ids = 0
// A cap reached while progressing is the environment's (outcome.ts ENV_LIMIT, criterion E8): the
// cap the harness set was too small for the task. Reached while looping it is the model's (LIMIT,
// MF2). The thresholds were checked in W0-A on every pilot-1 and pilot-2 trajectory truncated at
// 50%, 75% and 90% of its turns (all progressing: repeat share 0.00, at least 15 new ids) and on
// synthetic tails that repeat one search or re-read only seen ids (test/progress.test.ts).
import type { EventBody } from '../core/events.ts';

export const PROGRESS_TAIL = 20;
export const LOOP_REPEAT_SHARE = 0.5;
// The caps rule P-L decides; a context-window stop is always the environment's, a second
// max_tokens stop always the model's.
export const CAP_LIMITS: readonly string[] = ['turns', 'cost', 'wall_clock'];

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

// A trajectory's events, stamped (TrialEvent) or not (the loop's EventBody).
export function progress(events: readonly EventBody[]): Progress {
  const inputs = new Map<string, unknown>();
  const ran: Array<{ key: string; exposed: readonly string[]; written: readonly string[] }> = [];
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    else if (e.type === 'tool_result' && e.executed) ran.push({ key: `${e.name} ${canonical(inputs.get(e.tool_use_id) ?? null)}`, exposed: e.exposed_ids, written: e.written_ids ?? [] });
  }
  const start = Math.max(0, ran.length - PROGRESS_TAIL);
  const tail = ran.slice(start);
  const earlier = new Set(ran.slice(0, start).map((c) => c.key));
  let repeats = 0;
  for (const c of tail) {
    if (earlier.has(c.key)) repeats++;
    earlier.add(c.key);
  }
  const seen = new Set(ran.slice(0, start).flatMap((c) => c.exposed));
  const fresh = new Set(tail.flatMap((c) => c.exposed).filter((id) => !seen.has(id)));
  const written = new Set(tail.flatMap((c) => c.written));
  const repeat_share = tail.length === 0 ? 0 : repeats / tail.length;
  const new_ids = fresh.size + written.size;
  return { tail: tail.length, repeats, repeat_share, new_ids, looping: repeat_share >= LOOP_REPEAT_SHARE || new_ids === 0 };
}

// The P-L facts in words, for a criterion's evidence (outcomes.ts E8 and MF2).
export const progressText = (p: Progress): string =>
  `last ${p.tail} call${p.tail === 1 ? '' : 's'}: ${p.repeats} repeat${p.repeats === 1 ? '' : 's'} (share ${p.repeat_share.toFixed(2)}), ${p.new_ids} new id${p.new_ids === 1 ? '' : 's'}; ${p.looping ? 'looping' : 'progressing'}`;
