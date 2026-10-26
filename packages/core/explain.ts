// Why one trial ended as it did (plan phase P14a): its outcome, fault, audit label, the criterion
// that decided the fault, the confirmation state, decisive check, reason and the M1-M5 criteria,
// from its record at the current grade (summary.ts currentGrade: the last regrade, else the
// recorded grade), its audit row when it has one, and what the caller can say about the world.
// The UI's "why this failed", cli/audit-check.ts, the auditor prompt and the writeup all call
// explainTrial, so none of them can disagree with the audit. Pure: no Node, DOM or file access.
//
// Every criterion of outcomes.ts FAULT_DEFINITIONS is checked; the fault is the first of
// FAULT_PRECEDENCE with a criterion that holds, and the label is AUDIT_LABEL of it. Criteria of
// the other faults that hold are returned as notes, and so is a run-level block (RUN_BLOCKS) that
// holds. A PASS has no fault: whatever holds on it is a note (PASS_DEFINITION). The confirmation
// state follows CONFIRMATION_DEFINITIONS, and blocksRun says why a trial blocks the run.
//
// The reason is one sentence of at most REASON_WORDS words, in the forms
// docs/requirements/ui-contract.md fixes for a valid non-pass trial:
//   <check id> failed: expected <value>, found <value>   a FAIL's decisive gate check, then
//                                                          '; Kind: <kind> (<why>)' when it fits
//   turn limit reached: <n> turns (and the cost, time and output limit forms)
//   refused: <the first REFUSAL_WORDS words of the refusal>
// A LIMIT or REFUSAL comes from the record status, so its limit or refusal sentence comes first;
// when the grader failed a gate check too, '; <check id> failed: ...' follows, then the kind of
// fault when it is not the model's and it fits.
// Expected is what the check requires and found the first difference the trial left, both in
// clinical words, from the task's check text (ExplainContext.text, tasks/<id>.check-text.ts). To
// fit, only the expected part is cut: the found value is the point of the reason and stays whole.
// A check with no text (a hand-built record) reads its evidence: its expected and found fields
// when it has them, else a range and the value checked against it, else a list that should be
// empty.
import type { TrialEvent } from './events.ts';
import { MODEL } from './anthropic.ts';
import { PER_TRIAL_CAP_USD } from './cost.ts';
import {
  AUDIT_LABEL, AUDIT_LABELS, CONFIRMATION_CRITERIA, FAULT_DEFINITIONS, FAULT_PRECEDENCE, RUN_BLOCKS, type AttributionFacts, type AuditAnswer, type AuditLabelName, type Confirmation, type CriterionMet, type Fault,
  type MatrixResult,
} from './outcomes.ts';
import { currentGrade, firstFailed, type RegradeGrade } from './summary.ts';
import { validateInput } from '../env/tools/registry.ts';
import { TOOLS } from '../env/tools/write/index.ts';
import { firstFailedGate, TAXONOMY, type Taxonomy } from '../grader/attribution.ts';

export const REASON_WORDS = 40;
export const REFUSAL_WORDS = 12;
// The marker every surface shows next to the fault of a trial with no audit row.
export const NOT_AUDITED_MARKER = 'not human-audited';

export interface ExplainCheck {
  id: string;
  kind?: string;
  category?: string;
  met: unknown;
  // A failed gate whose failure is a missing required write (packages/grader check.ts Verdict).
  omission?: boolean;
  evidence?: { [k: string]: unknown };
}

// What explainTrial reads of a trial record (a BatchRecord or a run()'s TrialRecord).
export interface ExplainRecord {
  task_id?: string;
  task_version: string | null;
  // The env files, world and TOOLS_VERSION it ran at (packages/core/tasks.ts); absent on records
  // made before env_version.
  env_version?: string | null;
  // The grader_task_version it was graded at; a regrade's entry carries its own.
  grader_task_version?: string | null;
  outcome: string;
  valid?: boolean;
  score?: number | null;
  status?: string | null;
  detail?: string | null;
  stop_reason?: string | null;
  model_requested?: string | null;
  models_returned?: readonly string[];
  turns?: number;
  cost_usd?: number;
  // Time in failed API attempts and the waits after them (loop.ts): elapsed less this is working time.
  retry_wait_ms?: number;
  started?: string;
  ended?: string;
  summary?: string | null;
  refusal_category?: string | null;
  tool_errors?: Readonly<Record<string, number>>;
  state_hash: { initial: string | null; final: string | null; replay_final: string | null };
  checks?: ReadonlyArray<ExplainCheck> | null;
  attribution?: { auto: string; first_failed: string | null; decisive_step: number | null; exposure: ReadonlyArray<{ id: string; first_exposed_step: number | null }> } | null;
  error?: { check: string | null; message: string; stops_batch?: boolean } | null;
  regrades?: ReadonlyArray<RegradeGrade>;
}

