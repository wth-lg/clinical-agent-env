// The typical cost of one trial of a task, shown beside the launcher's "at most" amounts: the
// nearest-rank median of agent plus judge cost over the task's trials in the latest committed
// pilot run that holds the task (data/pilot-order.ts latestHolding: pilot-10 after pilot-9,
// pilot-4b after pilot-3, in any list order; verifier JU6-1 F4, pre-audit-2 S24), or null when
// no pilot holds it. Pilots never enter headline numbers; this is a price hint only.
// The parts of a pilot run (data/results.ts RunData) this reads; typed here so the root tsconfig
// that runs apps/web/test does not follow results.ts into its Vite-only import.meta APIs.
import { latestHolding } from '../data/pilot-order.ts';

export interface PilotCosts {
  runId: string;
  trials: readonly { task: string; record: { cost_usd: number; judge_cost_usd?: number | null } }[];
}

export function typicalCost(pilots: readonly PilotCosts[], task: string): { usd: number; n: number; run: string } | null {
  const run = latestHolding(pilots, task);
  if (run === null) return null;
  const costs = run.trials.filter((t) => t.task === task).map((t) => t.record.cost_usd + (t.record.judge_cost_usd ?? 0)).sort((a, b) => a - b);
  return { usd: costs[Math.ceil(0.5 * costs.length) - 1]!, n: costs.length, run: run.runId };
}

// A launcher amount is an upper bound ("at most") only when every line of its projection is priced
// at the per-trial cap; a line priced from a pilot's p90 (the local runner, once results name a
// cost_from run) makes it an estimate (verifier JU6-1 F2).
export const allCapped = (lines: readonly { basis: string }[]): boolean => lines.every((l) => l.basis === 'cap');
export const amountText = (usd: number, bound: boolean): string => (bound ? `at most $${usd.toFixed(2)}` : `about $${usd.toFixed(2)} (pilot p90)`);

// P25u A7: the line beside a Run button leads with the typical cost of one trial, when a pilot
// gives one, with its basis (eval-p25u-2 S5: the key gate's range is the final run's mean per
// task, this is a pilot median), then what the batch holds: "holds up to $X" for an upper bound,
// else the estimate.
export const TYPICAL_BASIS = 'pilot median';
export function costLine(typicalUsd: number | null, batchUsd: number, bound: boolean): string {
  const hold = bound ? `holds up to $${batchUsd.toFixed(2)}` : amountText(batchUsd, bound);
  return typicalUsd === null ? hold : `about $${typicalUsd.toFixed(2)} a trial (${TYPICAL_BASIS}) · ${hold}`;
}
