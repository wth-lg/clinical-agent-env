// Why tasks fail (plan P17j JU7): the words and counts the Findings and Overview fault box, the
// kind bar and the Runs filters share. The counts come from summary.json (packages/core/summary.ts
// faultCounts); the M1-M4 count and the run block come from the explanations (explain.ts), which
// summary.json does not hold. No JSX and no data/ imports, so the e2e specs can import it.
import { blocksRun, m1ToM4Met, type Explanation } from '../../../../packages/core/explain.ts';
import type { Fault } from '../../../../packages/core/outcomes.ts';
import { FAILURE_KINDS, FAILURE_LABELS, type FaultCounts } from '../../../../packages/core/summary.ts';

export type FailureKind = (typeof FAILURE_KINDS)[number];
export type FailureLabel = (typeof FAILURE_LABELS)[number];

// A kind in words (the glossary explains each): TAXONOMY's ids in plain spelling; unattributed is a
// failure whose recorded kind does not name the check that decides it now; action_form is the right
// decision in a channel or form the policy does not name (TAXONOMY_TEXT).
const KIND_WORDS: Partial<Record<FailureKind, string>> = { over_action: 'over-action', action_form: 'wrong channel or form', did_not_finish: 'did not finish', unattributed: 'no kind recorded' };
export const kindWords = (k: FailureKind): string => KIND_WORDS[k] ?? k.replace(/_/g, ' ');

// The kind with the most failures, the first in FAILURE_KINDS on a tie; null with no failures.
export function mostCommon(fc: FaultCounts): { kind: FailureKind; count: number } | null {
  let best: { kind: FailureKind; count: number } | null = null;
  for (const kind of FAILURE_KINDS) if (fc.taxonomy[kind] > 0 && (best === null || fc.taxonomy[kind] > best.count)) best = { kind, count: fc.taxonomy[kind] };
  return best;
}

// A valid failure: what fault_counts and the M1-M4 count count.
export const isFailure = (e: Explanation): boolean => e.valid && e.outcome !== 'PASS';

// A valid failure's audit label as fault_counts.label counts it: the audit's label (adjudicated
// first), else unlabelled; null for a trial that is not a valid failure. The Runs ?audit= filter.
export function auditFilterOf(e: Explanation): FailureLabel | null {
  if (!isFailure(e)) return null;
  const l = e.audit_label;
  return l === 'model' || l === 'environment' || l === 'grader' ? l : 'unlabelled';
}

// The Runs ?check= filter: a valid failure whose decisive check is this one, the check
// top_failed_checks counts.
export const failedCheckOf = (e: Explanation): string | null => (isFailure(e) ? (e.decisive_check?.id ?? null) : null);

// The failures whose confirmation criteria M1-M4 are all met, of the valid failures.
export function m1m4(es: readonly Explanation[]): { met: number; failures: number } {
  const failed = es.filter(isFailure);
  // packages/core/explain.ts m1ToM4Met, the rule audit-check's fault box counts by: n/a is met.
  return { met: failed.filter((e) => m1ToM4Met(e.criteria)).length, failures: failed.length };
}

// The one rule for "this trial blocks the run" (DENOMINATOR_RULE; decisions.tsv 2026-10-29T16:00
// and 17:30; verifier-phase-P17i-JU7r2-1 F2): the run notice, Overview, Runs, Findings, the fault
// label's note and the trial header all read it. blocksRun (a false PASS, GR5; a valid failure whose
// fault is the environment's or the grader's; a run block such as B1); a GRADER_ERROR, which blocks
// a committed run until a grader fix and a full regrade; or a valid failure the audit labels
// environment or grader, which audit-check fails too. An ENV_ERROR or an INFRA trial never blocks
// it: it is run again.
export const blocksTheRun = (e: Explanation): boolean =>
  blocksRun(e) !== null || e.outcome === 'GRADER_ERROR' || (isFailure(e) && (e.audit_label === 'environment' || e.audit_label === 'grader'));

// The fault label a trial shows: the audit's environment or grader label on a valid failure, which
// makes it block the run, else the label explainTrial gives (null for a PASS with no fault).
export const shownLabel = (e: Explanation): string | null => (isFailure(e) && (e.audit_label === 'environment' || e.audit_label === 'grader') ? e.audit_label : e.label);

// The fault the outcome chip, the Overview dot and the Findings swatch show: the one the shown label
// names, so an audit's environment or grader label never sits beside a model mark
// (verifier-phase-P17j-retro-JU2-1 D1); else the fault explainTrial gives.
export function shownFault(e: Explanation): Fault | null {
  const l = shownLabel(e);
  return l === 'environment' ? 'env' : l === 'grader' ? 'grader' : e.fault;
}

// The fault explainTrial gave a trial whose shown fault the audit's label changed, which the trial
// header's Fault row names beside the shown one (verifier-phase-P17i-UIRETRO-1 M1); else null.
export function relabelledFrom(e: Explanation): Fault | null {
  return e.fault !== null && shownFault(e) !== e.fault ? e.fault : null;
}

// The kind of failure the trial header shows, in words: only for a model or refusal fault the audit
// did not relabel, so the headline and the Whose-fault row agree (verifier-phase-P17i-UI-3-1 F4).
export function shownKind(e: Explanation): string | null {
  return relabelledFrom(e) === null && (e.fault === 'model' || e.fault === 'refusal') && e.taxonomy !== null ? e.taxonomy.replace(/_/g, ' ') : null;
}

// The run block (it then shows no pass count, dot or Wilson interval, decisions.tsv
// 2026-10-29T16:00): the trials that block it, by name, and how many are false PASSes.
export interface RunBlock {
  trials: number;
  falsePasses: number;
  names: string[];
}
export function runBlock(ts: ReadonlyArray<{ name: string; explanation: Explanation }>): RunBlock | null {
  const blocking = ts.filter((t) => blocksTheRun(t.explanation));
  return blocking.length === 0 ? null : { trials: blocking.length, falsePasses: blocking.filter((t) => isFalsePass(t.explanation)).length, names: blocking.map((t) => t.name) };
}

// Why a pilot run gives no pass count, rate dot or Wilson interval: a trial blocks it (runBlock),
// so the official run's rule holds (decisions.tsv 2026-10-29T16:00), worded without the official
// run's "blocked" (decisions.tsv 19:10). Its Runs header, its Overview line and its rate rows on
// Overview and Findings show it in their place. Null when nothing blocks the run.
export function noPassCount(ts: ReadonlyArray<{ name: string; explanation: Explanation }>): string | null {
  const b = runBlock(ts);
  return b === null ? null : `no pass count while ${b.trials} ${b.trials === 1 ? 'trial needs' : 'trials need'} a fix`;
}

export const isFalsePass = (e: Explanation): boolean => e.outcome === 'PASS' && e.deciding?.id === 'GR5';
