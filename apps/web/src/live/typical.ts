// The typical cost of one trial of a task, shown beside the launcher's "at most" amounts: the
// nearest-rank median of agent plus judge cost over the task's trials in the latest committed
// pilot run that holds the task (pilots in directory order, as data/results.ts sorts them), or
// null when no pilot holds it. Pilots never enter headline numbers; this is a price hint only.
// The parts of a pilot run (data/results.ts RunData) this reads; typed here so the root tsconfig
// that runs apps/web/test does not follow results.ts into its Vite-only import.meta APIs.
export interface PilotCosts {
  runId: string;
  trials: readonly { task: string; record: { cost_usd: number; judge_cost_usd?: number | null } }[];
}

export function typicalCost(pilots: readonly PilotCosts[], task: string): { usd: number; n: number; run: string } | null {
  const run = pilots.findLast((p) => p.trials.some((t) => t.task === task));
  if (run === undefined) return null;
  const costs = run.trials.filter((t) => t.task === task).map((t) => t.record.cost_usd + (t.record.judge_cost_usd ?? 0)).sort((a, b) => a - b);
  return { usd: costs[Math.ceil(0.5 * costs.length) - 1]!, n: costs.length, run: run.runId };
}
