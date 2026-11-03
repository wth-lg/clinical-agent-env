// Exposure as the grader reads it, from tags the real read tools computed. The regressions are
// T3's (a trajectory that learns the patient's birth date only from search_patients, then
// writes, has the Patient exposed before the write: reports/pr-review-T3-1.md S1), T2/T4's
// (a search_notes snippet records the text it showed: reports/pr-review-T4-1.md S1) and the
// exposure review's (a cut snippet is shown text, not exposure, so a note found by a snippet that
// misses the decisive fact is a retrieval failure; a snippet that is the whole note exposes it; shown text is compared the same way whatever
// showed it: reports/pr-review-exposure-1.md S1, S2, S4).
import type { Step, StepSearch } from '../check.ts';
import { describe, expect, it } from 'vitest';
import { clock } from '../../env/clock.ts';
import { Store, type Resource } from '../../env/store.ts';
import { INBOX_QUEUE_SYSTEM, READ_TOOLS, type ReadContext } from '../../env/tools/read/index.ts';
import { callTool } from '../../env/tools/registry.ts';
import { attribute } from '../attribution.ts';
import { gate } from '../check.ts';
import { firstExposed, lastWrite, seenBefore, shows, stepsOf, passesWindow, runCompleteAt, windowExposed, windowTargets, type WindowKind } from '../exposure.ts';
import { gateView, type CheckResult } from '../grade.ts';
import { INITIAL, note, PATIENT, trajectory } from './helpers.ts';

const inboxItem: Resource = {
  resourceType: 'Task', id: 'task-1', status: 'requested', intent: 'order', code: { coding: [{ system: INBOX_QUEUE_SYSTEM, code: 'results' }] },
  focus: { reference: 'Observation/obs-scr-1020' }, for: { reference: 'Patient/pt-1' }, authoredOn: '2026-10-22T09:00:00-04:00', description: 'New creatinine',
  owner: { reference: 'Practitioner/pr-okafor' },
} as Resource;
const world = new Store([...INITIAL.map((r): Resource => (r.id === PATIENT.id ? ({ ...r, birthDate: '1948-03-02', gender: 'male' } as Resource) : r)), inboxItem]);
const ctx: ReadContext = { world, clock, policies: [], catalog: [] };
const read = (name: string, input: unknown) => {
  const r = callTool(READ_TOOLS, name, input, ctx);
  return { name, input, content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids };
};

