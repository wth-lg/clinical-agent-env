// Attribution at the edges of the trial caps (R14-13, R14-14): a LIMIT says the model used its
// turns, its priced cost or its working time, never that the API stalled or the harness could
// not price a call. Each case runs the real loop through a real MessagesClient and an in-memory
// ledger, on a fake clock whose timers fire as it moves:
//   - a 429 storm past the hard elapsed bound ends INFRA_API (re-queued by batch.ts), with the
//     time lost to failed attempts and retry waits in retry_wait_ms
//   - a dropped attempt settled at its worst case stays in the ledger and the record's cost, but
//     the cap reads only priced usage, so it cannot end the trial LIMIT cost
//   - a usage the cost model cannot price ends INFRA_HARNESS
//   - an attempt whose stream goes idle fails after the idle-stream timeout and is retried
//   - a real turns, cost or working-time limit is still LIMIT, a model fault
// The cases are the lane A limit probe of verifier-phase-P17r-1 (evidence/verifier-P17r-1-laneA/
// limit.ts) turned into tests: on 6d9d66f the storm ended LIMIT wall_clock and the dropped
// attempt LIMIT cost, both labelled model.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { okResponse, sse, turnEvents, type MockTurn } from '../../../apps/web/src/harness/scenarios.ts';
import { MessagesClient, type ClientOptions, type MessageParams, type Transport } from '../anthropic.ts';
import { worstCaseUsd } from '../cost.ts';
import type { EventBody } from '../events.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { runLoop, type Caps } from '../loop.ts';
import { FAULT } from '../outcomes.ts';
import { run } from '../run.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import type { WriteContext } from '../../env/tools/write/index.ts';

class MemoryStore implements LedgerStore {
  rows: LedgerRow[] = [];
  async transact<T>(fn: (rows: readonly LedgerRow[]) => { append: LedgerRow[]; result: T }): Promise<T> {
    const { append, result } = fn(this.rows);
    this.rows.push(...append);
    return result;
  }
  async read(): Promise<LedgerRow[]> {
    return [...this.rows];
  }
}

// A clock in ms and the timers of `timeout`, which fire, in deadline order, as advance() moves it.
function fakeTime() {
  let t = 0;
  const timers: Array<{ at: number; c: AbortController }> = [];
  const fire = () => {
    for (const x of timers) if (x.at <= t && !x.c.signal.aborted) x.c.abort(new DOMException('timer', 'TimeoutError'));
  };
  return {
    now: () => t,
    timeout: (ms: number) => {
      const c = new AbortController();
      timers.push({ at: t + ms, c });
      fire();
      return c.signal;
    },
    advance: (ms: number) => {
      const end = t + ms;
      for (const at of timers.map((x) => x.at).filter((a) => a > t && a <= end).sort((a, b) => a - b)) {
        t = at;
        fire();
      }
      t = end;
      fire();
    },
  };
}

// The fault an ended trial's status is labelled with (COMPLETED is graded first, so it has none).
const fault = (status: string) => FAULT[status as keyof typeof FAULT];
const PARAMS: MessageParams = { max_tokens: 1000 };
const respond = (turn: MockTurn, n = 1) => okResponse(turn, n);
const tooMany = () => new Response('{"error":{"type":"rate_limit_error","message":"slow down"}}', { status: 429, headers: { 'retry-after': '30' } });
// A stream that ends after message_start: dropped, usage unknown, settled at the worst case.
const dropped = () => new Response(sse(turnEvents({ text: 'cut' }, 1).slice(0, 1)), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const toolUse = (n: number): MockTurn => ({ tools: [{ id: `toolu_${n}`, name: 'nope', input: {} }] });

async function clientOver(fetch: Transport, time: ReturnType<typeof fakeTime>, over: Partial<ClientOptions> = {}) {
  const store = new MemoryStore();
  admitStore(store);
  let id = 0;
  const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++id}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
  const grant = await ledger.batchStart(6);
  const client = new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch, sleep: async (ms) => time.advance(ms), random: () => 0, ...over });
  return { client, store };
}

