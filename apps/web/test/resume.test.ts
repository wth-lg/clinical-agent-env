// The cost of the calls a reload cut off (verifier-phase-P15-2 D3): the tab ledger's settles for
// the trial, each orphan at its worst case, beyond the loop total its kept events reach.
import { describe, expect, it } from 'vitest';
import type { TrialEvent } from '../../../packages/core/events.ts';
import type { LedgerRow } from '../../../packages/core/ledger.ts';
import { cutOffUsd } from '../src/live/resume.ts';

const settle = (trial: string, cost_usd: number, call_id = `c-${cost_usd}`): LedgerRow => ({
  ts: 't', call_id, kind: 'settle', source: 'browser', run_id: null, batch_id: 'b', trial, usage: null, cost_usd,
});
const usage = (cost_usd: number) => ({ type: 'usage', cost_usd }) as unknown as TrialEvent;
const finalHash = { type: 'state_hash', at: 'final' } as unknown as TrialEvent;

describe('cutOffUsd', () => {
  it('is what the ledger settled for the trial beyond the kept loop total', () => {
    const rows = [settle('t1', 0.0112), settle('t1', 0.0224), settle('t1', 1.5, 'orphan'), settle('t2', 9), settle('validate', 0.011)];
    expect(cutOffUsd(rows, 't1', [usage(0.0112), usage(0.0336)])).toBeCloseTo(1.5, 9);
  });

  it('is 0 when nothing was cut off, and for a new trial', () => {
    expect(cutOffUsd([settle('t1', 0.0112)], 't1', [usage(0.0112)])).toBe(0);
    expect(cutOffUsd([], 't1', [])).toBe(0);
  });

  it('is 0 once the loop had ended: what a reload cuts off then is a judge call, not the loop', () => {
    expect(cutOffUsd([settle('t1', 0.0112), settle('t1', 0.2, 'judge')], 't1', [usage(0.0112), finalHash])).toBe(0);
  });
});
