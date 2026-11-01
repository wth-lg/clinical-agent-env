// builder-266: the per-trial spend bound and failed attempts, through the real loop, a real
// MessagesClient and the batch runner on a mock transport (no live call).
//   (a) a trial whose settled cost plus its next attempt's worst case passes MAX_SETTLED_USD ends
//       INFRA_API spend_bound and is re-queued, while two other trials in flight in the same
//       batch finish; the batch does not stop
//   (b) the grant stays open: the bound never closes it, and the other trials reserve after it
//   (c) worstCaseUsd prices input from a token estimate: for every request of the recorded
//       pilot-3 crc-care-gap trajectories, replayed through MessagesClient, the reserved worst
//       case is never below the worst case at the request's real token count (nor below its
//       real cost), and within 1.5x of it at 100k tokens and up
//   (3) every failed or aborted attempt is recorded, error class and message, in the
//       trajectory (event attempt_error) and in the client log the CLI prints; never the key
//   (4) an attempt that fails after the stream started settles the usage message_start and
//       message_delta reported (output at max_tokens when no message_delta came); the worst case
//       only when nothing is known
//   (5) a transient stream error (idle timeout, overloaded_error, 5xx) on every attempt ends
//       that trial INFRA_API, re-queued, and never stops the batch
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioTransport, sse } from '../../../apps/web/src/harness/scenarios.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { checks as toyChecks } from '../../../tasks/_toy/tests/grader.ts';
import { classifyFailure, MAX_ATTEMPTS, MessagesClient, MODEL, type ContentBlock, type MessageParam, type MessageParams, type Transport } from '../anthropic.ts';
import { memorySink, runBatch, type BatchDeps, type BatchSpec } from '../batch.ts';
import { usageCostUsd, worstCaseUsd, type Usage } from '../cost.ts';
import { parseEvent, type TrialEvent } from '../events.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { MAX_SETTLED_USD } from '../loop.ts';
import { run, MAX_TOKENS } from '../run.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const WORLD_HASH = (JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const DEFINITIONS = JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8'));
const KEY = 'test-key-not-real';

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

const body = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
const stream = (events: readonly object[]) => new Response(body(sse(events)), { status: 200, headers: { 'content-type': 'text/event-stream' } });
// A stream that sends `events`, then breaks on the next read (error() in the same tick would
// discard the queued chunk).
const broken = (events: readonly object[]) => {
  let reads = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (reads++ === 0 && events.length > 0) c.enqueue(new TextEncoder().encode(sse(events)));
        else c.error(new TypeError('terminated'));
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};
// A stream that sends `events`, then nothing.
const stalled = (events: readonly object[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        if (events.length > 0) c.enqueue(new TextEncoder().encode(sse(events)));
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

const start = (usage: Usage, id = 'msg_sb') => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } } });
// One complete answer: its content blocks as given, then message_delta and message_stop.
function answer(content: readonly ContentBlock[], stop: string, usage: Usage, id = 'msg_sb'): Response {
  return stream([
    start(usage, id),
    ...content.flatMap((b, index) => [{ type: 'content_block_start', index, content_block: b }, { type: 'content_block_stop', index }]),
    { type: 'message_delta', delta: { stop_reason: stop, stop_details: null }, usage: { output_tokens: usage.output_tokens } },
    { type: 'message_stop' },
  ]);
}

function newLedger(store: MemoryStore, runId: string | null = null) {
  admitStore(store);
  let id = 0;
  return createLedger({ store, clock: { now: () => '2026-11-01T00:00:00.000Z' }, newId: () => `id-${++id}`, source: 'node', runId, pid: 1, host: 'h', isAlive: () => true });
}