// One line of <run>/audit.jsonl (design section 5, "Human audit"). label and label_subtype are
// optional: without them a taxonomy in TAXONOMY reads as model, environment or grader as itself,
// and an outcome GRADER_BUG as grader. adjudicated_label settles a row whose model_fault is unclear
// or whose LLM auditor disagrees; the reasoning goes in note. criteria is what audit-check writes
// back: explainTrial's criteria for the trial. The auditor answers two questions on a failure
// (R14-31): clinically_acceptable, "is the recorded outcome (pass or fail) clinically right?" (a
// no on a failure: the grader rejected a clinically acceptable solution), and
// tool_rejections_correct, "was every tool rejection in the trajectory right?" (no: a tool refused
// a valid call, at the row's decisive_step). Each is yes or no, absent when the row does not
// answer. An adjudicator who overrules or keeps an answer records the final one in
// adjudicated_clinically_acceptable or adjudicated_tool_rejections_correct (decisions.tsv
// 2026-10-27T02:10); the adjudicated answer, else the auditor's, is the answer every count reads,
// so an overruled no is never counted. A tool_rejections_correct no makes the fault environment
// (outcomes.ts E6) when its decisive_step is a tool error step of the trajectory, the tool's input
// schema, run on the recorded call, does not give the same refusal and the environment has the
// tool (citedStep's schema_error is null), and the audit is
// confirmed (outcomes.ts e6Confirmation: an adjudicated_label environment or, with none,
// llm_auditor_agrees true; decisions.tsv 2026-10-27T06:00, 08:50 and 09:30).
// cli/audit-check.ts requires an answered no to come with GR3 (an audit outcome GRADER_BUG with
// evidence) or an environment label for clinically_acceptable, and for tool_rejections_correct
// with what E6 needs and an environment label; an overruled no needs an adjudicated_label and a
// note.
export interface AuditRow {
  trial: string;
  outcome: string;
  taxonomy: string | null;
  model_fault: 'yes' | 'no' | 'unclear' | null;
  decisive_step: number | null;
  evidence_ids: string[];
  llm_auditor_agrees: boolean | null;
  label?: string | null;
  label_subtype?: string | null;
  adjudicated_label?: AuditLabelName | null;
  note?: string;
  clinically_acceptable?: AuditAnswer | null;
  tool_rejections_correct?: AuditAnswer | null;
  adjudicated_clinically_acceptable?: AuditAnswer | null;
  adjudicated_tool_rejections_correct?: AuditAnswer | null;
  criteria?: CriterionRow[];
}

// What the caller knows beyond the record. Each criterion that needs a missing part is pending.
export interface ExplainContext {
  // The trial's trajectory: the limit and refusal sentences read it. Required, so a UI caller
  // cannot leave it out and get "?" where the limit event has the value.
  events: readonly TrialEvent[];
  // The run manifest's world_hash (explain-context.ts runWorldHash); null when the run has none.
  world_state_hash?: string | null;
  // Whether a decisive id the model was never shown is reachable: a tool result exposed or
  // referenced it to a passing oracle or alternative in the matrix run on the trial's world and
  // env_version (explain-context.ts reachability, R14-30).
  exposable?: (id: string) => boolean;
  // Why exposable is absent, when the caller knows: the matrix ran on another world or env_version,
  // the run has no manifest, or matrix.json records no reachable ids. M1 shows it.
  exposability_unchecked?: string;
  // The exposure of the current decisive check's ids, then the first failed check's when it is
  // another, when the caller recomputed it from the trajectory (a regrade failed another check
  // than the recorded attribution names).
  exposure?: { check: string; ids: ReadonlyArray<{ id: string; first_exposed_step: number | null }> } | null;
  // The grader validation matrix of the task (pnpm cli matrix), with the checks it fails when it says.
  matrix?: MatrixResult | null;
  // The task's gate checks, for traces_to.
  checks?: ReadonlyArray<{ id: string; traces_to: string }>;
  // The task's check text (tasks/<id>.check-text.ts): what each gate check requires, and the first
  // difference its evidence shows.
  text?: CheckText | null;
}

export type Evidence = { readonly [k: string]: unknown };

// One gate check in words: what it requires (one sentence, no full stop; the Tasks view shows it
// and a reason uses it as the expected value) and the first difference between that and what its
// evidence shows the trial left ("the 2026-10-26 02:00 dose is 0 mg"). found reads evidence a
// grader wrote, possibly at an older grader version, so it may meet any shape: when it throws or
// returns nothing, the reason falls back to the evidence itself.
export interface CheckTextEntry {
  requires: string;
  found: (evidence: Evidence) => string;
}
export type CheckText = Readonly<Record<string, CheckTextEntry>>;

export interface CriterionRow {
  id: string;
  met: CriterionMet;
  evidence: string;
}

export interface Holding {
  fault: Fault;
  id: string;
  evidence: string;
}