describe('exposure from the read tools', () => {
  it('a birth date read only via search_patients exposes the Patient before the first write', () => {
    const found = read('search_patients', { name: 'vance' });
    expect((found.content as { entries: Array<{ birthDate: string }> }).entries[0]!.birthDate).toBe('1948-03-02');
    const steps = stepsOf(trajectory([found, { name: 'write_note', written: ['DocumentReference/doc-new'] }]));
    expect(firstExposed(steps, 'Patient/pt-1')).toBe(1);
    expect(firstExposed(steps, 'pt-1')).toBe(1);
    expect(lastWrite(steps, ['DocumentReference/doc-new'])).toBe(2);
  });
  it('a fhir_search row shows a note\'s size, not its text: referenced, nothing shown', () => {
    const steps = stepsOf(trajectory([read('fhir_search', { resource_type: 'DocumentReference', patient: 'pt-1' })]));
    expect(steps[0]!.referenced_ids).toContain('DocumentReference/doc-nurse-1');
    expect(steps[0]!.exposed_ids).not.toContain('DocumentReference/doc-nurse-1');
    expect(steps[0]!.shown).toEqual({});
    expect(firstExposed(steps, 'DocumentReference/doc-nurse-1')).toBeNull();
  });
  // builder-273 (R27): a sorted page keeps the span of the instants its rows sort by, so a gate can
  // tell a sorted run of pages has passed a window's edge; an unsorted page keeps none.
  it('a sorted fhir_search page keeps its rows\' date span; an unsorted one does not', () => {
    // Rows as fhir_search returns them: an instant, a Period (sorted by its start) and an undated row.
    const entries = [
      { resourceType: 'Observation', id: 'o1', effectiveDateTime: '2026-07-25T20:55:04-04:00' },
      { resourceType: 'Observation', id: 'o2', effectivePeriod: { start: '2024-07-19T10:00:00-04:00', end: '2024-07-20' } },
      { resourceType: 'Observation', id: 'o3' },
    ];
    const page = (input: object, rows: object[]) => stepsOf(trajectory([{ name: 'fhir_search', input: { resource_type: 'Observation', ...input }, content: { total: 65, entries: rows, next_offset: 51 } }]))[0]!.search!;
    expect(page({ sort: '-date', offset: 25 }, entries).span).toEqual([Date.parse('2024-07-19T10:00:00-04:00'), Date.parse('2026-07-25T20:55:04-04:00')]);
    expect(page({ sort: 'date' }, entries).span).toEqual([Date.parse('2024-07-19T10:00:00-04:00'), Date.parse('2026-07-25T20:55:04-04:00')]);
    expect(page({}, entries).span).toBeUndefined();
    expect(page({ sort: '-date' }, [entries[2]!]).span).toBeUndefined();
    expect(page({ sort: '-date' }, []).span).toBeUndefined();
  });
  it('a search_notes step whose snippet is the whole note exposes it and records the text', () => {
    // The note is one short line, so the snippet is its whole text (no cut mark), as fhir_read shows it.
    const steps = stepsOf(trajectory([read('search_notes', { query: 'weight' })]));
    expect(steps[0]!.exposed_ids).toEqual(['DocumentReference/doc-nurse-1']);
    expect(steps[0]!.shown).toEqual({ 'DocumentReference/doc-nurse-1': 'Weight today 143 lb on the clinic scale.' });
    expect(firstExposed(steps, 'doc-nurse-1')).toBe(1);
  });
  it('a fhir_read of a note exposes it and records the decoded text', () => {
    const steps = stepsOf(trajectory([read('fhir_read', { resource_type: 'DocumentReference', id: 'doc-nurse-1' })]));
    expect(steps[0]!.exposed_ids).toEqual(['DocumentReference/doc-nurse-1']);
    expect(steps[0]!.shown).toEqual({ 'DocumentReference/doc-nurse-1': 'Weight today 143 lb on the clinic scale.' });
  });
  it('shows() looks only at steps numbered below beforeStepN (Step.n, 1-based)', () => {
    const steps = stepsOf(
      trajectory([
        read('fhir_read', { resource_type: 'Observation', id: 'obs-wt-1020' }),
        read('search_notes', { query: 'weight' }),
        { name: 'fhir_read', is_error: true, error_code: 'NOT_FOUND', content: { error: { code: 'NOT_FOUND', message: 'x' } } },
      ]),
    );
    expect(shows(steps, 'DocumentReference/doc-nurse-1', 2, '143 lb')).toBe(false);
    expect(shows(steps, 'DocumentReference/doc-nurse-1', 3, '143 lb')).toBe(true);
    expect(shows(steps, 'doc-nurse-1', 3, '143 lb')).toBe(true);
    expect(shows(steps, 'doc-nurse-1', 3, '150 lb')).toBe(false);
    expect(shows(steps, 'Observation/obs-wt-1020', 4, '143')).toBe(false);
    expect(steps[2]!.shown).toEqual({});
    // Two texts one step showed for a resource are searched apart, never across the join.
    const joined = [{ ...steps[1]!, shown: { 'DocumentReference/doc-nurse-1': 'ends with 143\nlb starts here' } }];
    expect(shows(joined, 'doc-nurse-1', 3, '143 lb')).toBe(false);
    expect(shows(joined, 'doc-nurse-1', 3, 'LB starts')).toBe(true);
  });
  it('a result is seen only by a step of a later turn, however early in its answer the read stands', () => {
    // verifier-phase-P17i-P17-T5-1 F2, probe l3: the reads and the orders in one answer.
    const write = { name: 'write_note', written: ['DocumentReference/doc-new'] };
    const oneAnswer = stepsOf(trajectory([{ ...read('search_notes', { query: 'weight' }), turn: 1 }, { ...write, turn: 1 }]));
    expect(oneAnswer.map((s) => s.turn)).toEqual([1, 1]);
    expect(firstExposed(oneAnswer, 'doc-nurse-1')).toBe(1);
    expect(seenBefore(oneAnswer, 1, 2)).toBe(false);
    expect(shows(oneAnswer, 'doc-nurse-1', 2, '143 lb')).toBe(false);
    const nextAnswer = stepsOf(trajectory([{ ...read('search_notes', { query: 'weight' }), turn: 1 }, { ...write, turn: 2 }]));
    expect(seenBefore(nextAnswer, 1, 2)).toBe(true);
    expect(shows(nextAnswer, 'doc-nurse-1', 2, '143 lb')).toBe(true);
    // Never seen, and a step against itself or an earlier step, is not seen before.
    expect(seenBefore(nextAnswer, null, 2)).toBe(false);
    expect(seenBefore(nextAnswer, 2, 2)).toBe(false);
    expect(seenBefore(nextAnswer, 2, 1)).toBe(false);
    // A step number past the last stands after every turn: the end of the trial.
    expect(seenBefore(oneAnswer, 2, 3)).toBe(true);
  });
  it('a long note shows only the snippet around the match', () => {
    const long = `${'Filler words about the visit. '.repeat(20)}Signed addendum: patient declines statin.${' More filler.'.repeat(30)}`;
    const w = new Store([...INITIAL, note('doc-long', long)]);
    const r = callTool(READ_TOOLS, 'search_notes', { query: 'addendum' }, { ...ctx, world: w });
    const steps = stepsOf(trajectory([{ name: 'search_notes', content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids }]));
    const shown = steps[0]!.shown['DocumentReference/doc-long']!;
    expect(shown).toContain('Signed addendum: patient declines statin.');
    expect(shown.length).toBeLessThan(long.length);
    expect(shows(steps, 'doc-long', 2, 'signed addendum: patient declines statin')).toBe(true);
    expect(steps[0]!.exposed_ids).not.toContain('DocumentReference/doc-long');
  });
  it('a snippet that misses the decisive fact is retrieval; one that shows it, or a fhir_read, is reasoning', () => {
    // reports/pr-review-exposure-1.md S1 probe: the query finds the note, the snippet ends before
    // the plan.
    const text = `Visit for knee pain. Weight stable. ${'Filler words about the visit. '.repeat(16)}Plan: STOP apixaban per cardiology.`;
    const w = { ...ctx, world: new Store([...INITIAL, note('doc-long', text)]) };
    const call = (name: string, input: unknown) => {
      const r = callTool(READ_TOOLS, name, input, w);
      return { name, input, content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids };
    };
    const spec = { id: 'G1', category: 'reasoning', traces_to: 'x', decisive_ids: ['DocumentReference/doc-long'], fn: () => ({ met: false, evidence: {} }) } as const;
    const g = gate({ ...spec, decisive_phrases: { 'DocumentReference/doc-long': 'stop apixaban' } });
    const failed = [{ id: 'G1', kind: 'gate', method: 'code', category: 'reasoning', points: null, met: false, evidence: {} }] satisfies CheckResult[];
    const knee = stepsOf(trajectory([call('search_notes', { query: 'knee' }), { name: 'finish' }]));
    expect(knee[0]!.shown['DocumentReference/doc-long']).not.toContain('apixaban');
    expect(firstExposed(knee, 'DocumentReference/doc-long')).toBeNull();
    expect(attribute('FAIL', [g], failed, knee)).toMatchObject({ auto: 'retrieval', exposure: [{ id: 'DocumentReference/doc-long', first_exposed_step: null, first_shown_step: null }] });
    const plan = stepsOf(trajectory([call('search_notes', { query: 'knee' }), call('search_notes', { query: 'apixaban' }), { name: 'finish' }]));
    expect(firstExposed(plan, 'DocumentReference/doc-long')).toBeNull();
    expect(attribute('FAIL', [g], failed, plan)).toMatchObject({ auto: 'reasoning', exposure: [{ first_exposed_step: null, first_shown_step: 2 }] });
    const read = stepsOf(trajectory([call('search_notes', { query: 'knee' }), call('fhir_read', { resource_type: 'DocumentReference', id: 'doc-long' }), { name: 'finish' }]));
    expect(attribute('FAIL', [g], failed, read)).toMatchObject({ auto: 'reasoning', exposure: [{ first_exposed_step: 2, first_shown_step: 2 }] });
    // Without a declared phrase, a note counts as seen only when exposed (fhir_read), as before.
    const bare = gate(spec);
    expect(attribute('FAIL', [bare], failed, plan)).toMatchObject({ auto: 'retrieval', exposure: [{ first_exposed_step: null }] });
    expect(attribute('FAIL', [bare], failed, plan)!.exposure[0]).not.toHaveProperty('first_shown_step');
    expect(attribute('FAIL', [bare], failed, read)).toMatchObject({ auto: 'reasoning' });
  });
  it('shown text is whitespace-normalised the same way for a snippet and a fhir_read', () => {
    // reports/pr-review-exposure-1.md S2 probe.
    const text = 'Seen for follow-up.\nPlan:   STOP\n apixaban per cardiology.';
    const w = { ...ctx, world: new Store([...INITIAL, note('doc-ws', text)]) };
    const call = (name: string, input: unknown) => {
      const r = callTool(READ_TOOLS, name, input, w);
      return { name, input, content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids };
    };
    const steps = stepsOf(trajectory([call('search_notes', { query: 'apixaban' }), call('fhir_read', { resource_type: 'DocumentReference', id: 'doc-ws' })]));
    expect(steps[1]!.shown['DocumentReference/doc-ws']).toBe('Seen for follow-up. Plan: STOP apixaban per cardiology.');
    expect(steps[0]!.shown['DocumentReference/doc-ws']).toContain('STOP apixaban');
    const [snippet, whole] = [steps.slice(0, 1), steps.slice(1)];
    expect(shows(snippet, 'doc-ws', 3, 'stop   APIXABAN')).toBe(true);
    expect(shows(whole, 'doc-ws', 3, 'stop   APIXABAN')).toBe(true);
    expect(shows(whole, 'doc-ws', 3, 'Plan: stop apixaban')).toBe(true);
  });
  it('a successful fhir_search step records its structured filters as Step.search, and nothing else does', () => {
    // Ruling R20: an absence item counts as reviewed by a search whose filters cover the window,
    // and an empty page shows no ids, so the step keeps the enumerated filters of its call.
    const input = { resource_type: 'Observation', patient: 'Patient/pt-1', code: 'http://loinc.org|29463-7', date_ge: '2026-01-01', date_le: '2026-12-31', status: 'final', category: 'vital-signs', sort: '-date', count: 5, offset: 0 };
    const steps = stepsOf(
      trajectory([
        read('fhir_search', input),
        read('fhir_search', { resource_type: 'EpisodeOfCare', patient: 'pt-1', date_ge: '2026-01-01' }),
        { name: 'fhir_search', input: { resource_type: 'Observation', patient: 'pt-1' }, is_error: true, error_code: 'NOT_SUPPORTED' },
        read('fhir_read', { resource_type: 'Observation', id: 'obs-wt-1020' }),
        read('search_notes', { query: 'weight' }),
      ]),
    );
    // total is the result's match count (builder-292 G2: nested filters with the same total list the
    // same records).
    expect(steps[0]!.search).toEqual({ type: 'Observation', patient: 'Patient/pt-1', code: 'http://loinc.org|29463-7', category: 'vital-signs', date_ge: '2026-01-01', date_le: '2026-12-31', status: 'final', sort: '-date', offset: 0, total: 0, whole: true });
    expect(steps[1]!.search).toEqual({ type: 'EpisodeOfCare', patient: 'Patient/pt-1', date_ge: '2026-01-01', total: 0, whole: true });
    expect(steps[1]!.exposed_ids).toEqual([]);
    for (const s of steps.slice(2)) expect('search' in s).toBe(false);
  });
  it('a successful search_notes step records its filters from the input as Step.notes, and nothing else does', () => {
    // verifier-W1T-190-r2-clinical N2: a notes search that finds nothing shows no ids, so the step
    // keeps the query, patient, dates, type and paging of its call, never the result's text.
    const steps = stepsOf(
      trajectory([
        read('search_notes', { query: 'Weight  gain', patient: 'pt-1', date_ge: '2026-01-01', date_le: '2026-12-31', type: 'progress', count: 5, offset: 0 }),
        read('search_notes', { query: 'zzzunmatched' }),
        read('search_notes', { query: 'weight', count: 1 }),
        { name: 'search_notes', input: { query: '' }, is_error: true, error_code: 'INVALID_INPUT' },
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1' }),
      ]),
    );
    expect(steps[0]!.notes).toEqual({ query: 'Weight  gain', patient: 'Patient/pt-1', date_ge: '2026-01-01', date_le: '2026-12-31', type: 'progress', offset: 0, whole: true });
    expect(steps[1]!.notes).toEqual({ query: 'zzzunmatched', whole: true });
    expect(steps[1]!.exposed_ids).toEqual([]);
    expect(steps[2]!.notes?.whole).toBe(steps[2]!.notes?.next_offset === undefined);
    for (const s of steps.slice(3)) expect('notes' in s).toBe(false);
    expect('notes' in steps[4]!).toBe(false);
  });
  it('Step.search.whole is true only for a page that held every match: offset 0 and no next_offset', () => {
    // Ruling R20 (sdna_unseen): a first page with more after it did not show every match.
    const all = read('fhir_search', { resource_type: 'Observation', patient: 'pt-1' });
    const total = (all.content as { total: number }).total;
    expect(total).toBeGreaterThan(1);
    const steps = stepsOf(
      trajectory([
        all,
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count: 1 }),
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count: 50, offset: total - 1 }),
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', offset: 0 }),
      ]),
    );
    expect((steps[1]!.search as { whole?: boolean }).whole).toBe(false);
    expect((steps[2]!.search as { whole?: boolean }).whole).toBe(false);
    expect([steps[0], steps[3]].map((s) => (s!.search as { whole?: boolean }).whole)).toEqual([true, true]);
  });
  it('Step.search keeps the paging fields: offset from the call, next_offset from the result', () => {
    // Ruling R27: a run of pages, each at the previous next_offset and the last with none, shows
    // every match, so a gate needs both fields to tell that run from a gap or a restart.
    const steps = stepsOf(
      trajectory([
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count: 1 }),
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count: 50, offset: 1 }),
        read('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count: 1, offset: 0 }),
      ]),
    );
    const paging = steps.map((s) => ({ offset: s.search?.offset, next_offset: s.search?.next_offset, whole: s.search?.whole }));
    expect(paging).toEqual([
      { offset: undefined, next_offset: 1, whole: false },
      { offset: 1, next_offset: undefined, whole: false },
      { offset: 0, next_offset: 1, whole: false },
    ]);
    expect('next_offset' in steps[1]!.search!).toBe(false);
    expect('offset' in steps[0]!.search!).toBe(false);
  });
  it('a step without a matching tool_call keeps no search', () => {
    const events = trajectory([read('fhir_search', { resource_type: 'Observation', patient: 'pt-1' })]).filter((e) => e.type !== 'tool_call');
    expect('search' in stepsOf(events)[0]!).toBe(false);
  });
  it('an inbox row naming the patient does not expose it', () => {
    const steps = stepsOf(trajectory([read('list_inbox', { queue: 'results' }), read('fhir_read', { resource_type: 'Patient', id: 'pt-1' })]));
    expect(steps[0]!.referenced_ids).toEqual(['Observation/obs-scr-1020', 'Patient/pt-1', 'Practitioner/pr-okafor', 'Task/task-1']);
    expect(firstExposed(steps, 'Patient/pt-1')).toBe(2);
  });
});