async function loop(fetch: Transport, caps: Partial<Caps>, opts: { params?: MessageParams; client?: Partial<ClientOptions>; time?: ReturnType<typeof fakeTime> } = {}) {
  const time = opts.time ?? fakeTime();
  const { client, store } = await clientOver(fetch, time, opts.client);
  const events: EventBody[] = [];
  const out = await runLoop({
    client, params: opts.params ?? PARAMS, history: [{ role: 'user', content: 'x' }], tools: [], ctx: {} as WriteContext,
    caps: { maxTurns: 80, maxCostUsd: 5, maxWallMs: 50_000, maxElapsedMs: 100_000, ...caps },
    now: time.now, timeout: time.timeout, emit: (e) => events.push(e), stateHash: async () => 'h',
  });
  const settles = store.rows.filter((r) => r.kind === 'settle');
  return { out, events, settles, ledgerUsd: settles.reduce((a, r) => a + r.cost_usd, 0) };
}

describe('infrastructure never ends a trial LIMIT', () => {
  it('a 429 storm past the hard elapsed bound ends INFRA_API with the retry wait on the record', async () => {
    const time = fakeTime();
    // Each attempt takes 1 s and gets a 429 with retry-after 30 s.
    const { out } = await loop(async () => (time.advance(1000), tooMany()), {}, { time });
    expect(out.status).toBe('INFRA_API');
    expect(out.terminal).toMatchObject({ type: 'error', status: 'INFRA_API', code: 'elapsed_bound' });
    expect(fault(out.status)).toBe('infra');
    // Attempts at 0, 31, 62 and 93 s, each failing 1 s in; the bound fires 6 s into the fourth
    // wait, and the fake sleep finishes that wait before the abort lands: 4 x 1 s + 4 x 30 s.
    expect(out.retry_wait_ms).toBe(124_000);
    expect(out.api_retries).toBe(0);
    expect(out.turns).toBe(1);
  });

  it('run(): the storm ends the trial record INFRA_API elapsed_bound, fault infra, with retry_wait_ms', async () => {
    const root = new URL('../../../', import.meta.url);
    const time = fakeTime();
    const { client } = await clientOver(async () => (time.advance(1000), tooMany()), time);
    const { record } = await run('_toy', 'claude-opus-5-5', {
      tasks: nodeTaskSource({ testMode: true }), client,
      world: { read: async () => new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root))) },
      worldHash: (JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } }).world.state_hash,
      definitions: JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8')),
      now: time.now, timeout: time.timeout, maxWallMs: 50_000, maxElapsedMs: 100_000,
    });
    expect(record).toMatchObject({ status: 'INFRA_API', detail: 'elapsed_bound', outcome: 'INFRA_API', valid: false, fault: 'infra', retry_wait_ms: 124_000, api_retries: 0 });
  });

  it('a dropped attempt settled at its worst case stays in the ledger and the cost, and cannot end the trial LIMIT cost', async () => {
    // max_tokens 250,000 puts the worst case of one attempt just over $5.
    const params: MessageParams = { max_tokens: 250_000 };
    const steps = [dropped, () => respond(toolUse(1), 1), () => respond({ text: 'done' }, 2)];
    const { out, settles, ledgerUsd } = await loop(async () => steps.shift()!(), { maxCostUsd: 5 }, { params });
    const worst = settles.find((r) => r.usage === null)!;
    expect(worst.cost_usd).toBeGreaterThan(5);
    expect(worst.cost_usd).toBeCloseTo(worstCaseUsd({ bodyBytes: 1, maxTokens: 250_000 }), 1);
    expect(out.status).toBe('COMPLETED');
    expect(out.terminal).toBeNull();
    expect(out.turns).toBe(2);
    expect(out.api_retries).toBe(1);
    // The record's cost is still what the ledger settled, the worst case included.
    expect(out.cost_usd).toBeCloseTo(ledgerUsd, 9);
  });

  it('a usage the cost model cannot price ends INFRA_HARNESS, not LIMIT cost', async () => {
    const unpriced = () => {
      const events = turnEvents(toolUse(1), 1) as Array<{ type: string; message?: { usage: object } }>;
      events[0]!.message!.usage = { ...events[0]!.message!.usage, speed: 'warp' };
      return new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const { out, events } = await loop(async () => unpriced(), {});
    expect(out.status).toBe('INFRA_HARNESS');
    expect(out.terminal).toMatchObject({ type: 'error', status: 'INFRA_HARNESS', code: 'unpriced_usage' });
    expect(fault(out.status)).toBe('infra');
    // It ends on the response: the answer's tool calls do not run.
    expect(out.turns).toBe(1);
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(0);
  });

  it.each(['before-response', 'mid-stream'] as const)('an attempt idle past the idle-stream timeout (%s) fails as retryable and is retried', async (when) => {
    let n = 0;
    const stall: Transport = async () => {
      if (++n > 1) return respond({ text: 'done' });
      // Never answers, and ignores the request's signal: only the idle timeout ends it.
      if (when === 'before-response') return new Promise<Response>(() => {});
      const first = new TextEncoder().encode(sse(turnEvents({ text: 'x' }, 1).slice(0, 1)));
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(first) }), { status: 200 });
    };
    const lines: string[] = [];
    const { out, settles } = await loop(stall, {}, { client: { idleStreamMs: 20, log: (l) => lines.push(l) } });
    expect(out.status).toBe('COMPLETED');
    expect(out.api_retries).toBe(1);
    expect(settles.map((r) => r.usage === null)).toEqual([true, false]);
    expect(lines[0]).toMatch(/attempt 1: .*no data for 20 ms/);
  }, 5000);
});