export interface Explanation {
  outcome: string;
  valid: boolean;
  fault: Fault | null;
  label: AuditLabelName | null;
  label_subtype: 'refusal' | null;
  // The criterion that decided the fault; null on a PASS.
  deciding: Holding | null;
  confirmation: Confirmation | null;
  // Infra, grader and env criteria that hold but did not decide (lower in FAULT_PRECEDENCE, or on a
  // PASS), then the run-level blocks (RUN_BLOCKS) that hold, as fault grader.
  notes: Holding[];
  audited: boolean;
  // The label the audit row gives (its adjudicated_label when it has one), next to the computed one.
  audit_label: AuditLabelName | null;
  // The audit row's two answers (AuditRow), each null when the row does not give it; null without a row.
  audit_answers: AuditAnswers | null;
  decisive_check: { id: string; traces_to: string | null; expected: string; found: string } | null;
  // The first failed gate check when the decisive one is another (an unmarked safety gate outranked
  // it), and the secondary reason that names it, 'first failed check: <check id> failed: expected
  // <value>, found <value>' (decisions.tsv 2026-10-28T20:55); both null otherwise.
  first_failed_check: { id: string; traces_to: string | null; expected: string; found: string } | null;
  secondary_reason: string | null;
  decisive_step: number | null;
  taxonomy: Taxonomy | null;
  reason: string;
  // CONFIRMATION_CRITERIA, M1-M5.
  criteria: CriterionRow[];
  // Every criterion of every fault, met or not.
  fault_criteria: Record<Fault, CriterionRow[]>;
}

export const AUDIT_QUESTIONS = ['clinically_acceptable', 'tool_rejections_correct'] as const;
export type AuditQuestion = (typeof AUDIT_QUESTIONS)[number];

// The answers every count reads (the adjudicated one, else the auditor's), and the questions whose
// auditor no an adjudicated yes overruled.
export interface AuditAnswers {
  clinically_acceptable: AuditAnswer | null;
  tool_rejections_correct: AuditAnswer | null;
  overruled: AuditQuestion[];
}

// "recorded outcome clinically right: no; tool rejections correct: yes (an auditor no, overruled)".
export const formatAuditAnswers = (a: AuditAnswers | null): string => {
  if (a === null) return NOT_AUDITED_MARKER;
  const say = (q: AuditQuestion) => `${a[q] ?? 'not answered'}${a.overruled.includes(q) ? ' (an auditor no, overruled)' : ''}`;
  return `recorded outcome clinically right: ${say('clinically_acceptable')}; tool rejections correct: ${say('tool_rejections_correct')}`;
};
const answer = (v: unknown): AuditAnswer | null => (v === 'yes' || v === 'no' ? v : null);
// The step a row cites, numbered as grader/exposure.ts stepsOf numbers them (the executed calls
// from 1); null when it cites none or the trajectory has no such step. schema_error, on a refusal,
// is the field (else the message) at fault when the tool's input schema (registry.ts validateInput)
// refuses the recorded call with the same code and field, or "name: no tool <name>" when callTool
// refused a call to a tool not in TOOLS with NOT_SUPPORTED: the call broke the schema or named a
// tool the environment does not have, so the refusal was right (decisions.tsv 2026-10-27T08:50,
// 09:30 and 2026-10-28T09:10).
// The schemas and the tool list are today's TOOLS'.
export interface CitedStep {
  tool: string;
  is_error: boolean;
  error_code: string | null;
  schema_error: string | null;
}
export const citedStep = (events: readonly TrialEvent[], n: number | null | undefined): CitedStep | null => {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) return null;
  const e = events.filter((x) => x.type === 'tool_result' && x.executed)[n - 1];
  if (e?.type !== 'tool_result') return null;
  const call = events.find((x) => x.type === 'tool_call' && x.tool_use_id === e.tool_use_id);
  const tool = TOOLS.find((t) => t.name === e.name);
  const replay = e.is_error && call?.type === 'tool_call' && tool !== undefined ? validateInput(tool.inputSchema, call.input) : undefined;
  const field = (e.content as { error?: { field?: unknown } } | null)?.error?.field;
  const unknown = e.is_error && tool === undefined && e.error_code === 'NOT_SUPPORTED' ? `name: no tool ${e.name}` : null;
  const schema_error = replay !== undefined && replay.code === e.error_code && replay.field === field ? (replay.field ?? replay.message) : unknown;
  return { tool: e.name, is_error: e.is_error, error_code: e.error_code, schema_error };
};
// A row's answer to q after adjudication.
export const auditAnswerOf = (row: Partial<Pick<AuditRow, AuditQuestion | `adjudicated_${AuditQuestion}`>>, q: AuditQuestion): AuditAnswer | null =>
  answer(row[`adjudicated_${q}`]) ?? answer(row[q]);

// How a criterion's met value reads, in audit-check's output and the trial detail alike.
export const MET_TEXT: Record<string, string> = { true: 'met', false: 'not met', pending: 'pending', 'n/a': 'not applicable' };
export const formatCriterion = (c: Pick<CriterionRow, 'id' | 'met'>): string => `${c.id}: ${MET_TEXT[String(c.met)]}`;

const isLabel = (l: unknown): l is AuditLabelName => (AUDIT_LABELS as readonly unknown[]).includes(l);