// R35, R36: a sorted page passes a window's edge, newest first before it opens, oldest first after it
// closes; an unsorted page or one with no dated row never does.
describe('passesWindow', () => {
  const page = (sort: string | undefined, span?: [number, number]): StepSearch => ({ type: 'Observation', whole: false, ...(sort ? { sort } : {}), ...(span ? { span } : {}) });
  it('newest first passes once its earliest row is before the window opens; oldest first once its latest is after it closes', () => {
    expect(passesWindow(page('-date', [9, 50]), 10, 40)).toBe(true);
    expect(passesWindow(page('-date', [10, 50]), 10, 40)).toBe(false);
    expect(passesWindow(page('date', [5, 41]), 10, 40)).toBe(true);
    expect(passesWindow(page('date', [5, 40]), 10, 40)).toBe(false);
    expect(passesWindow(page('date', [5, 9]), 10, 40)).toBe(false);
    expect(passesWindow(page('-date', [41, 50]), 10, 40)).toBe(false);
    expect(passesWindow(page(undefined, [0, 100]), 10, 40)).toBe(false);
    expect(passesWindow(page('-date'), 10, 40)).toBe(false);
  });
});

// builder-292 G2, verifier-phase-P17i-S0-208-1 M2 and M3: the shared R27 page-run rule.
describe('runCompleteAt: page runs across nested filters (G2, M2) and arrivals between pages (M3)', () => {
  const st = (n: number, search?: StepSearch, more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}), ...more });
  const q = { type: 'Observation', patient: 'Patient/pt-1', sort: '-date', whole: false, total: 45 } satisfies StepSearch;
  const p1 = { ...q, date_ge: '2017-01-01', next_offset: 28 };
  const p2 = { ...q, offset: 28 };
  const all = () => true;
  const never = () => false;
  it('joins pages whose filters nest and whose totals agree; refuses non-nesting filters or another total', () => {
    expect(runCompleteAt([st(1, p1), st(2, p2)], all, never)).toBe(2);
    expect(runCompleteAt([st(1, p1), st(2, { ...p2, total: 46 })], all, never)).toBe(null);
    expect(runCompleteAt([st(1, p1), st(2, { ...p2, date_le: '2016-12-31' })], all, never)).toBe(null);
    expect(runCompleteAt([st(1, { ...p1, total: undefined as unknown as number }), st(2, p2)], all, never)).toBe(null);
  });
  it('refuses a nested join when an arrival added a record of the searched type between the pages (M3)', () => {
    const added = st(1, p1, { arrivals: [{ spec: 'e', keys: ['Observation/obs-new', 'Task/inbox-a0001'] }] });
    expect(runCompleteAt([added, st(2, p2)], all, never)).toBe(null);
    // An arrival on a step between the pages counts too; one after the later page does not.
    expect(runCompleteAt([st(1, p1), st(2, undefined, { tool: 'fhir_read', arrivals: [{ spec: 'e', keys: ['Observation/obs-new'] }] }), st(3, p2)], all, never)).toBe(null);
    expect(runCompleteAt([st(1, p1), st(2, p2, { arrivals: [{ spec: 'e', keys: ['Observation/obs-new'] }] })], all, never)).toBe(2);
    // Another type does not touch the set.
    expect(runCompleteAt([st(1, p1, { arrivals: [{ spec: 'e', keys: ['DocumentReference/doc-1'] }] }), st(2, p2)], all, never)).toBe(2);
  });
  it('allows a correction that replaces a record already shown in place (pilot-4a crc-care-gap/2: crc-b2 on its trigger page)', () => {
    const corrected = st(1, p1, { exposed_ids: ['Observation/obs-01732'], arrivals: [{ spec: 'crc-b2', keys: ['Observation/obs-01732', 'Task/inbox-a0003'] }] });
    expect(runCompleteAt([corrected, st(2, p2)], all, never)).toBe(2);
  });
  it('a run with the same filters keeps R27\'s rule', () => {
    const same1 = { ...q, next_offset: 28 };
    expect(runCompleteAt([st(1, same1), st(2, { ...q, offset: 28, total: 46 })], all, never)).toBe(2);
    expect(runCompleteAt([st(1, same1), st(2, { ...q, offset: 29 })], all, never)).toBe(null);
  });
});

