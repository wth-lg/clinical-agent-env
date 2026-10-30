// Rule P-L (packages/grader/progress.ts, plan-amendment-worklist "Attribution rule for stops"):
// whether a trial that reached a turn, cost or working-time cap was still making progress or
// looping, from its trajectory alone. Calls compare on what they target (tool and input without
// free text or paging), so a varied note or a growing offset is the same call. Looping: in the
// tail (the last 20 executed calls), half or more of the calls repeat an earlier call's target, or
// the tail found fewer new ids than a quarter of its length (5 of 20). An id the call's own input
// names (a read of an id the model supplied) is not found, and a repeated call finds nothing, so
// a repeated write is not progress. Padding probes g1-g7 (verifier-phase-P17i-W0-A-1 F3) read as
// looping. Calibration (W0-A gate): every pilot-1 and pilot-2 trajectory truncated at 50%, 75% and
// 90% of its turns reads as progressing.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventBody, TrialEvent } from '../../core/events.ts';
import { LOOP_REPEAT_SHARE, MIN_NEW_SHARE, minNewIds, progress, PROGRESS_TAIL } from '../progress.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';

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
  it('uses the last 20 executed calls, a 0.5 repeat share and new ids from a quarter of the tail', () => {
    expect(PROGRESS_TAIL).toBe(20);
    expect(LOOP_REPEAT_SHARE).toBe(0.5);
    expect(MIN_NEW_SHARE).toBe(0.25);
    expect([minNewIds(20), minNewIds(19), minNewIds(4), minNewIds(1), minNewIds(0)]).toEqual([5, 5, 1, 1, 1]);
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

  it('20 distinct calls that only re-read ids an earlier result exposed are looping (0 new ids)', () => {
    const seen = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const reread = times(20, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/o-${i % 10}`]));
    const p = progress([...seen, ...reread]);
    expect(p).toMatchObject({ tail: 20, repeats: 0, new_ids: 0, looping: true });
  });

  // A search finds the ids it lists; reading one of them afterwards finds nothing new, but is no repeat.
  const searchThenRead = (k: number) => times(k, (i) => (i % 2 === 0
    ? call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', code: `c-${i}` }, [`Observation/o-${i}a`, `Observation/o-${i}b`])
    : call('fhir_read', { resource_type: 'Observation', id: `o-${i - 1}a` }, [`Observation/o-${i - 1}a`])));

  it('searches that list new ids, and reads of what they found, are progressing', () => {
    expect(progress(searchThenRead(30))).toMatchObject({ tail: 20, repeats: 0, new_ids: 20, looping: false });
  });

  it('a read finds no id its own input names: 20 reads of ids no result showed are looping', () => {
    const p = progress(times(25, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`])));
    expect(p).toMatchObject({ tail: 20, repeats: 0, new_ids: 0, looping: true });
    // A bare id or Type/id in the input names the same resource.
    expect(progress(call('fhir_read', { id: 'Observation/o-1' }, ['Observation/o-1', 'Patient/pt-1']))).toMatchObject({ new_ids: 1 });
  });

  it('calls compare on their target: free text and paging do not make a call new', () => {
    const a = call('search_notes', { patient: 'pt-1', query: 'k', count: 5, offset: 0 }, ['DocumentReference/n-1']);
    const b = call('search_notes', { patient: 'pt-1', query: 'k', count: 10, offset: 5, sort: 'date' }, ['DocumentReference/n-2']);
    expect(progress([...a, ...b])).toMatchObject({ repeats: 1 });
    const n1 = call('write_note', { patient: 'pt-1', type: 'progress', title: 'A', text: 'one', cites: ['Observation/o-1'] }, [], ['DocumentReference/w-1']);
    const n2 = call('write_note', { patient: 'pt-1', type: 'progress', title: 'B', text: 'two', cites: ['Observation/o-1'] }, [], ['DocumentReference/w-2']);
    expect(progress([...n1, ...n2])).toMatchObject({ repeats: 1, new_ids: 1 });
    // A search key (query, code) is not free text: another query is another call.
    expect(progress([...a, ...call('search_notes', { patient: 'pt-1', query: 'potassium' }, ['DocumentReference/n-3'])])).toMatchObject({ repeats: 0 });
  });

  it('a write with a new target counts its written ids; the same write again counts none', () => {
    const seen = times(20, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const found = times(15, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/x-${i}`]));
    const write = (i: number) => call('order_service', { patient: 'pt-1', code: `L-${i}`, reason: `r ${i}` }, [], [`ServiceRequest/sr-${i}`, `Provenance/pv-${i}`]);
    expect(progress([...seen, ...found, ...write(1), ...write(2)].slice(-40))).toMatchObject({ tail: 20, repeats: 0, looping: false });
    const again = times(2, () => call('order_service', { patient: 'pt-1', code: 'L-1', reason: 'again' }, [], ['ServiceRequest/sr-9', 'Provenance/pv-9']));
    expect(progress([...seen, ...write(1), ...again, ...times(18, (i) => call('fhir_search', { code: `d-${i}` }, [`Observation/o-${i}`]))])).toMatchObject({ tail: 20, repeats: 2, new_ids: 0, looping: true });
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

  it('a trajectory with no executed call has an empty tail and no new id: looping', () => {
    expect(progress([])).toMatchObject({ tail: 0, repeats: 0, repeat_share: 0, new_ids: 0, looping: true });
  });
});

// The padding probes of verifier-phase-P17i-W0-A-1 F3 (evidence 04-adversarial-probes.test.ts):
// a model that pads its tail to look busy reads as looping. g4 and g7 are the controls.
describe('rule P-L against padding', () => {
  const seenFive = times(5, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
  const probes: Record<string, EventBody[]> = {
    g1: [...seenFive, ...times(25, (i) => call('fhir_read', { id: `junk-${i}` }, [`Observation/junk-${i}`]))],
    g2: [...seenFive, ...times(25, (i) => call('fhir_search', { resource_type: 'Observation', patient: 'pt-1', offset: i * 10 }, [`Observation/p-${i}`]))],
    g3: [...seenFive, ...times(19, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`])), ...call('fhir_read', { id: 'o-new' }, ['Observation/o-new'])],
    g4: [...seenFive, ...times(20, (i) => call('fhir_read', { id: `o-${i % 5}`, why: `again ${i}` }, [`Observation/o-${i % 5}`]))],
    g5: [...seenFive, ...times(25, (i) => call('write_note', { text: `note ${i}` }, [], [`DocumentReference/w-${i}`]))],
    g6: [...seenFive, ...times(20, (i) => (i % 2 === 0 && i < 18 ? call('search_notes', { query: 'k' }, ['DocumentReference/d1']) : call('fhir_read', { id: `n-${i}` }, [`Observation/n-${i}`])))],
    g7: [...seenFive, ...times(20, (i) => call('order_service', { code: `x${i}` }))],
  };

  it.each(Object.keys(probes))('%s reads as looping', (id) => {
    expect(progress(probes[id]!)).toMatchObject({ tail: 20, looping: true });
  });

  it('g2 and g5 repeat one target; g1, g3 and g6 find under 5 new ids', () => {
    expect(progress(probes.g2!)).toMatchObject({ repeats: 20 });
    expect(progress(probes.g5!)).toMatchObject({ repeats: 20, new_ids: 0 });
    expect(progress(probes.g1!).new_ids).toBe(0);
    expect(progress(probes.g3!)).toMatchObject({ repeats: 19, new_ids: 0 });
    expect(progress(probes.g6!)).toMatchObject({ repeats: 8, new_ids: 1 });
  });
});

// Calibration on the committed pilots: a cap reached during any of these trajectories would read
// as progressing. The thresholds change here (in W0-A), never later.
describe('rule P-L calibration on pilot-1 and pilot-2', () => {
  const files = ['results/pilot-1', 'results/pilot-2'].flatMap((run) => {
    const dir = join(repoRoot, run, 'trajectories');
    return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => join(e.parentPath, e.name));
  });

  it('reads 66 committed trajectories (18 pilot-1, 48 pilot-2)', () => {
    expect(files).toHaveLength(66);
  });

  it('every trajectory truncated at 50%, 75% and 90% of its turns reads as progressing', () => {
    const looping: string[] = [];
    for (const file of files) {
      const events = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as TrialEvent);
      const turns = Math.max(...events.map((e) => e.turn));
      for (const frac of [0.5, 0.75, 0.9]) {
        const p = progress(events.filter((e) => e.turn <= Math.floor(frac * turns)));
        if (p.looping) looping.push(`${file.slice(repoRoot.length + 1)} at ${frac * 100}%: ${JSON.stringify(p)}`);
      }
    }
    expect(looping).toEqual([]);
  });
});