// The batch runner on the toy task, a transport per trial attempt.
function batchDeps(store: MemoryStore, transport: (trial: string) => Transport, opts: (trial: string) => { idleStreamMs?: number } = () => ({})): BatchDeps & { sink: ReturnType<typeof memorySink> } {
  const ledger = newLedger(store, 'run-sb');
  return {
    ledger, rows: () => store.read(), sink: memorySink(), tasks: nodeTaskSource({ testMode: true }), checks: async () => toyChecks,
    world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0,
    client: (grant, trial) => new MessagesClient({ grant, ledger, apiKey: KEY, trial, sleep: async () => {}, fetch: transport(trial), ...opts(trial) }),
  };
}
const spec = (over: Partial<BatchSpec> = {}): BatchSpec => ({ runId: 'run-sb', taskIds: ['_toy'], trials: 3, model: MODEL, effort: 'high', mode: 'mock-toy', concurrency: 3, observations: [], ...over });

// Trial 0 of a batch runs `first`; the other trials run the toy scenario, but their first
// request waits until trial 0 has finished its first attempt, so they are in flight when it ends.
async function batchWith(first: () => Transport, over: Partial<BatchSpec> = {}, opts: { idleStreamMs?: number } = {}) {
  const store = new MemoryStore();
  let release!: () => void;
  const zeroDone = new Promise<void>((r) => (release = r));
  const d = batchDeps(store, (trial) => {
    if (trial.endsWith('/0')) return first();
    const toy = scenarioTransport('toy').transport;
    return async (r) => (await zeroDone, toy(r));
  }, (trial) => (trial.endsWith('/0') ? opts : {}));
  const finish = d.sink.finish.bind(d.sink);
  d.sink.finish = async (key, record) => {
    await finish(key, record);
    if (key.index === 0) release();
  };
  const log: string[] = [];
  const result = await runBatch(spec({ log: (l) => log.push(l), ...over }), d);
  return { result, sink: d.sink, store, log };
}

// Trial 0 of (a): one answer that puts ~600 kB into the history, then every later attempt fails
// before any byte arrives, so each settles at its worst case (~$5.5) until the bound refuses the
// next one: $0.0x + 5.5 + 5.5 > $12 at attempt 3 of turn 2.
const BIG = 'x'.repeat(600_000);
function boundTransport(): Transport {
  let n = 0;
  return async () => {
    n++;
    if (n === 1) return answer([{ type: 'text', text: BIG }, { type: 'tool_use', id: 'toolu_1', name: 'get_context', input: {} }], 'tool_use', { input_tokens: 2000, output_tokens: 60 });
    throw new TypeError('fetch failed');
  };
}