// The audit label a row gives: its adjudicated_label, else its label, else the one its taxonomy or a
// GRADER_BUG outcome implies. explainTrial's audit_label and M5 and audit-check all read it so.
export function auditLabelOf(row: Pick<AuditRow, 'label' | 'taxonomy' | 'outcome' | 'adjudicated_label'>): string | null {
  if (row.adjudicated_label !== undefined && row.adjudicated_label !== null) return row.adjudicated_label;
  if (row.label !== undefined && row.label !== null) return row.label;
  if ((AUDIT_LABELS as readonly (string | null)[]).includes(row.taxonomy)) return row.taxonomy;
  if (row.outcome === 'GRADER_BUG') return 'grader';
  if ((TAXONOMY as readonly (string | null)[]).includes(row.taxonomy) || row.outcome === 'REFUSAL') return 'model';
  return null;
}

const words = (s: string) => s.trim().split(/\s+/).filter((w) => w !== '');
const firstWords = (s: string, n: number) => {
  const w = words(s);
  return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ').replace(/[,;:(]+$/, '')}…`;
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// An ISO date-time, as a person reads it: 2026-10-25T20:00:00-04:00 is 2026-10-25 20:00.
const ISO_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;
// List items, and fields of an object inside a value, shown before "and N more".
const LIST_ITEMS = 2;
const NESTED_FIELDS = 3;

// A value of check evidence in words, never as JSON: a list shows its first items and how many
// more there are, an object each field as "<name> <value>" (in parentheses when it sits inside
// another value), a range as min-max.
export function show(v: unknown, nested = false): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'string') return v.trim() === '' ? 'none' : v.replace(ISO_TIME, '$1 $2');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return 'none';
    const head = v.slice(0, LIST_ITEMS).map((x) => show(x, true)).join(', ');
    return v.length > LIST_ITEMS ? `${head} and ${v.length - LIST_ITEMS} more` : head;
  }
  if (isObj(v) && typeof v.min === 'number' && typeof v.max === 'number') return v.min === v.max ? String(v.min) : `${v.min}-${v.max}`;
  if (isObj(v)) {
    const entries = Object.entries(v);
    const shown = entries.slice(0, nested ? NESTED_FIELDS : entries.length).map(([k, x]) => `${k.replace(/_/g, ' ')} ${show(x, true)}`).join(', ');
    const fields = entries.length > NESTED_FIELDS && nested ? `${shown} and ${entries.length - NESTED_FIELDS} more` : shown;
    return fields === '' ? 'none' : nested ? `(${fields})` : fields;
  }
  return String(v);
}

// Evidence lists a passing check leaves empty (the writes beyond what is allowed, the writes
// before their inputs were read, the uncited inputs).
const SHOULD_BE_EMPTY = ['extra', 'late', 'uncited', 'written_before_read'];
// The value a range check compared, in the order graders name it.
const RANGE_VALUE = ['found', 'value', 'mg_per_day', 'mg', 'per_day'];

export function expectedFound(evidence: { [k: string]: unknown } | undefined): { expected: string; found: string } {
  const ev = evidence ?? {};
  if ('expected' in ev || 'found' in ev) return { expected: show(ev.expected), found: show(ev.found) };
  if (isObj(ev.range)) return { expected: show(ev.range), found: show(ev[RANGE_VALUE.find((k) => k in ev) ?? 'found']) };
  // A list that should be empty and is not; when each is empty the check failed for another field.
  const empty = SHOULD_BE_EMPTY.find((k) => Array.isArray(ev[k]) && ev[k].length > 0);
  if (empty !== undefined) return { expected: 'none', found: show(ev[empty]) };
  // The state the check wanted, when it names it: `want` (the values), or `window` (dates).
  const fields = (skip: string) => Object.entries(ev).filter(([k]) => k !== 'active' && k !== skip).map(([k, v]) => `${k.replace(/_/g, ' ')} ${show(v, true)}`).join(', ') || 'not met';
  if (isObj(ev.want) || Array.isArray(ev.want)) return { expected: show(ev.want), found: fields('want') };
  if (isObj(ev.window) && 'start' in ev.window && 'end' in ev.window) return { expected: `between ${show(ev.window.start)} and ${show(ev.window.end)}`, found: fields('window') };
  return { expected: 'every condition of the check', found: fields('') };
}

// Expected and found for a failed check: its check text when the task has one and it reads the
// evidence, else the evidence itself.
function describeCheck(c: ExplainCheck, text: CheckText | null | undefined): { expected: string; found: string } {
  const t = text?.[c.id];
  if (t !== undefined) {
    let found = '';
    try {
      found = t.found(c.evidence ?? {}).trim();
    } catch {
      // Evidence of another shape (an older grader): the evidence speaks for itself.
    }
    return { expected: t.requires, found: found === '' ? expectedFound(c.evidence).found : found };
  }
  return expectedFound(c.evidence);
}

