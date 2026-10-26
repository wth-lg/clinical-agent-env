// A trial's place for the heading's "Trial i of n" (pre-audit M8, P17j JU11): among the run's
// trials of the same task, model and effort (verifier-phase-P17i-JU4JU11-1 m1), ordered by the
// record's index, or for a run-one record, which has none, by the number its name ends in (S4:
// the run's own order compares names as strings, so ".../10" came before ".../2").
export interface Placed {
  name: string;
  task: string;
  record: { index?: number; model_requested?: string | null; effort?: string | null };
}

const orderOf = (t: Placed): number => t.record.index ?? Number(/(\d+)$/.exec(t.name)?.[1] ?? Number.MAX_SAFE_INTEGER);

export function trialPlace(t: Placed, trials: readonly Placed[]): { i: number; n: number } | null {
  const same = trials
    .filter((x) => x.task === t.task && x.record.model_requested === t.record.model_requested && x.record.effort === t.record.effort)
    .sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name));
  const at = same.indexOf(t);
  return at < 0 ? null : { i: at + 1, n: same.length };
}
