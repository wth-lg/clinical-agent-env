// The tab ledger: an admitted store whose grants build a MessagesClient, records browser rows
// (in sessionStorage when the tab has it; Node has none), enforces the core caps, and on load
// closes what an earlier page left open at its worst case.
import { describe, expect, it } from 'vitest';
import { MessagesClient } from '../../../packages/core/anthropic.ts';
import { ACTUAL_CAP_USD, assertGrant, PROJECTED_CAP_USD, SpendRefused, totals, type LedgerRow } from '../../../packages/core/ledger.ts';
import { closeOrphans, memoryLedger, sessionCeiling, tabLedger } from '../src/adapters/ledger-browser.ts';

describe('tabLedger', () => {
  it('is one ledger per tab whose grants pass assertGrant and build a MessagesClient', async () => {
    const ledger = tabLedger();
    expect(tabLedger()).toBe(ledger);
    const grant = await ledger.batchStart(0.05);
    expect(() => assertGrant(grant, ledger)).not.toThrow();
    expect(() => new MessagesClient({ grant, ledger, apiKey: 'test-key', fetch: async () => new Response(null, { status: 500 }) })).not.toThrow();
    await grant.close();
  });

  it('records browser rows in memory and settles a call', async () => {
    const ledger = tabLedger();
    const before = (await ledger.totals()).settled;
    const grant = await ledger.batchStart(0.05);
    const res = await grant.reserve({ bodyBytes: 100, maxTokens: 16 });
    await grant.settle(res, { input_tokens: 1000, output_tokens: 10 });
    await grant.close();
    const t = await ledger.totals();
    expect(t.settled - before).toBeCloseTo(0.0042, 6);
    expect(t.reserved).toBe(0);
    expect(t.open).toEqual([]);
  });

  it('refuses a batch past the core projected cap', async () => {
    await expect(tabLedger().batchStart(PROJECTED_CAP_USD + 1)).rejects.toBeInstanceOf(SpendRefused);
  });
});

describe('closeOrphans', () => {
  const row = (r: Partial<LedgerRow> & Pick<LedgerRow, 'kind' | 'call_id'>): LedgerRow => ({
    ts: 't0', source: 'browser', run_id: null, batch_id: 'b1', trial: 'validate', usage: null, cost_usd: 0, ...r,
  });

  it('settles a reservation an earlier page left open at its worst case, and closes its batch', () => {
    const rows = [row({ kind: 'open', call_id: 'open:b1', projection: 0.04 }), row({ kind: 'reserve', call_id: 'c1', cost_usd: 0.034 })];
    const added = closeOrphans(rows, 't1');
    expect(added.map((r) => [r.kind, r.call_id, r.cost_usd])).toEqual([['close', 'close:b1', 0], ['settle', 'c1', 0.034]]);
    const t = totals([...rows, ...added]);
    expect([t.settled, t.reserved, t.open]).toEqual([0.034, 0, []]);
    expect(closeOrphans([...rows, ...added], 't2')).toEqual([]);
  });

  it('adds nothing for settled calls and closed batches', () => {
    const rows = [
      row({ kind: 'open', call_id: 'open:b1', projection: 0.04 }), row({ kind: 'reserve', call_id: 'c1', cost_usd: 0.034 }),
      row({ kind: 'settle', call_id: 'c1', cost_usd: 0.02 }), row({ kind: 'close', call_id: 'close:b1' }),
    ];
    expect(closeOrphans(rows, 't1')).toEqual([]);
  });
});

describe('sessionCeiling and memoryLedger (browser-direct trials)', () => {
  it('starts a batch whose projection is the session cap minus $0.01, and grants none at the cap plus $0.01', async () => {
    const cap = 5;
    const ledger = memoryLedger();
    const under = await ledger.batchStart(cap - 0.01, sessionCeiling(cap));
    await under.close();
    await expect(memoryLedger().batchStart(cap + 0.01, sessionCeiling(cap))).rejects.toMatchObject({ name: 'SpendRefused', cap: 'ceiling' });
  });

  it('counts the rows it is seeded with against the session cap', async () => {
    const seed: LedgerRow[] = [
      { ts: 't0', call_id: 'c1', kind: 'reserve', source: 'browser', run_id: null, batch_id: 'b0', trial: 't', usage: null, cost_usd: 3 },
      { ts: 't0', call_id: 'c1', kind: 'settle', source: 'browser', run_id: null, batch_id: 'b0', trial: 't', usage: null, cost_usd: 3 },
    ];
    await expect(memoryLedger({ rows: seed }).batchStart(2.01, sessionCeiling(5))).rejects.toBeInstanceOf(SpendRefused);
    await (await memoryLedger({ rows: seed }).batchStart(2, sessionCeiling(5))).close();
  });

  it('never sets a ceiling above the core caps', () => {
    expect(sessionCeiling(PROJECTED_CAP_USD + 100).usd).toBe(PROJECTED_CAP_USD);
    expect(sessionCeiling(PROJECTED_CAP_USD + 100).usd).toBeLessThanOrEqual(ACTUAL_CAP_USD);
  });

  it('keeps rows in memory only, reports each append, and its grants build a MessagesClient', async () => {
    const appended: LedgerRow[] = [];
    const ledger = memoryLedger({ onAppend: (rows) => appended.push(...rows) });
    const grant = await ledger.batchStart(0.05, sessionCeiling(1));
    expect(() => new MessagesClient({ grant, ledger, apiKey: 'test-key', fetch: async () => new Response(null, { status: 500 }) })).not.toThrow();
    const res = await grant.reserve({ bodyBytes: 100, maxTokens: 16 });
    await grant.settle(res, { input_tokens: 1000, output_tokens: 10 });
    await grant.close();
    expect(appended.map((r) => r.kind)).toEqual(['open', 'reserve', 'settle', 'close']);
    expect(appended.every((r) => r.source === 'browser')).toBe(true);
  });
});