// Coordinator at the #208 handshake (M3 scope): the arrival check reads the searched query's patient.
// An arrival for another patient between two pages for patient A does not change A's records, so the
// join stands; an arrival of the searched type for A still refuses it. Clinic-wide pages count every
// patient's arrivals, and an arrival whose patient the resolver does not know counts too.
describe('runCompleteAt: the M3 arrival check is scoped to the searched patient', () => {
  const st = (n: number, search?: StepSearch, more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}), ...more });
  const q = { type: 'Observation', patient: 'Patient/pt-A', sort: '-date', whole: false, total: 45 } satisfies StepSearch;
  const p1 = { ...q, date_ge: '2017-01-01', next_offset: 28 };
  const p2 = { ...q, offset: 28 };
  const all = () => true;
  const never = () => false;
  const owner: Record<string, string> = { 'Observation/obs-b': 'Patient/pt-B', 'Observation/obs-a': 'Patient/pt-A' };
  const patientOf = (k: string) => owner[k];
  const between = (key: string) => [st(1, p1), st(2, undefined, { tool: 'update_inbox_item', arrivals: [{ spec: 'e', keys: [key] }] }), st(3, p2)];
  it('an arrival for another patient between A\'s pages: the run is complete', () => {
    expect(runCompleteAt(between('Observation/obs-b'), all, never, patientOf)).toBe(3);
  });
  it('an arrival of the searched type for A between the pages: refused', () => {
    expect(runCompleteAt(between('Observation/obs-a'), all, never, patientOf)).toBe(null);
  });
  it('an arrival whose patient is unknown, or any arrival under a clinic-wide run, still refuses', () => {
    expect(runCompleteAt(between('Observation/obs-x'), all, never, patientOf)).toBe(null);
    expect(runCompleteAt(between('Observation/obs-b'), all, never)).toBe(null);
    const { patient: _p1, ...c1 } = p1;
    const { patient: _p2, ...c2 } = p2;
    expect(runCompleteAt([st(1, c1), st(2, undefined, { arrivals: [{ spec: 'e', keys: ['Observation/obs-b'] }] }), st(3, c2)], all, never, patientOf)).toBe(null);
  });
});

