// A session trial's full explanation (trace row N10): the context the published trial detail
// builds (data/results.ts fullExplanation), with the events the transport kept and the task's
// checks and check text, no audit row and no matrix (M4 stays pending). M3 is checked against the
// app's manifest world (data/world.ts MANIFEST, bundled with the code on every surface), the world
// every published trial is checked against, never against the record's own hashes. The trial page
// (TrialPage.tsx SessionDetail) and the live view's graded card (S4, A4) read the one function, so
// the card's reason and the page's agree. It reaches data/results.ts, so Node cannot load it: the
// e2e specs must not import it.
import { explainContext } from '../../../../packages/core/explain-context.ts';
import { explainTrial, type Explanation } from '../../../../packages/core/explain.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { checkTextOf, type Trial } from '../data/results.ts';
import { MANIFEST } from '../data/world.ts';

export async function sessionExplanation(t: Trial, events: readonly TrialEvent[]): Promise<Explanation> {
  const { taskChecks } = await import('../tasks/matrix-task.ts');
  const checks = await taskChecks(t.task).catch(() => []);
  return explainTrial(t.record, null, explainContext({ record: t.record, events, manifest: { world_hash: MANIFEST.world.state_hash }, matrix: null, checks, text: checkTextOf(t.task) }));
}
