// Discoverability (plan-amendment-worklist W1 gate; rulings R6 and R12 in the run ledger's
// reports/w1-probe-rulings.md): a stand-in set of the first broad searches a worklist agent makes,
// run through the real tools, shows no trap-deciding record on page 1 except for an item whose
// hard step is reasoning, and the oracle's trajectory exposes every item's decisive ids (or shows
// the note's phrase) before its first write for that item. The stand-in is written for the worklist
// form (W1, D13): pilot queries are pre-worklist and are not reused; W2 replaces it with probe-1's
// first searches.
// Each broad search is cross-patient (no patient filter), page 1 at the tool's default size and sort:
//   the queue and the protocol: get_context, list_inbox, read_policy (list and RBC-RX-05);
//   search_notes over the words the messages use and the protocol's general words: refill,
//     lisinopril, metformin, laboratory report;
//   fhir_search lists, newest first, of the record types the protocol decides on: DocumentReference,
//     DiagnosticReport (all and BMP panels), active MedicationRequests, every laboratory Observation,
//     and the clinic-wide lists by lab code a clinician runs first: potassium 2823-3, creatinine
//     2160-0, eGFR 33914-3, HbA1c 4548-4 and weight 29463-7 (gates T1 and T5 named the creatinine and
//     weight lists), each also in the tool's default order.
// The page-1 rule (R6) applies to trap-deciding records (TRAP below): the record that makes an item a
// trap or holds its hidden comparison value. An item's plain input may appear. A trap-deciding
// record a listed search shows on page 1 is allowed only for an item labelled reasoning in TRAP, with
// the reason: its trap fact sits on the result itself (a status, a note, a collection date), so any
// view of the result shows it, and the hard step is not trusting it. The four items whose hard step
// is retrieval (an outside report: m3, m5, m8, m10) keep their reports off page 1 of every list.
// Lures (R19) are listed apart (LURES): a record that tempts the wrong action but cannot decide the
// item may show on page 1 of a broad search; it makes the trap harder, not easier. They are never
// decisive.
// Targeted searches are exempt (R12, R25): a search for a rule term the policy uses (hemolyzed,
// collected, amended, entered in error) is the retrieval route R5 requires, and a search for a hazard
// word (correction, corrected, addendum, stop, held, substitution) is the retrieval skill working;
// neither is a broad first search.
// TARGETED lists them; the last test pins what each shows, and policy.test checks each rule word
// retrieves its outside report. A search for 'hemolyzed' shows Frank Odum's outside report on page 1
// (verifier-W1-probe-T6-1 F1), by design.
// R30: a note search by a lab panel or test name (potassium, BMP, HbA1c, creatinine, eGFR) is a
// targeted results route too, exempt from the page-1 rule; TESTS lists them, and a test pins what
// each shows. Since the R29 atoms (builder-254), the 'eGFR' search shows Frank Odum's outside report
// by its comment that the potassium may be falsely elevated by hemolysis: the report's eGFR line sits
// just before it. The clinic-wide fhir_search lists by lab code stay in BROAD, under the stricter rule.
// Reading a queued message is not a search, so it is not in the stand-in: the two repeat-request
// items (m2, m11) are decided by the first message, which list_inbox only references.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { firstExposed, seenBefore, stepsOf } from '../../../packages/grader/exposure.ts';
import type { Step } from '../../../packages/grader/check.ts';
import { trial } from '../../../packages/grader/matrix/matrix.ts';
import type { ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { ITEMS, type Item } from '../expected.ts';
import { firstSeenBy, seenStep } from './grader.ts';
import { ref } from '../ids.ts';
import { oracle } from '../solution/solve.ts';

const call = (name: string, input: ScriptCall['input']): ScriptCall => ({ name, input });
const notes = (query: string) => call('search_notes', { query });
const search = (resource_type: string, more: ScriptCall['input'] = {}) => call('fhir_search', { resource_type, ...more });
export const BROAD: ScriptCall[] = [
  call('get_context', {}),
  call('list_inbox', { queue: 'messages', status: 'requested' }),
  call('read_policy', {}),
  call('read_policy', { policy_id: 'RBC-RX-05' }),
  ...['refill', 'lisinopril', 'metformin', 'laboratory report'].map(notes),
  search('DocumentReference', { sort: '-date' }),
  search('DiagnosticReport', { sort: '-date' }),
  search('DiagnosticReport', { code: '51990-0', sort: '-date' }),
  search('MedicationRequest', { status: 'active' }),
  search('Observation', { category: 'laboratory', sort: '-date' }),
  ...['2823-3', '2160-0', '33914-3', '4548-4', '29463-7'].flatMap((code) => [search('Observation', { code, sort: '-date' }), search('Observation', { code })]),
];
// Targeted rule-term searches (R12): exempt from the page-1 rule.
// R25: hazard words, which name the hazard an item tests (a result corrected, an addendum, a drug held
// or stopped, a substitution), are targeted too.
export const HAZARD = ['correction', 'corrected', 'addendum', 'stop', 'held', 'substitution'];
export const TARGETED: ScriptCall[] = ['hemolyzed', 'collected', 'amended', 'entered in error', ...HAZARD].map(notes);
// R30: note searches by a lab panel or test name, exempt like TARGETED.
export const TEST_NAMES = ['potassium', 'BMP', 'HbA1c', 'creatinine', 'eGFR'];
export const TESTS: ScriptCall[] = TEST_NAMES.map(notes);

// R6: each item's trap-deciding records and its hard step. A reasoning item may show its trap on page 1.
const RESULT_ITSELF = 'the trap fact is on the result itself, so any view of the result shows it; the hard step is not trusting it';
export const TRAP: Record<string, { ids: string[]; hard: 'retrieval' | 'reasoning'; why?: string }> = {
  m1: { ids: [ref('Observation/obs-t6-hayes-1005-k')], hard: 'reasoning', why: `${RESULT_ITSELF} (the hemolysis note)` },
  m2: { ids: [ref('Communication/comm-t6-m1')], hard: 'reasoning', why: 'the first message is in the queue the task hands over' },
  m3: { ids: [ref('DocumentReference/doc-t6-odum-0827')], hard: 'retrieval' },
  m4: { ids: [], hard: 'reasoning', why: 'the filler has no trap' },
  m5: { ids: [ref('DocumentReference/doc-t6-park-1002')], hard: 'retrieval' },
  m6: { ids: [ref('Observation/obs-t6-park-egfr-0720')], hard: 'reasoning', why: `${RESULT_ITSELF} (amended status and note; the trap value 51 is in the visit note)` },
  m7: { ids: [ref('Observation/obs-t6-brooks-0921-cr')], hard: 'reasoning', why: 'a creatinine list shows the values but not the dose increase; the hard step is tying the baseline to the order date' },
  m8: { ids: [ref('DocumentReference/doc-t6-brooks-0412')], hard: 'retrieval' },
  m9: { ids: [ref('Observation/obs-t6-price-0918-cr')], hard: 'reasoning', why: 'a creatinine list shows the values but not the dose increase; the hard step is tying the baseline to the order date' },
  m10: { ids: [ref('DocumentReference/doc-t6-price-0819')], hard: 'retrieval' },
  m11: { ids: [ref('Communication/comm-t6-m10')], hard: 'reasoning', why: 'the first message is in the queue the task hands over' },
  m12: { ids: [], hard: 'reasoning', why: 'an absence item (R20, R31): no BMP was collected in the 12-month window; the out-of-window panel and its potassium are lures, and the hard step is reading the collection date, not the issued date' },
  m13: { ids: [], hard: 'reasoning', why: 'the eGFR entered in error cannot decide the item (R1), so it is a lure; the hard step is not trusting it' },
};

// R19: lures, each with the wrong action it tempts. None decides its item, so none is decisive.
// R31: an absence item's newest in-house result of the kind (expected.ts absence: Webb's 10/20/2025
// panel, Park's 04/21/2025 panel, Brooks's 01/12/2026 HbA1c) is a lure when only it is seen, but it is
// the decisive id that stands for the window search, which alone counts it as seen; so it is not listed
// here (rulings.test checks that exposing it counts for nothing).
export const LURES: Record<string, { id: string; tempts: string }> = {
  park_visit_note: { id: ref('DocumentReference/doc-t6-park-0720'), tempts: "m6: the visit note's eGFR 51, written before the amendment, tempts a metformin renewal" },
  brooks_potassium: { id: ref('Observation/obs-t6-brooks-1008-k'), tempts: 'm7: the high-flagged potassium 5.2, under the 5.5 line, tempts a renewal (or a hold for the wrong reason)' },
  price_inhouse_a1c: { id: ref('Observation/obs-t6-price-a1c-0330'), tempts: 'm10: the in-house HbA1c of March, outside 6 months, tempts a 30-day supply' },
  // R19, R31: it shows the panel's collection date but not whether a BMP was drawn since; never decisive.
  webb_bmp_potassium: { id: ref('Observation/obs-t6-webb-1020-k'), tempts: 'm12: the potassium 4.3 issued 10/27/2025, inside 12 months by its issued date, tempts a 90-day renewal' },
  webb_error_egfr: { id: ref('Observation/obs-t6-webb-egfr-1014'), tempts: 'm13: the eGFR 39 entered in error, the newest by date, tempts a metformin hold' },
};

const task = await loadMatrixTask('message-queue');
const env = matrixEnv();
const run = async (id: string, script: typeof oracle) => stepsOf((await trial(env, task, { kind: 'alternative', id, script })).events);
// When a step first saw a decisive id: a scanned report when one of its atom sets was shown (R29),
// else exposed.
const seenAt = (steps: readonly Step[], x: Item, id: string) => (x.atoms[id] !== undefined ? firstSeenBy(steps, id, x.atoms[id]!) : firstExposed(steps, id));

describe('message-queue discoverability', () => {
  it('every trap-deciding record is decisive for its item, and every retrieval item names one', () => {
    for (const x of ITEMS) {
      const t = TRAP[x.name]!;
      for (const id of t.ids) expect(x.decisive, `${x.name} ${id}`).toContain(id);
      if (t.hard === 'retrieval') expect(t.ids.length, x.name).toBeGreaterThan(0);
      else expect(t.why, x.name).toBeTruthy();
    }
  });

  it('lures (R19) are listed apart from the trap-deciding records and decide no item', () => {
    const decisive = new Set(ITEMS.flatMap((x) => x.decisive));
    const traps = new Set(Object.values(TRAP).flatMap((t) => t.ids));
    for (const [name, l] of Object.entries(LURES)) {
      expect(decisive.has(l.id), name).toBe(false);
      expect(traps.has(l.id), name).toBe(false);
    }
  });

  it.each(BROAD.map((c) => [JSON.stringify({ [c.name]: c.input }), c] as const))('page 1 of %s shows no trap-deciding record of a retrieval item (R6)', async (_label, c) => {
    const steps = await run('broad', [{ calls: [c] }, { calls: [call('finish', { summary: 'searched' })] }]);
    const shown = ITEMS.flatMap((x) => TRAP[x.name]!.ids.filter((id) => seenAt(steps, x, id) !== null).map((id) => ({ item: x.name, id })));
    expect(shown.filter((s) => TRAP[s.item]!.hard === 'retrieval')).toEqual([]);
  });

  it('the targeted rule-term searches (R12, exempt): only the hemolyzed search shows a retrieval trap, the report it names', async () => {
    const found: string[] = [];
    for (const c of TARGETED) {
      const steps = await run('targeted', [{ calls: [c] }, { calls: [call('finish', { summary: 'searched' })] }]);
      for (const x of ITEMS) for (const id of TRAP[x.name]!.ids) if (TRAP[x.name]!.hard === 'retrieval' && seenAt(steps, x, id) !== null) found.push(`${String(c.input.query)}: ${x.name}`);
    }
    expect(found).toEqual(['hemolyzed: m3']);
  });

  it('the lab-name searches (R30, exempt): only the eGFR search shows a retrieval trap, the report whose comment follows its eGFR line', async () => {
    const found: string[] = [];
    for (const c of TESTS) {
      const steps = await run('tests', [{ calls: [c] }, { calls: [call('finish', { summary: 'searched' })] }]);
      for (const x of ITEMS) for (const id of TRAP[x.name]!.ids) if (TRAP[x.name]!.hard === 'retrieval' && seenAt(steps, x, id) !== null) found.push(`${String(c.input.query)}: ${x.name}`);
    }
    expect(found).toEqual(['eGFR: m3']);
    // No BROAD note search names a lab panel or test (R30).
    expect(BROAD.filter((c) => c.name === 'search_notes' && TEST_NAMES.some((t) => String(c.input.query).toLowerCase().includes(t.toLowerCase())))).toEqual([]);
  });

  it("the oracle's trajectory sees every decisive id of an item before its first write for that item", async () => {
    const { events } = await trial(env, task, { kind: 'alternative', id: 'oracle', script: oracle });
    const steps = stepsOf(events);
    // Each step's call input, through its tool_result's tool_use_id.
    const inputOf = new Map<number, string>();
    for (const s of steps) {
      const result = events.find((e) => e.seq === s.seq) as { tool_use_id?: string } | undefined;
      const callEvent = events.find((e) => e.type === 'tool_call' && (e as { tool_use_id?: string }).tool_use_id === result?.tool_use_id) as { input?: unknown } | undefined;
      inputOf.set(s.n, JSON.stringify(callEvent?.input ?? {}));
    }
    // An item's writes: an order of its drug for its patient, a Task whose focus is its request,
    // or its own inbox item closed.
    const about = (s: Step, x: Item) => {
      if (s.written_ids.length === 0) return false;
      const input = inputOf.get(s.n)!;
      if (s.tool === 'order_medication') return input.includes(`"${x.patient.split('/')[1]}"`) && CODES[x.drug]!.some((c) => input.includes(`"${c}"`));
      if (s.tool === 'create_task') return input.includes(x.request.split('/')[1]!);
      return s.tool === 'update_inbox_item' && input.includes(`"${x.item.split('/')[1]}"`);
    };
    const late = ITEMS.flatMap((x) => {
      const write = steps.find((s) => about(s, x))?.n ?? null;
      if (write === null) return [`${x.name}: no write`];
      // Any id by the grader's rule: a report by its atoms, any-of evidence included (R21, R29).
      const seen = (id: string) => seenStep(x, id)(steps);
      return x.decisive.filter((id) => !seenBefore(steps, seen(id), write)).map((id) => `${x.name} ${id}`);
    });
    expect(late).toEqual([]);
  });
});

const CODES: Record<string, string[]> = { lisinopril: ['314076', '314077'], metformin: ['861007', '861004'], amlodipine: ['197361'] };
