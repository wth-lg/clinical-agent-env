// Rule P-L (packages/grader/progress.ts, plan-amendment-worklist "Attribution rule for stops"):
// whether a trial that reached a turn, cost or working-time cap was looping, from its trajectory
// alone. It fails safe (decisions.tsv 2026-10-30T10:39): a cap stop is the model's only when half
// or more of the tail (the last 20 executed calls) repeat an earlier call with the same tool and
// the same target. Calls compare on their tool and input without free text or undeclared fields;
// paging is part of a search's target, so the next page is another call and the same page again
// is a repeat. Every other cap stop is the environment's (ENV_LIMIT), which halts the run for a
// human review, so a model that pads its tail with new calls (g1, g2, G8, G9, G11) ends as
// ENV_LIMIT, the intended fail-safe. Exact repeats (g3-g5, g6 at share 0.5, G10) read as looping.
// Calibration on real trajectories and worklist shapes: progress-windows.test.ts.
import { describe, expect, it } from 'vitest';
import type { EventBody } from '../../core/events.ts';
import { LOOP_REPEAT_SHARE, progress, PROGRESS_TAIL, progressText } from '../progress.ts';

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
  it('uses the last 20 executed calls and a 0.5 repeat share', () => {
    expect(PROGRESS_TAIL).toBe(20);
    expect(LOOP_REPEAT_SHARE).toBe(0.5);
  });

  it('20 calls of one search, word for word, are looping (repeat share 0.95)', () => {
    const p = progress(times(20, () => call('search_notes', { query: 'creatinine', patient: 'pt-0001' }, ['DocumentReference/n-1'])));
    expect(p).toMatchObject({ tail: 20, repeats: 19, looping: true });
    expect(p.repeat_share).toBeCloseTo(0.95, 9);
  });

  it('the same input with its keys in another order is the same call (canonical JSON)', () => {
    const p = progress([...call('search_notes', { query: 'k', patient: 'pt-1' }, ['A/1']), ...call('search_notes', { patient: 'pt-1', query: 'k' }, ['A/2'])]);
    expect(p.repeats).toBe(1);
  });

  it('new ids do not decide: 20 distinct searches that list only seen ids are not looping', () => {
    const seen = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const reread = times(20, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/o-${i % 10}`]));
    expect(progress([...seen, ...reread])).toEqual({ tail: 20, repeats: 0, repeat_share: 0, looping: false });
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

  it('a repeat share of exactly 0.5 is looping, under it is not', () => {
    const base = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const repeated = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const fresh = (k: number) => times(k, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/x-${i}`]));
    expect(progress([...base, ...repeated, ...fresh(10)])).toMatchObject({ tail: 20, repeats: 10, looping: true });
    expect(progress([...base, ...repeated.slice(0, 18), ...fresh(11)])).toMatchObject({ tail: 20, repeats: 9, looping: false });
  });

  it('a call that did not run (after finish) is not in the tail', () => {
    const p = progress([...call('fhir_read', { id: 'a' }, ['A/a']), ...call('fhir_read', { id: 'a' }, [], undefined, 1, false)]);
    expect(p).toMatchObject({ tail: 1, repeats: 0 });
  });

  it('a trajectory with no executed call has an empty tail and no evidence of a loop', () => {
    expect(progress([])).toEqual({ tail: 0, repeats: 0, repeat_share: 0, looping: false });
  });

  it('states its facts in words', () => {
    expect(progressText({ tail: 20, repeats: 3, repeat_share: 0.15, looping: false })).toBe('last 20 calls: 3 repeats (share 0.15); no loop');
    expect(progressText({ tail: 1, repeats: 1, repeat_share: 1, looping: true })).toBe('last 1 call: 1 repeat (share 1.00); looping');
  });
});

// The probes of verifier-phase-P17i-W0-A-1 F3 (g1-g7) and verifier-phase-P17i-W0-A-r2-1 (G8-G11).
describe('rule P-L against exact repeats and padding', () => {
  const seenFive = times(5, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
  // g6: a tail of `searches` identical searches (the first is new) and new reads for the rest.
  const g6 = (searches: number) => [...seenFive, ...times(20, (i) => (i < searches ? call('search_notes', { query: 'k' }, ['DocumentReference/d1']) : call('fhir_read', { id: `n-${i}` }, [`Observation/n-${i}`])))];
  const loops: Record<string, EventBody[]> = {
    'g3 re-reads of the same five ids, a free-text field varied, one new id': [...seenFive, ...times(19, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`])), ...call('fhir_read', { id: 'o-new' }, ['Observation/o-new'])],
    'g4 the same re-reads, no new id': [...seenFive, ...times(20, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`]))],
    'g5 a write loop on one target, only the note text varied': [...seenFive, ...times(25, (i) => call('write_note', { text: `note ${i}` }, [], [`DocumentReference/w-${i}`]))],
    'g6 at share 0.5 (11 identical searches)': g6(11),
    'G10 hold/continue/stop/modify cycled on one order': [...seenFive, ...times(25, (i) => call('change_medication', { medication_request: 'mr-1', action: ['hold', 'continue', 'stop', 'modify'][i % 4], reason: 'r' }, [], ['MedicationRequest/mr-1', `Provenance/p${i}`]))],
  };
  const padding: Record<string, EventBody[]> = {
    'g1 25 reads of distinct never-seen ids': [...seenFive, ...times(25, (i) => call('fhir_read', { id: `junk-${i}` }, [`Observation/junk-${i}`]))],
    'g2 one search paged 25 times (declared offset)': [...seenFive, ...times(25, (i) => call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', offset: i * 10 }, [`Observation/p-${i}`]))],
    'g6 at share 0.45 (10 identical searches)': g6(10),
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
    expect(progress(loops['g6 at share 0.5 (11 identical searches)']!)).toMatchObject({ repeats: 10, repeat_share: 0.5 });
    expect(progress(padding['g6 at share 0.45 (10 identical searches)']!)).toMatchObject({ repeats: 9, repeat_share: 0.45 });
    expect(progress(loops['G10 hold/continue/stop/modify cycled on one order']!)).toMatchObject({ repeats: 20 });
    for (const id of ['g1 25 reads of distinct never-seen ids', 'g2 one search paged 25 times (declared offset)', 'G8 the same task on one patient, due date varied', 'G11 one search, the code varied over codes with no hits']) expect(progress(padding[id]!).repeats).toBe(0);
  });
});
