// Context-window stops are the environment's, not the model's (plan-amendment-worklist W0-A,
// "Attribution rule for stops"): the list the task gave did not fit the model's window. Each case
// runs the real loop through a real MessagesClient on a mock transport, run() and the grader:
//   (a)  stop_reason model_context_window_exceeded ends LIMIT context_window (code stop_reason)
//        and grades ENV_LIMIT, fault env, label environment, E7 met; never COMPLETED end_turn
//   (a2) the same stop in the middle of a tool call (a tool_use whose input JSON is cut off)
//        raises no invalid_tool_input, runs no tool of that answer, complete or not, and makes one
//        attempt in a batch (no INFRA_API re-queue); cut off under end_turn it still throws
//   (b)  a 400 "prompt is too long" ends that trial LIMIT context_window (code prompt_too_long),
//        keeps the grant open, and the batch's next trial runs
//   (f)  ENV_LIMIT is excluded and never rerun: not valid, in NEVER_RERUN, not in RERUN_OUTCOMES,
//        listed with its reason in DENOMINATOR_RULE; a batch finishes it settled false with
//        requeue_reason ENV_LIMIT after exactly one attempt
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioTransport, sse } from '../../../apps/web/src/harness/scenarios.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { checks as toyChecks } from '../../../tasks/_toy/tests/grader.ts';
import { ApiError, classifyFailure, MessagesClient, MODEL, type Transport } from '../anthropic.ts';
import { memorySink, runBatch, type BatchDeps, type BatchSpec } from '../batch.ts';
import { explainTrial } from '../explain.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { DENOMINATOR_RULE, FAULT, isValid, NEVER_RERUN, NOT_RERUN_REASON, RERUN_OUTCOMES, VALID_OUTCOMES } from '../outcomes.ts';
import { run } from '../run.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const WORLD_HASH = (JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } }).world.state_hash;
const DEFINITIONS = JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8'));

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

const USAGE = { input_tokens: 1200, output_tokens: 1, cache_creation_input_tokens: 300, cache_read_input_tokens: 190_000 };
const CONTEXT = 1200 + 300 + 190_000;
const stream = (events: readonly object[]) => new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });

