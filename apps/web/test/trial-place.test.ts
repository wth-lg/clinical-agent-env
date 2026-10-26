// "Trial i of n" in the trial heading (pre-audit M8, P17j JU11; verifier-phase-P17i-JU4JU11-1 S4,
// m1): i is the trial's place among the run's trials of the same task, model and effort, ordered by
// the record's index, or for a run-one record (no index) by the number its name ends in.
import { describe, expect, it } from 'vitest';
import { trialPlace } from '../src/trial/place.ts';

const trial = (name: string, record: { index?: number; model_requested?: string; effort?: string }, task = 'renal-dose-review') => ({ name, task, record });

describe('trialPlace', () => {
  it('orders a sparse batch by index, whatever the list order', () => {
    const ts = [12, 11, 5, 4, 0].map((i) => trial(`renal-dose-review/${i}`, { index: i }));
    expect(trialPlace(ts[2]!, ts)).toEqual({ i: 3, n: 5 });
    expect(trialPlace(ts[1]!, ts)).toEqual({ i: 4, n: 5 });
  });
  it('orders run-one records by the number their name ends in, not as strings', () => {
    const ts = Array.from({ length: 12 }, (_, k) => k + 1).sort((a, b) => String(a).localeCompare(String(b))).map((k) => trial(`renal-dose-review/high/live/${k}`, {}));
    expect(trialPlace(ts.find((t) => t.name.endsWith('/2'))!, ts)).toEqual({ i: 2, n: 12 });
    expect(trialPlace(ts.find((t) => t.name.endsWith('/10'))!, ts)).toEqual({ i: 10, n: 12 });
  });
  it('counts only the trials of the same task, model and effort', () => {
    const ts = [
      trial('renal-dose-review/low/live/1', { model_requested: 'm', effort: 'low' }),
      trial('renal-dose-review/low/live/2', { model_requested: 'm', effort: 'low' }),
      trial('renal-dose-review/high/live/1', { model_requested: 'm', effort: 'high' }),
      trial('renal-dose-review/high/live/2', { model_requested: 'm', effort: 'high' }),
      trial('renal-dose-review/other/live/3', { model_requested: 'x', effort: 'low' }),
      trial('crc-care-gap/low/live/1', { model_requested: 'm', effort: 'low' }, 'crc-care-gap'),
    ];
    expect(trialPlace(ts[1]!, ts)).toEqual({ i: 2, n: 2 });
    expect(trialPlace(ts[2]!, ts)).toEqual({ i: 1, n: 2 });
    expect(trialPlace(ts[4]!, ts)).toEqual({ i: 1, n: 1 });
  });
  it('is null for a trial not in the list', () => {
    expect(trialPlace(trial('renal-dose-review/3', { index: 3 }), [trial('renal-dose-review/0', { index: 0 })])).toBeNull();
  });
});
