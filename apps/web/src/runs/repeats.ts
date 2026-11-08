// Repeated reasons in a run's list (P25c, Runs: the same sentence 15 times for contrast-ct-prep):
// of the rows that show a reason, a later row of the same task with the same reason names the
// first row that shows it, so the Runs list shows each sentence once per group and the later rows
// keep the full text one click away.
// A row groups only when its plain lead is the same too, step numbers aside (verifier-1 addendum
// 3, G2): final-1 crc-care-gap/6 and /12 share the grader sentence, but their leads name different
// windows (2026-01-01 and 2024-01-01), and "Same reason as crc-care-gap/6" under /12 read as false.
export interface ReasonRow {
  name: string;
  task: string;
  reason: string;
  // The plain lead the row shows above the reason (trial/lead.ts trialLead), or null.
  lead?: string | null;
  // Whether the row shows its reason (a non-pass, or a false PASS).
  faulted: boolean;
}

// The lead with each step number masked: two trials that missed the same record at different
// steps read as the same reason.
const leadKey = (lead: string | null | undefined) => (lead ?? '').replace(/\bstep \d+/g, 'step #');

// Each later row's name to the name of the first row of its task with the same reason and lead.
export function repeatedReasons(rows: readonly ReasonRow[]): Map<string, string> {
  const first = new Map<string, string>();
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.faulted) continue;
    const key = `${r.task}\n${r.reason}\n${leadKey(r.lead)}`;
    const seen = first.get(key);
    if (seen === undefined) first.set(key, r.name);
    else out.set(r.name, seen);
  }
  return out;
}