describe('a real limit is still LIMIT, a model fault', () => {
  it('turns', async () => {
    let n = 0;
    const { out } = await loop(async () => respond(toolUse(++n), n), { maxTurns: 2 });
    expect(out.terminal).toMatchObject({ type: 'limit', limit: 'turns', cap: 2, value: 2 });
    expect(fault(out.status)).toBe('model');
  });

  it('cost, from priced usage', async () => {
    let n = 0;
    // 1,200 input and 310 output tokens: $0.0110 a turn.
    const { out } = await loop(async () => respond(toolUse(++n), n), { maxCostUsd: 0.02 });
    expect(out.terminal).toMatchObject({ type: 'limit', limit: 'cost', cap: 0.02 });
    expect((out.terminal as { value: number }).value).toBeCloseTo(0.0222, 4);
    expect(out.turns).toBe(2);
    expect(fault(out.status)).toBe('model');
  });

  it('working time, with failed attempts and retry waits left out of it', async () => {
    const time = fakeTime();
    let n = 0;
    // The first attempt gets a 429 after 1 s (then a 30 s wait); every answer takes 20 s.
    const fetch: Transport = async () => {
      if (++n === 1) return time.advance(1000), tooMany();
      time.advance(20_000);
      return respond(toolUse(n), n);
    };
    const { out } = await loop(fetch, { maxWallMs: 50_000 }, { time });
    expect(out.status).toBe('LIMIT');
    expect(out.terminal).toMatchObject({ type: 'limit', limit: 'wall_clock', cap: 50_000 });
    expect(out.retry_wait_ms).toBe(31_000);
    // Three answers: 60 s of work (the third crosses 50 s in flight and still lands). Elapsed is
    // 91 s, under the 100 s hard bound.
    expect(out.turns).toBe(3);
    expect((out.terminal as { value: number }).value).toBe(60_000);
    expect(fault(out.status)).toBe('model');
  });
});
