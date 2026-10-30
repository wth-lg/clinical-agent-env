// Rule P-L (plan-amendment-worklist W0-A, "Attribution rule for stops"; made fail-safe by the
// ruling of decisions.tsv 2026-10-30T10:39 after verifier-phase-P17i-W0-A-r2-1 F3): whether a
// trial that reached a turn, cost or working-time cap was looping, from its trajectory alone, so a
// grade, an offline regrade and a replay give the same answer.
//   target        what a call acts on: its tool name and canonical JSON input without free text
//                 (FREE_TEXT: a note's text, a message body, a reason) or a field the tool's
//                 schema does not declare; paging (count, offset, sort) is part of it, so the
//                 next page of a search is another call and the same page again is the same call
//   tail          the last PROGRESS_TAIL executed tool calls (all of them when fewer); a call
//                 recorded with executed false (after finish) is not a call that ran
//   repeats       tail calls whose target equals an earlier call's in the same trial (earlier in
//                 the tail included)
//   repeat_share  repeats / tail (0 for an empty tail)
//   looping       repeat_share >= LOOP_REPEAT_SHARE: half or more of the tail repeats
// The rule fails safe. A cap reached while looping is the model's (LIMIT, MF2); every other cap
// stop is the environment's (outcome.ts ENV_LIMIT, criterion E8). A false model attribution would
// misstate the result; a false environment attribution only halts the run, since every pilot and
// the final run require env_limit=0, so a human reviews every ENV_LIMIT. A model that pads its
// tail with new calls therefore ends as ENV_LIMIT and halts the run; it is never counted as
// progress. Whether new ids were found does not decide: a careful model re-reads and searches
// without finding new records. Checked on every 20-call window of every pilot-1 and pilot-2
// trajectory (2030 windows, none looping), on worklist shapes W1-W10 at every cut, and on the
// probes g1-g7 and G8-G11 (test/progress.test.ts, test/progress-windows.test.ts).
import type { EventBody } from '../core/events.ts';
import { TOOLS } from '../env/tools/write/index.ts';

export const PROGRESS_TAIL = 20;
export const LOOP_REPEAT_SHARE = 0.5;
// The caps rule P-L decides; a context-window stop is always the environment's, a second
// max_tokens stop always the model's.
export const CAP_LIMITS: readonly string[] = ['turns', 'cost', 'wall_clock'];
// Input fields that are prose, not what the call acts on (env/tools input schemas).
export const FREE_TEXT: readonly string[] = ['text', 'title', 'body', 'subject', 'reason', 'as_needed_reason', 'comment', 'description', 'summary'];

export interface Progress {
  tail: number;
  repeats: number;
  repeat_share: number;
  looping: boolean;
}

// JSON with object keys sorted, so the same input in another key order is the same call.
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};

const declared = new Map(TOOLS.map((t) => [t.name, new Set(Object.keys(t.inputSchema.properties))]));
// The input fields a call targets; a tool outside env/tools keeps every field but free text.
function targetInput(name: string, input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const fields = declared.get(name);
  return Object.fromEntries(Object.entries(input).filter(([k]) => !FREE_TEXT.includes(k) && (fields === undefined || fields.has(k))));
}

// A trajectory's events, stamped (TrialEvent) or not (the loop's EventBody).
export function progress(events: readonly EventBody[]): Progress {
  const inputs = new Map<string, unknown>();
  const ran: string[] = [];
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    else if (e.type === 'tool_result' && e.executed) ran.push(`${e.name} ${canonical(targetInput(e.name, inputs.get(e.tool_use_id) ?? null))}`);
  }
  const start = Math.max(0, ran.length - PROGRESS_TAIL);
  const targets = new Set(ran.slice(0, start));
  let repeats = 0;
  for (const target of ran.slice(start)) {
    if (targets.has(target)) repeats++;
    targets.add(target);
  }
  const tail = ran.length - start;
  const repeat_share = tail === 0 ? 0 : repeats / tail;
  return { tail, repeats, repeat_share, looping: repeat_share >= LOOP_REPEAT_SHARE };
}

// The P-L facts in words, for a criterion's evidence (outcomes.ts E8 and MF2).
export const progressText = (p: Progress): string =>
  `last ${p.tail} call${p.tail === 1 ? '' : 's'}: ${p.repeats} repeat${p.repeats === 1 ? '' : 's'} (share ${p.repeat_share.toFixed(2)}); ${p.looping ? 'looping' : 'no loop'}`;
