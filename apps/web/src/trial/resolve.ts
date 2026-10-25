// Which trial ?run= and ?trial= name (docs/requirements/ui-contract.md, "Tokens"): a trial name
// (packages/core/summary.ts trialName) in the named run, else in the official run, then each
// pilot run; or the token first-nonpass, the first valid trial whose outcome is not PASS in
// summary order (the official run's task order, a pilot run's sorted task ids, then the trial
// index). Pure.
import { isValid } from '../../../../packages/core/outcomes.ts';
import type { RunData, Trial } from '../data/results.ts';

export const FIRST_NONPASS = 'first-nonpass';

export type Resolved =
  | { kind: 'trial'; run: RunData; trial: Trial }
  | { kind: 'no-run'; message: string }
  | { kind: 'no-trial'; message: string }
  | { kind: 'none-nonpass'; message: string };

export function firstNonPass(run: RunData): Trial | null {
  const order = run.summary ? Object.keys(run.summary.tasks) : [...new Set(run.trials.map((t) => t.task))].sort();
  const rank = (t: Trial) => (order.includes(t.task) ? order.indexOf(t.task) : order.length);
  const candidates = run.trials.filter((t) => isValid(t.explanation.outcome) && t.explanation.outcome !== 'PASS');
  return candidates.sort((a, b) => rank(a) - rank(b) || (a.record.index ?? 0) - (b.record.index ?? 0))[0] ?? null;
}

export function resolveTrial(runs: readonly RunData[], runId: string | null, trial: string): Resolved {
  const named = runId === null || runId === '' ? null : runs.find((r) => r.runId === runId);
  if (named === undefined) return { kind: 'no-run', message: `No run ${runId} is published in this build.` };
  const scope = named === null ? runs : [named];
  if (trial === FIRST_NONPASS) {
    const run = scope[0];
    const t = run ? firstNonPass(run) : null;
    if (run === undefined || t === null) return { kind: 'none-nonpass', message: 'No non-pass trial in this run' };
    return { kind: 'trial', run, trial: t };
  }
  for (const run of scope) {
    const t = run.trials.find((x) => x.name === trial);
    if (t) return { kind: 'trial', run, trial: t };
  }
  const where = named === null ? 'any published run' : `run ${named.runId}`;
  return { kind: 'no-trial', message: `No trial ${trial} in ${where}.` };
}
