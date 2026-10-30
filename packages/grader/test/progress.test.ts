// Rule P-L (packages/grader/progress.ts, plan-amendment-worklist "Attribution rule for stops"):
// whether a trial that reached a turn, cost or working-time cap was looping, from its trajectory
// alone. It fails safe (decisions.tsv 2026-10-30T11:21): a cap stop is the model's only when at
// least 10 of the last 20 executed calls repeat an earlier call with the same tool and the same
// target, and none of the last 20 writes a target not written before in the trial. Calls compare
// on their tool and input without free text (at any depth) or undeclared fields; a search query
// or a calculate expression compares lowercased with its whitespace collapsed; paging is part of a
// search's target, so the next page is another call and the same page again is a repeat. Every
// other cap stop is the environment's (ENV_LIMIT), which halts the run for a human review, so a
// model that pads its tail with new calls (g1, g2, G8, G9, G11), a short tail (N5, N5b) and a
// careful worklist that re-reads context before each new write (N6) end as ENV_LIMIT, the intended
// fail-safe. Exact repeats with no new write (d, g3-g5, g6 at 10 repeats, G10, N2d, N2e, N3, N4)
// read as looping. Calibration on real trajectories and worklist shapes: progress-windows.test.ts.
import { describe, expect, it } from 'vitest';
import type { EventBody } from '../../core/events.ts';
import { FREE_TEXT, LOOP_REPEATS, progress, PROGRESS_TAIL, progressText } from '../progress.ts';
import { TOOLS } from '../../env/tools/write/index.ts';
import type { PropertySchema } from '../../env/tools/registry.ts';

// One executed call: its tool_call and tool_result events, in turn `turn`.
let n = 0;
function call(name: string, input: unknown, exposed: string[] = [], written?: string[], turn = 1, executed = true): EventBody[] {
  const id = `toolu_${++n}`;
  return [
    { type: 'tool_call', turn, tool_use_id: id, name, input },
    { type: 'tool_result', turn, tool_use_id: id, name, executed, is_error: false, error_code: null, content: {}, exposed_ids: exposed, referenced_ids: [], ...(written ? { written_ids: written } : {}) },
  ];
}
const times = (k: number, f: (i: number) => EventBody[]) => Array.from({ length: k }, (_, i) => f(i)).flat();

