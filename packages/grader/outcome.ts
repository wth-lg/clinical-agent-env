// The outcome a trial has before its checks run (design section 5, "Outcomes"), from its
// record. Which outcomes exist, which are valid and whose fault each is live in
// packages/core/outcomes.ts, the one definition the cost model shares.
//
// A LIMIT is split by whose fault the stop is (plan-amendment-worklist W0-A): a stop at the
// model's context window (detail context_window: a context-window stop_reason or a 400 prompt is
// too long) is ENV_LIMIT, the environment's; a turn, cost or working-time cap is LIMIT only when
// rule P-L (progress.ts) finds the model looping, and ENV_LIMIT otherwise, a trial with no
// trajectory included (the rule fails safe); a second max_tokens stop in a row stays LIMIT.
import { MODEL } from '../core/anthropic.ts';
import type { EventBody, TrialStatus } from '../core/events.ts';
import type { Outcome } from '../core/outcomes.ts';
import { CAP_LIMITS, progress, type Progress } from './progress.ts';

export { FAULT, isValid, OUTCOMES, VALID_OUTCOMES, type Fault, type Outcome } from '../core/outcomes.ts';

// What the grader reads from a trial record.
export interface TrialFacts {
  status: TrialStatus;
  // The terminal event's code or limit (run.ts TrialRun.detail): a LIMIT's kind.
  detail?: string | null;
  models_returned: readonly string[];
  tool_errors: Readonly<Record<string, number>>;
  state_hash: { initial: string | null; final: string | null; replay_final: string | null };
  // The summary the agent gave finish.
  summary: string | null;
}

// Rule P-L's facts for a trial that stopped at a turn, cost or working-time cap, null for any
// other trial; the grade records them (grade.ts Grade.progress).
export const capProgress = (t: Pick<TrialFacts, 'status' | 'detail'>, events?: readonly EventBody[]): Progress | null =>
  t.status === 'LIMIT' && CAP_LIMITS.includes(t.detail ?? '') ? progress(events ?? []) : null;

// The outcome the trial has before its checks run, or null when the gates decide (FAIL or PASS).
// events: the trial's trajectory, which rule P-L reads for a cap stop.
export function trialOutcome(t: TrialFacts, events?: readonly EventBody[]): Exclude<Outcome, 'GRADER_ERROR' | 'FAIL' | 'PASS'> | null {
  if (t.status === 'INVALID' || t.models_returned.some((m) => m !== MODEL)) return 'INVALID';
  if (t.status === 'INFRA_HARNESS') return 'INFRA_HARNESS';
  if (t.status === 'INFRA_API') return 'INFRA_API';
  if (t.status === 'CANCELLED') return 'CANCELLED';
  const h = t.state_hash;
  if (t.status === 'ENV_ERROR' || (t.tool_errors.INTERNAL ?? 0) > 0 || h.initial === null || h.final === null || h.replay_final !== h.final) return 'ENV_ERROR';
  if (t.status === 'REFUSAL') return 'REFUSAL';
  if (t.status === 'LIMIT') {
    if (t.detail === 'context_window') return 'ENV_LIMIT';
    const p = capProgress(t, events);
    return p !== null && !p.looping ? 'ENV_LIMIT' : 'LIMIT';
  }
  return null;
}