describe('(a)+(b) the spend bound ends one trial, not the batch', () => {
  it('ends trial 0 INFRA_API spend_bound, re-queued; the two other in-flight trials PASS; the batch does not stop; the grant stays open', async () => {
    const { result, sink, store } = await batchWith(boundTransport, { maxReruns: 1 });
    expect(result.stopped).toBeNull();
    expect(result.cancelled).toBe(false);
    const zero = (await sink.requeued()).filter((r) => r.index === 0);
    expect(zero.length).toBeGreaterThanOrEqual(1);
    for (const r of zero) expect(r).toMatchObject({ outcome: 'INFRA_API', status: 'INFRA_API', detail: 'spend_bound', settled: false, requeue_reason: 'INFRA_API' });
    expect((await sink.settled()).map((r) => [r.index, r.outcome]).sort()).toEqual([[0, 'INFRA_API'], [1, 'PASS'], [2, 'PASS']]);
    // The record's error does not stop the batch.
    expect(zero[0]!.error ?? null).not.toMatchObject({ stops_batch: true });
    // (b) One close row, the batch's own at its end, after the other trials' settles.
    const closes = store.rows.flatMap((r, i) => (r.kind === 'close' ? [i] : []));
    expect(closes).toHaveLength(1);
    const lastSettle = store.rows.findLastIndex((r) => r.kind === 'settle');
    expect(closes[0]!).toBeGreaterThan(lastSettle);
    // No attempt of trial 0 passed the bound in the ledger.
    const perTrial = store.rows.filter((r) => r.kind === 'settle' && r.trial?.endsWith('/0')).reduce((s, r) => s + r.cost_usd, 0);
    const tries = zero.length + 1;
    expect(perTrial / tries).toBeLessThanOrEqual(MAX_SETTLED_USD);
    expect(perTrial).toBeLessThanOrEqual(tries * MAX_SETTLED_USD);
  });

  it('the bound reaches the batch wrapper as INFRA_API spend_bound, which does not stop the batch', async () => {
    const { log } = await batchWith(boundTransport, { maxReruns: 0 });
    expect(log.filter((l) => l.startsWith('batch stopped'))).toEqual([]);
  });

  it('a toy trial alone: the trajectory ends with error INFRA_API spend_bound and the grant is not closed', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: boundTransport(), sleep: async () => {} });
    const { record, events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    expect(record).toMatchObject({ status: 'INFRA_API', detail: 'spend_bound', outcome: 'INFRA_API' });
    expect(events.findLast((e) => e.type !== 'graded')).toMatchObject({ type: 'error', status: 'INFRA_API', code: 'spend_bound' });
    expect(grant.signal.aborted).toBe(false);
    expect(store.rows.filter((r) => r.kind === 'close')).toEqual([]);
  });

  it('classifyFailure reads the refusal the loop aborts with as INFRA_API spend_bound, not a batch stop', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: boundTransport(), sleep: async () => {} });
    const { events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    const err = events.find((e) => e.type === 'error') as { message: string };
    expect(err.message).toMatch(/would pass the bound of \$12\.00/);
    // What the batch wrapper sees thrown from send: a typed refusal.
    const { SpendBoundRefused } = await import('../anthropic.ts');
    expect(classifyFailure(new SpendBoundRefused(err.message))).toEqual({ status: 'INFRA_API', code: 'spend_bound', stopsBatch: false, message: err.message });
  });
});

describe('(a) the working-time cap in flight ends one trial, not the batch', () => {
  it('trial 0 hits its working-time cap while a request is in flight: LIMIT wall_clock (ENV_LIMIT), the others PASS, no batch stop', async () => {
    const store = new MemoryStore();
    let release!: () => void;
    const zeroDone = new Promise<void>((r) => (release = r));
    const d = batchDeps(store, (trial) => {
      // Trial 0's request never answers; it ends when its signal aborts.
      if (trial.endsWith('/0')) return (request) => new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      const toy = scenarioTransport('toy').transport;
      return async (r) => (await zeroDone, toy(r));
    });
    const finish = d.sink.finish.bind(d.sink);
    d.sink.finish = async (key, record) => {
      await finish(key, record);
      if (key.index === 0) release();
    };
    // Trial 0's working-time timer fires at once.
    d.run = (id, model, o) => run(id, model, { ...o, ...(o.trialId?.endsWith('/0') ? { timeout: () => AbortSignal.timeout(5) } : {}) });
    const log: string[] = [];
    const result = await runBatch(spec({ log: (l) => log.push(l), maxReruns: 0 }), d);
    expect(result.stopped).toBeNull();
    expect(log.filter((l) => l.startsWith('batch stopped'))).toEqual([]);
    const zero = [...(await d.sink.settled()), ...(await d.sink.requeued())].filter((r) => r.index === 0);
    expect(zero).toHaveLength(1);
    expect(zero[0]).toMatchObject({ status: 'LIMIT', detail: 'wall_clock' });
    expect((await d.sink.settled()).filter((r) => r.index !== 0).map((r) => r.outcome)).toEqual(['PASS', 'PASS']);
  });
});