// The first words of s that fit in n, cut after the last clause boundary inside them (a word that
// ends in a comma or semicolon), so a cut never stops mid-clause; a plain cut when no boundary
// leaves at least three words (verifier-phase-P17i-SAFEPRECr2-1 F1: "... and none for the…").
const firstClauses = (s: string, n: number) => {
  const w = words(s);
  if (w.length <= n) return w.join(' ');
  for (let i = n; i >= 3; i--) if (/[,;]$/.test(w[i - 1]!)) return `${w.slice(0, i).join(' ').replace(/[,;]$/, '')}…`;
  return firstWords(s, n);
};

// "<id> failed: expected <e>, found <f>", the expected part cut at a clause boundary so that it
// fits in `max` words; the found part is never cut.
export function checkSentence(id: string, expected: string, found: string, max: number): string {
  const full = `${id} failed: expected ${expected}, found ${found}`;
  if (words(full).length <= max) return full;
  return `${id} failed: expected ${firstClauses(expected, Math.max(3, max - 4 - words(found).length))}, found ${found}`;
}

// Evidence as a check text reads it: a list (else empty) and an object (else empty).
export const items = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const fields = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
// A clock time as a person reads it: 2026-10-26T02:00:00-04:00 is 2026-10-26 02:00. Check texts use it.
export const clock = (v: unknown): string => show(v);
// A list in words: 'a', 'a and b', 'a, b and c'; none when empty.
export const listed = (xs: readonly unknown[]): string => (xs.length === 0 ? 'none' : xs.length === 1 ? show(xs[0]) : `${xs.slice(0, -1).map((x) => show(x)).join(', ')} and ${show(xs.at(-1))}`);

// What each taxonomy label (packages/grader/attribution.ts) says about a failed trial, in words; the
// glossary shows them, because a reason may end with the label alone when its clause does not fit.
export const TAXONOMY_TEXT: Readonly<Record<Taxonomy, string>> = {
  retrieval: 'The model did not read a record that the decision needed, so it did not have the facts.',
  reasoning: 'The model read every record that the decision needed, and the decision was still wrong.',
  output_gap: 'The model said that it did the action, but the action is not in the final state.',
  over_action: 'The model wrote more changes than the task permits.',
  process: 'The model wrote changes before it read the records that the policy tells it to read first.',
  did_not_finish: 'The trial stopped at a limit (turns, cost, time or output) before the model finished.',
};

// Why a model failure is of its kind, for the reason's '; Kind: <kind> (<why>)'. did_not_finish has
// none: it is a LIMIT's taxonomy, and a LIMIT's reason leads with its limit.
const TAXONOMY_WHY: Record<Exclude<Taxonomy, 'did_not_finish'>, (f: AttributionFacts) => string> = {
  reasoning: ({ decisive }) => {
    const seen = (decisive?.exposure ?? []).filter((e) => e.first_exposed_step !== null);
    if (seen.length === 1) return `${seen[0]!.id} was read at step ${seen[0]!.first_exposed_step}`;
    if (seen.length > 1) return `every record the decision needs was read by step ${Math.max(...seen.map((e) => e.first_exposed_step as number))}`;
    return 'the evidence was in view';
  },
  retrieval: ({ decisive }) => `${(decisive?.exposure ?? []).find((e) => e.first_exposed_step === null)?.id ?? 'a record the decision needs'} was never read`,
  output_gap: () => 'the model said it did this, and the final state does not have it',
  over_action: () => 'writes beyond what the task permits',
  process: () => 'writes before the records the policy says to read first',
};

function limitSentence(r: ExplainRecord, events: readonly TrialEvent[] | undefined): string {
  const e = events?.findLast((x) => x.type === 'limit');
  const limit = e?.type === 'limit' ? e : null;
  const kind = limit?.limit ?? r.detail;
  if (kind === 'cost') return `cost limit reached: $${(limit?.value ?? r.cost_usd ?? 0).toFixed(2)} of $${(limit?.cap ?? PER_TRIAL_CAP_USD).toFixed(2)}`;
  if (kind === 'wall_clock') {
    // Working time, as MAX_WALL_MS bounds it (packages/core/run.ts): elapsed less retry_wait_ms.
    const elapsed = limit?.value ?? (r.started && r.ended ? Date.parse(r.ended) - Date.parse(r.started) - (r.retry_wait_ms ?? 0) : NaN);
    return `time limit reached: ${Number.isFinite(elapsed) ? Math.floor(elapsed / 1000) : '?'} s of ${limit ? Math.round(limit.cap / 1000) : '?'} s`;
  }
  if (kind === 'max_tokens') return `output limit reached: ${limit ? limit.value + limit.cap : 2} cut-off responses in a row`;
  return `turn limit reached: ${limit?.value ?? r.turns ?? '?'} turns`;
}

// The bounds that end a trial as INFRA (packages/core/loop.ts), by the record's detail.
const INFRA_BOUND: Record<string, string> = {
  elapsed_bound: 'total elapsed time, failed attempts and retry waits included, passed its hard bound',
  spend_bound: 'the settled cost, worst cases of dropped attempts included, would pass twice the per-trial cap',
  unpriced_usage: "a response's usage cannot be priced, a harness defect",
};

