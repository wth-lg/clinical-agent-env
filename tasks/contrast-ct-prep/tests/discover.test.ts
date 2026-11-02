// Discoverability of T5's worklist (plan-amendment-worklist W1 design rule; W1 probe rulings R5, R6
// and R12).
//
// BROAD holds the plausible first searches a clinician runs across the clinic: the day's list,
// clinic-wide lists (allergies, active medications) and the newest-first sorts (the newest
// creatinines, the newest notes), each naming no rule term. The page-1 rule (R6) applies to the
// trap-deciding records: the record that makes an item a trap or holds its hidden comparison value
// (the two reports of the day, the outside ED summary, Brakus's baseline creatinine). An item's own
// plain input may show (Stracke's in-window creatinine, Brakus's latest), and so may a lure (LURES,
// R19). Schmitt, Stracke and Brakus are off the list since PW4-E3 (their studies cancelled); their
// records stay in TRAP and LURES, so the cut moves no record of theirs onto page 1. A listed
// search may show a trap-deciding record on page 1 only where ALLOWED says why: the item reads as
// reasoning when missed, because the record shows it beside the value it must be compared with.
// A hit is a page that shows the deciding content: the record exposed (an Observation row shows
// its value), or a note text on the page showing the deciding phrase (R22). A row that gives only a
// record's id, type or date is not exposure; every such row-only hit of a trap-deciding record is
// listed in ALLOWED as 'row' with that reason, and the test checks that it shows no content. An
// ALLOWED entry names only a record that is on the page in the built world.
//
// Targeted searches for a rule term the policy uses (search_notes 'allergic-like reaction',
// 'acute kidney injury', 'metformin', 'creatinine', 'contrast', ...) are the retrieval routes R5
// requires, not broad first searches; R12 exempts them from the page-1 rule. The per-patient route
// for each decisive record is checked instead: it must return the record.
//
// The oracle's chart review, the per-patient route §1 and §4 imply, exposes every decisive id in a
// turn before its first write.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import type { TrialEvent } from '../../../packages/core/events.ts';
import { firstShown, stepsOf, seenBefore } from '../../../packages/grader/exposure.ts';
import { trial } from '../../../packages/grader/matrix/matrix.ts';
import type { ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { SPECS } from '../events.ts';
import { expected } from '../expected.ts';
import { ref } from '../ids.ts';
import { oracle } from '../solution/solve.ts';
import { PHRASES } from './grader.ts';

type Result = Extract<TrialEvent, { type: 'tool_result' }>;
const env = matrixEnv();
const task = await loadMatrixTask('contrast-ct-prep');
const DECISIVE = expected.items.flatMap((x) => x.decisive);
const TRAP = {
  [ref('DocumentReference/doc-t5-ct-2019')]: 'Ferreira: the report of the day grades the reaction',
  [ref('DocumentReference/doc-t5-schmitt-ct')]: 'Schmitt: the report of the day grades the reaction',
  [ref('DocumentReference/doc-t5-schuster-ed')]: 'Schuster: the outside ED summary records the kidney injury',
  [ref('Observation/obs-t5-brakus-1019')]: "Brakus: the baseline the rise is measured from",
};

// Lures (R19): records that tempt the wrong action but cannot decide an item. They may show on
// page 1 of a broad search; seeing one makes the trap harder, not easier. Listed apart from TRAP.
export const LURES = {
  [ref('Observation/obs-t5-scr-0924')]: "Mohr: the 09-24 creatinine, 29 days before today but 32 before the scan (tempts counting the window from today)",
  [ref('Observation/obs-t5-stracke-0720')]: "Stracke: the July creatinine, outside the window, eGFR 35 (tempts an eGFR over 30)",
  [ref('AllergyIntolerance/alg-t5-iohexol')]: "Ferreira: the list's later 'Anaphylaxis (patient report)' (tempts grading severe)",
  [ref('AllergyIntolerance/alg-t5-schmitt-iohexol')]: "Schmitt: the list's 'hives, mild' from his own account (tempts grading mild)",
};

const search = (input: Record<string, string>): ScriptCall => ({ name: 'fhir_search', input });
const notes = (query: string, patient?: string): ScriptCall => ({ name: 'search_notes', input: { query, ...(patient ? { patient } : {}) } });
const NEWEST_SCR = search({ resource_type: 'Observation', code: '2160-0', sort: '-date' });
const ALL_SCR = search({ resource_type: 'Observation', code: '2160-0' });
// This month's creatinines, oldest first (the default order): verifier-W1-probe-T5-3 M1.
const MONTH_SCR = search({ resource_type: 'Observation', code: '2160-0', date_ge: '2026-10-01' });
// The creatinines of the 30 days before the scan, newest first: verifier-W1-probe-T5-4 M2.
const WINDOW_SCR = search({ resource_type: 'Observation', code: '2160-0', date_ge: '2026-09-26', sort: '-date' });
const ALL_NOTES = search({ resource_type: 'DocumentReference' });
// The notes of this month and of the 30 days before the scan, oldest first (the default order):
// verifier-W1-probe-T5-2 N1.
const MONTH_NOTES = search({ resource_type: 'DocumentReference', date_ge: '2026-10-01' });
const WINDOW_NOTES = search({ resource_type: 'DocumentReference', date_ge: '2026-09-26' });
export const BROAD: ScriptCall[] = [
  search({ resource_type: 'Appointment', date_ge: '2026-10-26', date_le: '2026-10-26' }),
  read_policy(),
  search({ resource_type: 'AllergyIntolerance', category: 'medication' }),
  search({ resource_type: 'AllergyIntolerance' }),
  search({ resource_type: 'MedicationRequest', status: 'active' }),
  NEWEST_SCR,
  ALL_SCR,
  MONTH_SCR,
  WINDOW_SCR,
  search({ resource_type: 'DocumentReference', date_ge: '2026-09-01', sort: '-date' }),
  search({ resource_type: 'DocumentReference', sort: '-date' }),
  ALL_NOTES,
  MONTH_NOTES,
  WINDOW_NOTES,
  notes('St. Brigid Imaging Monday 10/26'),
];
function read_policy(): ScriptCall {
  return { name: 'read_policy', input: { policy_id: 'RBC-RAD-07' } };
}
// Trap-deciding records a listed search may show on page 1, and why the item stays as labelled:
// 'shown', the deciding content shows and the item reads as reasoning; 'row', a row-only hit (R22)
// that shows no deciding content, so the record is not seen.
type Allowance = { kind: 'shown' | 'row'; why: string };
const BRAKUS_PAIR: Allowance = { kind: 'shown', why: 'the clinic-wide creatinine list shows Brakus\'s baseline beside the rise it is compared with; seeing both and missing the 48-hour rule is reasoning (creatinine_rise_missed), and the baseline cannot move off the page without leaving the 48-hour window' };
// A note row gives a document's type and date, not its text: the reports' rows do not show the
// grade, and the ED summary's row ('Emergency department Discharge summary', 10/05) does not show
// the kidney injury. The item is retrieval when the note is never read, reasoning when it is.
const row = (why: string): Allowance => ({ kind: 'row', why: `row-only hit (R22): ${why}` });
const ED_ROW = row('the row shows an emergency department discharge summary of 10/05, not the acute kidney injury it records');
const ALLOWED = new Map<ScriptCall, Record<string, Allowance>>([
  [NEWEST_SCR, { [ref('Observation/obs-t5-brakus-1019')]: BRAKUS_PAIR }],
  [MONTH_SCR, { [ref('Observation/obs-t5-brakus-1019')]: BRAKUS_PAIR }],
  [WINDOW_SCR, { [ref('Observation/obs-t5-brakus-1019')]: BRAKUS_PAIR }],
  [ALL_NOTES, { [ref('DocumentReference/doc-t5-ct-2019')]: row('the id-ordered row shows a 2019 imaging study, not its grade') }],
  [MONTH_NOTES, { [ref('DocumentReference/doc-t5-schuster-ed')]: ED_ROW }],
  [WINDOW_NOTES, { [ref('DocumentReference/doc-t5-schuster-ed')]: ED_ROW }],
]);

// The first page of one call: every id it names (rows and exposures), and the ids whose deciding
// content it shows (exposed, or a note whose deciding phrase shows in the page's text).
const run1 = async (call: ScriptCall) => {
  const run = await trial(env, task, { kind: 'alternative', id: 'discover', script: [{ calls: [call] }] });
  const r = run.events.find((e): e is Result => e.type === 'tool_result')!;
  expect(r.is_error, JSON.stringify(r.content)).toBe(false);
  const steps = stepsOf(run.events);
  const shows = (id: string) => r.exposed_ids.includes(id) || (PHRASES[id] !== undefined && firstShown(steps, id, PHRASES[id]!) !== null);
  return { named: [...r.exposed_ids, ...r.referenced_ids], shows };
};
const page1 = async (call: ScriptCall) => (await run1(call)).named;

describe('T5 discoverability', () => {
  it.each(BROAD.map((c) => [JSON.stringify(c.input), c] as const))('first page of %s shows no trap-deciding content (R6, R22)', async (_q, call) => {
    const { named, shows } = await run1(call);
    const allowed = ALLOWED.get(call) ?? {};
    // A hit is deciding content on the page; only a 'shown' allowance excuses it.
    expect(Object.keys(TRAP).filter((id) => shows(id) && allowed[id]?.kind !== 'shown').map((id) => `${id} (${TRAP[id]})`)).toEqual([]);
    // Every row-only hit is listed with its reason, and nothing listed is missing from the page.
    expect(Object.keys(TRAP).filter((id) => named.includes(id) && !shows(id) && allowed[id] === undefined).map((id) => `${id} (row-only, not in ALLOWED)`)).toEqual([]);
    expect(Object.keys(allowed).filter((id) => !named.includes(id))).toEqual([]);
    // A lure is never trap-deciding: the two lists do not overlap.
    expect(Object.keys(LURES).filter((id) => id in TRAP)).toEqual([]);
  });

  // R5: the per-patient route the policy implies returns every decisive record on its first page.
  const route = (id: string, patient: string): ScriptCall => {
    const bare = patient.slice('Patient/'.length);
    if (id.startsWith('DocumentReference/')) return notes(PHRASES[id]!, bare);
    if (id.startsWith('Observation/')) return search({ resource_type: 'Observation', patient: bare, code: '2160-0', sort: '-date' });
    return search({ resource_type: 'Condition', patient: bare });
  };
  it.each(expected.items.flatMap((x) => x.decisive.map((id) => [`${x.name}: ${id}`, id, x.patient] as const)))('%s comes back from its policy-word route (R5, R12)', async (_n, id, patient) => {
    expect(await page1(route(id, patient))).toContain(id);
  });

  // PW4-E3: a search run before any write sees no mid-trial arrival (events.ts fires each only
  // after a write about its patient), so the page-1 rule above is checked on the chart as it stands
  // before the trigger.
  it.each(BROAD.map((c) => [JSON.stringify(c.input), c] as const))('%s: no arrival before the trigger', async (_q, call) => {
    const run = await trial(env, task, { kind: 'alternative', id: 'discover', script: [{ calls: [call] }] });
    expect(run.events.filter((e) => e.type === 'env_event')).toEqual([]);
    const fresh = SPECS.flatMap((s) => (s.class === 'B' ? [] : s.resources.map((r) => `${r.resourceType}/${r.id}`)));
    const named = run.events.flatMap((e) => (e.type === 'tool_result' ? [...e.exposed_ids, ...e.referenced_ids] : []));
    expect(named.filter((k) => fresh.includes(k))).toEqual([]);
  });

  it('the oracle exposes every decisive id (a decisive note: read, or its deciding phrase shown) in a turn before its first write', async () => {
    const run = await trial(env, task, { kind: 'oracle', id: 'oracle', script: oracle });
    const steps = stepsOf(run.events);
    const firstWrite = steps.find((s) => s.written_ids.length > 0)!.n;
    for (const id of DECISIVE) {
      const exposed = steps.find((s) => s.exposed_ids.includes(id))?.n ?? null;
      expect(seenBefore(steps, exposed, firstWrite), `${id} (${PHRASES[id] ?? 'exposure'})`).toBe(true);
    }
  });
});