// The recorded crc-care-gap trajectories of pilot-3 (committed): every request rebuilt from the
// request events and every answer from the response events.
const CRC = new URL('results/pilot-3/trajectories/crc-care-gap/', root);
interface Recorded {
  params: MessageParams;
  turns: Array<{ messages_from: number; messages: MessageParam[]; content: ContentBlock[]; usage: Usage; stop_reason: string }>;
}
function recorded(file: string): Recorded {
  const events = readFileSync(new URL(file, CRC), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as TrialEvent);
  let params: MessageParams | undefined;
  const turns: Recorded['turns'] = [];
  for (const e of events) {
    if (e.type === 'request') {
      if (e.params) params = e.params;
      turns.push({ messages_from: e.messages_from, messages: e.messages, content: [], usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: '' });
    } else if (e.type === 'response') {
      Object.assign(turns.at(-1)!, { content: e.content, usage: e.usage, stop_reason: e.stop_reason });
    }
  }
  return { params: params!, turns };
}
// The worst case at a known prompt size: every prompt token at the 1-hour cache-write price, and
// max_tokens of output (cost.ts worstCaseUsd's prices).
const worstAt = (tokens: number, maxTokens: number) => worstCaseUsd({ bodyBytes: tokens, maxTokens }) - worstCaseUsd({ bodyBytes: 0, maxTokens: 0 });
const promptTokens = (u: Usage) => u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

describe('(c) worstCaseUsd from a token estimate, on recorded crc-care-gap requests', () => {
  const files = readdirSync(CRC).filter((f) => f.endsWith('.jsonl')).sort();

  it('replays all recorded crc-care-gap requests: never below the real worst case or cost; within 1.5x at 100k tokens and up', async () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    const ratios: Array<{ file: string; turn: number; tokens: number; ratio: number }> = [];
    for (const file of files) {
      const rec = recorded(file);
      const store = new MemoryStore();
      const ledger = newLedger(store);
      const grant = await ledger.batchStart(400);
      let n = 0;
      const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, fetch: async () => {
        const t = rec.turns[n++]!;
        return answer(t.content, t.stop_reason, t.usage, `msg_${n}`);
      } });
      const history: MessageParam[] = [];
      for (const [i, t] of rec.turns.entries()) {
        history.push(...t.messages);
        expect(history.length, `${file} turn ${i + 1}`).toBe(t.messages_from + t.messages.length);
        await client.send(history, rec.params);
        const reserve = store.rows.filter((r) => r.kind === 'reserve').at(-1)!;
        const real = worstAt(promptTokens(t.usage), rec.params.max_tokens);
        expect(reserve.cost_usd, `${file} turn ${i + 1}: below the real worst case`).toBeGreaterThanOrEqual(real);
        expect(reserve.cost_usd, `${file} turn ${i + 1}: below the real cost`).toBeGreaterThanOrEqual(usageCostUsd(t.usage)!);
        ratios.push({ file, turn: i + 1, tokens: promptTokens(t.usage), ratio: reserve.cost_usd / real });
      }
    }
    const large = ratios.filter((r) => r.tokens >= 100_000);
    expect(large.length).toBeGreaterThan(50);
    expect(large.filter((r) => r.ratio > 1.5)).toEqual([]);
    // The ~250k-token requests that tripped the bound: within 1.2x.
    expect(ratios.filter((r) => r.tokens >= 200_000 && r.ratio > 1.2)).toEqual([]);
  }, 120_000);

  it('the byte count it replaces overstated the largest recorded request by more than 2x', () => {
    const rec = recorded('5.jsonl');
    const history: MessageParam[] = [];
    let worst = { tokens: 0, bytes: 0 };
    for (const t of rec.turns) {
      history.push(...t.messages);
      const bytes = new TextEncoder().encode(JSON.stringify({ model: MODEL, ...rec.params, messages: history, stream: true })).length;
      if (promptTokens(t.usage) > worst.tokens) worst = { tokens: promptTokens(t.usage), bytes };
      history.push({ role: 'assistant', content: t.content });
    }
    expect(worst.tokens).toBeGreaterThan(200_000);
    expect(worst.bytes / worst.tokens).toBeGreaterThan(2);
  });

  it('keeps the byte bound on a first request and on a request whose earlier messages or params changed', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(100);
    // 300 kB of text that the answer reports as 60,000 prompt tokens.
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, fetch: async () => answer([{ type: 'text', text: 'ok' }], 'end_turn', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 60_000 }) });
    const params = { max_tokens: 1000 };
    const bytes = (p: MessageParams) => new TextEncoder().encode(JSON.stringify({ model: MODEL, ...p, messages: history, stream: true })).length;
    const last = () => store.rows.filter((r) => r.kind === 'reserve').at(-1)!.cost_usd;
    const history: MessageParam[] = [{ role: 'user', content: 'y'.repeat(300_000) }];
    const before = bytes(params);
    await client.send(history, params);
    expect(last()).toBeCloseTo(worstCaseUsd({ bodyBytes: before, maxTokens: 1000 }), 9);
    // Append-only: the last prompt (60,010 tokens) plus the bytes added (the answer and the new
    // turn) and the overhead.
    history.push({ role: 'user', content: 'b' });
    const grown = bytes(params);
    await client.send(history, params);
    expect(last()).toBeCloseTo(worstAt(60_010 + (grown - before) + 4096, 1000), 9);
    expect(last()).toBeLessThan(worstCaseUsd({ bodyBytes: grown, maxTokens: 1000 }) / 4);
    // An earlier message edited: the byte bound again.
    history[0] = { role: 'user', content: 'z'.repeat(300_000) };
    history.push({ role: 'user', content: 'c' });
    const edited = bytes(params);
    await client.send(history, params);
    expect(last()).toBeCloseTo(worstCaseUsd({ bodyBytes: edited, maxTokens: 1000 }), 9);
    // Different params on an otherwise appended body: the byte bound.
    const other = { max_tokens: 1000, system: 'other' };
    history.push({ role: 'user', content: 'd' });
    const changed = bytes(other);
    await client.send(history, other);
    expect(last()).toBeCloseTo(worstCaseUsd({ bodyBytes: changed, maxTokens: 1000 }), 9);
  });
});

