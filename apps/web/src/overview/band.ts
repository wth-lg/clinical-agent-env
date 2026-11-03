// The Overview band line (ui-contract P14, pre-audit F1): `<k> of <n> tasks in band`. k is the
// number of tasks whose band_verdict in the official run's summary.json is In band
// (packages/core/summary.ts bandVerdict, the one definition), n the number of tasks with a final
// result: a verdict, so valid trials in that run. Both come from the summary, never a constant,
// so the line reads `6 of 6 tasks in band` only when every task has a final result and all are in
// band. The tasks the count leaves out (no record in the run, or no valid trial) are named in a
// note, in the order of the task list, so a reader sees which results are still to come.
import type { BandVerdict } from '../../../../packages/core/summary.ts';

export interface BandCount {
  inBand: number;
  // Tasks with a final result (a verdict): the n of the line.
  final: number;
  // Tasks with no final result yet, in task-list order: the task list's ids the summary gives no
  // verdict for, then any summary task the list does not name.
  notFinal: string[];
}

// tasks: the summary's tasks by id; all: the environment's task ids in Overview order, or null
// while the task list loads (then only the summary's own verdict-less tasks are not final).
export function bandCount(tasks: Readonly<Record<string, { band_verdict: BandVerdict | null }>>, all: readonly string[] | null): BandCount {
  const final = new Set(Object.entries(tasks).filter(([, t]) => t.band_verdict !== null).map(([id]) => id));
  const known = all === null ? Object.keys(tasks) : [...all, ...Object.keys(tasks).filter((id) => !all.includes(id))];
  return {
    inBand: Object.values(tasks).filter((t) => t.band_verdict === 'In band').length,
    final: final.size,
    notFinal: known.filter((id) => !final.has(id)),
  };
}

// The line itself: the contract's pattern, numbers from the count.
export const bandLine = (c: BandCount): string => `${c.inBand} of ${c.final} tasks in band`;

// The note for the tasks the count leaves out; null when every task has a final result.
export function notFinalLine(c: BandCount): string | null {
  const n = c.notFinal.length;
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'task has' : 'tasks have'} no final result yet and ${n === 1 ? 'is' : 'are'} not counted: ${c.notFinal.join(', ')}.`;
}