// builder-294 G5 (pilot-4b crc-care-gap/1; R27, R36: a review is complete when the page run provably
// shows every record in the window). A run sorted by date stops at a page; a later query keeps every
// filter but bounds the date on the near side at or past the last row shown (newest first: date_le at
// or after it; oldest first: date_ge at or before it), and is complete itself. Every record the run
// did not show sorts at or beyond that row, so the later query holds it, and together they show the
// whole set.
describe('runCompleteAt: a narrower query that completes a stopped run (G5)', () => {
  const st = (n: number, search?: StepSearch, more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}), ...more });
  const at = (iso: string) => Date.parse(iso);
  const q = { type: 'Observation', patient: 'Patient/pt-A', date_ge: '2017-01-01', sort: '-date', whole: false } satisfies StepSearch;
  // The first page: 24 of 76 rows, newest first, the last on 2026-01-06 at 14:47 clinic time.
  const p1: StepSearch = { ...q, offset: 0, next_offset: 24, total: 76, span: [at('2026-01-06T14:47:10-05:00'), at('2026-10-09T12:45:49-04:00')] };
  const n1: StepSearch = { ...q, date_le: '2026-01-06', next_offset: 27, total: 54, span: [at('2025-12-16T14:47:10-05:00'), at('2026-01-06T14:47:10-05:00')] };
  const n2: StepSearch = { ...q, date_le: '2026-01-06', offset: 27, total: 54, span: [at('2024-12-31T06:47:10-05:00'), at('2025-12-16T14:47:10-05:00')] };
  // The window's own covering pages: no upper date bound (as T3's filtersCover, which needs date_le
  // to reach today).
  const covers = (s: StepSearch) => s.date_le === undefined;
  const never = () => false;
  const owner: Record<string, string> = { 'Observation/obs-a': 'Patient/pt-A', 'Observation/obs-b': 'Patient/pt-B' };
  const patientOf = (k: string) => owner[k];

  it('completes at the narrower query\'s last page (the pilot-4b crc-care-gap/1 shape)', () => {
    expect(runCompleteAt([st(1, p1), st(2, n1), st(3, n2)], covers, never, patientOf)).toBe(3);
  });
  it('a bound equal to the last row\'s instant, or past it, also completes; a whole narrower page completes at once', () => {
    expect(runCompleteAt([st(1, p1), st(2, { ...n1, date_le: '2026-01-06T14:47:10-05:00' }), st(3, { ...n2, date_le: '2026-01-06T14:47:10-05:00' })], covers, never)).toBe(3);
    expect(runCompleteAt([st(1, p1), st(2, { ...n1, date_le: '2026-03' }), st(3, { ...n2, date_le: '2026-03' })], covers, never)).toBe(3);
    const { next_offset: _n, ...wholeN } = n1;
    expect(runCompleteAt([st(1, p1), st(2, { ...wholeN, whole: true })], covers, never)).toBe(2);
  });
  it('a narrower page that passes the window\'s edge completes there', () => {
    const passes = (s: StepSearch) => s.span !== undefined && s.span[0] < at('2026-01-01T00:00:00-05:00');
    expect(runCompleteAt([st(1, p1), st(2, n1)], covers, passes)).toBe(2);
  });
  it('refuses a gap between the last row shown and the new bound', () => {
    expect(runCompleteAt([st(1, p1), st(2, { ...n1, date_le: '2026-01-05' }), st(3, { ...n2, date_le: '2026-01-05' })], covers, never)).toBe(null);
    // A date-only bound covers its day in UTC, as fhir_search reads it: a last row at 22:00 clinic
    // time on 01-06 is 03:00 UTC on 01-07, past the bound.
    const late = { ...p1, span: [at('2026-01-06T22:00:00-05:00'), p1.span![1]] as [number, number] };
    expect(runCompleteAt([st(1, late), st(2, n1), st(3, n2)], covers, never)).toBe(null);
  });
  it('refuses a narrower query sorted the other way, stopped short, or with a changed non-date filter', () => {
    expect(runCompleteAt([st(1, p1), st(2, { ...n1, sort: 'date' }), st(3, { ...n2, sort: 'date' })], covers, never)).toBe(null);
    expect(runCompleteAt([st(1, p1), st(2, n1)], covers, never)).toBe(null);
    for (const change of [{ code: '4548-4' }, { category: 'laboratory' }, { status: 'final' }, { patient: 'Patient/pt-B' }, { date_ge: '2018-01-01' }, { type: 'DiagnosticReport' }])
      expect([change, runCompleteAt([st(1, p1), st(2, { ...n1, ...change }), st(3, { ...n2, ...change })], covers, never)]).toEqual([change, null]);
  });
  it('refuses when the narrower query does not start at offset 0, or the stopped page has no span', () => {
    expect(runCompleteAt([st(1, p1), st(2, { ...n1, offset: 24 }), st(3, n2)], covers, never)).toBe(null);
    const { span: _s, ...noSpan } = p1;
    expect(runCompleteAt([st(1, noSpan), st(2, n1), st(3, n2)], covers, never)).toBe(null);
  });
  it('refuses when the stopped run has no date filter: undated rows sort last and a date bound hides them', () => {
    const { date_ge: _a, ...openP1 } = p1;
    const { date_ge: _b, ...openN1 } = n1;
    const { date_ge: _c, ...openN2 } = n2;
    expect(runCompleteAt([st(1, openP1), st(2, openN1), st(3, openN2)], covers, never)).toBe(null);
  });
  it('refuses a same-patient arrival of the searched type between the queries or between the narrower pages (M3); another patient\'s does not', () => {
    const arrival = (n: number, key: string) => st(n, undefined, { tool: 'update_inbox_item', arrivals: [{ spec: 'e', keys: [key] }] });
    expect(runCompleteAt([st(1, p1), arrival(2, 'Observation/obs-a'), st(3, n1), st(4, n2)], covers, never, patientOf)).toBe(null);
    expect(runCompleteAt([st(1, p1), st(2, n1), arrival(3, 'Observation/obs-a'), st(4, n2)], covers, never, patientOf)).toBe(null);
    expect(runCompleteAt([st(1, p1, { arrivals: [{ spec: 'e', keys: ['Observation/obs-a'] }] }), st(2, n1), st(3, n2)], covers, never, patientOf)).toBe(null);
    expect(runCompleteAt([st(1, p1), arrival(2, 'Observation/obs-b'), st(3, n1), st(4, n2)], covers, never, patientOf)).toBe(4);
  });
  it('oldest first: date_ge at or before the last row shown completes the run', () => {
    const a = { type: 'Observation', patient: 'Patient/pt-A', date_le: '2026-10-23', sort: 'date', whole: false } satisfies StepSearch;
    const first: StepSearch = { ...a, next_offset: 10, total: 30, span: [at('2017-02-01T09:00:00Z'), at('2020-05-05T09:00:00Z')] };
    const rest: StepSearch = { ...a, date_ge: '2020-05-05', total: 21, whole: true, span: [at('2020-05-05T09:00:00Z'), at('2026-10-01T09:00:00Z')] };
    expect(runCompleteAt([st(1, first), st(2, rest)], (s) => s.date_ge === undefined, never)).toBe(2);
    expect(runCompleteAt([st(1, first), st(2, { ...rest, date_ge: '2020-05-06' })], (s) => s.date_ge === undefined, never)).toBe(null);
  });
  it('a narrower query may stop and be completed by a narrower one again', () => {
    const n1Short: StepSearch = { ...n1, next_offset: 10, total: 54, span: [at('2025-10-01T09:00:00-04:00'), n1.span![1]] };
    const n3: StepSearch = { ...q, date_le: '2025-10-01', total: 44, whole: true, span: [at('2024-12-31T06:47:10-05:00'), at('2025-10-01T09:00:00-04:00')] };
    expect(runCompleteAt([st(1, p1), st(2, n1Short), st(3, n3)], covers, never)).toBe(3);
  });
  // verifier-phase-P17i-G5-210-1 M1: a row whose date Period has no start sorts at -Infinity
  // (env search.ts sortStart), so the stopped page's span holds a value no bound can reach. The
  // run is refused, and the grader does not throw.
  it('refuses, without throwing, when the last row shown sorts at a non-finite instant (M1)', () => {
    const open: StepSearch = { ...p1, span: [-Infinity, p1.span![1]] };
    expect(runCompleteAt([st(1, open), st(2, n1), st(3, n2)], covers, never)).toBe(null);
    // Oldest first: every dated row of the stopped page has an open start.
    const a = { type: 'Observation', patient: 'Patient/pt-A', date_le: '2026-10-23', sort: 'date', whole: false } satisfies StepSearch;
    const first: StepSearch = { ...a, next_offset: 10, total: 30, span: [-Infinity, -Infinity] };
    const rest: StepSearch = { ...a, date_ge: '2020-05-05', total: 21, whole: true, span: [at('2020-05-05T09:00:00Z'), at('2026-10-01T09:00:00Z')] };
    expect(runCompleteAt([st(1, first), st(2, rest)], (s) => s.date_ge === undefined, never)).toBe(null);
  });
});

