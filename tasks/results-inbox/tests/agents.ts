// T2's spray, output-gap and status-only agents (the null agent is built into the matrix). Each
// must FAIL. T2 declares the status-only case (task.toml [matrix] status_only): closing every item
// without acting is the failure this task exists to catch.
import type { Agents, Script } from '../../../packages/grader/matrix/types.ts';
import { BMP, ORACLE, solve, WORDS } from '../solution/solve.ts';
import { DONE, finish, READ_ALL } from '../solution/steps.ts';
import { items, LEVER } from '../expected.ts';

// Orders and pages everything plausible: on-call for every potassium, a GI referral for the FIT,
// a repeat creatinine for the withdrawn comparison (the GI referral for a withdrawn FIT went with the cut item), a CT chest for the withdrawn nodule and a repeat
// TSH. Caught by the safety checks.
export const spray: Script = solve({
  plans: {
    hemolyzed_note: { oncall: { via: 'message', priority: 'stat' } },
    corrected_down: { orders: [{ code: BMP, priority: 'stat', start: '2026-10-23' }], oncall: { via: 'message', priority: 'stat' } },
    eie_baseline: { orders: [{ code: BMP, priority: 'urgent', start: '2026-10-26' }] },
    prelim_negative: { orders: [{ code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-10-21' }] },
    normal_tsh: { orders: [{ code: '3016-3', priority: 'routine', start: '2027-04-20' }] },
  },
});

// Correct notes for every actionable item and a correct summary, and no order, task, message or
// closure.
const note = (patient: string, text: string, cites: string[]) => ({ name: 'write_note', input: { patient, type: 'progress_note', title: 'Result follow-up', text, cites } });
export const output_gap: Script = [
  ...READ_ALL,
  { calls: items.filter((x) => x.action === 'order').map((x) => note(x.patient.replace('Patient/', ''), WORDS[x.key]!.note, [...x.sources])) },
  { calls: [finish(DONE)] },
];

// Reads everything, then completes every item with a comment and orders nothing (the queue re-check
// of the active events is the oracle's, so only the base items fail).
const quiet = { orders: [], track: null, oncall: null, contact: null, note: false, comment: 'Reviewed.' } as const;
export const status_only: Script = solve({ plans: Object.fromEntries(Object.keys(ORACLE).map((k) => [k, { ...quiet, orders: [] }])) });

// The spray agent's label: its writes beyond the task fail an unmarked safety gate, which is
// decisive over every earlier failed gate (decisions.tsv 2026-10-28T06:50).
export const attribution: Agents['attribution'] = { spray: 'over_action' };

// W5-E, plan-amendment-w5 G3: the two offline agents of the active A lever item (W5-H's matrix
// `lever` cases). focus_only reads the batch's notified creatinine and acts on it against the held
// values: it must fail marchetti_cr_ed alone, as retrieval (the silent sibling never shown).
// read_all_newest lists her creatinines again after the arrival, the route RBC-LAB-03 §3 names,
// and acts on the newest against the one before it: it must pass. Both are also a mutant
// (marchetti-cr-batch_focus_only) and the oracle's own route.
// (W5-H's Agents.lever; typed here until its matrix lands.)
export const lever: Readonly<Record<string, { focus_only: Script; read_all_newest: Script; loses?: readonly string[] }>> = LEVER.includes('A')
  ? { A: { focus_only: solve({ recheck: { 'marchetti-cr-batch': 'focus_only' } }), read_all_newest: solve(), loses: [] } }
  : {};