// One answer that stops with `stop`: optional text, complete tool calls, and a last tool call
// whose input JSON is cut off when `cut` is given.
function answer(stop: string, opts: { text?: string; complete?: Array<{ id: string; name: string; input: object }>; cut?: string } = {}): Response {
  const blocks: object[][] = [];
  if (opts.text !== undefined) blocks.push([{ type: 'content_block_start', content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: opts.text } }]);
  for (const t of opts.complete ?? []) {
    blocks.push([{ type: 'content_block_start', content_block: { type: 'tool_use', id: t.id, name: t.name, input: {} } }, { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: JSON.stringify(t.input) } }]);
  }
  if (opts.cut !== undefined) {
    blocks.push([{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_cut', name: 'search_notes', input: {} } }, { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: opts.cut } }]);
  }
  return stream([
    { type: 'message_start', message: { id: 'msg_ctx', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, usage: USAGE } },
    ...blocks.flatMap((b, index) => [...b.map((e) => ({ ...e, index })), { type: 'content_block_stop', index }]),
    { type: 'message_delta', delta: { stop_reason: stop, stop_details: null }, usage: { output_tokens: 40 } },
    { type: 'message_stop' },
  ]);
}

const tooLong = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 215013 tokens > 200000 maximum' } }), { status: 400, headers: { 'content-type': 'application/json' } });

async function client(fetch: Transport, store = new MemoryStore()) {
  admitStore(store);
  const ledger = createLedger({ store, clock: { now: () => 't' }, newId: (() => { let i = 0; return () => `id-${++i}`; })(), source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
  const grant = await ledger.batchStart(6);
  return { client: new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch, sleep: async () => {} }), grant, store };
}

// One toy trial through run() whose model answers with `responses`, in order.
async function toyTrial(responses: Array<() => Response>) {
  const queue = [...responses];
  const sent: number[] = [];
  const { client: c, grant, store } = await client(async () => (sent.push(1), queue.shift()!()));
  const { record, events } = await run('_toy', MODEL, {
    tasks: nodeTaskSource({ testMode: true }), client: c, world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0,
  });
  return { record, events, sent: sent.length, grant, store };
}

const toolRuns = (events: ReadonlyArray<{ type: string }>) => events.filter((e) => e.type === 'tool_result').length;
const explain = (r: Awaited<ReturnType<typeof toyTrial>>) => explainTrial(r.record, null, { events: r.events, world_state_hash: WORLD_HASH, matrix: null });

describe('(a) stop_reason model_context_window_exceeded', () => {
  it('ends LIMIT context_window, code stop_reason, and grades ENV_LIMIT, fault env, label environment, E7 met', async () => {
    const t = await toyTrial([() => answer('model_context_window_exceeded', { text: 'Reading the next patient' })]);
    expect(t.record).toMatchObject({ status: 'LIMIT', detail: 'context_window', stop: null, outcome: 'ENV_LIMIT', valid: false, fault: 'env', stop_reason: 'model_context_window_exceeded' });
    expect(t.events.find((e) => e.type === 'limit')).toMatchObject({ limit: 'context_window', code: 'stop_reason', value: CONTEXT });
    const x = explain(t);
    expect(x).toMatchObject({ outcome: 'ENV_LIMIT', fault: 'env', label: 'environment', deciding: { id: 'E7' }, taxonomy: null, decisive_check: null });
    expect(x.fault_criteria.env.find((c) => c.id === 'E7')!.met).toBe(true);
    expect(x.reason).toContain(NOT_RERUN_REASON.ENV_LIMIT);
  });
});

describe('(a2) a context-window stop inside a tool call', () => {
  it('raises no ApiError, runs no tool, ends LIMIT context_window code stop_reason and grades ENV_LIMIT', async () => {
    const t = await toyTrial([() => answer('model_context_window_exceeded', { cut: '{"query":"crea' })]);
    expect(t.record).toMatchObject({ status: 'LIMIT', detail: 'context_window', outcome: 'ENV_LIMIT', fault: 'env' });
    expect(t.events.find((e) => e.type === 'limit')).toMatchObject({ limit: 'context_window', code: 'stop_reason' });
    expect(t.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(toolRuns(t.events)).toBe(0);
    // The cut-off call is dropped from the answer, as at max_tokens.
    const response = t.events.find((e) => e.type === 'response') as { content: Array<{ type: string }> };
    expect(response.content.filter((b) => b.type === 'tool_use')).toEqual([]);
    expect(t.sent).toBe(1);
  });

  it('a complete tool call before the cut-off one does not run either', async () => {
    const t = await toyTrial([() => answer('model_context_window_exceeded', { complete: [{ id: 'toolu_ok', name: 'get_context', input: {} }], cut: '{"query":"crea' })]);
    expect(t.record).toMatchObject({ status: 'LIMIT', detail: 'context_window', outcome: 'ENV_LIMIT', tool_calls: 0 });
    expect(t.events.filter((e) => e.type === 'tool_call' || e.type === 'tool_result')).toEqual([]);
  });

  it('the same cut-off call under end_turn still throws invalid_tool_input (unchanged)', async () => {
    const { client: c } = await client(async () => answer('end_turn', { cut: '{"query":"crea' }));
    const e = await c.send([{ role: 'user', content: 'x' }], { max_tokens: 1000 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ errorType: 'invalid_tool_input' });
    expect(classifyFailure(e).status).toBe('INFRA_API');
  });
});

// The batch runner on the toy task, with a transport per trial.
function batchDeps(store: MemoryStore, transport: (trial: string) => Transport, sent: Map<string, number>): BatchDeps {
  admitStore(store);
  let id = 0;
  const ledger = createLedger({ store, clock: { now: () => '2026-10-30T00:00:00.000Z' }, newId: () => `b-${++id}`, source: 'node', runId: 'run-ctx', pid: 1, host: 'h', isAlive: () => true });
  return {
    ledger, rows: () => store.read(), sink: memorySink(), tasks: nodeTaskSource({ testMode: true }), checks: async () => toyChecks,
    world: { read: async () => WORLD }, worldHash: WORLD_HASH, definitions: DEFINITIONS, now: () => 0,
    client: (grant, trial) => {
      const inner = transport(trial);
      return new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', trial, sleep: async () => {}, fetch: (r) => (sent.set(trial, (sent.get(trial) ?? 0) + 1), inner(r)) });
    },
  };
}
const spec = (over: Partial<BatchSpec> = {}): BatchSpec => ({ runId: 'run-ctx', taskIds: ['_toy'], trials: 2, model: MODEL, effort: 'high', mode: 'mock-toy', concurrency: 1, observations: [], ...over });

describe('(a2) and (f) through the batch runner', () => {
  it('a context stop inside a tool call makes one attempt: ENV_LIMIT, settled false, requeue_reason ENV_LIMIT, no re-queue', async () => {
    const store = new MemoryStore();
    const sent = new Map<string, number>();
    const d = batchDeps(store, (trial) => (trial.endsWith('/0') ? async () => answer('model_context_window_exceeded', { cut: '{"query":"crea' }) : scenarioTransport('toy').transport), sent);
    const sink = d.sink as ReturnType<typeof memorySink>;
    const result = await runBatch(spec(), d);
    expect(result.stopped).toBeNull();
    const requeued = await sink.requeued();
    expect(requeued).toHaveLength(1);
    expect(requeued[0]).toMatchObject({ index: 0, outcome: 'ENV_LIMIT', status: 'LIMIT', detail: 'context_window', settled: false, requeue_reason: 'ENV_LIMIT' });
    // Exactly one attempt of trial 0 began (one event stream), and it sent one request.
    expect([...sink.events.keys()].filter((k) => k.startsWith('_toy/0#'))).toHaveLength(1);
    expect([...sent].filter(([k]) => k.endsWith('/0')).map(([, n]) => n)).toEqual([1]);
    // Trial 1 ran and passed.
    expect((await sink.settled()).map((r) => [r.index, r.outcome])).toEqual([[1, 'PASS']]);
  });
});

describe('(b) a 400 prompt is too long', () => {
  it('classifies as ENV_LIMIT prompt_too_long, which does not stop the batch', () => {
    const e = new ApiError('HTTP 400 invalid_request_error: prompt is too long: 215013 tokens > 200000 maximum', { status: 400, type: 'invalid_request_error', retryable: false, stopsBatch: false });
    expect(classifyFailure(e)).toMatchObject({ status: 'ENV_LIMIT', code: 'prompt_too_long', stopsBatch: false });
    // Any other 400 still stops it.
    expect(classifyFailure(new ApiError('HTTP 400 invalid_request_error: messages: bad', { status: 400, type: 'invalid_request_error', retryable: false, stopsBatch: true }))).toMatchObject({ status: 'INFRA_HARNESS', stopsBatch: true });
  });

  // verifier-phase-P17i-W0-A-1 F5: the ApiError the client throws for the 400 says it does not
  // stop the batch (errorStatus), as classifyFailure does; any other 400 still says it does.
  it('the client throws an ApiError with stopsBatch false for it, true for another 400', async () => {
    const other = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: roles must alternate' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    for (const [res, stops] of [[tooLong, false], [other, true]] as const) {
      const { client: c } = await client(async () => res());
      const e = await c.send([{ role: 'user', content: 'x' }], { max_tokens: 100 }).then(() => null, (err: unknown) => err);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status: 400, errorType: 'invalid_request_error', stopsBatch: stops, retryable: false });
    }
  });

  it('ends the trial LIMIT context_window prompt_too_long, grades ENV_LIMIT, and leaves the grant open', async () => {
    const t = await toyTrial([tooLong]);
    expect(t.record).toMatchObject({ status: 'LIMIT', detail: 'context_window', outcome: 'ENV_LIMIT', fault: 'env' });
    expect(t.events.find((e) => e.type === 'limit')).toMatchObject({ limit: 'context_window', code: 'prompt_too_long', cap: 200_000, value: 215_013 });
    expect(t.grant.signal.aborted).toBe(false);
    expect(t.store.rows.filter((r) => r.kind === 'close')).toEqual([]);
    expect(explain(t)).toMatchObject({ fault: 'env', label: 'environment', deciding: { id: 'E7' } });
  });

  it('in a batch, the next trial runs: the batch is not stopped', async () => {
    const store = new MemoryStore();
    const sent = new Map<string, number>();
    const d = batchDeps(store, (trial) => (trial.endsWith('/0') ? async () => tooLong() : scenarioTransport('toy').transport), sent);
    const sink = d.sink as ReturnType<typeof memorySink>;
    const result = await runBatch(spec(), d);
    expect(result.stopped).toBeNull();
    expect((await sink.requeued()).map((r) => [r.index, r.outcome, r.requeue_reason])).toEqual([[0, 'ENV_LIMIT', 'ENV_LIMIT']]);
    expect((await sink.settled()).map((r) => [r.index, r.outcome])).toEqual([[1, 'PASS']]);
    expect([...sent].filter(([k]) => k.endsWith('/0')).map(([, n]) => n)).toEqual([1]);
  });
});

