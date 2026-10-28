import { describe, expect, it } from 'vitest';
import { clinicDate } from '../../grader/normalize.ts';
import { clock, eastern, NOW, NOW_DATE, NOW_MS, NOW_TIME } from '../clock.ts';

// eastern() writes an instant on the clinic's wall clock (America/New_York) with the offset in
// force at that instant: -04:00 under EDT, -05:00 under EST.
describe('eastern', () => {
  it('keeps the EDT form for the trial window', () => {
    expect(eastern(NOW_MS)).toBe(NOW);
    expect([NOW_DATE, NOW_TIME]).toEqual(['2026-10-23', '08:00']);
    expect(clock.stamp(1)).toBe('2026-10-23T08:00:01-04:00');
  });

  it('writes an EST instant with -05:00 and its local date', () => {
    expect(eastern(Date.parse('2026-12-31T23:30:00-05:00'))).toBe('2026-12-31T23:30:00-05:00');
    expect(eastern(Date.parse('2027-01-01T04:30:00Z'))).toBe('2026-12-31T23:30:00-05:00');
    expect(eastern(Date.parse('2027-01-01T05:30:00Z'))).toBe('2027-01-01T00:30:00-05:00');
    expect(eastern(Date.parse('2026-12-31T23:59:59.999-05:00'))).toBe('2026-12-31T23:59:59-05:00');
  });

  it('follows the 2026 transitions', () => {
    // EDT ends 2026-11-01 02:00 local (06:00Z); EST ends 2026-03-08 02:00 local (07:00Z).
    expect(eastern(Date.parse('2026-11-01T05:59:59Z'))).toBe('2026-11-01T01:59:59-04:00');
    expect(eastern(Date.parse('2026-11-01T06:00:00Z'))).toBe('2026-11-01T01:00:00-05:00');
    expect(eastern(Date.parse('2026-03-08T06:59:59Z'))).toBe('2026-03-08T01:59:59-05:00');
    expect(eastern(Date.parse('2026-03-08T07:00:00Z'))).toBe('2026-03-08T03:00:00-04:00');
  });

  it('round-trips to the same instant, to the second', () => {
    for (const s of ['1950-02-14T12:00:00Z', '2026-07-04T03:15:00Z', '2026-12-31T23:30:00-05:00', '2027-01-01T08:00:00+09:00']) {
      expect(Date.parse(eastern(Date.parse(s)))).toBe(Date.parse(s));
    }
  });

  it('gives clinicDate the local date in winter', () => {
    expect(clinicDate('2027-01-01T04:30:00Z')).toBe('2026-12-31');
    expect(clinicDate('2026-12-31T22:00:00-10:00')).toBe('2027-01-01');
  });
});
