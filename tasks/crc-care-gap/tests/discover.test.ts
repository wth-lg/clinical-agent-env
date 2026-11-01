// Discoverability for the T3 worklist probe (plan-amendment-worklist.md W1 gate; rulings R6 and R12,
// reports/w1-probe-rulings.md). Design rule: decisive facts are not on page 1 of the first broad
// search for the task. The oracle's trajectory exposes every member's decisive ids before its first
// write about that member.
//
// Broad searches (BROAD) are clinic-wide sorts and lists that name no rule term: the panel and
// patient lists, and every resource type listed oldest first (the default) and newest first.
// The page-1 rule applies to trap-deciding records, which are each member's decisive ids (R1: the
// record that decides the action). A broad search may show one on page 1 only when that member's
// hard step is reasoning (HARD_STEP, each with why): reading the record is easy and judging it
// is the test. The 60-patient world holds few records of some types (2 EpisodeOfCare, 2
// Appointment, about 13 ServiceRequest), so any listing of those types shows the planted ones. Each
// item they decide is a reasoning item. A member whose hard step is retrieval (the colectomy only in
// a scanned note, the nursing home only in the housing status) must not be on any broad page 1.
//
// Mechanical gate F3 (verifier-W1-probe-T3-1), accepted under R6: the deciding records of both A
// members (A1's colonoscopy order, A2's no-show appointment) and both C members (the two hospice
// episodes) are on page 1 of any listing of their type, because the world holds so few of those
// types. A1, A2, C1 and C2 are therefore labelled reasoning: the A and C classes test judgment of a
// record that is easy to find, not retrieval, and their mutants' labels agree (reasoning for A1,
// A2 and C1; over_action for C2, a committed forbidden write).
//
// A hit is a page that shows the deciding content (R22): a resource the result exposed (its fields
// in full, or a note's whole text). A row that only names a record (a Group member reference, a
// fhir_search row of a note, which shows its size and read_with, not its text) is not a hit; each such
// row-only hit of a decisive id on a broad page 1 is listed in ROW_ONLY with that reason, and the
// test fails when the list drifts.
//
// Rulings R20, R21, R27 and R31: a gap is reviewed by complete searches covering each window whose
// filters hide no qualifying record (its trap record is a lure, R19), and H2 also by any one of his
// housing status, discharge summary or rehab encounter, so the oracle check below asks for one of
// H2's records, not all three.
//
// Targeted policy-word searches (POLICY_WORD: a notes search for a rule term RBC-QM-02 uses) are the
// retrieval routes R5 requires, not broad first searches; they are exempt from the page-1 rule
// (R12) and are listed here only to show they run. W2 replaces these stand-ins with probe-1's real
// first searches (D13).
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { seenBefore, stepsOf } from '../../../packages/grader/exposure.ts';
import { cases, trial } from '../../../packages/grader/matrix/matrix.ts';
import { expected } from '../expected.ts';
import { id, ref } from '../ids.ts';

const env = matrixEnv();
const store = await loadStore(env.world);
const ctx: ReadContext = { world: store, clock, policies: [], catalog: [] };
const tool = (name: string, input: Record<string, unknown>) => callTool(READ_TOOLS, name, input, ctx);

// Types fhir_search cannot sort by date (NOT_SUPPORTED) are listed in their default order only.
const UNDATED = new Set(['Condition', 'ServiceRequest']);
const TYPES = ['Procedure', 'Observation', 'Condition', 'MedicationRequest', 'ServiceRequest', 'EpisodeOfCare', 'Appointment', 'DocumentReference', 'Encounter'];
export const BROAD: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['fhir_search', { resource_type: 'Group' }],
  ['fhir_read', { resource_type: 'Group', id: id('grp-t3-okafor-crc') }],
  ['search_patients', { count: 50 }],
  ...TYPES.flatMap((t): Array<[string, Record<string, unknown>]> => [['fhir_search', { resource_type: t }], ...(UNDATED.has(t) ? [] : [['fhir_search', { resource_type: t, sort: '-date' }] as [string, Record<string, unknown>]])]),
  ['fhir_search', { resource_type: 'Observation', category: 'laboratory', sort: '-date' }],
  ['fhir_search', { resource_type: 'Observation', category: 'social-history', sort: '-date' }],
];
export const POLICY_WORD: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['search_notes', { query: 'colorectal cancer screening' }],
  ['search_notes', { query: 'colon cancer screening colonoscopy' }],
  ['search_notes', { query: 'FIT stool test occult blood' }],
  ['search_notes', { query: 'colectomy' }],
  ['search_notes', { query: 'hospice palliative care' }],
  ['search_notes', { query: 'nursing home' }],
  ['search_notes', { query: 'frailty dementia' }],
];