describe('(f) ENV_LIMIT is excluded and never rerun', () => {
  it('is an env outcome, not valid, in NEVER_RERUN and not in RERUN_OUTCOMES', () => {
    expect(FAULT.ENV_LIMIT).toBe('env');
    expect(isValid('ENV_LIMIT')).toBe(false);
    expect(VALID_OUTCOMES).not.toContain('ENV_LIMIT');
    expect(NEVER_RERUN).toEqual(['GRADER_ERROR', 'ENV_LIMIT']);
    expect(RERUN_OUTCOMES).not.toContain('ENV_LIMIT');
    expect(RERUN_OUTCOMES).toContain('ENV_ERROR');
    expect(Object.keys(NOT_RERUN_REASON).sort()).toEqual([...NEVER_RERUN].sort());
  });

  it('DENOMINATOR_RULE lists it as never rerun, with its reason', () => {
    expect(DENOMINATOR_RULE).toMatch(/GRADER_ERROR and ENV_LIMIT are excluded and never rerun as a model trial/);
    expect(DENOMINATOR_RULE).toContain(`ENV_LIMIT: ${NOT_RERUN_REASON.ENV_LIMIT}`);
    expect(DENOMINATOR_RULE).toContain(`GRADER_ERROR: ${NOT_RERUN_REASON.GRADER_ERROR}`);
    expect(DENOMINATOR_RULE).toMatch(/INFRA_API, CANCELLED and ENV_ERROR are excluded and rerun/);
  });
});
