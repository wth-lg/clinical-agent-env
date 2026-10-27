// The one M1-M4 rule (decisions.tsv 2026-10-29T21:00): a failure is confirmed on M1-M4 when each is
// met or does not apply (n/a: M1 on a failure with no failed gate check), as explainTrial's
// confirmation reads it. cli/audit-check.ts's fault box and the web fault box both use it.
import { describe, expect, it } from 'vitest';
import { m1ToM4Met, type CriterionRow } from '../explain.ts';

const rows = (m1: CriterionRow['met'], rest: CriterionRow['met'] = true): CriterionRow[] =>
  [['M1', m1], ['M2', rest], ['M3', rest], ['M4', rest], ['M5', 'pending']].map(([id, met]) => ({ id: id as string, met: met as CriterionRow['met'], evidence: '' }));

describe('m1ToM4Met', () => {
  it('holds when M1-M4 are met or n/a, whatever M5 says', () => {
    expect(m1ToM4Met(rows(true))).toBe(true);
    expect(m1ToM4Met(rows('n/a'))).toBe(true);
  });
  it('fails on a pending or a not met M1-M4, or a missing one', () => {
    expect(m1ToM4Met(rows('pending'))).toBe(false);
    expect(m1ToM4Met(rows(false))).toBe(false);
    expect(m1ToM4Met(rows(true, 'pending'))).toBe(false);
    expect(m1ToM4Met(rows(true).filter((c) => c.id !== 'M3'))).toBe(false);
  });
});