function refusalSentence(r: ExplainRecord, events: readonly TrialEvent[] | undefined): string {
  const text = refusalText(r, events);
  return text === null ? `refused: no refusal text recorded${r.refusal_category ? ` (category ${r.refusal_category})` : ''}` : `refused: ${words(text).slice(0, REFUSAL_WORDS).join(' ')}`;
}

function refusalText(r: ExplainRecord, events: readonly TrialEvent[] | undefined): string | null {
  const e = events?.findLast((x) => x.type === 'response' && x.stop_reason === 'refusal');
  if (e?.type === 'response') {
    const explanation = e.stop_details?.explanation;
    if (typeof explanation === 'string' && explanation.trim() !== '') return explanation;
    const text = e.content.flatMap((b) => {
      const t = (b as unknown as { text?: unknown }).text;
      return b.type === 'text' && typeof t === 'string' ? [t] : [];
    }).join(' ');
    if (text.trim() !== '') return text;
  }
  return r.summary?.trim() ? r.summary : null;
}

const capWords = (s: string, max = REASON_WORDS) => firstWords(s, max);

// The grader criterion that decides a PASS (outcomes.ts GR5).
const FALSE_PASS = 'GR5';

// The decisive gate check of the current grade (packages/grader attribution.ts decisiveGate): the
// first failed safety gate without the omission mark, else the first failed gate, as the
// attribution names it; a check with no kind (a hand-built record) counts as a gate on a FAIL
// (summary.ts firstFailed, which the consistency flag reads too).
export const firstFailedCheck = (record: ExplainRecord): ExplainCheck | null => firstFailed(currentGrade(record)) as ExplainCheck | null;

// The first failed gate check of the current grade when the decisive check is another one, else null.
export function outrankedCheck(record: ExplainRecord): ExplainCheck | null {
  const grade = currentGrade(record);
  const first = firstFailedGate(grade.checks ?? []) as ExplainCheck | undefined;
  const decisive = firstFailedCheck(record);
  return first === undefined || decisive === null || first.id === decisive.id ? null : first;
}

// Whether the recorded attribution speaks for the current grade: it names the same decisive check.
export const attributionFits = (record: ExplainRecord): boolean => record.attribution != null && record.attribution.first_failed === (firstFailedCheck(record)?.id ?? null);

// The exposure of the decisive check's ids M1 reads: the recorded attribution's when it fits,
// else the caller's recomputed one (ExplainContext.exposure) when it is for that check, else none.
export function decisiveExposure(record: ExplainRecord, recomputed: ExplainContext['exposure']): ReadonlyArray<{ id: string; first_exposed_step: number | null }> | null {
  const failed = firstFailedCheck(record);
  if (attributionFits(record)) return record.attribution!.exposure;
  return failed !== null && recomputed?.check === failed.id ? recomputed.ids : null;
}