describe('(3) failed attempts are recorded', () => {
  it('an attempt that fails and is retried leaves an attempt_error event (class, message, settle) and a log line, never the key or body', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const toy = scenarioTransport('toy').transport;
    let n = 0;
    const log: string[] = [];
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, log: (l) => log.push(l), fetch: async (r) => (++n === 1 ? Promise.reject(new TypeError(`fetch failed for ${KEY}`)) : toy(r)) });
    const { record, events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    expect(record.outcome).toBe('PASS');
    const failed = events.filter((e) => e.type === 'attempt_error');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ turn: 1, attempt: 1, error: 'ApiError', code: 'network', status: null, retry: true, settle: 'worst_case' });
    expect((failed[0] as { message: string }).message).toMatch(/^network error: fetch failed for \[redacted/i);
    for (const e of events) expect(() => parseEvent(JSON.parse(JSON.stringify(e)))).not.toThrow();
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(log.some((l) => /^attempt 1: network error: fetch failed/.test(l))).toBe(true);
    expect(log.join('\n')).not.toContain(KEY);
  });

  it('an attempt the loop aborts (spend bound) and the final failed attempt are recorded too', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: boundTransport(), sleep: async () => {} });
    const { events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    const failed = events.filter((e) => e.type === 'attempt_error') as Array<{ attempt: number; code: string; retry: boolean }>;
    expect(failed.map((e) => [e.attempt, e.code, e.retry])).toEqual([[1, 'network', true], [2, 'network', true], [3, 'spend_bound', false]]);
  });
});

