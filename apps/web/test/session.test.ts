// The session spend store (P25c, Live trial should-fix): the meter and the launcher read one
// figure, from the surface's source (the tab ledger on the hosted site, the runner's session spend
// on the local runner), refreshed at load and after a trial, and set from a projection's committed.
import { describe, expect, it } from 'vitest';
import { refreshSpent, sessionSpend, setSpent, setSpentSource } from '../src/spend/session.ts';

describe('the session spend store', () => {
  it('starts from the tab ledger, which in Node holds nothing', async () => {
    expect(await refreshSpent()).toBe(0);
    expect(sessionSpend().spent).toBe(0);
  });

  it('reads the source it is given, as a reload on the local runner does', async () => {
    setSpentSource(async () => 5.71);
    expect(await refreshSpent()).toBe(5.71);
    expect(sessionSpend().spent).toBe(5.71);
  });

  it('keeps the last figure when the source fails, so the page still renders', async () => {
    setSpentSource(async () => {
      throw new Error('the runner did not answer');
    });
    expect(await refreshSpent()).toBe(5.71);
    expect(sessionSpend().spent).toBe(5.71);
  });

  it('takes the figure a projection carries', () => {
    setSpent(2.5);
    expect(sessionSpend().spent).toBe(2.5);
    expect(sessionSpend().cap).toBeGreaterThan(0);
  });
});
