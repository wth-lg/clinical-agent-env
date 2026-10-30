// Rule P-L (plan-amendment-worklist W0-A, "Attribution rule for stops"; fail-safe since the
// ruling of decisions.tsv 2026-10-30T10:39, and in its final form since the ruling of
// 2026-10-30T11:21 after verifier-phase-P17i-W0-A-r3-1 S2 and M2): whether a trial that reached a
// turn, cost or working-time cap was looping, from its trajectory alone, so a grade, an offline
// regrade and a replay give the same answer.
//   target        what a call acts on: its tool name and canonical JSON input without free text
//                 (FREE_TEXT at any depth: a note's text, a message body, a reason, a reaction in
//                 words) or a field the tool's schema does not declare; a search query or a
//                 calculate expression (NORMALISED) compares lowercased with its whitespace
//                 collapsed; paging (count, offset, sort) is part of it, so the next page of a
//                 search is another call and the same page again is the same call
//   tail          the last PROGRESS_TAIL executed tool calls (all of them when fewer); a call
//                 recorded with executed false (after finish) is not a call that ran
//   repeats       tail calls whose target equals an earlier call's in the same trial (earlier in
//                 the tail included)
//   new_writes    tail calls of a write tool whose target no earlier write in the trial had
//   looping       a full tail of PROGRESS_TAIL calls, repeats >= LOOP_REPEATS (an absolute
//                 count) and new_writes 0; a tail shorter than 20 never loops
// The rule fails safe. A cap reached while looping is the model's (LIMIT, MF2); every other cap
// stop is the environment's (outcome.ts ENV_LIMIT, criterion E8). A false model attribution would
// misstate the result; a false environment attribution only halts the run, since every pilot and
// the final run require env_limit=0, so a human reviews every ENV_LIMIT. A model that pads its
// tail with new calls therefore ends as ENV_LIMIT and halts the run; it is never counted as
// progress. So does a careful worklist that re-reads its context before each item's new write,
// and a cap reached after a few calls (a slow API). A write loop on one target writes nothing new
// and still loops. Whether new ids were found does not decide: a careful model re-reads and
// searches without finding new records. Checked on every 20-call window of every pilot-1 and
// pilot-2 trajectory (2030 windows, none looping), on worklist shapes W1-W10 at every cut, and on
// the probes d, g1-g7, G8-G11 and N2-N6 (test/progress.test.ts, test/progress-windows.test.ts).
import type { EventBody } from '../core/events.ts';
import { TOOLS, WRITE_TOOLS } from '../env/tools/write/index.ts';

export const PROGRESS_TAIL = 20;
export const LOOP_REPEATS = 10;
// The caps rule P-L decides; a context-window stop is always the environment's, a second
// max_tokens stop always the model's.
export const CAP_LIMITS: readonly string[] = ['turns', 'cost', 'wall_clock'];
// Input fields that are prose, not what the call acts on (env/tools input schemas, at any depth).
export const FREE_TEXT: readonly string[] = ['text', 'title', 'body', 'subject', 'reason', 'as_needed_reason', 'comment', 'description', 'summary', 'manifestation'];
// Search words and arithmetic, which the tools read without regard to case or spacing.
const NORMALISED: Readonly<Record<string, readonly string[]>> = { search_notes: ['query'], lookup_catalog: ['query'], search_patients: ['name'], calculate: ['expression'] };
// finish ends the trial; it writes no target.
const WRITES = new Set(WRITE_TOOLS.filter((t) => t.name !== 'finish').map((t) => t.name));

export interface Progress {
  tail: number;
  repeats: number;
  new_writes: number;
  looping: boolean;
}

// JSON with object keys sorted, so the same input in another key order is the same call.
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};

const declared = new Map(TOOLS.map((t) => [t.name, new Set(Object.keys(t.inputSchema.properties))]));
const withoutText = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(withoutText);
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).filter(([k]) => !FREE_TEXT.includes(k)).map(([k, x]) => [k, withoutText(x)]));
  return v;
};
const normalised = (v: unknown): unknown => (typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, ' ').trim() : v);
// The input fields a call targets; a tool outside env/tools keeps every field but free text.
function targetInput(name: string, input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const fields = declared.get(name);
  const words = NORMALISED[name] ?? [];
  return Object.fromEntries(Object.entries(input).filter(([k]) => !FREE_TEXT.includes(k) && (fields === undefined || fields.has(k))).map(([k, v]) => [k, words.includes(k) ? normalised(v) : withoutText(v)]));
}

// A trajectory's events, stamped (TrialEvent) or not (the loop's EventBody).
export function progress(events: readonly EventBody[]): Progress {
  const inputs = new Map<string, unknown>();
  const ran: Array<{ name: string; target: string }> = [];
  for (const e of events) {
    if (e.type === 'tool_call') inputs.set(e.tool_use_id, e.input);
    else if (e.type === 'tool_result' && e.executed) ran.push({ name: e.name, target: `${e.name} ${canonical(targetInput(e.name, inputs.get(e.tool_use_id) ?? null))}` });
  }
  const start = Math.max(0, ran.length - PROGRESS_TAIL);
  // A target names its tool, so a write's target seen before was written before.
  const targets = new Set(ran.slice(0, start).map((c) => c.target));
  let repeats = 0;
  let new_writes = 0;
  for (const { name, target } of ran.slice(start)) {
    if (targets.has(target)) repeats++;
    else if (WRITES.has(name)) new_writes++;
    targets.add(target);
  }
  return { tail: ran.length - start, repeats, new_writes, looping: ran.length >= PROGRESS_TAIL && repeats >= LOOP_REPEATS && new_writes === 0 };
}

// The P-L facts in words, for a criterion's evidence (outcomes.ts E8 and MF2).
export const progressText = (p: Progress): string =>
  `last ${p.tail} call${p.tail === 1 ? '' : 's'}: ${p.repeats} repeat${p.repeats === 1 ? '' : 's'}, ${p.new_writes} write${p.new_writes === 1 ? '' : 's'} to a new target; ${p.looping ? 'looping' : 'no loop'}`;