describe('(3) an attempt_error that cannot be recorded', () => {
  it('ends the trial as any emit failure does (ENV_ERROR INTERNAL), never as a client error that closes the grant', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const toy = scenarioTransport('toy').transport;
    let n = 0;
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, fetch: async (r) => (++n === 1 ? Promise.reject(new TypeError('fetch failed')) : toy(r)) });
    const { record } = await run('_toy', MODEL, {
      tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0,
      onEvent: (e) => {
        if (e.type === 'attempt_error') throw new Error('sink full');
      },
    });
    expect(record).toMatchObject({ status: 'ENV_ERROR', detail: 'INTERNAL' });
    expect(grant.signal.aborted).toBe(false);
    expect(store.rows.filter((r) => r.kind === 'close')).toEqual([]);
  });
});

describe('(4) a failed stream settles what it reported', () => {
  const USAGE: Usage = { input_tokens: 1500, output_tokens: 1, cache_creation_input_tokens: 2000, cache_read_input_tokens: 250_000 };
  async function oneFailure(res: () => Response) {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    let n = 0;
    const settled: number[] = [];
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, maxAttempts: 2, idleStreamMs: 20, fetch: async () => (++n === 1 ? res() : answer([{ type: 'text', text: 'ok' }], 'end_turn', { input_tokens: 1, output_tokens: 1 })) });
    await client.send([{ role: 'user', content: 'x' }], { max_tokens: MAX_TOKENS }, { onSettle: (u) => settled.push(u) });
    const first = store.rows.find((r) => r.kind === 'settle')!;
    const reserve = store.rows.find((r) => r.kind === 'reserve')!;
    return { first, reserve, settled };
  }

  it('dropped after message_start: input as reported, output at max_tokens', async () => {
    const { first, settled } = await oneFailure(() => broken([start(USAGE), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]));
    const expected = usageCostUsd({ ...USAGE, output_tokens: MAX_TOKENS })!;
    expect(first.cost_usd).toBeCloseTo(expected, 9);
    expect(settled[0]).toBeCloseTo(expected, 9);
  });

  it('dropped after message_delta: input and output as reported', async () => {
    const { first } = await oneFailure(() => broken([start(USAGE), { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: null }, usage: { output_tokens: 700 } }]));
    expect(first.cost_usd).toBeCloseTo(usageCostUsd({ ...USAGE, output_tokens: 700 })!, 9);
  });

  it('idle after message_start: the same partial settle', async () => {
    const { first } = await oneFailure(() => stalled([start(USAGE)]));
    expect(first.cost_usd).toBeCloseTo(usageCostUsd({ ...USAGE, output_tokens: MAX_TOKENS })!, 9);
  });

  it('dropped before message_start: the worst case', async () => {
    const { first, reserve } = await oneFailure(() => broken([]));
    expect(first.cost_usd).toBe(reserve.cost_usd);
  });

  it('a stream error event after message_start (overloaded) settles the reported input', async () => {
    const { first } = await oneFailure(() => stream([start(USAGE), { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]));
    expect(first.cost_usd).toBeCloseTo(usageCostUsd({ ...USAGE, output_tokens: MAX_TOKENS })!, 9);
  });
});

