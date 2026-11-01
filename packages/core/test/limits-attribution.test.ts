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
//   - a real turns, cost or working-time limit still ends the loop LIMIT
//   - who the cap stop counts against is rule P-L's (W0-A): the model while it looped (LIMIT,
//     MF2), else the environment (ENV_LIMIT, E8), as the rule fails safe; this reverses R14-13 and
//     R14-14 for caps reached without a loop, by the source's model-versus-environment rule
// The cases are the lane A limit probe of verifier-phase-P17r-1 (evidence/verifier-P17r-1-laneA/
// limit.ts) turned into tests: on 6d9d66f the storm ended LIMIT wall_clock and the dropped
// attempt LIMIT cost, both labelled model.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { okResponse, sse, turnEvents, type MockTurn } from '../../../apps/web/src/harness/scenarios.ts';
import { MessagesClient, type ClientOptions, type MessageParams, type Transport } from '../anthropic.ts';
import { PER_TRIAL_CAP_USD, worstCaseUsd } from '../cost.ts';
import { createEmitter, type EventBody, type TrialEvent } from '../events.ts';
import { explainTrial } from '../explain.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { runLoop, type Caps } from '../loop.ts';
import { FAULT, NOT_RERUN_REASON } from '../outcomes.ts';
import { run } from '../run.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import type { Tool } from '../../env/tools/registry.ts';
import type { WriteContext } from '../../env/tools/write/index.ts';
import { grade } from '../../grader/grade.ts';
import type { TrialFacts } from '../../grader/outcome.ts';

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
  // Abort listeners currently attached to timer signals.
  let listening = 0;
  const fire = () => {
    for (const x of timers) if (x.at <= t && !x.c.signal.aborted) x.c.abort(new DOMException('timer', 'TimeoutError'));
  };
  return {
    now: () => t,
    timeout: (ms: number) => {
      const c = new AbortController();
      const add = c.signal.addEventListener.bind(c.signal);
      const remove = c.signal.removeEventListener.bind(c.signal);
      c.signal.addEventListener = (...a: Parameters<typeof add>) => (listening++, add(...a));
      c.signal.removeEventListener = (...a: Parameters<typeof remove>) => (listening--, remove(...a));
      timers.push({ at: t + ms, c });
      fire();
      return c.signal;
    },
    listening: () => listening,
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
// A stream that drops before message_start: the usage is unknown, so the attempt settles at its
// worst case (one that drops after message_start settles what it reported: spend-bound.test.ts).
const dropped = () => new Response(sse([]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
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
    // Each of the four failed attempts was retried; the last retry's wait was cut by the bound.
    expect(out.api_retries).toBe(4);
    expect(out.turns).toBe(1);
    // Node keeps a timeout signal with a listener alive, and the trial with it, until it fires.
    expect(time.listening()).toBe(0);
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
    expect(record).toMatchObject({ status: 'INFRA_API', detail: 'elapsed_bound', outcome: 'INFRA_API', valid: false, fault: 'infra', retry_wait_ms: 124_000, api_retries: 4 });
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

  it('dropped attempts on every turn end INFRA_API spend_bound before the settled cost passes 2 x PER_TRIAL_CAP_USD', async () => {
    // Every turn's first attempt drops (a worst case just over $5) and its retry answers.
    let n = 0;
    let k = 0;
    const fetch: Transport = async () => (++k % 2 === 1 ? dropped() : respond(toolUse(++n), n));
    const { out, ledgerUsd, settles } = await loop(fetch, { maxCostUsd: 5, maxTurns: 20 }, { params: { max_tokens: 250_000 } });
    expect(out.status).toBe('INFRA_API');
    expect(out.terminal).toMatchObject({ type: 'error', status: 'INFRA_API', code: 'spend_bound' });
    expect(fault(out.status)).toBe('infra');
    expect(out.cost_usd).toBeLessThanOrEqual(2 * PER_TRIAL_CAP_USD);
    expect(out.cost_usd).toBeCloseTo(ledgerUsd, 9);
    // Two worst cases fit under the bound, a third does not: turn 2's retry is never reserved.
    expect(settles.filter((r) => r.usage === null)).toHaveLength(2);
    expect(out.turns).toBe(2);
  });

  it('dropped retries within one request end INFRA_API spend_bound before the settled cost passes 2 x PER_TRIAL_CAP_USD', async () => {
    const { out, ledgerUsd, settles } = await loop(async () => dropped(), { maxCostUsd: 5 }, { params: { max_tokens: 250_000 } });
    expect(out.terminal).toMatchObject({ type: 'error', status: 'INFRA_API', code: 'spend_bound' });
    expect(out.cost_usd).toBeLessThanOrEqual(2 * PER_TRIAL_CAP_USD);
    expect(out.cost_usd).toBeCloseTo(ledgerUsd, 9);
    expect(settles).toHaveLength(2);
    expect(out.api_retries).toBe(2);
    expect(out.turns).toBe(1);
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
    // Idle before the response: usage unknown, the worst case. Idle after message_start: the usage
    // it reported (builder-266 (4)).
    expect(settles.map((r) => r.usage === null)).toEqual([when === 'before-response', false]);
    expect(lines[0]).toMatch(/attempt 1: .*no data for 20 ms/);
  }, 5000);
});

// The loop ends a cap LIMIT; the grader decides whose fault it is by rule P-L
// (packages/grader/progress.ts, plan-amendment-worklist W0-A): a turn, cost or working-time cap
// reached while the model was looping (at least 10 of the last 20 calls repeat an earlier call's
// target and none writes a target not written before) stays LIMIT, the model's (MF2), and so does a second max_tokens stop in a row. Any other
// cap stop is ENV_LIMIT, the environment's (E8): the rule fails safe, so padding with new calls
// (guessing, paging) ends there too and halts the run for a human review (env_limit=0).
describe('rule P-L: who a cap stop counts against, through the loop, the grader and explainTrial', () => {
  // A read tool that exposes Observation/<id>, and a search that lists two observations per code.
  const READ: Tool<WriteContext> = {
    name: 'read', description: 'Read one observation.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'id' }, reason: { type: 'string', description: 'why' } }, required: ['id'], additionalProperties: false },
    run: (i) => ({ resourceType: 'Observation', id: i.id }),
  };
  const SEARCH: Tool<WriteContext> = {
    name: 'search', description: 'Observations by code, a page at a time.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'code' }, offset: { type: 'integer', description: 'offset' } }, required: ['code'], additionalProperties: false },
    run: (i) => ({ entries: ['a', 'b'].map((x) => ({ resourceType: 'Observation', id: `${String(i.code)}-${Number(i.offset ?? 0)}${x}` })) }),
  };
  const ask = (n: number, id: string, reason?: string): MockTurn => ({ tools: [{ id: `toolu_${n}`, name: 'read', input: reason === undefined ? { id } : { id, reason } }] });
  const find = (n: number, code: string, offset?: number): MockTurn => ({ tools: [{ id: `toolu_${n}`, name: 'search', input: offset === undefined ? { code } : { code, offset } }] });
  // How each kind of trajectory picks the n-th call: a search by a new code, then a read of an id
  // it listed; the same call word for word; after five reads, the same five again, each with a
  // reason of its own (free text, padding probe g3); reads of ids no result listed (padding probe
  // g1); one search paged on (padding probe g2).
  const kinds = {
    progressing: (n: number) => respond(n % 2 === 1 ? find(n, `c${n}`) : ask(n, `c${n - 1}-0a`), n),
    repeating: (n: number) => respond(ask(n, 'o-1'), n),
    rereading: (n: number) => respond(ask(n, `o-${n <= 5 ? n : 1 + (n % 5)}`, `call ${n}`), n),
    guessing: (n: number) => respond(ask(n, `junk-${n}`), n),
    paging: (n: number) => respond(find(n, 'k', 10 * n), n),
  };
  // 25 calls under each cap: 25 turns; $0.33 of priced usage (about $0.011 rising $0.0002 a
  // turn); 25 s of working time at 1 s an answer.
  const caps = { turns: { maxTurns: 25 }, cost: { maxCostUsd: 0.33 }, wall_clock: { maxWallMs: 25_000 } } as const;

  async function graded(kind: keyof typeof kinds, cap: keyof typeof caps) {
    const time = fakeTime();
    let n = 0;
    const { client } = await clientOver(async () => {
      time.advance(1000);
      return kinds[kind](++n);
    }, time);
    const { emit, events } = createEmitter(time.now);
    const out = await runLoop({
      client, params: PARAMS, history: [{ role: 'user', content: 'x' }], tools: [READ, SEARCH], ctx: {} as WriteContext,
      caps: { maxTurns: 80, maxCostUsd: 5, maxWallMs: 50_000, maxElapsedMs: 100_000, ...caps[cap] },
      now: time.now, timeout: time.timeout, emit, stateHash: async () => 'h',
    });
    return gradeOut(out, events);
  }

  async function gradeOut(out: Awaited<ReturnType<typeof runLoop>>, events: readonly TrialEvent[]) {
    const t = out.terminal;
    const trial: TrialFacts = {
      status: out.status, detail: t?.type === 'limit' ? t.limit : null, models_returned: out.models_returned, tool_errors: out.tool_errors,
      state_hash: { initial: 'h', final: 'h', replay_final: 'h' }, summary: null,
    };
    const g = await grade({ checks: [], initial: [], final: [], events, trial });
    const x = explainTrial({ ...trial, ...g, task_version: 'v', turns: out.turns, cost_usd: out.cost_usd }, null, { events, world_state_hash: 'h', matrix: null });
    return { out, g, x, criterion: (id: string) => [...x.fault_criteria.env, ...x.fault_criteria.model].find((c) => c.id === id)! };
  }

  it.each((['progressing', 'guessing', 'paging'] as const).flatMap((k) => (Object.keys(caps) as Array<keyof typeof caps>).map((c) => [k, c] as const)))('(c) %s, %s cap: no loop, so ENV_LIMIT, fault env, label environment, E8 met with the P-L facts', async (kind, cap) => {
    const { out, g, x, criterion } = await graded(kind, cap);
    expect(out).toMatchObject({ status: 'LIMIT', terminal: { type: 'limit', limit: cap } });
    expect(out.tool_calls).toBeGreaterThanOrEqual(20);
    expect(g).toMatchObject({ outcome: 'ENV_LIMIT', valid: false, fault: 'env' });
    expect(x).toMatchObject({ outcome: 'ENV_LIMIT', fault: 'env', label: 'environment', deciding: { id: 'E8' }, taxonomy: null });
    expect(criterion('E8')).toMatchObject({ met: true, evidence: expect.stringMatching(/^[a-z_]+ limit; last 20 calls: 0 repeats, 0 writes to a new target; no loop$/) });
    expect(criterion('MF2').met).toBe(false);
    expect(x.reason).toContain(NOT_RERUN_REASON.ENV_LIMIT);
  });

  it.each((['repeating', 'rereading'] as const).flatMap((k) => (Object.keys(caps) as Array<keyof typeof caps>).map((c) => [k, c] as const)))('(d) %s, %s cap: LIMIT, fault model, MF2 met with the P-L facts', async (kind, cap) => {
    const { out, g, x, criterion } = await graded(kind, cap);
    expect(out).toMatchObject({ status: 'LIMIT', terminal: { type: 'limit', limit: cap } });
    expect(g).toMatchObject({ outcome: 'LIMIT', valid: true, fault: 'model' });
    expect(x).toMatchObject({ outcome: 'LIMIT', fault: 'model', label: 'model', deciding: { id: 'MF2' } });
    expect(criterion('MF2')).toMatchObject({ met: true, evidence: expect.stringMatching(/^[a-z_]+ limit; last 20 calls: (19|20) repeats, 0 writes to a new target; looping$/) });
    expect(criterion('E8').met).toBe(false);
  });

  it('(e) two max_tokens stops in a row stay LIMIT, the model\'s, even after progress', async () => {
    let n = 0;
    const fetch: Transport = async () => (++n <= 5 ? respond(ask(n, `o-${n}`), n) : respond({ text: 'cut', stop: 'max_tokens' }, n));
    const time = fakeTime();
    const { client } = await clientOver(fetch, time);
    const { emit, events } = createEmitter(time.now);
    const out = await runLoop({
      client, params: PARAMS, history: [{ role: 'user', content: 'x' }], tools: [READ], ctx: {} as WriteContext,
      caps: { maxTurns: 80, maxCostUsd: 5, maxWallMs: 50_000, maxElapsedMs: 100_000 }, now: time.now, timeout: time.timeout, emit, stateHash: async () => 'h',
    });
    expect(out.terminal).toMatchObject({ type: 'limit', limit: 'max_tokens' });
    const { g, x } = await gradeOut(out, events);
    expect(g).toMatchObject({ outcome: 'LIMIT', fault: 'model' });
    expect(x).toMatchObject({ fault: 'model', deciding: { id: 'MF2' } });
  });
});

describe('the loop still ends a cap LIMIT; the grader decides whose (rule P-L)', () => {
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

  it('cost, from a priced answer over the cap: LIMIT cost, not spend_bound', async () => {
    // One answer whose priced usage alone ($7.02) is over the per-trial cap.
    const big = () => {
      const events = turnEvents(toolUse(1), 1) as Array<{ type: string; usage?: { output_tokens: number } }>;
      for (const e of events) if (e.type === 'message_delta') e.usage!.output_tokens = 350_000;
      return new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const { out, ledgerUsd } = await loop(async () => big(), { maxCostUsd: PER_TRIAL_CAP_USD }, { params: { max_tokens: 1000 } });
    expect(out.terminal).toMatchObject({ type: 'limit', limit: 'cost', cap: PER_TRIAL_CAP_USD });
    expect((out.terminal as { value: number }).value).toBeGreaterThan(PER_TRIAL_CAP_USD);
    expect(out.cost_usd).toBeCloseTo(ledgerUsd, 9);
    expect(out.turns).toBe(1);
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
    expect(time.listening()).toBe(0);
  });
});
