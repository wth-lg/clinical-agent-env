// Discoverability for the T3 worklist probe (plan-amendment-worklist.md W1 gate; rulings R6 and R12,
// reports/w1-probe-rulings.md). Design rule: decisive facts are not on page 1 of the first broad
// search for the task. The oracle's trajectory exposes every member's decisive ids before its first
// write about that member.
//
// Broad searches (BROAD) are clinic-wide sorts and lists that name no rule term: the panel and
// patient lists, and every resource type listed oldest first (the default) and newest first.
// The page-1 rule applies to trap-deciding records, which are each member's decisive ids (R1: the
// record that decides the action). A broad search may show one on page 1 only when that member's
// hard step is reasoning (HARD_STEP, each with why): reading the record is easy and judging it is
// the test. Since the PW4-E3 list cut every member's base record is plain on her chart (the 60-
// patient world holds 2 EpisodeOfCare, so any listing shows the hospice episode), so every member
// is reasoning at base; each event's hard step is reading what arrives (event_seen), and nothing an
// event brings is in the world before its trigger (the last two tests).
//
// A hit is a page that shows the deciding content (R22): a resource the result exposed (its fields
// in full, or a note's whole text). A row that only names a record (a Group member reference, a
// fhir_search row of a note, which shows its size and read_with, not its text) is not a hit; each such
// row-only hit of a decisive id on a broad page 1 is listed in ROW_ONLY with that reason, and the
// test fails when the list drifts.
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
import { SPECS } from '../events.ts';
import { DELIVERED, expected } from '../expected.ts';
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
// judge it, retrieval when the test is to find it. Since the PW4-E3 cut every member's base record is
// plain on its chart; the hard step of each event is reading the arrival (event_seen).
const HARD_STEP: Record<string, { step: 'reasoning' | 'retrieval'; why: string }> = {
  'Patient/pt-0009': { step: 'reasoning', why: 'frailty is on her problem list and donepezil an active order; the test is that they exclude her, until the frailty entry is corrected' },
  'Patient/pt-0020': { step: 'reasoning', why: 'the hospice episode is her one care episode; the test is that part of the period counts, before and after the discharge summary' },
  'Patient/pt-0022': { step: 'reasoning', why: 'the FIT is in her stool tests; the test is its collection date, before and after the correction' },
  'Patient/pt-0024': { step: 'reasoning', why: 'the sDNA-FIT is in her stool tests; the test is that it counts, until the laboratory withdraws it' },
};
const DECISIVE = expected.items.flatMap((x) => x.decisive.map((d) => ({ patient: x.patient, id: d })));
// Ruling R19: lures, records that tempt a wrong reading but cannot decide an action, may show on page
// 1; they are listed apart from the deciding records and gate nothing. A1's open 2025 colonoscopy
// order is not screening and cannot decide her at base, where her sDNA-FIT is up to date.
export const LURES: readonly string[] = [ref('ServiceRequest/sr-t3-4417')];
// Ruling R22: decisive ids a broad page 1 names in a row that does not show the deciding content,
// by search: the panel Group lists its members by reference only, so G1's row shows no birth date
// (her age, R33).
const AGE_DECIDES = ['Patient/pt-0009'];
export const ROW_ONLY: Readonly<Record<string, readonly string[]>> = {
  'fhir_search {"resource_type":"Group"}': AGE_DECIDES,
  [`fhir_read {"resource_type":"Group","id":"${id('grp-t3-okafor-crc')}"}`]: AGE_DECIDES,
};
// Ruling R6: an item's own plain input may show on page 1; none needs listing since the cut.
export const PLAIN_INPUTS: readonly string[] = [];
// Ruling R33: every gap's Patient is decisive too; no base member is a gap since the cut.
const GAP_PATIENTS = new Set(expected.items.filter((x) => x.status === 'gap').map((x) => x.patient));
const hitsOf = (r: { exposed_ids: readonly string[]; referenced_ids: readonly string[] }) => ({
  hits: DECISIVE.filter((d) => r.exposed_ids.includes(d.id)),
  rowOnly: DECISIVE.filter((d) => r.referenced_ids.includes(d.id) && !GAP_PATIENTS.has(d.id)).map((d) => d.id),
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
    // Every member an event turns into a gap is written about (the order and the message), so the
    // check above is not met by the finish alone for them.
    expect(Object.values(DELIVERED).filter((x) => firstWrite(x.patient.slice(8)) === finish).map((x) => x.patient)).toEqual([]);
  });

  // The mid-trial events (events.ts): nothing an event brings is in the world before its trigger.
  // No broad or policy-word search shows an arrival's new records, the records an event replaces
  // still hold their base values, and the inbox has no arrival Task. In the oracle's trajectory each
  // arrival comes at the step that first exposed its trigger record, never earlier.
  const NEW = SPECS.flatMap((s) => s.resources.filter((r) => store.get(r.resourceType, r.id!) === undefined).map((r) => `${r.resourceType}/${r.id}`));
  it('the arrivals are absent from the world before their triggers', () => {
    expect(NEW.sort()).toEqual(['Communication/comm-e3-5521', 'DocumentReference/doc-e3-6804', 'DocumentReference/doc-e3-7390']);
    for (const [name, input] of [...BROAD, ...POLICY_WORD, ['list_inbox', { queue: 'results' }], ['list_inbox', { queue: 'messages' }]] as const) {
      const r = tool(name, input);
      expect([...r.exposed_ids, ...r.referenced_ids].filter((k) => NEW.includes(k)), `${name} ${JSON.stringify(input)}`).toEqual([]);
      expect(JSON.stringify(r.content), `${name} ${JSON.stringify(input)}`).not.toMatch(/inbox-a\d{4}/);
    }
    const at = (type: string, key: string) => store.get(type, key) as Record<string, unknown>;
    expect(at('Condition', id('cond-t3-6027')).verificationStatus).toMatchObject({ coding: [{ code: 'confirmed' }] });
    expect(at('Observation', id('obs-t3-3906'))).toMatchObject({ status: 'final', effectiveDateTime: expect.stringMatching(/^2026-01-05/) });
    expect(at('Observation', id('obs-t3-1279')).status).toBe('final');
  });

  it("in the oracle's trajectory each event arrives at the step that first exposed its trigger record", async () => {
    const task = await loadMatrixTask('crc-care-gap');
    const steps = stepsOf((await trial(env, task, cases(task).find((c) => c.id === 'oracle')!)).events);
    for (const spec of SPECS) {
      const trigger = spec.trigger.kind === 'after_exposed' ? spec.trigger.ids[0]! : '';
      const first = steps.find((s) => s.exposed_ids.includes(trigger))?.n;
      const arrived = steps.find((s) => (s.arrivals ?? []).some((a) => a.spec === spec.id))?.n;
      expect([spec.id, arrived]).toEqual([spec.id, first]);
      expect(first, spec.id).toBeDefined();
    }
  });
});
