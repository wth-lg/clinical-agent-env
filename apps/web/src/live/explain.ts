// A live trial's full explanation (P25u A4): the trial page's own (trial/session-explanation.ts
// sessionExplanation, S3), over a Trial built from the live record as trial/session.ts builds one,
// so the card's and the Your runs row's one-line reason is the page's, not the bare record's
// ("expected every condition of the check, found failed items Patient/pt-0061 …"). It reaches
// data/results.ts through sessionExplanation, so no Node test or e2e spec imports this.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { explainTrial, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import type { Trial, TrialRecord } from '../data/run-types.ts';
import { sessionExplanation } from '../trial/session-explanation.ts';

export function liveExplanation(record: ExplainRecord, events: readonly TrialEvent[], taskId: string, trialId = ''): Promise<Explanation> {
  const r = record as Partial<TrialRecord>;
  const rec: TrialRecord = { ...record, task_id: r.task_id ?? taskId, cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0 };
  const trial: Trial = { name: trialId, file: '', task: rec.task_id, record: rec, audit: null, trajectoryUrl: null, explanation: explainTrial(rec, null, { events: [] }) };
  return sessionExplanation(trial, events);
}