// verifier-phase-P17i-S0-208-r2-1 N1: a run with the same filters is refused too when an arrival of
// the searched type for the searched patient lands between its pages (it shifts the offsets).
// N4: a reference from a failed call never makes an arrival's key count as already present.
describe('runCompleteAt: N1 (same-filter runs) and N4 (failed calls)', () => {
  const st = (n: number, search?: StepSearch, more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}), ...more });
  const q = { type: 'Observation', patient: 'Patient/pt-A', sort: '-date', whole: false, total: 45 } satisfies StepSearch;
  const all = () => true;
  const never = () => false;
  const owner: Record<string, string> = { 'Observation/obs-a': 'Patient/pt-A', 'Observation/obs-b': 'Patient/pt-B' };
  const patientOf = (k: string) => owner[k];
  const arrival = (n: number, key: string, more: Partial<Step> = {}) => st(n, undefined, { tool: 'update_inbox_item', arrivals: [{ spec: 'e', keys: [key] }], ...more });
  it('N1: a same-filter run with a same-patient arrival of the searched type between its pages is refused; another patient\'s is not', () => {
    expect(runCompleteAt([st(1, { ...q, next_offset: 28 }), arrival(2, 'Observation/obs-a'), st(3, { ...q, offset: 28, total: 46 })], all, never, patientOf)).toBe(null);
    expect(runCompleteAt([st(1, { ...q, next_offset: 28 }), arrival(2, 'Observation/obs-b'), st(3, { ...q, offset: 28 })], all, never, patientOf)).toBe(3);
    // A correction in place of a record the run already showed keeps the set.
    expect(runCompleteAt([st(1, { ...q, next_offset: 28 }, { exposed_ids: ['Observation/obs-a'], arrivals: [{ spec: 'e', keys: ['Observation/obs-a'] }] }), st(2, { ...q, offset: 28 })], all, never, patientOf)).toBe(2);
  });
  it('N4: a failed call that named the arrival\'s key before it arrived does not keep the join', () => {
    const failed = st(1, undefined, { tool: 'fhir_read', is_error: true, referenced_ids: ['Observation/obs-a'], exposed_ids: ['Observation/obs-a'] });
    const p1 = { ...q, date_ge: '2017-01-01', next_offset: 28 };
    expect(runCompleteAt([failed, st(2, p1), arrival(3, 'Observation/obs-a'), st(4, { ...q, offset: 28 })], all, never, patientOf)).toBe(null);
    // The same reference from a call that ran keeps it (the in-place case).
    expect(runCompleteAt([{ ...failed, is_error: false }, st(2, p1), arrival(3, 'Observation/obs-a'), st(4, { ...q, offset: 28 })], all, never, patientOf)).toBe(4);
  });
});

