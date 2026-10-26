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

// A pilot's number (pilot-10 is 10), so pilot-10 counts as later than pilot-9 (verifier JU6-1 F4);
// a run with no number sorts first, and equal numbers keep their order.
const pilotNumber = (runId: string) => Number(/(\d+)$/.exec(runId)?.[1] ?? -1);

export function typicalCost(pilots: readonly PilotCosts[], task: string): { usd: number; n: number; run: string } | null {
  const holding = pilots.filter((p) => p.trials.some((t) => t.task === task));
  const run = holding.reduce<PilotCosts | undefined>((best, p) => (best === undefined || pilotNumber(p.runId) >= pilotNumber(best.runId) ? p : best), undefined);
  if (run === undefined) return null;
  const costs = run.trials.filter((t) => t.task === task).map((t) => t.record.cost_usd + (t.record.judge_cost_usd ?? 0)).sort((a, b) => a - b);
  return { usd: costs[Math.ceil(0.5 * costs.length) - 1]!, n: costs.length, run: run.runId };
}

// A launcher amount is an upper bound ("at most") only when every line of its projection is priced
// at the per-trial cap; a line priced from a pilot's p90 (the local runner, once results name a
// cost_from run) makes it an estimate (verifier JU6-1 F2).
export const allCapped = (lines: readonly { basis: string }[]): boolean => lines.every((l) => l.basis === 'cap');
export const amountText = (usd: number, bound: boolean): string => (bound ? `at most $${usd.toFixed(2)}` : `about $${usd.toFixed(2)} (pilot p90)`);
