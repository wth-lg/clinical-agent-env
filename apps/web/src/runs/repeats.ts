// Repeated reasons in a run's list (P25c, Runs: the same sentence 15 times for contrast-ct-prep):
// of the rows that show a reason, a later row of the same task with the same reason names the
// first row that shows it, so the Runs list shows each sentence once per group and the later rows
// keep the full text one click away.
export interface ReasonRow {
  name: string;
  task: string;
  reason: string;
  // Whether the row shows its reason (a non-pass, or a false PASS).
  faulted: boolean;
}

// Each later row's name to the name of the first row of its task with the same reason.
export function repeatedReasons(rows: readonly ReasonRow[]): Map<string, string> {
  const first = new Map<string, string>();
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.faulted) continue;
    const key = `${r.task}\n${r.reason}`;
    const seen = first.get(key);
    if (seen === undefined) first.set(key, r.name);
    else out.set(r.name, seen);
  }
  return out;
}