describe('rule P-L', () => {
  it('uses the last 20 executed calls and an absolute count of 10 repeats', () => {
    expect(PROGRESS_TAIL).toBe(20);
    expect(LOOP_REPEATS).toBe(10);
  });

  it('20 calls of one search, word for word, are looping (19 repeats, no write)', () => {
    expect(progress(times(20, () => call('search_notes', { query: 'creatinine', patient: 'pt-0001' }, ['DocumentReference/n-1'])))).toEqual({ tail: 20, repeats: 19, new_writes: 0, looping: true });
  });

  it('the same input with its keys in another order is the same call (canonical JSON)', () => {
    const p = progress([...call('search_notes', { query: 'k', patient: 'pt-1' }, ['A/1']), ...call('search_notes', { patient: 'pt-1', query: 'k' }, ['A/2'])]);
    expect(p.repeats).toBe(1);
  });

  it('new ids do not decide: 20 distinct searches that list only seen ids are not looping', () => {
    const seen = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const reread = times(20, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/o-${i % 10}`]));
    expect(progress([...seen, ...reread])).toEqual({ tail: 20, repeats: 0, new_writes: 0, looping: false });
  });

  it('free text and undeclared fields do not make a call new; a search key does', () => {
    const a = call('search_notes', { patient: 'pt-1', query: 'k' }, ['DocumentReference/n-1']);
    const n1 = call('write_note', { patient: 'pt-1', type: 'progress_note', title: 'A', text: 'one', cites: ['Observation/o-1'] }, [], ['DocumentReference/w-1']);
    const n2 = call('write_note', { patient: 'pt-1', type: 'progress_note', title: 'B', text: 'two', cites: ['Observation/o-1'] }, [], ['DocumentReference/w-2']);
    expect(progress([...n1, ...n2])).toMatchObject({ repeats: 1 });
    // fhir_read declares resource_type and id; `why` is not in its schema, which the real tool rejects.
    expect(progress([...call('fhir_read', { resource_type: 'Observation', id: 'o-1' }), ...call('fhir_read', { resource_type: 'Observation', id: 'o-1', why: 'again' })])).toMatchObject({ repeats: 1 });
    expect(progress([...a, ...call('search_notes', { patient: 'pt-1', query: 'potassium' }, ['DocumentReference/n-3'])])).toMatchObject({ repeats: 0 });
  });

  it('paging is part of the target: the next page is another call, the same page again a repeat', () => {
    const page = (offset: number, count = 10) => call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', count, offset }, [`Observation/p-${offset}`]);
    expect(progress([...page(0), ...page(10), ...page(20)])).toMatchObject({ repeats: 0 });
    expect(progress([...page(0), ...page(10), ...page(0)])).toMatchObject({ repeats: 1 });
    expect(progress([...page(0), ...page(0, 20)])).toMatchObject({ repeats: 0 });
  });

  it('the same write on the same target again is a repeat, whatever ids it wrote', () => {
    const order = (code: string, reason: string, sr: string) => call('order_service', { patient: 'pt-1', code, reason }, [], [`ServiceRequest/${sr}`, `Provenance/pv-${sr}`]);
    expect(progress([...order('L-1', 'r', 'sr-1'), ...order('L-1', 'again', 'sr-2'), ...order('L-2', 'r', 'sr-3')])).toMatchObject({ repeats: 1 });
  });

  it('10 repeats in the last 20 calls are looping, 9 are not', () => {
    const base = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const repeated = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const fresh = (k: number) => times(k, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/x-${i}`]));
    expect(progress([...base, ...repeated, ...fresh(10)])).toMatchObject({ tail: 20, repeats: 10, looping: true });
    expect(progress([...base, ...repeated.slice(0, 18), ...fresh(11)])).toMatchObject({ tail: 20, repeats: 9, looping: false });
  });

  it('the count is absolute: a tail shorter than 20 is never looping, even all repeats', () => {
    const same = times(19, () => call('fhir_read', { id: 'o-1' }, ['Observation/o-1']));
    expect(progress(same)).toEqual({ tail: 19, repeats: 18, new_writes: 0, looping: false });
    expect(progress([...same, ...call('fhir_read', { id: 'o-1' }, ['Observation/o-1'])])).toMatchObject({ tail: 20, repeats: 19, looping: true });
  });

  it('a write to a target not written before in the tail is progress, whatever the repeats', () => {
    const reads = times(19, () => call('fhir_read', { id: 'o-1' }, ['Observation/o-1']));
    const complete = (k: number) => call('update_inbox_item', { task_id: `task-${k}`, action: 'complete' }, [], [`Task/task-${k}`]);
    expect(progress([...complete(1), ...reads, ...complete(2)])).toEqual({ tail: 20, repeats: 18, new_writes: 1, looping: false });
    // The same write again is no new target: a write loop meets the rule.
    expect(progress([...complete(1), ...reads, ...complete(1)])).toEqual({ tail: 20, repeats: 19, new_writes: 0, looping: true });
    // A read target new in the tail is not a write.
    expect(progress([...reads, ...call('fhir_read', { id: 'o-2' }, ['Observation/o-2'])])).toMatchObject({ repeats: 18, new_writes: 0, looping: true });
  });

  it('a call that did not run (after finish) is not in the tail', () => {
    const p = progress([...call('fhir_read', { id: 'a' }, ['A/a']), ...call('fhir_read', { id: 'a' }, [], undefined, 1, false)]);
    expect(p).toMatchObject({ tail: 1, repeats: 0 });
  });

  it('a trajectory with no executed call has an empty tail and no evidence of a loop', () => {
    expect(progress([])).toEqual({ tail: 0, repeats: 0, new_writes: 0, looping: false });
  });

  it('states its facts in words', () => {
    expect(progressText({ tail: 20, repeats: 3, new_writes: 0, looping: false })).toBe('last 20 calls: 3 repeats, 0 writes to a new target; no loop');
    expect(progressText({ tail: 20, repeats: 12, new_writes: 1, looping: false })).toBe('last 20 calls: 12 repeats, 1 write to a new target; no loop');
    expect(progressText({ tail: 20, repeats: 20, new_writes: 0, looping: true })).toBe('last 20 calls: 20 repeats, 0 writes to a new target; looping');
    expect(progressText({ tail: 1, repeats: 0, new_writes: 1, looping: false })).toBe('last 1 call: 0 repeats, 1 write to a new target; no loop');
  });
});