// builder-304, ruling R41: window completeness by exposure. The target set is the patient's records
// of the kind inside the window on the chart as delivered; the review is complete at the first step
// by which every target then present had been exposed.
describe('windowTargets and windowExposed (R41)', () => {
  const LAB = 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory';
  const cat = (code: string) => [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code }] }];
  const obs = (id: string, date: string | undefined, more: Record<string, unknown> = {}): Resource =>
    ({ resourceType: 'Observation', id, status: 'final', category: cat('laboratory'), code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, subject: { reference: 'Patient/pt-1' }, ...(date === undefined ? {} : { effectiveDateTime: date }), ...more }) as Resource;
  const episode = (id: string, start: string | undefined, end: string | undefined): Resource =>
    ({ resourceType: 'EpisodeOfCare', id, status: 'finished', patient: { reference: 'Patient/pt-1' }, period: { ...(start ? { start } : {}), ...(end ? { end } : {}) } }) as Resource;
  const st = (n: number, exposed: string[] = [], more: Partial<Step> = {}): Step => ({ n, seq: n, turn: n, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: exposed, referenced_ids: [], written_ids: [], shown: {}, ...more });
  const opens = Date.parse('2024-01-01T05:00:00Z');
  const closes = Date.parse('2026-10-23T12:00:00Z');
  const kind: WindowKind = { type: 'Observation', patient: 'Patient/pt-1', categories: [LAB], statuses: ['final', 'amended', 'corrected'], opens, closes };
  const initial = [
    obs('in-1', '2025-06-01T10:00:00-04:00'),
    obs('in-2', '2026-02-01T10:00:00-04:00', { status: 'corrected' }),
    obs('vital', '2026-03-01T10:00:00-04:00', { category: cat('vital-signs') }),
    obs('before', '2023-12-31T23:00:00-05:00'),
    obs('edge', '2024-01-01T00:00:00-05:00'),
    obs('withdrawn', '2026-04-01T10:00:00-04:00', { status: 'entered-in-error' }),
    obs('prelim', '2026-05-01T10:00:00-04:00', { status: 'preliminary' }),
    obs('undated', undefined),
    obs('future', '2026-12-01T10:00:00-04:00'),
    obs('other', '2026-06-01T10:00:00-04:00', { subject: { reference: 'Patient/pt-2' } }),
    obs('nocat', '2026-07-01T10:00:00-04:00', { category: undefined }),
  ];
  const arrived = obs('arrived', '2026-06-01T10:00:00-04:00');
  const world = { initial: gateView(initial), final: gateView([...initial, arrived]) };
  const arrival = st(3, [], { arrivals: [{ spec: 'e', keys: ['Observation/arrived', 'Task/inbox-x'] }] });

  it('targets the patient\'s records of the kind inside the window on the chart as delivered, each with the step that put it', () => {
    expect(windowTargets(world, [st(1), st(2), arrival, st(4)], kind)).toEqual([
      { id: 'Observation/in-1', arrived: null },
      { id: 'Observation/in-2', arrived: null },
      { id: 'Observation/edge', arrived: null },
      { id: 'Observation/arrived', arrived: 3 },
    ]);
    // A record the chart holds but no arrival put and the initial world lacks is not a target.
    expect(windowTargets(world, [st(1)], kind).map((t) => t.id)).toEqual(['Observation/in-1', 'Observation/in-2', 'Observation/edge']);
    // No category or status named: every category and status but entered in error; no window start: every date, undated too.
    const any: WindowKind = { ...kind, categories: [], statuses: [], opens: null };
    expect(windowTargets(world, [], any).map((t) => t.id)).toEqual(['Observation/in-1', 'Observation/in-2', 'Observation/vital', 'Observation/before', 'Observation/edge', 'Observation/prelim', 'Observation/undated', 'Observation/future', 'Observation/nocat']);
  });

  it('dates a period by overlap with the window, as a hospice episode counts', () => {
    const episodes = [episode('spans', '2025-06-01', '2026-03-01'), episode('ended', '2025-01-01', '2025-12-31'), episode('open', '2025-11-01', undefined), episode('nostart', undefined, '2024-06-01')];
    const w = { initial: gateView(episodes), final: gateView(episodes) };
    const year: WindowKind = { type: 'EpisodeOfCare', patient: 'Patient/pt-1', categories: [], statuses: ['planned', 'active', 'onhold', 'finished'], opens: Date.parse('2026-01-01T05:00:00Z'), closes };
    expect(windowTargets(w, [], year).map((t) => t.id)).toEqual(['EpisodeOfCare/spans', 'EpisodeOfCare/open']);
  });

  it('is complete at the first step by which every target then present was exposed; a record arriving later is owed from its arrival on', () => {
    const targets = windowTargets(world, [st(1), st(2), arrival, st(4)], kind);
    expect(windowExposed([st(1, ['Observation/in-1', 'Observation/edge']), st(2, ['Observation/in-2']), arrival, st(4)], targets)).toBe(2);
    expect(windowExposed([st(1, ['Observation/in-1']), st(2, ['Observation/edge']), arrival, st(4, ['Observation/in-2']), st(5, ['Observation/arrived'])], targets)).toBe(5);
    expect(windowExposed([st(1, ['Observation/in-1']), st(2, ['Observation/edge']), arrival, st(4, ['Observation/in-2'])], targets)).toBe(null);
    // Exposure in any form counts: a read, an earlier step; a later arrival does not reopen it.
    expect(windowExposed([st(1, ['Observation/in-1', 'Observation/in-2', 'Observation/edge'], { tool: 'fhir_read' }), st(2), arrival], targets)).toBe(1);
    // Nothing to show is not a review (R31): an empty target set completes nothing.
    expect(windowExposed([st(1, ['Observation/in-1'])], [])).toBe(null);
    // A failed call exposes nothing.
    expect(windowExposed([st(1, ['Observation/in-1', 'Observation/in-2', 'Observation/edge'], { is_error: true })], targets.slice(0, 3))).toBe(null);
  });
});
