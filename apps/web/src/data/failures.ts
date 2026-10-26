// Why tasks fail (plan P17j JU7): the words and counts the Findings and Overview fault box, the
// kind bar and the Runs filters share. The counts come from summary.json (packages/core/summary.ts
// faultCounts); the M1-M4 count and the run block come from the explanations (explain.ts), which
// summary.json does not hold. No JSX and no data/ imports, so the e2e specs can import it.
import { blocksRun, type Explanation } from '../../../../packages/core/explain.ts';
import { FAILURE_KINDS, FAILURE_LABELS, type FaultCounts } from '../../../../packages/core/summary.ts';

export type FailureKind = (typeof FAILURE_KINDS)[number];
export type FailureLabel = (typeof FAILURE_LABELS)[number];

// A kind in words (the glossary explains each): TAXONOMY's ids in plain spelling; unattributed is a
// failure whose recorded kind does not name the check that decides it now.
const KIND_WORDS: Partial<Record<FailureKind, string>> = { over_action: 'over-action', did_not_finish: 'did not finish', unattributed: 'no kind recorded' };
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
  return { met: failed.filter((e) => ['M1', 'M2', 'M3', 'M4'].every((id) => e.criteria.find((c) => c.id === id)?.met === true)).length, failures: failed.length };
}

// Whether a trial blocks the run (DENOMINATOR_RULE): blocksRun (a false PASS, GR5; a failure whose
// fault is the environment's or the grader's; a run block such as B1), or a valid failure the
// audit labels environment or grader, which audit-check fails too (verifier-phase-P17i-JU7-1 S1).
export const blocksTheRunHere = (e: Explanation): boolean => blocksRun(e) !== null || (isFailure(e) && (e.audit_label === 'environment' || e.audit_label === 'grader'));

// The run block (it then shows no pass count, dot or Wilson interval, decisions.tsv
// 2026-10-29T16:00): the trials that block it, by name, and how many are false PASSes.
export interface RunBlock {
  trials: number;
  falsePasses: number;
  names: string[];
}
export function runBlock(ts: ReadonlyArray<{ name: string; explanation: Explanation }>): RunBlock | null {
  const blocking = ts.filter((t) => blocksTheRunHere(t.explanation));
  return blocking.length === 0 ? null : { trials: blocking.length, falsePasses: blocking.filter((t) => isFalsePass(t.explanation)).length, names: blocking.map((t) => t.name) };
}

export const isFalsePass = (e: Explanation): boolean => e.outcome === 'PASS' && e.deciding?.id === 'GR5';
