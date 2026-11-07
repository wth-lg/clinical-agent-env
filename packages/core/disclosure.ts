// A disclosed out-of-band result (the user's accept-and-disclose decision, decisions.tsv
// 2026-11-06T17:27Z): final-1 stands as measured, and each task outside the band is disclosed
// rather than rerun. The record lives in results/tasks-final.json, under the task's freeze entry
// as `disclosure`, beside the entry's other post-run facts (regrades, replay_at): the freeze is
// the per-task ledger of the final result, scripts/donewhen.ts clause (5) already reads it per
// task, scripts/test/tasks-final.test.ts holds its shape, and scripts/docs-gen.ts reads it to
// mark the writeup's pass-rates row. results/official.json only names the run.
//
// `summary --require band-or-disclosed=a-b` (packages/core/summary.ts checkRequirements) passes
// an out-of-band task only when its disclosure names a recognised user decision
// (RECOGNISED_DECISIONS, by decision_id; the record's decided_by and date must be that decision's,
// so a fabricated record never passes, gate P25CFIX-242 F1), the task's current verdict, and the
// writeup's generated pass-rates block marks the task with disclosedVerdictText, which is
// generated from the recognised decision. An in-band task needs no record; a record on one is
// stale and fails. docs/decisions.md names the recognised decisions.
import { BAND_VERDICTS, type BandVerdict } from './summary.ts';

// The user decisions a disclosure may name. The run's decision log (decisions.tsv) is not in the
// repository, so the code carries each recognised decision: its id, who took it, the day and a
// summary. A new decision is a new entry here and a line in docs/decisions.md.
export interface RecognisedDecision {
  id: string;
  decided_by: string;
  date: string;
  summary: string;
}
export const RECOGNISED_DECISIONS: readonly RecognisedDecision[] = [
  {
    id: 'user-2026-11-06T17:27Z-accept-and-disclose',
    decided_by: 'user',
    date: '2026-11-06',
    summary: 'Accept and disclose: final-1 stands as measured, with no second final run; the writeup discloses each out-of-band result with its Wilson 95% interval, the S5 procedure, the priors and why four tasks landed above the band.',
  },
];
export const recognisedDecision = (id: string): RecognisedDecision | undefined => RECOGNISED_DECISIONS.find((d) => d.id === id);

export interface Disclosure {
  // The recognised decision this record rests on (RECOGNISED_DECISIONS[].id).
  decision_id: string;
  // The task's band verdict when it was disclosed; must equal its current verdict.
  verdict: BandVerdict;
  // The decision in words, who took it and the day: "accept and disclose", "user", "2026-11-06";
  // decided_by and date equal the recognised decision's.
  decision: string;
  decided_by: string;
  date: string;
  // Where the decision is recorded (a decisions.tsv row, a report); for the reader.
  source?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The mark in words, from the recognised decision: "disclosed: user decision 2026-11-06".
export const disclosureText = (d: Disclosure): string => {
  const r = recognisedDecision(d.decision_id) ?? d;
  return `disclosed: ${r.decided_by} decision ${r.date}`;
};
// The verdict cell of a disclosed task in the writeup's pass-rates block and in a summary line:
// "Above band (disclosed: user decision 2026-11-06)".
export const disclosedVerdictText = (verdict: BandVerdict, d: Disclosure): string => `${verdict} (${disclosureText(d)})`;

// The disclosures a tasks-final.json document holds, by task. Throws on a malformed one, naming
// the field; an entry without one is skipped.
export function parseDisclosures(doc: unknown): Record<string, Disclosure> {
  const tasks = (doc as { tasks?: unknown } | null)?.tasks;
  if (tasks === null || typeof tasks !== 'object' || Array.isArray(tasks)) throw new Error('tasks must be an object keyed by task id');
  const out: Record<string, Disclosure> = {};
  for (const [id, entry] of Object.entries(tasks as Record<string, { disclosure?: unknown }>)) {
    const d = entry?.disclosure;
    if (d === undefined) continue;
    const at = `tasks.${id}.disclosure`;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${at} must be an object`);
    const x = d as Record<string, unknown>;
    const rec = typeof x.decision_id === 'string' ? recognisedDecision(x.decision_id) : undefined;
    if (rec === undefined) throw new Error(`${at}.decision_id must name a recognised decision (${RECOGNISED_DECISIONS.map((r) => r.id).join(', ')})`);
    if (!(BAND_VERDICTS as readonly unknown[]).includes(x.verdict)) throw new Error(`${at}.verdict must be one of ${BAND_VERDICTS.join(', ')}`);
    for (const k of ['decision', 'decided_by'] as const) if (typeof x[k] !== 'string' || x[k].trim() === '') throw new Error(`${at}.${k} must be a non-empty string`);
    if (x.decided_by !== rec.decided_by) throw new Error(`${at}.decided_by must be "${rec.decided_by}", who took decision ${rec.id}`);
    if (typeof x.date !== 'string' || !DATE.test(x.date)) throw new Error(`${at}.date must be a YYYY-MM-DD date`);
    if (x.date !== rec.date) throw new Error(`${at}.date must be ${rec.date}, the date of decision ${rec.id}`);
    if (x.source !== undefined && typeof x.source !== 'string') throw new Error(`${at}.source must be a string`);
    out[id] = { decision_id: rec.id, verdict: x.verdict as BandVerdict, decision: x.decision as string, decided_by: x.decided_by as string, date: x.date, ...(x.source !== undefined ? { source: x.source as string } : {}) };
  }
  return out;
}

const BEGIN = '<!-- docs-gen:begin pass-rates -->';
const END = '<!-- docs-gen:end pass-rates -->';
const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// The rows of the writeup's generated pass-rates block, by the task id in the row header, each as
// its text with the markup stripped; a superseded version's row (its header holds more than the
// id) is left out. null when the writeup has no block.
export function passRatesRows(html: string): Record<string, string> | null {
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END);
  if (a < 0 || b < a) return null;
  const rows: Record<string, string> = {};
  for (const m of html.slice(a, b).matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const head = /<th scope="row">([\s\S]*?)<\/th>/.exec(m[1]!);
    if (head === null) continue;
    rows[stripTags(head[1]!).trim()] = stripTags(m[1]!);
  }
  return rows;
}