export function explainTrial(record: ExplainRecord, audit: AuditRow | null | undefined, ctx: ExplainContext): Explanation {
  const grade = currentGrade(record);
  const outcome = grade.outcome;
  const failed = firstFailedCheck(record);
  const outranked = outrankedCheck(record);
  const att = record.attribution ?? null;
  const attFits = att !== null && attributionFits(record);
  const exposure = decisiveExposure(record, ctx.exposure);
  const row = audit ?? null;
  // The row's own label, before adjudication; M5 and audit_label put adjudicated_label first.
  const rowLabel = row === null ? null : auditLabelOf({ ...row, adjudicated_label: null });
  const facts: AttributionFacts = {
    outcome,
    regraded: grade.regraded,
    status: record.status ?? null,
    detail: record.detail ?? null,
    stop_reason: record.stop_reason ?? null,
    model_requested: record.model_requested ?? null,
    model_expected: MODEL,
    models_returned: record.models_returned ?? [],
    internal_errors: record.tool_errors?.INTERNAL ?? 0,
    state_hash: record.state_hash,
    env_error: (ctx.events.findLast((e) => e.type === 'error' && e.status === 'ENV_ERROR') as { message?: string } | undefined)?.message ?? null,
    manifest_hash: ctx.world_state_hash ?? null,
    grader_task_version: grade.grader_task_version,
    decisive: failed === null ? null : {
      id: failed.id,
      first_failed: outranked?.id ?? null,
      exposure: exposure === null ? null : exposure.map((e) => ({ ...e, exposable: e.first_exposed_step === null && ctx.exposable ? ctx.exposable(e.id) : null })),
      exposability_unchecked: ctx.exposable ? null : (ctx.exposability_unchecked ?? null),
    },
    matrix: ctx.matrix ?? null,
    check_error: grade.regraded ? null : (record.error ?? null),
    audit: row === null ? null : {
      outcome: row.outcome,
      label: isLabel(rowLabel) ? rowLabel : null,
      model_fault: row.model_fault ?? null,
      llm_auditor_agrees: row.llm_auditor_agrees ?? null,
      adjudicated_label: isLabel(row.adjudicated_label) ? row.adjudicated_label : null,
      evidence_ids: row.evidence_ids ?? [],
      clinically_acceptable: auditAnswerOf(row, 'clinically_acceptable'),
      tool_rejections_correct: auditAnswerOf(row, 'tool_rejections_correct'),
      decisive_step: typeof row.decisive_step === 'number' ? row.decisive_step : null,
      cited_step: citedStep(ctx.events, row.decisive_step),
    },
  };
  const fault_criteria = Object.fromEntries(FAULT_PRECEDENCE.map((f) => [f, FAULT_DEFINITIONS[f].criteria.map((c) => ({ id: c.id, ...c.check(facts) }))])) as Record<Fault, CriterionRow[]>;
  const holding: Holding[] = FAULT_PRECEDENCE.flatMap((f) => fault_criteria[f].filter((c) => c.met === true).map((c) => ({ fault: f, id: c.id, evidence: c.evidence })));
  // A PASS has no fault, except a false PASS: GR5 decides it (P17j JG5).
  const deciding = outcome === 'PASS' ? (holding.find((h) => h.id === FALSE_PASS) ?? null) : (holding[0] ?? null);
  const fault = deciding?.fault ?? null;
  // MF and R criteria restate the outcome, so only infra, grader and env criteria are notes.
  // A run-level block is a note, and is not repeated when GR4 decided on the same matrix.
  const blocks: Holding[] = RUN_BLOCKS.flatMap((c) => {
    const r = c.check(facts);
    return r.met === true && deciding?.id !== 'GR4' ? [{ fault: 'grader' as const, id: c.id, evidence: r.evidence }] : [];
  });
  const notes = [...holding.filter((h) => h.fault !== fault && h.fault !== 'model' && h.fault !== 'refusal'), ...blocks];
  const label = fault === null ? null : AUDIT_LABEL[fault];
  const criteria = CONFIRMATION_CRITERIA.map((c) => ({ id: c.id, ...c.check(facts) }));
  const audit_label = facts.audit === null ? null : (facts.audit.adjudicated_label ?? facts.audit.label);
  const recordFact = fault !== null && FAULT_DEFINITIONS[fault].criteria.find((c) => c.id === deciding?.id)?.record_fact === true;
  const confirmation: Confirmation | null = fault === null ? null
    : fault === 'infra' ? (audit_label === null ? 'confirmed' : 'contradicted')
      : fault === 'model' || fault === 'refusal' ? (criteria.some((c) => c.met === false) ? 'contradicted' : criteria.some((c) => c.met === 'pending') ? 'provisional' : 'confirmed')
        : facts.audit !== null ? (audit_label === label!.label ? 'confirmed' : 'contradicted') : recordFact ? 'confirmed' : 'provisional';
  // A fault that is not the model's is never told as a model failure (review-ui-P16-1 F3): the
  // kind of model failure and the model step that decided it speak only for a model or refusal
  // fault, and an excluded trial (a check threw, the environment or the API failed) has no
  // decisive check, because no check gave a verdict on the model. A valid trial with another
  // fault keeps its check: its reason names it, then whose fault it is.
  const modelFault = fault === 'model' || fault === 'refusal';
  const taxonomy = modelFault && attFits && (TAXONOMY as readonly string[]).includes(att.auto) ? (att.auto as Taxonomy) : null;
  const ef = failed === null || !grade.valid ? null : describeCheck(failed, ctx.text);
  const decisive_check = failed === null || ef === null ? null : { id: failed.id, traces_to: ctx.checks?.find((c) => c.id === failed.id)?.traces_to ?? null, ...ef };
  const first_failed_check = decisive_check === null || outranked === null ? null : { id: outranked.id, traces_to: ctx.checks?.find((c) => c.id === outranked.id)?.traces_to ?? null, ...describeCheck(outranked, ctx.text) };
  const secondaryLead = 'first failed check:';
  const secondary_reason = first_failed_check === null ? null
    : capWords(`${secondaryLead} ${checkSentence(first_failed_check.id, first_failed_check.expected, first_failed_check.found, REASON_WORDS - words(secondaryLead).length)}`);

  let reason: string;
  if (grade.valid && outcome !== 'PASS') {
    // A REFUSAL or LIMIT comes from the record status: its sentence leads, the failed check follows.
    const lead = outcome === 'REFUSAL' ? refusalSentence(record, ctx.events) : outcome === 'LIMIT' ? limitSentence(record, ctx.events) : null;
    if (decisive_check !== null) {
      // The taxonomy speaks only for a model or refusal fault on a FAIL (a lead already says why a
      // REFUSAL or LIMIT ended); an infra trial gets the check alone.
      const kind = fault === 'env' ? 'environment' : fault === 'grader' ? 'grader' : modelFault && lead === null && taxonomy !== null && taxonomy !== 'did_not_finish' ? taxonomy.replace(/_/g, ' ') : null;
      const why = fault === 'env' ? deciding!.evidence
        : fault === 'grader' ? (deciding!.id === 'GR3' ? 'an audit found a grader bug' : deciding!.evidence)
          : kind !== null ? TAXONOMY_WHY[taxonomy as Exclude<Taxonomy, 'did_not_finish'>](facts) : null;
      const check = checkSentence(decisive_check.id, decisive_check.expected, decisive_check.found, REASON_WORDS - (lead === null ? 0 : words(lead).length) - (kind === null ? 0 : words(kind).length + 1));
      const base = lead === null ? check : `${lead}; ${check}`;
      const fits = (s: string) => words(s).length <= REASON_WORDS;
      reason = kind === null || !fits(`${base}; Kind: ${kind}`) ? base : fits(`${base}; Kind: ${kind} (${why})`) ? `${base}; Kind: ${kind} (${why})` : `${base}; Kind: ${kind}`;
    } else if (lead !== null) {
      reason = lead;
    } else {
      reason = `${outcome}: no failed gate check recorded`;
    }
  } else if (outcome === 'PASS') {
    reason = deciding !== null ? `PASS: an audit found a false PASS (${deciding.id}); the grader's fault, which blocks the run`
      : notes.length === 0 ? 'PASS: every gate check met' : `PASS: every gate check met; note ${notes[0]!.id}: ${notes[0]!.evidence}`;
  } else {
    const detail = record.detail ? ` (${record.detail})` : '';
    if (fault === 'grader') {
      const tail = "; the grader's fault, which blocks the run";
      // A thrown error is whole when it fits, else cut at a word to fit REASON_WORDS.
      const threw = () => {
        const head = `check ${facts.check_error!.check} threw`;
        return `${head} ${firstWords(facts.check_error!.message, REASON_WORDS - words(`${outcome}: ${head}${tail}`).length)}`;
      };
      const why = deciding!.id === 'GR1' ? threw() : deciding!.id === 'GR3' ? 'an audit found a grader bug' : deciding!.id === 'GR4' ? deciding!.evidence : 'a regrade could not grade the record';
      reason = `${outcome}: ${why}${tail}`;
    } else if (fault === 'env') {
      reason = `${outcome}${detail}: ${deciding!.evidence}; the environment's fault, excluded and rerun`;
    } else if (outcome === 'CANCELLED') {
      reason = 'CANCELLED: stopped from outside; says nothing about the model, excluded and rerun';
    } else {
      const bound = record.detail ? INFRA_BOUND[record.detail] : undefined;
      reason = `${outcome}${detail}: ${bound === undefined ? '' : `${bound}; `}the infrastructure's fault, not a trial of the model; excluded and rerun`;
    }
  }

  return {
    outcome,
    valid: grade.valid,
    fault,
    label: label?.label ?? null,
    label_subtype: label?.subtype ?? null,
    deciding,
    confirmation,
    notes,
    audited: row !== null,
    audit_label,
    audit_answers: facts.audit === null || row === null ? null : {
      clinically_acceptable: facts.audit.clinically_acceptable,
      tool_rejections_correct: facts.audit.tool_rejections_correct,
      overruled: AUDIT_QUESTIONS.filter((q) => answer(row[q]) === 'no' && auditAnswerOf(row, q) === 'yes'),
    },
    decisive_check,
    first_failed_check,
    secondary_reason,
    decisive_step: fault !== null && !modelFault ? null : attFits ? att.decisive_step : (row?.decisive_step ?? null),
    taxonomy,
    reason: capWords(reason),
    criteria,
    fault_criteria,
  };
}