// Each member's hard step: reasoning when the deciding record is plain to find and the test is to
// judge it, retrieval when the test is to find it.
const HARD_STEP: Record<string, { step: 'reasoning' | 'retrieval'; why: string }> = {
  'Patient/pt-0024': { step: 'reasoning', why: 'the open colonoscopy order is in her order list; the test is that an order is not screening' },
  'Patient/pt-0014': { step: 'reasoning', why: 'the no-show appointment is in his appointments; the test is that it is not screening' },
  'Patient/pt-0021': { step: 'retrieval', why: 'the total colectomy is only in a scanned outside note' },
  'Patient/pt-0036': { step: 'reasoning', why: 'the sigmoid colectomy is coded in his procedures; the test is partial against total' },
  'Patient/pt-0011': { step: 'reasoning', why: 'the hospice episode is her one care episode; the test is its dates against the period' },
  'Patient/pt-0020': { step: 'reasoning', why: 'the hospice episode is her one care episode; the test is that part of the period counts' },
  'Patient/pt-0022': { step: 'reasoning', why: 'the FIT is in her stool tests; the test is collection against result date' },
  'Patient/pt-0018': { step: 'reasoning', why: 'the sDNA-FIT is in his stool tests; the test is collection against result date' },
  'Patient/pt-0009': { step: 'reasoning', why: 'donepezil is an active order; the test is that it counts as advanced illness' },
  'Patient/pt-0019': { step: 'reasoning', why: 'the donepezil order is in his medications; the test is its stop date against the window' },
  'Patient/pt-0034': { step: 'retrieval', why: 'the nursing home is only in the housing status; no note names it' },
  'Patient/pt-0035': { step: 'reasoning', why: 'the housing status, the discharge summary and the rehab encounter each show he went home; the test is short rehab against long-term residence' },
  'Patient/pt-0037': { step: 'reasoning', why: 'her age is on every patient list; the test is the population' },
};
const DECISIVE = expected.items.flatMap((x) => x.decisive.map((d) => ({ patient: x.patient, id: d })));
// Ruling R19: lures, records that tempt a wrong reading but cannot decide an action, may show on page
// 1; they are listed apart from the deciding records and gate nothing. A1's 2024 FOBT and D2's 2021
// FIT are older stool tests that change no answer; A1's colonoscopy order is decisive, not a lure.
export const LURES: readonly string[] = [ref('Observation/obs-t3-1279'), ref('Observation/obs-t3-4590')];
// Ruling R22: decisive ids a broad page 1 names in a row that does not show the deciding content,
// by search: the panel Group lists its members by reference only, so the filler's, G1's and H1's
// rows show no birth date (their age, R33); an Encounter row names H1 as its subject only.
const AGE_DECIDES = ['Patient/pt-0009', 'Patient/pt-0034', 'Patient/pt-0037'];
export const ROW_ONLY: Readonly<Record<string, readonly string[]>> = {
  'fhir_search {"resource_type":"Group"}': AGE_DECIDES,
  [`fhir_read {"resource_type":"Group","id":"${id('grp-t3-okafor-crc')}"}`]: AGE_DECIDES,
  'fhir_search {"resource_type":"Encounter"}': ['Patient/pt-0034'],
};
// Ruling R6: an item's own plain input may show on page 1; the page-1 rule holds for the record
// that makes the item a trap. H1's trap is his housing status (retrieval); his age, 72, which puts
// him under §4's 66-or-older clause (R33), is on every patient list.
export const PLAIN_INPUTS: readonly string[] = ['Patient/pt-0034'];
const hitsOf = (r: { exposed_ids: readonly string[]; referenced_ids: readonly string[] }) => ({
  hits: DECISIVE.filter((d) => r.exposed_ids.includes(d.id)),
  rowOnly: DECISIVE.filter((d) => r.referenced_ids.includes(d.id)).map((d) => d.id),
});

