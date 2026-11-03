// The Overview band line (ui-contract P14, pre-audit F1): `<k> of <n> tasks in band`. k is the
// number of tasks whose band_verdict in the official run's summary.json is In band
// (packages/core/summary.ts bandVerdict, the one definition), n the number of tasks with a final
// result: FINAL_TRIALS_PER_TASK valid trials in that run (packages/core/cost.ts), so a verdict
// over the whole sample. Both come from the summary, never a constant, so the line reads
// `6 of 6 tasks in band` only when every task has a final result and all are in band. A task part
// way through the run (fewer valid trials, whatever its verdict so far) is in progress: it is never
// counted in n or k, and the note names it with its count. A task with no record in the run is
// named plainly. The note keeps the task list's order, so a reader sees which results are to come.
import { FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';
import type { BandVerdict } from '../../../../packages/core/summary.ts';

export interface BandCount {
  inBand: number;
  // Tasks with a final result: the n of the line.
  final: number;
  // Tasks with no final result yet, in task-list order: trials is the task's valid trials in the
  // run so far (in progress), or null when the run has no record of it.
  notFinal: { id: string; trials: number | null }[];
}

// A task's summary entry: its verdict and its valid trials (summary.json tasks.<id>.trials).
export type BandTask = { band_verdict: BandVerdict | null; trials: number };

// tasks: the summary's tasks by id; all: the environment's task ids in Overview order, or null
// while the task list loads (then only the summary's own tasks short of the sample are not final).
export function bandCount(tasks: Readonly<Record<string, BandTask>>, all: readonly string[] | null): BandCount {
  const isFinal = (t: BandTask | undefined) => t !== undefined && t.band_verdict !== null && t.trials >= FINAL_TRIALS_PER_TASK;
  const final = Object.entries(tasks).filter(([, t]) => isFinal(t));
  const known = all === null ? Object.keys(tasks) : [...all, ...Object.keys(tasks).filter((id) => !all.includes(id))];
  return {
    inBand: final.filter(([, t]) => t.band_verdict === 'In band').length,
    final: final.length,
    notFinal: known.filter((id) => !isFinal(tasks[id])).map((id) => ({ id, trials: tasks[id]?.trials ?? null })),
  };
}

// The line itself: the contract's pattern, numbers from the count.
export const bandLine = (c: BandCount): string => `${c.inBand} of ${c.final} tasks in band`;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n: number) => WORDS[n] ?? String(n);

// The note for the tasks the count leaves out; null when every task has a final result. When every
// such task is in progress at one count, one line says so ("All six tasks are in progress: 12 of
// 20 valid trials each."), instead of the count after each name.
export function notFinalLine(c: BandCount): string | null {
  const n = c.notFinal.length;
  if (n === 0) return null;
  const counts = new Set(c.notFinal.map((t) => t.trials));
  if (counts.size === 1 && !counts.has(null)) {
    const v = [...counts][0];
    const each = `${v} of ${FINAL_TRIALS_PER_TASK} valid trials${n === 1 ? '' : ' each'}`;
    if (c.final === 0 && n > 1) return `All ${word(n)} tasks are in progress: ${each}.`;
    return `${n} ${n === 1 ? 'task is' : 'tasks are'} in progress and not counted, ${each}: ${c.notFinal.map((t) => t.id).join(', ')}.`;
  }
  const names = c.notFinal.map((t) => (t.trials === null ? t.id : `${t.id} (in progress, ${t.trials} of ${FINAL_TRIALS_PER_TASK} valid trials)`));
  return `${n} ${n === 1 ? 'task has' : 'tasks have'} no final result yet and ${n === 1 ? 'is' : 'are'} not counted: ${names.join(', ')}.`;
}

// A task's verdict as the screen labels it: over the final sample (FINAL_TRIALS_PER_TASK valid
// trials) the verdict itself; over fewer, provisional, with the count, so a card never reads
// against the line above it (verifier UIBAND-219-2 N1). The verdict word is bandVerdict's.
export function verdictLabel(verdict: BandVerdict, trials: number): { label: string; count: string | null } {
  if (trials >= FINAL_TRIALS_PER_TASK) return { label: verdict, count: null };
  return { label: `${verdict}, provisional`, count: `${trials} of ${FINAL_TRIALS_PER_TASK} valid trials` };
}