// Why a trial blocks the run, or null. A valid failure labelled environment or grader is not
// allowed in a committed run, so a run with one has no headline pass rate (DENOMINATOR_RULE), and
// neither is a false PASS (GR5), which is not counted as a pass; a run-level block (B1) on its
// grader_task_version blocks it too. Excluded outcomes are not covered here:
// INFRA and ENV_ERROR are rerun, and summary --require grader_error=0 blocks a GRADER_ERROR.
// cli/audit-check.ts enforces both, and its --json names these trials as excluded with the
// denominator without them: summary.ts sees no audit rows, matrix or world, so it cannot compute
// these labels.
export function excludedFromHeadline(e: Explanation): string | null {
  if (e.valid && e.outcome === 'PASS' && e.deciding?.id === FALSE_PASS) {
    return `PASS is a false PASS (${FALSE_PASS}): the grader's fault, not counted as a pass, so the run fails and has no headline pass rate until a grader fix, a full offline regrade and a disclosure in results/changelog.d`;
  }
  if (!e.valid || e.outcome === 'PASS' || (e.fault !== 'env' && e.fault !== 'grader')) return null;
  const fix = e.fault === 'env' ? 'an environment fix and a rerun of the affected trials, disclosed in results/changelog.d' : 'a grader fix and a full offline regrade';
  return `${e.outcome} is the ${e.fault === 'env' ? "environment's" : "grader's"} fault (${e.deciding!.id}): not allowed in a committed run, so the run fails and has no headline pass rate until ${fix}`;
}

export function blocksRun(e: Explanation): string | null {
  const block = e.notes.find((n) => RUN_BLOCKS.some((c) => c.id === n.id));
  return excludedFromHeadline(e) ?? (block === undefined ? null : `${block.id} holds: ${block.evidence}; it blocks the run until the task or the grader is fixed`);
}