describe('(5) transient stream errors after retries end one trial INFRA_API and never stop the batch', () => {
  const USAGE: Usage = { input_tokens: 1500, output_tokens: 1 };
  const cases: Array<[string, () => Response | Promise<Response>, string]> = [
    ['idle timeout', () => stalled([start(USAGE)]), 'stream_idle'],
    ['overloaded stream error', () => stream([start(USAGE), { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]), 'overloaded_error'],
    ['HTTP 500', () => new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Internal server error' } }), { status: 500, headers: { 'content-type': 'application/json' } }), 'api_error'],
    ['HTTP 529', () => new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529, headers: { 'content-type': 'application/json' } }), 'overloaded_error'],
    ['dropped stream', () => broken([start(USAGE)]), 'stream_dropped'],
  ];
  for (const [name, res, code] of cases) {
    it(`${name}: INFRA_API ${code}, re-queued, other trials PASS, batch not stopped`, async () => {
      const { result, sink, store, log } = await batchWith(() => async () => res(), { maxReruns: 1 }, { idleStreamMs: 10 });
      expect(result.stopped).toBeNull();
      // (3) The run output names each failed attempt.
      expect(log.filter((l) => l.startsWith('mock:run:run-sb:_toy/0 turn 1 attempt ') && l.includes(` ${code}`))).toHaveLength(2 * MAX_ATTEMPTS);
      const zero = (await sink.requeued()).filter((r) => r.index === 0);
      expect(zero.length).toBeGreaterThanOrEqual(1);
      for (const r of zero) expect(r).toMatchObject({ outcome: 'INFRA_API', detail: code, requeue_reason: 'INFRA_API' });
      expect((await sink.settled()).filter((r) => r.index !== 0).map((r) => r.outcome)).toEqual(['PASS', 'PASS']);
      expect(store.rows.filter((r) => r.kind === 'close')).toHaveLength(1);
      const events = sink.events.get([...sink.events.keys()].find((k) => k.startsWith('_toy/0#'))!)!;
      expect(events.filter((e) => e.type === 'attempt_error')).toHaveLength(MAX_ATTEMPTS);
    }, 30_000);
  }
});

// builder-269 F1 (verifier probe MF-1): a model that grows its context fast under the $6 cost
// cap. Each answer adds `perTurnBytes` of text to the history and reports honest usage, so the
// next request's own worst case (the estimate counts every added byte as a token) is what passes
// MAX_SETTLED_USD; no attempt failed. That is the model's spend, not the infrastructure's: the
// trial ends LIMIT cost, which rule P-L splits into LIMIT and ENV_LIMIT, and is not re-queued.
function growingTransport(perTurnBytes: number): Transport {
  let n = 0;
  let prompt = 3000;
  return async () => {
    n++;
    const usage: Usage = { input_tokens: 500, cache_read_input_tokens: prompt - 500, cache_creation_input_tokens: 0, output_tokens: 30_000 };
    prompt += Math.round(perTurnBytes / 2.3);
    return answer([{ type: 'text', text: 'z'.repeat(perTurnBytes) }, { type: 'tool_use', id: `toolu_${n}`, name: 'get_context', input: {} }], 'tool_use', usage, `msg_mf${n}`);
  };
}