// The probes of verifier-phase-P17i-W0-A-1 F3 (g1-g7), verifier-phase-P17i-W0-A-r2-1 (G8-G11) and
// lane-A probe d.
describe('rule P-L against exact repeats and padding', () => {
  const seenFive = times(5, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
  // g6: a tail of `searches` identical searches (the first is new) and new reads for the rest.
  const g6 = (searches: number) => [...seenFive, ...times(20, (i) => (i < searches ? call('search_notes', { query: 'k' }, ['DocumentReference/d1']) : call('fhir_read', { id: `n-${i}` }, [`Observation/n-${i}`])))];
  const loops: Record<string, EventBody[]> = {
    'd 25 identical searches': [...seenFive, ...times(25, () => call('search_notes', { query: 'creatinine' }, ['DocumentReference/d1']))],
    'g3 re-reads of the same five ids, a free-text field varied, one new id': [...seenFive, ...times(19, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`])), ...call('fhir_read', { id: 'o-new' }, ['Observation/o-new'])],
    'g4 the same re-reads, no new id': [...seenFive, ...times(20, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`]))],
    'g5 a write loop on one target, only the note text varied': [...seenFive, ...times(25, (i) => call('write_note', { text: `note ${i}` }, [], [`DocumentReference/w-${i}`]))],
    'g6 at 10 repeats (11 identical searches)': g6(11),
    'G10 hold/continue/stop/modify cycled on one order': [...seenFive, ...times(25, (i) => call('change_medication', { medication_request: 'mr-1', action: ['hold', 'continue', 'stop', 'modify'][i % 4], reason: 'r' }, [], ['MedicationRequest/mr-1', `Provenance/p${i}`]))],
  };
  const padding: Record<string, EventBody[]> = {
    'g1 25 reads of distinct never-seen ids': [...seenFive, ...times(25, (i) => call('fhir_read', { id: `junk-${i}` }, [`Observation/junk-${i}`]))],
    'g2 one search paged 25 times (declared offset)': [...seenFive, ...times(25, (i) => call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', offset: i * 10 }, [`Observation/p-${i}`]))],
    'g6 at 9 repeats (10 identical searches)': g6(10),
    'g7 invalid input, varied codes': [...seenFive, ...times(20, (i) => call('order_service', { code: `x${i}` }))],
    'G8 the same task on one patient, due date varied': [...seenFive, ...times(25, (i) => call('create_task', { patient: 'pt-1', owner: 'Practitioner/pr-1', due: `2026-11-${String(i + 1).padStart(2, '0')}`, priority: 'routine', description: 'follow up' }, [], [`Task/t-${i}`, `Provenance/p-${i}`]))],
    'G9 the same note on one patient, cites varied': [...seenFive, ...times(25, (i) => call('write_note', { patient: 'pt-1', type: 'progress_note', title: 'x', text: 'x', cites: [`Observation/o-${i % 3}`, ...(i % 2 ? ['Patient/pt-1'] : [])], cites_policies: [`P-${i}`] }, [], [`DocumentReference/d${i}`, `Provenance/p${i}`]))],
    'G11 one search, the code varied over codes with no hits': [...seenFive, ...times(25, (i) => call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', code: `${1000 + i}-0` }, i === 0 ? ['Observation/o-a'] : []))],
  };

  it.each(Object.keys(loops))('%s reads as looping', (id) => {
    expect(progress(loops[id]!)).toMatchObject({ tail: 20, looping: true });
  });

  // The intended fail-safe: no strong evidence of a loop, so the stop is ENV_LIMIT and the run
  // halts for a human review (every pilot and the final run require env_limit=0).
  it.each(Object.keys(padding))('%s is not looping: ENV_LIMIT, the intended fail-safe', (id) => {
    expect(progress(padding[id]!)).toMatchObject({ tail: 20, looping: false });
  });

  it('the repeat counts behind those verdicts', () => {
    expect(progress(loops['g3 re-reads of the same five ids, a free-text field varied, one new id']!)).toMatchObject({ repeats: 19 });
    expect(progress(loops['g5 a write loop on one target, only the note text varied']!)).toMatchObject({ repeats: 20 });
    expect(progress(loops['g6 at 10 repeats (11 identical searches)']!)).toMatchObject({ repeats: 10 });
    expect(progress(padding['g6 at 9 repeats (10 identical searches)']!)).toMatchObject({ repeats: 9 });
    expect(progress(loops['G10 hold/continue/stop/modify cycled on one order']!)).toMatchObject({ repeats: 20 });
    for (const id of ['g1 25 reads of distinct never-seen ids', 'g2 one search paged 25 times (declared offset)', 'G8 the same task on one patient, due date varied', 'G11 one search, the code varied over codes with no hits']) expect(progress(padding[id]!).repeats).toBe(0);
  });
});

// The probes of verifier-phase-P17i-W0-A-r3-1 (evidence 04-probes-new.txt): S1 nested free text
// (N2d, N2e), M1 normalised queries and expressions (N3, N4), S2 short tails (N5, N5b) and M2 a
// worklist on one patient that re-checks its context for every item (N6).
describe('rule P-L against the r3 probes', () => {
  const ctx = call('get_context', {});
  const read = (id: string) => call('fhir_read', { resource_type: 'Observation', id }, [`Observation/${id}`]);

  it('N2d a record_allergy loop with only the nested reactions[].manifestation varied is looping', () => {
    const allergy = (i: number) => call('record_allergy', { patient: 'pt-1', substance_code: '7980', type: 'allergy', category: 'medication', criticality: 'low', verification: 'confirmed', clinical_status: 'active', reactions: [{ manifestation_code: '247472004', manifestation: `hives ${i}`, severity: 'mild' }] }, [], [`AllergyIntolerance/a${i}`]);
    expect(progress([...ctx, ...times(25, allergy)])).toEqual({ tail: 20, repeats: 20, new_writes: 0, looping: true });
  });

  it('N2e a change_medication loop with only the nested new_dose.as_needed_reason varied is looping', () => {
    const modify = (i: number) => call('change_medication', { medication_request: 'mr-1', action: 'modify', reason: 'r', new_dose: { value: 5, unit: 'mg', frequency: 'PRN', as_needed_reason: `pain ${i}` } }, [], ['MedicationRequest/mr-1']);
    expect(progress([...ctx, ...times(25, modify)])).toEqual({ tail: 20, repeats: 20, new_writes: 0, looping: true });
  });

  it('nested fields that are not free text still tell writes apart', () => {
    const dose = (value: number) => call('change_medication', { medication_request: 'mr-1', action: 'modify', reason: 'r', new_dose: { value, unit: 'mg', frequency: 'BID' } }, [], ['MedicationRequest/mr-1']);
    expect(progress([...dose(5), ...dose(10)])).toMatchObject({ repeats: 0, new_writes: 2 });
  });

  it('N3 one search_notes query in case and whitespace variants is looping', () => {
    const search = (i: number) => call('search_notes', { patient: 'pt-1', query: `${i % 2 ? 'Creatinine' : 'creatinine'}${' '.repeat(i)}` });
    expect(progress([...ctx, ...times(25, search)])).toEqual({ tail: 20, repeats: 20, new_writes: 0, looping: true });
    expect(progress([...call('lookup_catalog', { query: '  Basic   metabolic', kind: 'lab' }), ...call('lookup_catalog', { query: 'basic metabolic', kind: 'lab' })])).toMatchObject({ repeats: 1 });
  });

  it('N4 one calculate expression in whitespace variants is looping', () => {
    const calc = (i: number) => call('calculate', { expression: `140 - 70${' '.repeat(i)}` });
    expect(progress([...ctx, ...times(25, calc)])).toEqual({ tail: 20, repeats: 20, new_writes: 0, looping: true });
  });

  it('a different query is still another call', () => {
    expect(progress([...call('search_notes', { patient: 'pt-1', query: 'creatinine' }), ...call('search_notes', { patient: 'pt-1', query: 'potassium' })])).toMatchObject({ repeats: 0 });
  });

  it('N5 a wall-clock cap after 4 calls (ctx, A, ctx, A) is not looping', () => {
    expect(progress([...ctx, ...read('o-a'), ...ctx, ...read('o-a')])).toEqual({ tail: 4, repeats: 2, new_writes: 0, looping: false });
  });

  it('N5b a cost cap after 2 calls (ctx, ctx) is not looping', () => {
    expect(progress([...ctx, ...ctx])).toEqual({ tail: 2, repeats: 1, new_writes: 0, looping: false });
  });

  it('N6 a 12-item worklist on one patient, 3 repeated context reads and one new write per item, is not looping', () => {
    const item = (k: number) => [
      ...read(`res-${k}`),
      ...call('fhir_search', { resource_type: 'MedicationRequest', patient: 'pt-1', status: 'active' }),
      ...call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', code: '2160-0' }),
      ...call('read_policy', { policy_id: 'P-1' }),
      ...call('update_inbox_item', { task_id: `task-${k}`, action: 'complete', linked: [`Observation/res-${k}`] }, [], [`Task/task-${k}`]),
    ];
    const events = [...ctx, ...times(12, item)];
    expect(progress(events)).toEqual({ tail: 20, repeats: 12, new_writes: 4, looping: false });
    // At every cut from the 20th call on, not only at the end.
    const ends = events.flatMap((e, i) => (e.type === 'tool_result' ? [i] : []));
    expect(ends.slice(PROGRESS_TAIL - 1).filter((end) => progress(events.slice(0, end + 1)).looping)).toEqual([]);
  });
});

// FREE_TEXT names every prose field of every tool input, at any depth: a string with no enum and
// no pattern is either prose or listed here as part of what the call acts on.
describe('FREE_TEXT covers the tools', () => {
  // Search parameters and codes: part of the target (query, name and expression are NORMALISED).
  const TARGET_STRINGS: readonly string[] = ['category', 'code', 'expression', 'mrn', 'name', 'query', 'status'];
  const strings = (props: Readonly<Record<string, PropertySchema>>): string[] => Object.entries(props).flatMap(([k, s]) => {
    const item = s.type === 'array' ? s.items : s;
    if (item.type === 'object') return strings(item.properties);
    return item.type === 'string' && item.enum === undefined && item.pattern === undefined ? [k] : [];
  });

  it('every unconstrained string field is free text or a listed target field', () => {
    const unlisted = [...new Set(TOOLS.flatMap((t) => strings(t.inputSchema.properties)))].filter((k) => !FREE_TEXT.includes(k) && !TARGET_STRINGS.includes(k)).sort();
    expect(unlisted).toEqual([]);
  });
});
