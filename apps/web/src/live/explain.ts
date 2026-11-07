// A live trial's full explanation (P25u A4): the same context the trial page of run=session builds
// (trial/TrialPage.tsx sessionExplanation): the record, the events the transport kept, the task's
// checks and check text, the app's manifest world for M3, no audit row and no matrix. The card
// and the Your runs row read this, so their one-line reason is the page's, not the bare record's
// ("expected every condition of the check, found failed items Patient/pt-0061 …").
import { explainContext } from '../../../../packages/core/explain-context.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { explainTrial, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { checkTextOf } from '../data/results.ts';
import { MANIFEST } from '../data/world.ts';

export async function liveExplanation(record: ExplainRecord, events: readonly TrialEvent[], taskId: string): Promise<Explanation> {
  const task = record.task_id ?? taskId;
  const { taskChecks } = await import('../tasks/matrix-task.ts');
  const checks = await taskChecks(task).catch(() => []);
  return explainTrial(record, null, explainContext({ record: { ...record, task_id: task }, events, manifest: { world_hash: MANIFEST.world.state_hash }, matrix: null, checks, text: checkTextOf(task) }));
}
