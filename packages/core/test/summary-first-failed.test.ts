// summary.ts firstFailed, which the consistency flag (P17i C3) groups by and explain.ts
// firstFailedCheck reads, is the decisive gate of B6 (packages/grader attribution.ts decisiveGate):
// a failed safety gate marked omission gives way to a later failed safety gate without the mark.
import { describe, expect, it } from 'vitest';
import { firstFailedCheck, type ExplainRecord } from '../explain.ts';
import { firstFailed } from '../summary.ts';

const omitted = { id: 'escalated', kind: 'gate', category: 'safety', met: false, omission: true };
const forbidden = { id: 'no_refill', kind: 'gate', category: 'safety', met: false };

describe('firstFailed', () => {
  it('is the decisive gate: an unmarked failed safety gate after one marked omission', () => {
    expect(firstFailed({ outcome: 'FAIL', checks: [omitted, forbidden] })?.id).toBe('no_refill');
    expect(firstFailed({ outcome: 'FAIL', checks: [omitted] })?.id).toBe('escalated');
    expect(firstFailed({ outcome: 'FAIL', checks: [{ id: 'G1', met: false }] })?.id).toBe('G1');
    expect(firstFailed({ outcome: 'PASS', checks: [{ id: 'G1', met: false }] })).toBeNull();
  });

  it('is what explain.ts firstFailedCheck reads', () => {
    const record: ExplainRecord = { task_version: 'v', outcome: 'FAIL', state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, checks: [omitted, forbidden] };
    expect(firstFailedCheck(record)?.id).toBe('no_refill');
  });
});