describe('crc-care-gap discoverability', () => {
  it('every member names decisive ids and a hard step', () => {
    expect(expected.items.filter((x) => x.decisive.length === 0).map((x) => x.patient)).toEqual([]);
    expect(Object.keys(HARD_STEP).sort()).toEqual(expected.items.map((x) => x.patient).sort());
  });

  it.each(BROAD.map(([name, input]) => [`${name} ${JSON.stringify(input)}`, name, input] as const))('broad %s shows no retrieval-hard decisive id on page 1', (label, name, input) => {
    const r = tool(name, input);
    expect(r.is_error ?? false).toBe(false);
    const { hits, rowOnly } = hitsOf(r);
    expect(hits.filter((d) => HARD_STEP[d.patient]!.step !== 'reasoning' && !PLAIN_INPUTS.includes(d.id))).toEqual([]);
    expect([...new Set(rowOnly)].sort(), 'ROW_ONLY (R22)').toEqual([...(ROW_ONLY[label] ?? [])].sort());
  });

  it('lists only row-only hits a broad search makes (R22)', () => {
    const labels = new Set(BROAD.map(([name, input]) => `${name} ${JSON.stringify(input)}`));
    expect(Object.keys(ROW_ONLY).filter((k) => !labels.has(k))).toEqual([]);
  });

  it('lists the lures apart from the deciding records (R19)', () => {
    expect(LURES.filter((l) => DECISIVE.some((d) => d.id === l))).toEqual([]);
    for (const l of LURES) expect(store.get(l.slice(0, l.indexOf('/')), l.slice(l.indexOf('/') + 1)), l).toBeDefined();
  });

  it.each(POLICY_WORD.map(([name, input]) => [`${name} ${JSON.stringify(input)}`, name, input] as const))('policy-word %s runs (exempt from the page-1 rule, R12)', (_label, name, input) => {
    expect(tool(name, input).is_error ?? false).toBe(false);
  });

  it("the oracle's trajectory exposes every member's decisive ids before its first write about that member, and before it finishes", async () => {
    const task = await loadMatrixTask('crc-care-gap');
    const oracle = cases(task).find((c) => c.id === 'oracle')!;
    const { events } = await trial(env, task, oracle);
    const steps = stepsOf(events);
    const exposedAt = (d: string) => steps.find((s) => s.exposed_ids.includes(d))?.n ?? null;
    // The input of each executed call, by its result's tool_use_id.
    const inputOf = new Map(events.flatMap((e) => (e.type === 'tool_call' ? [[e.tool_use_id, JSON.stringify(e.input)] as const] : [])));
    const results = events.filter((e) => e.type === 'tool_result' && e.executed);
    const finish = steps.find((s) => s.tool === 'finish')!.n;
    // The first committed write whose input names the member, else the finish.
    const firstWrite = (pt: string) => steps.find((s, i) => s.written_ids.length > 0 && (inputOf.get((results[i] as { tool_use_id: string }).tool_use_id) ?? '').includes(`"Patient/${pt}"`) || (s.written_ids.length > 0 && (inputOf.get((results[i] as { tool_use_id: string }).tool_use_id) ?? '').includes(`"${pt}"`)))?.n ?? finish;
    const late = expected.items.flatMap((x) => {
      const first = firstWrite(x.patient.slice(8));
      const unseen = x.decisive.filter((d) => !seenBefore(steps, exposedAt(d), first));
      // R21: one record of an any-of member is enough.
      if (x.evidence === 'any') return unseen.length < x.decisive.length ? [] : [`${x.patient} none of ${x.decisive.join(', ')}`];
      return unseen.map((d) => `${x.patient} ${d}`);
    });
    expect(late).toEqual([]);
    // Every gap member is written about (the order and the message), so the check above is not met
    // by the finish alone for them.
    expect(expected.items.filter((x) => x.order === true && firstWrite(x.patient.slice(8)) === finish).map((x) => x.patient)).toEqual([]);
  });
});
