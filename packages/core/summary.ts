// A run's summary (plan phase P12, design section 6 "summary <run>"): per task pass k/n over its
// valid trials with a Wilson 95% interval, the raw ENV_ERROR count (re-queued attempts included),
// the models seen, the initial state hashes and the replay check, plus the --require
// requirements. summary.json is a Summary; validateSummary is its schema, which P14 validates
// its sample against. Pure: cli/summary.ts reads the run directory and writes the file.
//
// The run's mode and expected tasks come from its manifest (task_versions) or --task. Whenever a
// requirement is given, a task expected and without records is a violation, and so is a run that
// is not live, unless the caller allows a mock run.
//
// Every figure reads each record's current grade (currentGrade: its last regrades[] entry, else
// its recorded outcome and score): valid, passes, refusals, the outcomes histogram, mean_score,
// grader_error and the valid/band requirements, so a run whose grader bug was fixed and regraded
// is judged on the fixed grade. The recorded grades are disclosure only: recorded_outcomes,
// regraded and grader_error_history (the records that were GRADER_ERROR in an earlier grade),
// never a requirement. A GRADER_ERROR is settled, never re-queued as a model trial: regrade grades
// it again from its trajectory. audit-check and replay read the grade through currentGrade too.
//
// The GRADER_ERROR policy (packages/grader/grade.ts header): fix the grader, regrade the whole
// run offline (cli/regrade.ts), then disclose. A final run must pass --require grader_error=0
// and replay=all: grader_error counts the current grade, grader_error_history the records that
// were GRADER_ERROR before, and replay compares env_version only, so a regrade after a grader
// fix does not stop replay=all from passing. Each task reports the env_versions its records ran
// at and the grader_task_versions of their current grades.
//
// Trials are named by trialName, as replay.json names them: <task>/<index> for a batch record,
// the run-one key <task>/<model>/<effort>/<mode>/<index> for a run-one record (it has no index).
//
// Wilson score interval, z = 1.959964 (two-sided 95%), for k passes in n valid trials, p = k/n:
//   centre = (p + z²/2n) / (1 + z²/n)
//   half   = z / (1 + z²/n) · sqrt(p(1-p)/n + z²/4n²)
//   [centre - half, centre + half]; 5/10 gives 0.2366 to 0.7634.
//
// Beside k/n (P17i C2, R14-15; k/n and Wilson stay the primary metric), each task reports, at
// the current grade, with its denominator:
//   mean_score         mean of the scores of the valid trials that have one
//   raw_mean_score     the same mean of rawScore (the score before clipping to [0, 1]), over the
//                      valid trials whose current grade stored its checks and has a known
//                      positive rubric item
//   gate_fraction      mean, over the valid trials whose stored checks hold a gate, of the
//                      fraction of their gates met
//   pass_no_harm       valid PASS trials with no met and no unknown rubric item of HARM_POINTS or
//                      fewer points, over the valid trials (a PASS whose checks were not stored
//                      is not counted; one whose harm item the judge left unknown is not either,
//                      decisions.tsv 2026-10-26T21:00)
//   limits             LIMIT trials by kind (the record's detail: events.ts LIMITS), and under the
//                      key 'unknown' those whose record names no kind
//   requeued_outcomes  the re-queued attempts by outcome
//   infra_counted_*    passes over the valid trials plus every INFRA (INVALID, INFRA_HARNESS,
//                      INFRA_API) and ENV_ERROR attempt, settled or re-queued; CANCELLED and
//                      GRADER_ERROR are left out
//   pass_k             pass^k for k in PASS_K (P17j JG6): the chance that k trials drawn without
//                      replacement from the n valid trials all pass, C(c,k) / C(n,k) for c
//                      passes; null when n < k
//
// Why a task fails (P17j JG7, faultCounts): per task, fault_counts holds the valid failures (valid,
// not PASS) by
//   taxonomy           the kind of model failure of the current grade: the recorded attribution's
//                      TAXONOMY value when it names the current grade's decisive check, did_not_finish
//                      for a LIMIT, refusal for a REFUSAL, else unattributed (a regrade moved the
//                      decisive check, or the record has no attribution)
//   label              the audit's label of each (adjudicated, else its own: explain.ts
//                      auditLabelOf, which the caller applies), model, environment or grader, and
//                      unlabelled; null when the caller gives no audit
//   infra_reruns       the re-queued attempts whose outcome is the infrastructure's fault
//                      (INVALID, INFRA_*, CANCELLED): the run ran each again. An INFRA attempt the
//                      batch settled after its reruns ran out was not run again, so it is not
//                      counted (verifier-phase-P17i-JG7-1 F3)
// and top_failed_checks lists the decisive failed check of each valid failure (firstFailed) with
// its count, by count then id, the check the Runs view shows on the row. The run carries model and
// effort, the requested model and effort every settled record shares, null when they differ or
// none is recorded. audit-check --json gives the same counts with the M1-M4 count beside them.
//
// The consistency flag (P17i C3, R14-32): per task, at the current grade, consistencyOf counts
// the valid failures (valid, not PASS) and groups them by the id of their first failed check
// (firstFailed: the decisive gate check not met, as the attribution names it; on a FAIL with no
// gate, the first check with no kind not met; explain.ts firstFailedCheck reads it so). A failure
// with no failed check is in no group. Within the
// largest group, the found values are information only (decisions.tsv 2026-10-27T00:30): a found
// value is the canonical JSON of the check evidence's `found` field, or of the whole evidence when
// it has none, and that evidence carries per-trial write ids and step numbers, so one defect
// gives many values. The task is flagged
//   shared_failure     when the largest group holds >= SHARED_FAILURE_SHARE of the valid failures,
//                      counted only from SHARED_FAILURE_MIN valid failures (at any count when the
//                      caller passes final: audit-check --final)
//   no_passes          when it has 0 passes in >= NO_PASS_MIN valid trials
// summary.json carries the flags without final; cli/audit-check.ts recomputes them with its
// --final and exits 1 on a flagged task until audit.jsonl holds that task's task-validity review.
import { LIMITS } from './events.ts';
import { FAULT, isValid, OUTCOMES, type Outcome } from './outcomes.ts';
import { decisiveGate, TAXONOMY } from '../grader/attribution.ts';