describe('(F1) a request whose own worst case passes the bound on priced usage ends LIMIT cost, not INFRA_API', () => {
  it('MF-1 grow 380 kB/turn: LIMIT cost (P-L), the limit event names the worst case, no spend_bound error; the grant stays open', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: growingTransport(380_000), sleep: async () => {} });
    const { record, events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    expect(record).toMatchObject({ status: 'LIMIT', detail: 'cost' });
    // Rule P-L (packages/grader/outcome.ts) decides LIMIT or ENV_LIMIT; never INFRA_*.
    expect(['LIMIT', 'ENV_LIMIT']).toContain(record.outcome);
    const limit = events.findLast((e) => e.type === 'limit');
    expect(limit).toMatchObject({ type: 'limit', limit: 'cost', cap: MAX_SETTLED_USD, code: 'worst_case' });
    expect((limit as { value: number }).value).toBeGreaterThan(MAX_SETTLED_USD);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    // The refused attempt is recorded under the cost limit's code, never as spend_bound.
    expect(events.filter((e) => e.type === 'attempt_error').map((e) => (e as { code: string }).code)).toEqual(['cost_limit']);
    // Priced usage stayed under the $6 cost cap: the bound, not the cap check, ended it.
    expect(record.cost_usd).toBeLessThan(6);
    expect(grant.signal.aborted).toBe(false);
    expect(store.rows.filter((r) => r.kind === 'close')).toEqual([]);
  });

  it('MF-1 grow 150 kB/turn: unchanged, LIMIT turns', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: growingTransport(150_000), sleep: async () => {} });
    const { record } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    expect(record).toMatchObject({ status: 'LIMIT', detail: 'turns' });
  });

  it('MF-1 in a batch: trial 0 ends LIMIT cost once, never rerun as INFRA_API; the other trials PASS; the batch does not stop; one close at the end', async () => {
    const { result, sink, store } = await batchWith(() => growingTransport(380_000), { maxReruns: 1 });
    expect(result.stopped).toBeNull();
    // One record for trial 0: a LIMIT is never rerun. Rule P-L grades it; an ENV_LIMIT is held
    // unsettled for a human (outcomes.ts NOT_RERUN_REASON), a LIMIT is settled.
    const zero = [...(await sink.requeued()), ...(await sink.settled())].filter((r) => r.index === 0);
    expect(zero).toHaveLength(1);
    expect(zero[0]).toMatchObject({ status: 'LIMIT', detail: 'cost' });
    expect(['LIMIT', 'ENV_LIMIT']).toContain(zero[0]!.outcome);
    if (zero[0]!.outcome === 'ENV_LIMIT') expect(zero[0]).toMatchObject({ settled: false, requeue_reason: 'ENV_LIMIT' });
    expect((await sink.settled()).filter((r) => r.index !== 0).map((r) => r.outcome)).toEqual(['PASS', 'PASS']);
    const closes = store.rows.flatMap((r, i) => (r.kind === 'close' ? [i] : []));
    expect(closes).toHaveLength(1);
    expect(closes[0]!).toBeGreaterThan(store.rows.findLastIndex((r) => r.kind === 'settle'));
  });

  it('a mix: failed-attempt settles alone push the next attempt past the bound -> INFRA_API spend_bound (boundTransport, priced usage + worst case under the bound)', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(50);
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, fetch: boundTransport(), sleep: async () => {} });
    const { record, events } = await run('_toy', MODEL, { tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0 });
    expect(record).toMatchObject({ status: 'INFRA_API', detail: 'spend_bound' });
    expect(events.some((e) => e.type === 'limit')).toBe(false);
  });
});

// builder-269 F2 (verifier probe EDGE-1): an answer that reports its cache write only in
// usage.cache_creation{} (no cache_creation_input_tokens). The estimate counts the write as
// usageCostUsd prices it, max(cache_creation_input_tokens, ephemeral_5m + ephemeral_1h).
describe('(F2) the token estimate counts a cache write reported only in cache_creation{}', () => {
  it('EDGE-1: the next reserve is at least the worst case at the real ~120k-token prompt', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(100);
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 120_000 } } as Usage;
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, fetch: async () => answer([{ type: 'text', text: 'ok' }], 'end_turn', usage) });
    const history: MessageParam[] = [{ role: 'user', content: 'q'.repeat(300_000) }];
    await client.send(history, { max_tokens: 1000 });
    history.push({ role: 'user', content: 'next' });
    await client.send(history, { max_tokens: 1000 });
    const reserve = store.rows.filter((r) => r.kind === 'reserve').at(-1)!.cost_usd;
    expect(reserve).toBeGreaterThanOrEqual(worstAt(120_010, 1000));
  });

  it('a breakdown below cache_creation_input_tokens: the larger count, as usageCostUsd', async () => {
    const store = new MemoryStore();
    const ledger = newLedger(store);
    const grant = await ledger.batchStart(100);
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 90_000, cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 0 } } as Usage;
    const client = new MessagesClient({ grant, ledger, apiKey: KEY, sleep: async () => {}, fetch: async () => answer([{ type: 'text', text: 'ok' }], 'end_turn', usage) });
    const history: MessageParam[] = [{ role: 'user', content: 'q'.repeat(300_000) }];
    await client.send(history, { max_tokens: 1000 });
    history.push({ role: 'user', content: 'next' });
    await client.send(history, { max_tokens: 1000 });
    expect(store.rows.filter((r) => r.kind === 'reserve').at(-1)!.cost_usd).toBeGreaterThanOrEqual(worstAt(90_010, 1000));
  });
});
