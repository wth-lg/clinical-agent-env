// A trial's mark (ui.tsx draws it): its outcome and whose fault it is, and the legend's words for
// each mark. No JSX here, so apps/web/test can import it.
import { FAULT, isValid, type Fault, type Outcome } from '../../../../packages/core/outcomes.ts';

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
