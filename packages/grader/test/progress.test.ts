// Rule P-L (packages/grader/progress.ts, plan-amendment-worklist "Attribution rule for stops"):
// whether a trial that reached a turn, cost or working-time cap was still making progress or
// looping, from its trajectory alone. Looping: in the tail (the last 20 executed calls), half or
// more of the calls repeat an earlier call's tool and input, or the tail exposed no id that an
// earlier result had not, and wrote none. Calibration (W0-A gate): every pilot-1 and pilot-2
// trajectory truncated at 50%, 75% and 90% of its turns reads as progressing, and a synthetic tail
// that repeats one search, or re-reads only ids already seen, for 20 calls reads as looping.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventBody, TrialEvent } from '../../core/events.ts';
import { LOOP_REPEAT_SHARE, progress, PROGRESS_TAIL } from '../progress.ts';
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

  it('20 distinct calls that only re-read ids an earlier result exposed are looping (0 new ids)', () => {
    const seen = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const reread = times(20, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/o-${i % 10}`]));
    const p = progress([...seen, ...reread]);
    expect(p).toMatchObject({ tail: 20, repeats: 0, new_ids: 0, looping: true });
  });

  it('20 distinct calls that each expose a new id are progressing', () => {
    const p = progress(times(25, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`])));
    expect(p).toMatchObject({ tail: 20, repeats: 0, new_ids: 20, looping: false });
  });

  it('a write in the tail counts as a new id', () => {
    const seen = times(20, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const reread = times(19, (i) => call('fhir_search', { code: `c-${i}` }, [`Observation/o-${i}`]));
    const p = progress([...seen, ...reread, ...call('write_note', { text: 'x' }, [], ['DocumentReference/new-1'])]);
    expect(p).toMatchObject({ tail: 20, repeats: 0, new_ids: 1, looping: false });
    expect(progress([...seen, ...reread, ...call('fhir_search', { code: 'c-x' }, ['Observation/o-0'])])).toMatchObject({ new_ids: 0, looping: true });
  });

  it('a repeat share of exactly 0.5 is looping, under it is not', () => {
    const base = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const repeated = times(10, (i) => call('fhir_read', { id: `o-${i}` }, [`Observation/o-${i}`]));
    const fresh = (k: number) => times(k, (i) => call('fhir_read', { id: `x-${i}` }, [`Observation/x-${i}`]));
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
