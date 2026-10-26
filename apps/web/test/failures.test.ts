// The helpers the JU7 views share (src/data/failures.ts, plan P17j JU7): the most common kind, on a
// tie the first in FAILURE_KINDS; a valid failure's audit filter; the M1-M4 count; and the run block
// with its false PASSes.
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { FAILURE_KINDS, type FaultCounts } from '../../../packages/core/summary.ts';
import { auditFilterOf, m1m4, mostCommon, runBlock } from '../src/data/failures.ts';

const fc = (counts: Partial<Record<(typeof FAILURE_KINDS)[number], number>>): FaultCounts => {
  const taxonomy = Object.fromEntries(FAILURE_KINDS.map((k) => [k, counts[k] ?? 0])) as FaultCounts['taxonomy'];
  return { failures: Object.values(taxonomy).reduce((a, b) => a + b, 0), taxonomy, label: null, infra_reruns: 0 };
};
const met = (ids: string[]) => ['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => ({ id, met: ids.includes(id) ? true : 'pending', evidence: '' }));
const e = (over: Partial<Explanation>): Explanation => ({ outcome: 'FAIL', valid: true, fault: 'model', deciding: null, notes: [], audit_label: null, criteria: met(['M1', 'M2', 'M3', 'M4']), ...over }) as unknown as Explanation;

describe('failures helpers', () => {
  it('mostCommon takes the largest count, the first kind on a tie, and is null with no failures', () => {
    expect(mostCommon(fc({ reasoning: 3, retrieval: 3, refusal: 1 }))).toEqual({ kind: 'retrieval', count: 3 });
    expect(mostCommon(fc({}))).toBeNull();
  });
  it('auditFilterOf files a valid failure by its audit label, else unlabelled; a PASS has none', () => {
    expect(auditFilterOf(e({ audit_label: 'grader' }))).toBe('grader');
    expect(auditFilterOf(e({ audit_label: null }))).toBe('unlabelled');
    expect(auditFilterOf(e({ outcome: 'PASS', fault: null }))).toBeNull();
  });
  it('m1m4 counts the valid failures with M1-M4 all met', () => {
    expect(m1m4([e({}), e({ criteria: met(['M1', 'M2', 'M3']) as never }), e({ outcome: 'PASS' })])).toEqual({ met: 1, failures: 2 });
  });
  it('runBlock is null for a run with no block, and names the false PASS', () => {
    expect(runBlock([{ name: 't/1', explanation: e({}) }])).toBeNull();
    const falsePass = e({ outcome: 'PASS', fault: 'grader', deciding: { fault: 'grader', id: 'GR5', evidence: '' } });
    expect(runBlock([{ name: 't/1', explanation: e({}) }, { name: 't/0', explanation: falsePass }])).toEqual({ trials: 1, falsePasses: 1, names: ['t/0'] });
  });
  it('a valid failure the audit labels environment or grader blocks it too (verifier-phase-P17i-JU7-1 S1)', () => {
    for (const audit_label of ['environment', 'grader'] as const) expect(runBlock([{ name: 't/5', explanation: e({ audit_label }) }])).toEqual({ trials: 1, falsePasses: 0, names: ['t/5'] });
    expect(runBlock([{ name: 't/5', explanation: e({ audit_label: 'model' }) }])).toBeNull();
  });
});
