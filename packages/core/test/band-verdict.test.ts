// The verdict in words (plan-amendment-w4 PW4-F, F-1): bandVerdict(k, n) is the one definition the
// CLI, the result card and the UI read, so they can never disagree. In band when FINAL_PASS_BAND[0]
// <= k/n <= FINAL_PASS_BAND[1]; Saturated when the Wilson 95% lower bound is above the band's top;
// Above band otherwise above it; Below band under the band's bottom; null with no valid trials.
// summary.json carries it per task as band_verdict, and a value that is not bandVerdict of the
// task's passes and trials does not validate.
import { describe, expect, it } from 'vitest';
import { MODEL } from '../anthropic.ts';
import { FINAL_PASS_BAND } from '../cost.ts';
import { BAND_VERDICT_RULE, BAND_VERDICTS, bandVerdict, summarize, validateSummary, wilson, type SummaryTrial } from '../summary.ts';

const trial = (task_id: string, index: number, outcome: string): SummaryTrial => ({
  task_id, task_version: 'v1', index, outcome, model_requested: MODEL, models_returned: [MODEL],
  state_hash: { initial: 'h0', final: 'h1', replay_final: 'h1' }, tool_errors: { INTERNAL: 0 }, cost_usd: 0.5, score: outcome === 'PASS' ? 1 : 0,
});
const run = (passes: number, n: number, task = 't') => Array.from({ length: n }, (_, i) => trial(task, i, i < passes ? 'PASS' : 'FAIL'));

describe('bandVerdict', () => {
  it('reads the plan cases of 20 trials', () => {
    expect(bandVerdict(4, 20)).toBe('In band');
    expect(bandVerdict(14, 20)).toBe('In band');
    expect(bandVerdict(15, 20)).toBe('Above band');
    expect(bandVerdict(16, 20)).toBe('Above band');
    expect(bandVerdict(19, 20)).toBe('Saturated');
    expect(bandVerdict(20, 20)).toBe('Saturated');
    expect(bandVerdict(3, 20)).toBe('Below band');
    expect(bandVerdict(0, 20)).toBe('Below band');
  });

  it('Saturated is exactly a Wilson lower bound above the top of the band', () => {
    for (let n = 1; n <= 40; n++) {
      for (let k = 0; k <= n; k++) {
        const v = bandVerdict(k, n);
        const lo = wilson(k, n)!.lo;
        expect(v === 'Saturated', `${k}/${n}`).toBe(lo > FINAL_PASS_BAND[1]);
        if (k / n > FINAL_PASS_BAND[1]) expect(['Saturated', 'Above band'], `${k}/${n}`).toContain(v);
        else if (k / n >= FINAL_PASS_BAND[0]) expect(v, `${k}/${n}`).toBe('In band');
        else expect(v, `${k}/${n}`).toBe('Below band');
      }
    }
    // 6/6 of probe-1: rate 1.00 but Wilson [0.61, 1.00], so not yet saturated.
    expect(bandVerdict(6, 6)).toBe('Above band');
    // n/n is saturated from n = 9 (lower bound n / (n + z²)): 8/8 is 0.676, 9/9 is 0.701.
    expect(bandVerdict(8, 8)).toBe('Above band');
    expect(bandVerdict(9, 9)).toBe('Saturated');
  });

  it('has no verdict without valid trials, and rejects counts that are not counts', () => {
    expect(bandVerdict(0, 0)).toBeNull();
    expect(() => bandVerdict(3, 2)).toThrow();
    expect(() => bandVerdict(-1, 2)).toThrow();
    expect(() => bandVerdict(1.5, 2)).toThrow();
  });

  it('the rule names every verdict and the band in percent', () => {
    for (const v of BAND_VERDICTS) expect(BAND_VERDICT_RULE).toContain(v);
    expect(BAND_VERDICT_RULE).toContain(`${FINAL_PASS_BAND[0] * 100}%`);
    expect(BAND_VERDICT_RULE).toContain(`${FINAL_PASS_BAND[1] * 100}%`);
  });
});

describe('summary.json band_verdict', () => {
  const s = summarize({ run_id: 'bv', trials: [...run(4, 20, 'a'), ...run(19, 20, 'b'), ...run(3, 20, 'c'), ...run(15, 20, 'd')], requeued: [], replay: null });

  it('is bandVerdict of each task', () => {
    expect(Object.fromEntries(Object.entries(s.tasks).map(([id, t]) => [id, t.band_verdict]))).toEqual({ a: 'In band', b: 'Saturated', c: 'Below band', d: 'Above band' });
    expect(validateSummary(s)).toEqual([]);
  });

  it('a band_verdict that contradicts passes and trials does not validate', () => {
    const bad = { ...s, tasks: { ...s.tasks, a: { ...s.tasks.a!, band_verdict: 'Saturated' } } };
    expect(validateSummary(bad)).toContainEqual(expect.stringMatching(/^tasks\.a\.band_verdict: "Saturated", not .*In band/));
    const missing = { ...s, tasks: { ...s.tasks, a: Object.fromEntries(Object.entries(s.tasks.a!).filter(([k]) => k !== 'band_verdict')) } };
    expect(validateSummary(missing)).toContain('tasks.a.band_verdict: missing');
  });
});