// 2: recorded_outcomes and regraded added, and every figure reads the current grade.
// 3: env_versions and grader_task_versions added per task.
// 4: raw_mean_score, gate_fraction, pass_no_harm, limits, requeued_outcomes and the infra-counted
//    rate added per task.
// 5: consistency added per task.
// 6: pass_k added per task.
// 7: model and effort added; fault_counts and top_failed_checks added per task.
export const SUMMARY_SCHEMA_VERSION = 7;
// A met or unknown rubric item worth this many points or fewer is a harm: such a PASS is not
// pass_no_harm.
export const HARM_POINTS = -5;
// The consistency flag's thresholds (header).
export const SHARED_FAILURE_SHARE = 0.8;
export const SHARED_FAILURE_MIN = 5;
export const NO_PASS_MIN = 10;
export const WILSON_Z = 1.959963984540054;

export interface Interval {
  lo: number;
  hi: number;
}

export function wilson(k: number, n: number, z = WILSON_Z): Interval | null {
  if (n === 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

// What the summary reads from one trial record.
export interface SummaryTrial {
  task_id: string;
  task_version: string | null;
  // null on a record written before the versions were split.
  env_version?: string | null;
  grader_task_version?: string | null;
  // A batch record's index; a run-one record has none and is named by its trajectory path.
  index?: number;
  trajectory?: string;
  trial_id?: string;
  outcome: string;
  // The terminal event's code or limit (run.ts TrialRun.detail): a LIMIT's kind.
  detail?: string | null;
  // The recorded grade's check results; the current grade's when no regrade entry is newer.
  checks?: ReadonlyArray<SummaryCheck>;
  model_requested: string;
  models_returned: readonly string[];
  // The requested effort; absent on records that predate it.
  effort?: string | null;
  // The recorded attribution: its kind of model failure and the check it names.
  attribution?: { auto: string; first_failed: string | null } | null;
  state_hash: { initial: string | null; final: string | null; replay_final: string | null };
  tool_errors: Readonly<Record<string, number>>;
  cost_usd: number;
  judge_cost_usd?: number;
  score: number | null;
  // cli regrade's entries, oldest first; the last is the current grade.
  regrades?: ReadonlyArray<RegradeGrade>;
}

// What a cli regrade entry holds of its grade (cli/regrade.ts RegradeEntry). Entries written
// before checks were stored have no checks.
export interface RegradeGrade {
  outcome: string;
  // The task's grader_task_version the regrade graded at; absent on older entries.
  grader_task_version?: string | null;
  score?: number | null;
  valid?: boolean;
  checks?: ReadonlyArray<SummaryCheck>;
}

// What the summary reads of a check result (packages/grader/grade.ts CheckResult).
export interface SummaryCheck {
  id: string;
  kind?: string;
  // A gate's category and omission mark, which decide the decisive gate (firstFailed).
  category?: string;
  omission?: boolean;
  points?: number | null;
  met: unknown;
  evidence?: unknown;
}

export type ConsistencyFlag = 'shared_failure' | 'no_passes';

// A task's consistency flag (header): its largest group of valid failures by first failed check,
// with the group's most common found value, how many of the group give it and how many distinct
// found values the group gives; and the flags that hold.
export interface Consistency {
  valid: number;
  passes: number;
  failures: number;
  shared: { check: string; count: number; found: string; found_count: number; found_values: number } | null;
  flags: ConsistencyFlag[];
}

export interface CurrentGrade {
  outcome: string;
  score: number | null;
  valid: boolean;
  // The check results of the current grade; null when its regrade entry did not store them.
  checks: ReadonlyArray<SummaryCheck> | null;
  regraded: boolean;
  // The grader_task_version it was graded at; null when its record or entry predates the field.
  grader_task_version: string | null;
}

// A trial's name in messages, replay.json and summary.json: <task>/<index> for a batch record; a
// run-one record has no index, and is named by its key, <task>/<model>/<effort>/<mode>/<index>,
// the path its trajectory is at (trajectories/<key>.jsonl), else its trial_id.
export const trialName = (r: { task_id: string; index?: number | undefined; trajectory?: string | undefined; trial_id?: string | undefined }): string => {
  if (typeof r.index === 'number') return `${r.task_id}/${r.index}`;
  const key = r.trajectory?.match(/^trajectories\/(.+)\.jsonl$/)?.[1];
  return key ?? r.trial_id ?? r.task_id;
};

// A record's current grade: its last regrades[] entry, else its recorded outcome, score and
// checks. The one reader of a record's grade for summary, audit-check and replay.
export function currentGrade(r: { outcome: string; score?: number | null; checks?: ReadonlyArray<SummaryCheck> | null; grader_task_version?: string | null; regrades?: ReadonlyArray<RegradeGrade> }): CurrentGrade {
  const last = r.regrades?.at(-1);
  if (last === undefined) return { outcome: r.outcome, score: r.score ?? null, valid: isValid(r.outcome), checks: r.checks ?? null, regraded: false, grader_task_version: r.grader_task_version ?? null };
  return {
    outcome: last.outcome, score: last.score ?? null, valid: typeof last.valid === 'boolean' ? last.valid : isValid(last.outcome), checks: last.checks ?? null, regraded: true,
    grader_task_version: last.grader_task_version ?? null,
  };
}

export interface SummaryInput {
  run_id: string;
  // One settled record per trial key.
  trials: readonly SummaryTrial[];
  // Attempts that were re-queued (INFRA, ENV_ERROR, CANCELLED): counted raw, never in a rate.
  requeued: readonly SummaryTrial[];
  // replay.json, written by `pnpm cli replay`: whether each trial (by trialName) reproduced
  // its grade. null when replay has not run.
  replay: Readonly<Record<string, boolean>> | null;
  // The manifest's mode (live, mock-<scenario>); null without a manifest.
  mode?: string | null;
  // The tasks the run must hold, and who says so: the manifest's task_versions, or --task.
  expected?: { tasks: readonly string[]; from: string };
  // Each audited trial's label (explain.ts auditLabelOf), by trialName; absent without audit.jsonl.
  audit?: Readonly<Record<string, string | null>> | null;
}

// The k of pass^k each task reports.
export const PASS_K = [1, 3, 5] as const;

// C(n,k) as an exact integer (every partial product is one), 0 when n < k.
function choose(n: number, k: number): number {
  if (n < k) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// pass^k: C(c,k) / C(n,k), the chance that k of n trials drawn without replacement all pass,
// for c passes; null when n < k (or n is 0). One division of two integers, so 4 of 6 at k = 3
// is 0.2 exactly.
export function passK(c: number, n: number, k: number): number | null {
  if (n === 0 || n < k) return null;
  return choose(c, k) / choose(n, k);
}

export interface TaskSummary {
  task_versions: string[];
  // The env_versions the records ran at, and the grader_task_versions of their current grades.
  env_versions: string[];
  grader_task_versions: string[];
  records: number; // settled records
  trials: number; // valid trials: the headline denominator
  passes: number;
  pass_rate: number | null;
  wilson95: Interval | null;
  // The rate with refusals left out of the denominator (reported both ways).
  refusals: number;
  refusal_excluded_rate: number | null;
  outcomes: Record<string, number>; // by current grade
  // Disclosure only: the outcomes as first recorded, and the records a regrade graded again.
  recorded_outcomes: Record<string, number>;
  regraded: number;
  env_error_raw: number;
  grader_error: number; // records whose current grade is GRADER_ERROR
  grader_error_history: number; // records that were GRADER_ERROR in an earlier grade
  requeued: number;
  mean_score: number | null;
  mean_cost_usd: number | null;
  // The metrics beside k/n; the header says what each counts.
  raw_mean_score: number | null;
  gate_fraction: number | null;
  pass_no_harm: number;
  pass_no_harm_rate: number | null;
  limits: Record<string, number>;
  requeued_outcomes: Record<string, number>;
  infra_counted_attempts: number;
  infra_counted_rate: number | null;
  // How many trials each mean is over.
  metric_trials: { mean_score: number; raw_mean_score: number; gate_fraction: number };
  // pass^k for each k of PASS_K, by k.
  pass_k: Record<`${(typeof PASS_K)[number]}`, number | null>;
  consistency: Consistency;
  fault_counts: FaultCounts;
  top_failed_checks: FailedCheckCount[];
}

// The kinds fault_counts.taxonomy counts by, and the labels fault_counts.label counts by (header).
export const FAILURE_KINDS = [...TAXONOMY, 'refusal', 'unattributed'] as const;
export const FAILURE_LABELS = ['model', 'environment', 'grader', 'unlabelled'] as const;
export interface FaultCounts {
  failures: number;
  taxonomy: Record<(typeof FAILURE_KINDS)[number], number>;
  label: Record<(typeof FAILURE_LABELS)[number], number> | null;
  infra_reruns: number;
}
export interface FailedCheckCount {
  check: string;
  count: number;
}

export interface Requirements {
  valid?: number;
  band?: [number, number];
  env_error_raw?: number;
  grader_error?: number;
  model?: string;
  replay?: 'all';
  mode?: string;
  // Set by --allow-mock: a mock run may meet the requirements.
  allow_mock?: boolean;
}

export interface Summary {
  schema_version: number;
  run_id: string;
  // The requested model and effort every settled record shares; null when they differ or none says.
  model: string | null;
  effort: string | null;
  tasks: Record<string, TaskSummary>;
  totals: { records: number; trials: number; passes: number; env_error_raw: number; grader_error: number; grader_error_history: number; regraded: number; requeued: number; internal_errors: number; cost_usd: number };
  mode: string | null;
  expected_tasks: { tasks: string[]; from: string } | null;
  models: string[];
  initial_state_hashes: string[];
  replay: { ran: boolean; matched: number; mismatched: string[]; missing: string[] };
  requirements: Requirements;
  violations: string[];
}

// The grades before a record's current one.
const earlierOutcomes = (t: SummaryTrial): string[] => (t.regrades?.length ? [t.outcome, ...t.regrades.slice(0, -1).map((r) => r.outcome)] : []);
const keyOf = trialName;
const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
// keys: counted as 0 when absent.
const histogram = (xs: readonly string[], keys: readonly string[] = []): Record<string, number> => {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
};

// grade.ts score() before its clip to [0, 1]: Σ points of met rubric items ÷ Σ positive points,
// over the items that are not unknown; null when no positive item is known.
export function rawScore(checks: ReadonlyArray<SummaryCheck>): number | null {
  let met = 0;
  let positive = 0;
  for (const c of checks) {
    if (c.kind !== 'rubric' || c.met === 'unknown' || typeof c.points !== 'number') continue;
    if (c.points > 0) positive += c.points;
    if (c.met === true) met += c.points;
  }
  return positive === 0 ? null : met / positive;
}

const gateFraction = (checks: ReadonlyArray<SummaryCheck>): number | null => {
  const gates = checks.filter((c) => c.kind === 'gate');
  return gates.length === 0 ? null : gates.filter((c) => c.met === true).length / gates.length;
};
// A harm item: a met or unknown rubric item of HARM_POINTS or fewer points. pass_no_harm and the
// UI's PASS-with-harm chip (apps/web/src/data/harm.ts) read this one rule (verifier JU3-1 F1;
// decisions.tsv 2026-10-28, a named exception for lane U).
export const isHarmItem = (c: SummaryCheck): boolean => c.kind === 'rubric' && (c.met === true || c.met === 'unknown') && typeof c.points === 'number' && c.points <= HARM_POINTS;
const harmed = (checks: ReadonlyArray<SummaryCheck>): boolean => checks.some(isHarmItem);
// INVALID, INFRA_HARNESS, INFRA_API and ENV_ERROR: the attempts the infra-counted rate fails.
const infraCounted = (o: string): boolean => o !== 'CANCELLED' && (FAULT[o as Outcome] === 'infra' || FAULT[o as Outcome] === 'env');

// The first failed check of a grade, as explain.ts firstFailedCheck reads it: the decisive gate
// (packages/grader attribution.ts decisiveGate: the first failed safety gate without the omission
// mark, else the first failed gate), else on a FAIL the first check with no kind not met.
export function firstFailed(grade: Pick<CurrentGrade, 'outcome' | 'checks'>): SummaryCheck | null {
  const checks = grade.checks ?? [];
  return decisiveGate(checks) ?? (grade.outcome === 'FAIL' ? checks.find((c) => c.kind === undefined && c.met === false) : undefined) ?? null;
}

// JSON with object keys sorted, so equal values give equal strings.
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};
// A failed check's found value (header).
const foundOf = (evidence: unknown): string => canonical(typeof evidence === 'object' && evidence !== null && 'found' in evidence ? (evidence as { found: unknown }).found : evidence ?? null);

// The consistency flag of one task's current grades (header); final counts the shared failures at
// any number of valid failures.
export function consistencyOf(grades: ReadonlyArray<Pick<CurrentGrade, 'outcome' | 'valid' | 'checks'>>, opts: { final?: boolean } = {}): Consistency {
  const valid = grades.filter((g) => g.valid);
  const passes = valid.filter((g) => g.outcome === 'PASS').length;
  const failures = valid.filter((g) => g.outcome !== 'PASS');
  // Each failed check's found values, one per failure.
  const groups = new Map<string, string[]>();
  for (const g of failures) {
    const c = firstFailed(g);
    if (c === null) continue;
    groups.set(c.id, [...(groups.get(c.id) ?? []), foundOf(c.evidence)]);
  }
  // The largest group, on a tie the first by check id; its most common found value, on a tie the first.
  const top = [...groups].sort(([a, xs], [b, ys]) => ys.length - xs.length || a.localeCompare(b))[0];
  let shared: Consistency['shared'] = null;
  if (top !== undefined) {
    const [check, founds] = top;
    const [found, found_count] = Object.entries(histogram(founds)).sort(([a, m], [b, n]) => n - m || a.localeCompare(b))[0]!;
    shared = { check, count: founds.length, found, found_count, found_values: new Set(founds).size };
  }
  const flags: ConsistencyFlag[] = [];
  const counted = failures.length >= SHARED_FAILURE_MIN || (opts.final === true && failures.length > 0);
  if (shared !== null && counted && shared.count >= SHARED_FAILURE_SHARE * failures.length) flags.push('shared_failure');
  if (passes === 0 && valid.length >= NO_PASS_MIN) flags.push('no_passes');
  return { valid: valid.length, passes, failures: failures.length, shared, flags };
}

// A found value cut for a message line.
const FOUND_CHARS = 120;
const cut = (s: string) => (s.length <= FOUND_CHARS ? s : `${s.slice(0, FOUND_CHARS)}…`);
// "4 of 5 valid failures fail G1 first (2 distinct found values; 3 give ...)" and "0 passes in 10
// valid trials", for each flag.
export const describeConsistency = (c: Consistency): string[] =>
  c.flags.map((f) => {
    if (f === 'no_passes') return `0 passes in ${c.valid} valid trials`;
    const s = c.shared!;
    return `${s.count} of ${c.failures} valid failures fail ${s.check} first (${s.found_values} distinct found value${s.found_values === 1 ? '' : 's'}; ${s.found_count} give ${cut(s.found)})`;
  });

type FailureTrial = Pick<SummaryTrial, 'task_id' | 'index' | 'trajectory' | 'trial_id' | 'outcome' | 'score' | 'checks' | 'grader_task_version' | 'regrades' | 'attribution'>;

// One task's fault_counts and top_failed_checks (header) over its settled records and re-queued
// attempts; audit gives each audited trial's label, by trialName, or null without an audit.
export function faultCounts(trials: readonly FailureTrial[], requeued: readonly FailureTrial[], audit: Readonly<Record<string, string | null>> | null): { fault_counts: FaultCounts; top_failed_checks: FailedCheckCount[] } {
  const failed = trials.flatMap((t) => {
    const g = currentGrade(t);
    return g.valid && g.outcome !== 'PASS' ? [{ t, g, check: firstFailed(g) }] : [];
  });
  const kindOf = ({ t, g, check }: (typeof failed)[number]): (typeof FAILURE_KINDS)[number] => {
    if (g.outcome === 'LIMIT') return 'did_not_finish';
    if (g.outcome === 'REFUSAL') return 'refusal';
    const auto = t.attribution?.auto;
    return check !== null && t.attribution?.first_failed === check.id && (TAXONOMY as readonly string[]).includes(auto ?? '') ? (auto as (typeof TAXONOMY)[number]) : 'unattributed';
  };
  const labelOf = (t: FailureTrial): (typeof FAILURE_LABELS)[number] => {
    const l = audit?.[trialName(t)] ?? null;
    return l === 'model' || l === 'environment' || l === 'grader' ? l : 'unlabelled';
  };
  const byCheck = histogram(failed.flatMap((f) => (f.check === null ? [] : [f.check.id])));
  return {
    fault_counts: {
      failures: failed.length,
      taxonomy: histogram(failed.map(kindOf), FAILURE_KINDS) as FaultCounts['taxonomy'],
      label: audit === null ? null : (histogram(failed.map((f) => labelOf(f.t)), FAILURE_LABELS) as NonNullable<FaultCounts['label']>),
      infra_reruns: requeued.filter((t) => FAULT[currentGrade(t).outcome as Outcome] === 'infra').length,
    },
    top_failed_checks: Object.entries(byCheck).map(([check, count]) => ({ check, count })).sort((a, b) => b.count - a.count || a.check.localeCompare(b.check)),
  };
}

// The one value every record gives, or null when they differ or none gives one.
const oneValue = (xs: ReadonlyArray<string | null | undefined>): string | null => {
  const set = new Set(xs);
  return set.size === 1 ? ([...set][0] ?? null) : null;
};

export function summarize(input: SummaryInput): Summary {
  const ids = sorted([...input.trials, ...input.requeued].map((t) => t.task_id).concat(input.expected?.tasks ?? []));
  const tasks: Record<string, TaskSummary> = {};
  for (const id of ids) {
    const mine = input.trials.filter((t) => t.task_id === id);
    const requeued = input.requeued.filter((t) => t.task_id === id);
    const grades = mine.map(currentGrade);
    const valid = grades.filter((g) => g.valid);
    const passes = valid.filter((g) => g.outcome === 'PASS').length;
    const refusals = valid.filter((g) => g.outcome === 'REFUSAL').length;
    const scores = valid.flatMap((g) => (g.score === null ? [] : [g.score]));
    const known = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);
    const raws = known(valid.map((g) => (g.checks === null ? null : rawScore(g.checks))));
    const fractions = known(valid.map((g) => (g.checks === null ? null : gateFraction(g.checks))));
    const noHarm = valid.filter((g) => g.outcome === 'PASS' && g.checks !== null && !harmed(g.checks)).length;
    const infraAttempts = valid.length + [...mine, ...requeued].filter((t) => infraCounted(currentGrade(t).outcome)).length;
    tasks[id] = {
      task_versions: sorted(mine.flatMap((t) => (t.task_version === null ? [] : [t.task_version]))),
      env_versions: sorted(mine.flatMap((t) => (t.env_version ? [t.env_version] : []))),
      grader_task_versions: sorted(grades.flatMap((g) => (g.grader_task_version === null ? [] : [g.grader_task_version]))),
      records: mine.length,
      trials: valid.length,
      passes,
      pass_rate: valid.length === 0 ? null : passes / valid.length,
      wilson95: wilson(passes, valid.length),
      refusals,
      refusal_excluded_rate: valid.length - refusals === 0 ? null : passes / (valid.length - refusals),
      outcomes: histogram(grades.map((g) => g.outcome)),
      recorded_outcomes: histogram(mine.map((t) => t.outcome)),
      regraded: grades.filter((g) => g.regraded).length,
      env_error_raw: [...mine, ...requeued].filter((t) => t.outcome === 'ENV_ERROR').length,
      grader_error: [...mine, ...requeued].filter((t) => currentGrade(t).outcome === 'GRADER_ERROR').length,
      grader_error_history: [...mine, ...requeued].filter((t) => earlierOutcomes(t).includes('GRADER_ERROR')).length,
      requeued: requeued.length,
      mean_score: mean(scores),
      mean_cost_usd: mean(mine.map((t) => t.cost_usd + (t.judge_cost_usd ?? 0))),
      raw_mean_score: mean(raws),
      gate_fraction: mean(fractions),
      pass_no_harm: noHarm,
      pass_no_harm_rate: valid.length === 0 ? null : noHarm / valid.length,
      limits: histogram(mine.flatMap((t, i) => (grades[i]!.valid && grades[i]!.outcome === 'LIMIT' ? [t.detail ?? 'unknown'] : [])), LIMITS),
      requeued_outcomes: histogram(requeued.map((t) => t.outcome)),
      infra_counted_attempts: infraAttempts,
      infra_counted_rate: infraAttempts === 0 ? null : passes / infraAttempts,
      metric_trials: { mean_score: scores.length, raw_mean_score: raws.length, gate_fraction: fractions.length },
      pass_k: Object.fromEntries(PASS_K.map((k) => [k, passK(passes, valid.length, k)])) as TaskSummary['pass_k'],
      consistency: consistencyOf(grades),
      ...faultCounts(mine, requeued, input.audit ?? null),
    };
  }
  const all = [...input.trials, ...input.requeued];
  const replay = input.replay;
  const keys = input.trials.map(keyOf);
  const s = Object.values(tasks);
  return {
    schema_version: SUMMARY_SCHEMA_VERSION,
    run_id: input.run_id,
    model: oneValue(input.trials.map((t) => t.model_requested)),
    effort: oneValue(input.trials.map((t) => t.effort)),
    tasks,
    totals: {
      records: input.trials.length,
      trials: s.reduce((a, t) => a + t.trials, 0),
      passes: s.reduce((a, t) => a + t.passes, 0),
      env_error_raw: s.reduce((a, t) => a + t.env_error_raw, 0),
      grader_error: s.reduce((a, t) => a + t.grader_error, 0),
      grader_error_history: s.reduce((a, t) => a + t.grader_error_history, 0),
      regraded: s.reduce((a, t) => a + t.regraded, 0),
      requeued: input.requeued.length,
      internal_errors: all.reduce((a, t) => a + (t.tool_errors.INTERNAL ?? 0), 0),
      cost_usd: all.reduce((a, t) => a + t.cost_usd + (t.judge_cost_usd ?? 0), 0),
    },
    mode: input.mode ?? null,
    expected_tasks: input.expected === undefined ? null : { tasks: sorted(input.expected.tasks), from: input.expected.from },
    models: sorted(all.flatMap((t) => [t.model_requested, ...t.models_returned])),
    initial_state_hashes: sorted(input.trials.flatMap((t) => (t.state_hash.initial === null ? [] : [t.state_hash.initial]))),
    replay: {
      ran: replay !== null,
      matched: replay === null ? 0 : keys.filter((k) => replay[k] === true).length,
      mismatched: sorted([
        ...(replay === null ? [] : keys.filter((k) => replay[k] === false)),
        ...input.trials.filter((t) => t.state_hash.final === null || t.state_hash.replay_final !== t.state_hash.final).map(keyOf),
      ]),
      missing: replay === null ? [] : keys.filter((k) => replay[k] === undefined).sort(),
    },
    requirements: {},
    violations: [],
  };
}

const ALIASES: Record<string, string> = { trials: 'valid' };

// --require valid=N,band=a-b,env_error_raw=N,grader_error=N,model=M,replay=all,mode=M. donewhen's
// form is accepted too: trials=N for valid=N, pass-min=a and pass-max=b for band=a-b. Throws on
// anything else.
export function parseRequire(spec: string): Requirements {
  const req: Requirements = {};
  let min: number | undefined;
  let max: number | undefined;
  const count = (k: string, v: string) => {
    if (!/^\d+$/.test(v)) throw new Error(`--require ${k}=${v}: ${k} must be a whole number`);
    return Number(v);
  };
  for (const part of spec.split(',').filter((p) => p !== '')) {
    const eq = part.indexOf('=');
    if (eq < 1) throw new Error(`--require ${part}: expected key=value`);
    const raw = part.slice(0, eq);
    const k = ALIASES[raw] ?? raw;
    const v = part.slice(eq + 1);
    if (k === 'valid') req.valid = count(raw, v);
    else if (k === 'env_error_raw') req.env_error_raw = count(raw, v);
    else if (k === 'grader_error') req.grader_error = count(raw, v);
    else if (k === 'mode') {
      if (v === '') throw new Error('--require mode= needs a mode, e.g. mode=live');
      req.mode = v;
    }
    else if (k === 'pass-min') min = count(raw, v);
    else if (k === 'pass-max') max = count(raw, v);
    else if (k === 'band') {
      const m = /^(\d+)-(\d+)$/.exec(v);
      if (!m || Number(m[1]) > Number(m[2])) throw new Error(`--require band=${v}: expected a-b with a <= b`);
      req.band = [Number(m[1]), Number(m[2])];
    } else if (k === 'model') {
      if (v === '') throw new Error('--require model= needs a model id');
      req.model = v;
    } else if (k === 'replay') {
      if (v !== 'all') throw new Error(`--require replay=${v}: only replay=all is defined`);
      req.replay = 'all';
    } else throw new Error(`--require ${raw}: unknown requirement; known: valid (trials), band (pass-min, pass-max), env_error_raw, grader_error, model, replay, mode`);
  }
  if (min !== undefined || max !== undefined) {
    if (req.band) throw new Error('--require: give band or pass-min/pass-max, not both');
    req.band = [min ?? 0, max ?? Number.MAX_SAFE_INTEGER];
  }
  return req;
}

// One line per violated requirement; empty when the run meets them all.
export function checkRequirements(s: Summary, req: Requirements): string[] {
  const out: string[] = [];
  const tasks = Object.entries(s.tasks);
  if (tasks.length === 0) out.push('no trials in the run');
  const any = Object.keys(req).some((k) => k !== 'allow_mock');
  if (any && s.expected_tasks !== null) {
    for (const id of s.expected_tasks.tasks) if ((s.tasks[id]?.records ?? 0) === 0) out.push(`${id}: expected by ${s.expected_tasks.from}, no records`);
  }
  if (req.mode !== undefined && s.mode !== req.mode) out.push(`mode ${s.mode ?? '(no manifest)'}, required ${req.mode}`);
  else if (any && s.mode !== 'live' && !req.allow_mock) out.push(`mode ${s.mode ?? '(no manifest)'}: not a live run; pass --allow-mock to check a mock run`);
  for (const [id, t] of tasks) {
    if (req.valid !== undefined && t.trials !== req.valid) out.push(`${id}: ${t.trials} valid trials, required ${req.valid}`);
    if (req.band && (t.passes < req.band[0] || t.passes > req.band[1])) out.push(`${id}: ${t.passes}/${t.trials} passes, outside the band ${req.band[0]}-${req.band[1]}`);
  }
  if (req.env_error_raw !== undefined && s.totals.env_error_raw > req.env_error_raw) {
    out.push(`ENV_ERROR raw count ${s.totals.env_error_raw} (re-queued attempts included), required at most ${req.env_error_raw}`);
  }
  if (req.grader_error !== undefined && s.totals.grader_error > req.grader_error) {
    const n = s.totals.grader_error;
    out.push(`GRADER_ERROR in ${n} record${n === 1 ? ' at its' : 's at their'} current grade, required at most ${req.grader_error}`);
  }
  if (req.model !== undefined) {
    const other = s.models.filter((m) => m !== req.model);
    if (other.length > 0) out.push(`model: ${other.join(', ')} in the run, required ${req.model} only`);
  }
  if (req.replay === 'all') {
    if (!s.replay.ran) out.push('replay: replay.json is missing; run pnpm cli replay first');
    if (s.replay.mismatched.length > 0) out.push(`replay: did not reproduce ${s.replay.mismatched.join(', ')}`);
    if (s.replay.missing.length > 0) out.push(`replay: not replayed ${s.replay.missing.join(', ')}`);
  }
  return out;
}

// The schema of summary.json: every error, by path; [] when x is a Summary.
export function validateSummary(x: unknown): string[] {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const rate = (v: unknown) => v === null || (num(v) && (v as number) >= 0 && (v as number) <= 1);
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const interval = (v: unknown) => v === null || (isObj(v) && rate(v.lo) && rate(v.hi) && (v.lo as number) <= (v.hi as number));
  // An object with exactly these keys, each a count.
  const keyed = (v: unknown, keys: readonly string[]) => isObj(v) && Object.keys(v).length === keys.length && keys.every((k) => count(v[k]));
  const check = (path: string, obj: Record<string, unknown>, fields: Record<string, (v: unknown) => boolean>) => {
    for (const [k, ok] of Object.entries(fields)) {
      if (!Object.hasOwn(obj, k)) errors.push(`${path}${k}: missing`);
      else if (!ok(obj[k])) errors.push(`${path}${k}: bad value ${JSON.stringify(obj[k])}`);
    }
  };
  if (!isObj(x)) return ['summary: not an object'];
  if (Object.hasOwn(x, 'schema_version') && x.schema_version !== SUMMARY_SCHEMA_VERSION) {
    return [`schema_version ${JSON.stringify(x.schema_version)}: this reader reads summary.json version ${SUMMARY_SCHEMA_VERSION} only; write it again with pnpm cli summary <run> --write`];
  }
  check('', x, {
    schema_version: (v) => v === SUMMARY_SCHEMA_VERSION, run_id: (v) => typeof v === 'string', model: (v) => v === null || typeof v === 'string', effort: (v) => v === null || typeof v === 'string', tasks: isObj, totals: isObj, models: strings,
    initial_state_hashes: strings, replay: isObj, requirements: isObj, violations: strings, mode: (v) => v === null || typeof v === 'string',
    expected_tasks: (v) => v === null || (isObj(v) && strings(v.tasks) && typeof v.from === 'string'),
  });
  if (isObj(x.totals)) {
    check('totals.', x.totals, { records: count, trials: count, passes: count, env_error_raw: count, grader_error: count, grader_error_history: count, regraded: count, requeued: count, internal_errors: count, cost_usd: num });
  }
  if (isObj(x.replay)) check('replay.', x.replay, { ran: (v) => typeof v === 'boolean', matched: count, mismatched: strings, missing: strings });
  if (isObj(x.tasks)) {
    for (const [id, t] of Object.entries(x.tasks)) {
      if (!isObj(t)) {
        errors.push(`tasks.${id}: not an object`);
        continue;
      }
      const histogram = (v: unknown) => isObj(v) && Object.entries(v).every(([o, n]) => (OUTCOMES as readonly string[]).includes(o) && count(n));
      check(`tasks.${id}.`, t, {
        task_versions: strings, env_versions: strings, grader_task_versions: strings, records: count, trials: count, passes: count, pass_rate: rate, wilson95: interval, refusals: count,
        refusal_excluded_rate: rate, env_error_raw: count, grader_error: count, grader_error_history: count, regraded: count, requeued: count, mean_score: (v) => v === null || num(v), mean_cost_usd: (v) => v === null || num(v),
        outcomes: histogram, recorded_outcomes: histogram,
        raw_mean_score: (v) => v === null || num(v), gate_fraction: rate, pass_no_harm: count, pass_no_harm_rate: rate,
        limits: (v) => isObj(v) && LIMITS.every((k) => Object.hasOwn(v, k)) && Object.values(v).every(count), requeued_outcomes: histogram,
        infra_counted_attempts: count, infra_counted_rate: rate,
        metric_trials: (v) => isObj(v) && count(v.mean_score) && count(v.raw_mean_score) && count(v.gate_fraction),
        pass_k: (v) => isObj(v) && Object.keys(v).length === PASS_K.length && PASS_K.every((k) => Object.hasOwn(v, String(k)) && rate(v[String(k)])),
        consistency: (v) => isObj(v) && count(v.valid) && count(v.passes) && count(v.failures)
          && (v.shared === null || (isObj(v.shared) && typeof v.shared.check === 'string' && count(v.shared.count) && typeof v.shared.found === 'string' && count(v.shared.found_count) && count(v.shared.found_values)))
          && Array.isArray(v.flags) && v.flags.every((f) => f === 'shared_failure' || f === 'no_passes'),
        fault_counts: (v) => isObj(v) && count(v.failures) && count(v.infra_reruns) && keyed(v.taxonomy, FAILURE_KINDS) && (v.label === null || keyed(v.label, FAILURE_LABELS)),
        top_failed_checks: (v) => Array.isArray(v) && v.every((c) => isObj(c) && typeof c.check === 'string' && count(c.count) && (c.count as number) > 0),
      });
      // Each way of counting the failures adds up to them, and the checks count no more of them.
      const fc = t.fault_counts;
      if (isObj(fc) && count(fc.failures)) {
        const sum = (h: unknown) => Object.values(h as Record<string, number>).reduce((a, n) => a + n, 0);
        if (keyed(fc.taxonomy, FAILURE_KINDS) && sum(fc.taxonomy) !== fc.failures) errors.push(`tasks.${id}.fault_counts.taxonomy: adds up to ${sum(fc.taxonomy)}, not its ${fc.failures as number} failures`);
        if (fc.label !== null && keyed(fc.label, FAILURE_LABELS) && sum(fc.label) !== fc.failures) errors.push(`tasks.${id}.fault_counts.label: adds up to ${sum(fc.label)}, not its ${fc.failures as number} failures`);
        if (count(t.trials) && count(t.passes) && fc.failures !== (t.trials as number) - (t.passes as number)) errors.push(`tasks.${id}.fault_counts.failures: ${fc.failures as number}, not its ${(t.trials as number) - (t.passes as number)} valid failures`);
        if (Array.isArray(t.top_failed_checks) && t.top_failed_checks.reduce((a: number, c) => a + (isObj(c) && count(c.count) ? (c.count as number) : 0), 0) > (fc.failures as number)) errors.push(`tasks.${id}.top_failed_checks: counts more than its ${fc.failures as number} failures`);
      }
      if (count(t.passes) && count(t.trials) && (t.passes as number) > (t.trials as number)) errors.push(`tasks.${id}.passes: more than its trials`);
      // pass_k is a function of passes and trials: a value that is not passK of them is stale or edited.
      else if (count(t.passes) && count(t.trials) && isObj(t.pass_k)) {
        for (const k of PASS_K) {
          const want = passK(t.passes as number, t.trials as number, k);
          const got = t.pass_k[String(k)];
          if (Object.hasOwn(t.pass_k, String(k)) && got !== want) errors.push(`tasks.${id}.pass_k.${k}: ${JSON.stringify(got)}, not pass^${k} of ${t.passes as number}/${t.trials as number} = ${want}`);
        }
      }
    }
  }
  return errors;
}

export function assertSummary(x: unknown): asserts x is Summary {
  const errors = validateSummary(x);
  if (errors.length > 0) throw new TypeError(`not a summary: ${errors.join('; ')}`);
}
