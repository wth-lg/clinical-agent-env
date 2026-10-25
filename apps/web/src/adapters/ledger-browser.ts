// The tab's ledger: a LedgerStore kept in this tab's sessionStorage (no file; spend is not a
// secret, and the rows hold no key and no prompt, only ids, token counts and dollars) over the
// core ledger, admitted so its grants can build a MessagesClient. A reload keeps the spend: rows
// are read back on load, and a call or batch an earlier page left open is closed as spent at its
// worst case, since that page can no longer settle it and the API may still bill it.
// Browser-direct calls meter through it; its caps are the core's PROJECTED_CAP_USD and
// ACTUAL_CAP_USD, and the tighter session cap is checked in spend/ before each batchStart.
// A browser-direct trial runs in a Worker, which has no sessionStorage and cannot use a grant the
// page minted (grants are capabilities of the realm that made them). Its client comes from
// memoryLedger: an in-memory LedgerStore in the Worker's memory (no file, gone with the Worker),
// seeded with the tab's rows and opened with sessionCeiling, so the session cap is its projected
// and actual ceiling. Each append is reported (onAppend), and the page ingests the reserve and
// settle rows into the tab ledger as they happen, so a reload still counts what the Worker spent.
import { MessagesClient, type ClientOptions } from '../../../../packages/core/anthropic.ts';
import { ACTUAL_CAP_USD, admitStore, createLedger, parseRow, PROJECTED_CAP_USD, type Ledger, type LedgerRow, type LedgerStore, type SpendCeiling } from '../../../../packages/core/ledger.ts';

export const LEDGER_KEY = 'clinenv.ledger';

const session = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

function load(storage: Storage | null): LedgerRow[] {
  try {
    const rows = JSON.parse(storage?.getItem(LEDGER_KEY) ?? '[]') as unknown;
    return Array.isArray(rows) ? rows.map(parseRow) : [];
  } catch {
    return [];
  }
}

// Settle rows at the reserved worst case for calls no settle followed, and close rows for
// batches no close followed: every one of them belongs to a page that is gone.
export function closeOrphans(rows: readonly LedgerRow[], now: string): LedgerRow[] {
  const settled = new Set(rows.filter((r) => r.kind === 'settle').map((r) => r.call_id));
  const closed = new Set(rows.filter((r) => r.kind === 'close').map((r) => r.batch_id));
  const reason = 'left open by an earlier page in this tab: counted at its worst case';
  const base = { ts: now, source: 'browser' as const, run_id: null, usage: null };
  const append: LedgerRow[] = [];
  for (const r of rows) {
    if (r.kind === 'reserve' && !settled.has(r.call_id)) {
      settled.add(r.call_id);
      append.push({ ...base, call_id: r.call_id, kind: 'settle', batch_id: r.batch_id, trial: r.trial, cost_usd: r.cost_usd, reason });
    } else if (r.kind === 'open' && !closed.has(r.batch_id)) {
      closed.add(r.batch_id);
      append.push({ ...base, call_id: `close:${r.batch_id}`, kind: 'close', batch_id: r.batch_id, trial: null, cost_usd: 0, reason });
    }
  }
  return append;
}

// fn runs synchronously inside transact, so in one JavaScript thread no other transaction can
// interleave with it: that is the lock. Each transaction writes the rows through to storage.
class TabStore implements LedgerStore {
  readonly #rows: LedgerRow[];
  readonly #storage: Storage | null;
  constructor(storage: Storage | null, now: string) {
    this.#storage = storage;
    this.#rows = load(storage);
    this.#append(closeOrphans(this.#rows, now));
  }
  #append(rows: LedgerRow[]): void {
    if (rows.length === 0) return;
    this.#rows.push(...rows);
    try {
      this.#storage?.setItem(LEDGER_KEY, JSON.stringify(this.#rows));
    } catch {
      // storage full or blocked: the rows still meter this page
    }
  }
  async transact<T>(fn: (rows: readonly LedgerRow[]) => { append: LedgerRow[]; result: T }): Promise<T> {
    const { append, result } = fn(this.#rows);
    this.#append(append);
    return result;
  }
  async read(): Promise<LedgerRow[]> {
    return [...this.#rows];
  }
}

const browserLedger = (store: LedgerStore, now: () => string, host: string): Ledger => {
  admitStore(store);
  return createLedger({
    store,
    clock: { now },
    newId: () => crypto.randomUUID(),
    source: 'browser',
    runId: null,
    pid: 0,
    host,
    // Only the tab's own grants close its batches.
    isAlive: () => true,
  });
};

let tab: { ledger: Ledger; store: TabStore } | undefined;

function opened() {
  if (tab === undefined) {
    const now = () => new Date().toISOString();
    const store = new TabStore(session(), now());
    tab = { ledger: browserLedger(store, now, 'tab'), store };
  }
  return tab;
}

export const tabLedger = (): Ledger => opened().ledger;

// The tab ledger's rows: what a Worker's memoryLedger starts from.
export const tabRows = (): Promise<LedgerRow[]> => opened().store.read();

// The session cap as a ledger ceiling over every browser row, never above the core caps.
export const sessionCeiling = (cap: number): SpendCeiling => ({ usd: Math.min(cap, PROJECTED_CAP_USD, ACTUAL_CAP_USD), scope: () => true, what: 'session cap' });

// Rows in this realm's memory only, starting from `rows`; onAppend sees each transaction's rows.
class MemoryStore implements LedgerStore {
  readonly #rows: LedgerRow[];
  readonly #onAppend: (rows: LedgerRow[]) => void;
  constructor(rows: readonly LedgerRow[], onAppend: (rows: LedgerRow[]) => void) {
    this.#rows = rows.map(parseRow);
    this.#onAppend = onAppend;
  }
  async transact<T>(fn: (rows: readonly LedgerRow[]) => { append: LedgerRow[]; result: T }): Promise<T> {
    const { append, result } = fn(this.#rows);
    if (append.length > 0) {
      this.#rows.push(...append);
      this.#onAppend(append);
    }
    return result;
  }
  async read(): Promise<LedgerRow[]> {
    return [...this.#rows];
  }
}

export function memoryLedger(opts: { rows?: readonly LedgerRow[]; onAppend?: (rows: LedgerRow[]) => void } = {}): Ledger {
  return browserLedger(new MemoryStore(opts.rows ?? [], opts.onAppend ?? (() => {})), () => new Date().toISOString(), 'worker');
}

// The model a browser trial asks for: run() refuses any other, and apps/web/src outside the
// adapters imports nothing from anthropic.ts (lint: no-loop-outside-core).
export { MODEL } from '../../../../packages/core/anthropic.ts';

// The Messages client of a grant this adapter's ledger minted.
export const grantClient = (opts: ClientOptions): MessagesClient => new MessagesClient(opts);
