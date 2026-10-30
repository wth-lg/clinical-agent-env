// A trial's mark (ui.tsx draws it): its outcome and whose fault it is, the legend's words for
// each mark, and the words beside a fault label: the note on a trial that is not counted, and the
// plain "Not counted" rule. No JSX here, so apps/web/test can import it.
import type { Explanation } from '../../../../packages/core/explain.ts';
import { FAULT, isValid, NEVER_RERUN, NOT_RERUN_REASON, OUTCOMES, RERUN_OUTCOMES, type Fault, type Outcome } from '../../../../packages/core/outcomes.ts';
import { blocksTheRun, isFalsePass } from './failures.ts';

export type Mark = 'pass' | 'model' | 'limit' | 'refusal' | 'environment' | 'grader' | 'infra';

export const MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
  { mark: 'pass', label: 'PASS' },
  { mark: 'model', label: 'model failure (FAIL)' },
  { mark: 'limit', label: 'model: stopped at a limit (LIMIT)' },
  { mark: 'refusal', label: 'model: refused (REFUSAL)' },
  { mark: 'environment', label: 'environment fault' },
  { mark: 'grader', label: 'grader fault' },
  { mark: 'infra', label: 'infrastructure fault, rerun, not counted' },
];
export const markLabel = (m: Mark) => MARKS.find((x) => x.mark === m)!.label;

// The mark of a trial from its outcome and the fault explainTrial gives it; with no explanation
// (a count by outcome), the fault packages/core/outcomes.ts FAULT gives the outcome.
export function markOf(outcome: string, fault: Fault | null = FAULT[outcome as Outcome] ?? null): Mark {
  // A false PASS (GR5) is the grader's fault: it takes the grader mark, not the pass accent.
  if (outcome === 'PASS') return fault === 'grader' ? 'grader' : 'pass';
  if (fault === 'env') return 'environment';
  if (fault === 'grader') return 'grader';
  if (fault === 'infra' || (fault === null && !isValid(outcome))) return 'infra';
  if (fault === 'refusal' || outcome === 'REFUSAL') return 'refusal';
  return outcome === 'LIMIT' ? 'limit' : 'model';
}

// An environment or grader fault: the outcome chip takes the danger border (JU2).
export const BLOCKING_MARKS: readonly Mark[] = ['environment', 'grader'];

// The note beside the label (data/failures.ts blocksTheRun decides whether the trial blocks the
// run). notCountedShown: the surrounding view already says "Not counted" (the trial header's plain
// reason for an excluded trial), so the note gives only the rest and the header has one "Not
// counted" sentence (F3). Only an official run is blocked; a counted trial that blocks it (a valid
// failure labelled environment or grader, a run block such as B1) is not "not counted"; a pilot's
// GRADER_ERROR is a grader bug fixed before the final run; an excluded environment error is run
// again and blocks nothing (decisions.tsv 2026-10-29T17:30 and 19:10); an ENV_LIMIT is not run
// again, and the note says why in NOT_RERUN_REASON's words (plan-amendment-worklist W0-A), on the
// trial page and in Runs alike.
const GRADER_BUG_NOTE = 'A grader bug; it is fixed and regraded before the final run.';
export function faultNote(e: Explanation, official: boolean, notCountedShown: boolean): string | null {
  const notCounted = (rest: string) => (notCountedShown ? rest : `Not counted. ${rest}`);
  if (blocksTheRun(e) && official) return !e.valid || isFalsePass(e) ? notCounted('The run is blocked until this is fixed.') : 'The run is blocked until this is fixed.';
  if (!e.valid && e.outcome === 'GRADER_ERROR') return notCounted(GRADER_BUG_NOTE);
  // A pilot trial the official run would be blocked by: a pilot is not counted (decisions.tsv 21:00).
  if (blocksTheRun(e) && !official) return 'A pilot is not counted in the final pass rate.';
  if (!e.valid && e.fault === 'env') {
    const reason = NOT_RERUN_REASON[e.outcome as Outcome];
    if (reason !== undefined) return notCountedShown ? `It is not run again: ${reason}.` : `Not counted; it is not run again: ${reason}.`;
    return notCountedShown ? 'It is run again.' : 'Not counted; it is run again.';
  }
  return null;
}

// The plain rules' "Not counted" line (ui.tsx PlainRules), the outcome lists and reasons read
// from outcomes.ts: the outcomes run again, then each one not run again with its reason.
const and = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);
export const NOT_COUNTED_LINE = `${and([`${RERUN_OUTCOMES.join(', ')} (run again)`, ...NEVER_RERUN.map((o) => `${o} (not run again: ${NOT_RERUN_REASON[o]})`)])}.`;

// The trials of a task that k/n leaves out (verifier-phase-P17i-W0-A-1 F4), from its outcome
// counts (summary.json TaskSummary, or a pilot's trials): each excluded outcome with its count and
// what happens to it, in NOT_COUNTED_LINE's words. ENV_LIMIT takes env_limit when given, which
// counts every ENV_LIMIT attempt, settled or not (packages/core/summary.ts).
export interface NotCounted {
  outcome: Outcome;
  n: number;
  why: string;
}
export function notCounted(t: { outcomes: Readonly<Record<string, number>>; env_limit?: number }): NotCounted[] {
  const count = (o: Outcome) => (o === 'ENV_LIMIT' && t.env_limit !== undefined ? t.env_limit : (t.outcomes[o] ?? 0));
  return OUTCOMES.filter((o) => !isValid(o) && count(o) > 0)
    .map((o) => ({ outcome: o, n: count(o), why: NOT_RERUN_REASON[o] === undefined ? 'run again' : `not run again: ${NOT_RERUN_REASON[o]}` }));
}
// One line beside k/n, or null when every trial counts.
export function notCountedText(parts: readonly NotCounted[]): string | null {
  return parts.length === 0 ? null : `Not counted: ${parts.map((p) => `${p.n} ${p.outcome} (${p.why})`).join(', ')}.`;
}
