// The agent loop (design section 6): request, then the answer's tool calls one at a time in
// emitted order, until the episode ends. It keeps the conversation append-only: MessagesClient
// appends each complete answer exactly as streamed, thinking blocks and signatures included,
// and the loop only appends the user turn of tool results after it. It never edits or drops an
// earlier message.
//
// The episode ends on:
//   finish                 the calls before it in the same answer run; each call after it is
//                          recorded as a tool_result with executed false and "episode finished"
//   an answer without tool use (end_turn)
//   a refusal              REFUSAL
//   the context window     LIMIT context_window: an answer with stop_reason
//                          model_context_window_exceeded (code stop_reason; none of its tool
//                          calls runs, complete or cut off), or a 400 prompt is too long (code
//                          prompt_too_long). The grader grades it ENV_LIMIT, the environment's:
//                          the task's list did not fit the window (plan-amendment-worklist W0-A)
//   a cap                  LIMIT, counted on what the model used only (R14-13, R14-14). Whose
//                          fault it is the grader decides (packages/grader/outcome.ts): the
//                          model's while it was looping, the environment's (ENV_LIMIT) otherwise
//                          (rule P-L, packages/grader/progress.ts, which fails safe). The
//                          caps: turns (requests sent), cost (the priced usage of the
//                          answers so far; a worst-case settle of a dropped or aborted attempt
//                          is in the ledger and cost_usd but not here) and working time
//                          (elapsed time on the injected clock less retry_wait_ms: failed
//                          attempts and the backoff waits after them), checked before each
//                          request; working time also aborts an attempt in flight through the
//                          injected `timeout` at the remaining budget, and that call settles at
//                          its worst case with no retry; and a second max_tokens stop in a row
//                          (the first is asked to continue)
//   the hard elapsed bound INFRA_API, code elapsed_bound: total elapsed time, retries included,
//                          reached caps.maxElapsedMs (checked before each request, and aborting
//                          a call in flight once a retry has happened); batch.ts re-queues it
//   the settled-cost bound MAX_SETTLED_USD: an attempt whose worst case would take cost_usd
//                          (worst-case settles included) past it is not sent, so a trial's
//                          ledger spend never passes it. Whose spend passes it decides the end:
//                          LIMIT cost, code worst_case: priced usage (the answers) plus this
//                            request's own worst case passes it, with no failed attempt
//                            counted: the model's spend, so rule P-L splits it into LIMIT and
//                            ENV_LIMIT like the cost cap (a model whose context grows fast can
//                            reach it under maxCostUsd). The loop aborts the call with a
//                            CostLimitRefused; never re-queued
//                          INFRA_API, code spend_bound: only the worst-case settles of failed or
//                            aborted attempts make up the difference; batch.ts re-queues it.
//                            The loop aborts the call with a SpendBoundRefused
//                          classifyFailure reads either refusal as stopsBatch false: it ends this
//                          trial only
//   an unpriced usage      INFRA_HARNESS, code unpriced_usage, on the answer that has it: a
//                          missing price is a harness defect, not the model's spend
//   opts.signal aborted    CANCELLED, checked before each request and passed to the client
//   an exception from the environment: a tool (other than a ToolError) or the state hash
//                          ENV_ERROR, code INTERNAL: the environment's fault, not the model's
//   a client error         INFRA_API, INFRA_HARNESS or INVALID (a response from another model)
// Every failed or aborted attempt is recorded as an attempt_error event (MessagesClient
// onAttemptError): its error class, code, status, message, how it settled and whether the client
// retries; never the key or the request body.
// It reads no clock and draws no randomness (eslint-rules/determinism.js): time comes from the
// injected `now` and `timeout`, used only for the working-time cap and the elapsed bound.
import { classifyFailure, CostLimitRefused, SpendBoundRefused, type CallResult, type MessageParam, type MessageParams, type SendOptions } from './anthropic.ts';
import { PER_TRIAL_CAP_USD, usageCostUsd, type Usage } from './cost.ts';
import type { ErrorStatus, EventBody, Limit, LimitCode, TrialStatus } from './events.ts';
import { ERROR_CODES, internalError, type ErrorCode } from '../env/tools/errors.ts';
import { callTool, type Tool, type ToolResult } from '../env/tools/registry.ts';
import type { WriteContext } from '../env/tools/write/index.ts';

// The part of MessagesClient the loop uses: send appends a complete, non-refusal answer to history.
export interface TrialClient {
  send(history: MessageParam[], params: MessageParams, opts?: SendOptions): Promise<CallResult>;
}

export interface Caps {
  maxTurns: number;
  // Against priced usage only.
  maxCostUsd: number;
  // Working time: elapsed less retry_wait_ms.
  maxWallMs: number;
  // Total elapsed time, retries included; at least maxWallMs.
  maxElapsedMs: number;
}

export interface LoopInput {
  client: TrialClient;
  params: MessageParams;
  // Starts as the instruction turn; the loop appends to it.
  history: MessageParam[];
  tools: readonly Tool<WriteContext>[];
  ctx: WriteContext;
  caps: Caps;
  now: () => number;
  // A signal that aborts after ms of wall-clock time.
  timeout: (ms: number) => AbortSignal;
  signal?: AbortSignal;
  emit: (body: EventBody) => void;
  stateHash: () => Promise<string>;
  // The outcome to fill in, kept current as the loop goes (each settle, request, response and
  // tool call), so a caller still holds what was spent if the loop throws (an emit that
  // throws). Default newOutcome().
  out?: LoopOutcome;
}

export type Terminal =
  | { type: 'limit'; limit: Limit; cap: number; value: number; code?: LimitCode }
  | { type: 'error'; status: ErrorStatus; code: string; message: string }
  | { type: 'cancelled'; reason: string };

export interface LoopOutcome {
  status: TrialStatus;
  // How a COMPLETED episode ended.
  stop: 'finish' | 'end_turn' | null;
  // The event that ends a trial in any other status; run() emits it last.
  terminal: Terminal | null;
  turns: number;
  tool_calls: number;
  tool_errors: Record<ErrorCode, number>;
  usage: { input: number; cache_write: number; cache_read: number; output: number };
  cost_usd: number;
  models_returned: string[];
  // Retries the client reported (onRetry), so a trial that ends in a retry storm records them
  // too. It includes a retry the spend bound then refused before sending it.
  api_retries: number;
  // Time spent in failed attempts that were retried and the backoff waits after them, up to the
  // next attempt or the end of the trial, on the injected clock: left out of working time. A
  // final failed attempt that the client does not retry is not counted (it ends the trial).
  retry_wait_ms: number;
  stop_reason: string | null;
  refusal_category: string | null;
}

// The bound on a trial's cost_usd, worst-case settles included. The cost cap reads priced usage
// only, so without it attempts that keep dropping (say, a proxy that cuts long streams) would
// settle worst cases until the turn cap.
export const MAX_SETTLED_USD = 2 * PER_TRIAL_CAP_USD;

// What onAttempt refuses an attempt with: LIMIT cost (code worst_case) or INFRA_API spend_bound.
type Refused = Extract<Terminal, { type: 'error' | 'limit' }>;

const CONTINUE = 'Your previous answer reached the output token limit. Continue from where it stopped.';
const FINISHED = { error: { code: 'CONFLICT', message: 'episode finished' } } as const;

interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export const errorText = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// How a failed send ends the trial: cancelled, LIMIT context_window for a prompt too long, or
// as classifyFailure says.
function clientFailure(e: unknown, signal: AbortSignal | undefined): Terminal {
  if (signal?.aborted) return { type: 'cancelled', reason: errorText(signal.reason ?? e) };
  const { status, code, message } = classifyFailure(e);
  if (status === 'ENV_LIMIT') {
    // "prompt is too long: 215013 tokens > 200000 maximum": the prompt and the window, when given.
    const m = /(\d+) tokens > (\d+)/.exec(message);
    return { type: 'limit', limit: 'context_window', cap: m ? Number(m[2]) : 0, value: m ? Number(m[1]) : 0, code: 'prompt_too_long' };
  }
  return { type: 'error', status, code, message };
}

const toolResultBlock = (id: string, r: Pick<ToolResult, 'content' | 'is_error'>) => ({
  type: 'tool_result',
  tool_use_id: id,
  content: JSON.stringify(r.content),
  ...(r.is_error ? { is_error: true } : {}),
});

// The outcome of a trial that has sent nothing yet.
export const newOutcome = (): LoopOutcome => ({
  status: 'COMPLETED', stop: null, terminal: null, turns: 0, tool_calls: 0,
  tool_errors: Object.fromEntries(ERROR_CODES.map((c) => [c, 0])) as Record<ErrorCode, number>,
  usage: { input: 0, cache_write: 0, cache_read: 0, output: 0 }, cost_usd: 0,
  models_returned: [], api_retries: 0, retry_wait_ms: 0, stop_reason: null, refusal_category: null,
});

// Node keeps a timeout signal that has an abort listener alive, with everything the listener's
// closure reaches (the trial's store), until it fires; every listener the loop adds to a
// `timeout` signal is removed when its attempt or the trial ends, through `exits` for the trial.
export async function runLoop(input: LoopInput): Promise<LoopOutcome> {
  const exits: Array<() => void> = [];
  try {
    return await loop(input, exits);
  } finally {
    for (const exit of exits) exit();
  }
}

async function loop(input: LoopInput, exits: Array<() => void>): Promise<LoopOutcome> {
  const { client, params, history, tools, ctx, caps, now, timeout, signal, emit } = input;
  const started = now();
  const out = input.out ?? newOutcome();
  const end = (status: TrialStatus, terminal: Terminal | null, stop: LoopOutcome['stop'] = null): LoopOutcome =>
    Object.assign(out, { status, terminal, stop });
  // Messages already carried by a request or response event.
  let logged = 0;
  let maxTokensInARow = 0;
  // What the cost cap reads: the priced usage of the answers so far.
  let pricedUsd = 0;
  const onSettle = (usd: number) => {
    out.cost_usd += usd;
  };
  const internal = (e: unknown) => end('ENV_ERROR', { type: 'error', status: 'ENV_ERROR', code: 'INTERNAL', message: errorText(e) });

  // Working time. A failed attempt's time, and the wait after it, move into retry_wait_ms when
  // the client reports the retry (onRetry) and when the next attempt starts (onAttempt).
  // Each takes the time `t` the caller read once, so one decision reads the clock once.
  let attemptStart = started;
  let waitFrom: number | null = null;
  const working = (t: number) => t - started - out.retry_wait_ms - (waitFrom === null ? 0 : t - waitFrom);
  const settleWait = (t: number) => {
    if (waitFrom !== null) out.retry_wait_ms += t - waitFrom;
    waitFrom = null;
  };
  // The hard elapsed bound. Without a retry, working time is elapsed time and reaches its cap
  // first, so the bound's timer starts at the trial's first retry.
  const bound = new AbortController();
  let boundArmed = false;
  const armBound = (t: number) => {
    if (boundArmed) return;
    boundArmed = true;
    const s = timeout(caps.maxElapsedMs - (t - started));
    const fire = () => bound.abort(s.reason);
    if (s.aborted) fire();
    else {
      s.addEventListener('abort', fire, { once: true });
      exits.push(() => s.removeEventListener('abort', fire));
    }
  };
  const elapsedBound = (t: number): Terminal => ({
    type: 'error', status: 'INFRA_API', code: 'elapsed_bound',
    message: `${t - started} ms elapsed, past the hard bound of ${caps.maxElapsedMs} ms (${out.retry_wait_ms} ms in failed attempts and retry waits)`,
  });
  const spendBound = (worstUsd: number): Extract<Terminal, { type: 'error' }> => ({
    type: 'error', status: 'INFRA_API', code: 'spend_bound',
    message: `$${out.cost_usd.toFixed(2)} settled (worst cases of failed attempts included) + this attempt's worst case $${worstUsd.toFixed(2)} would pass the bound of $${MAX_SETTLED_USD.toFixed(2)} (2 x PER_TRIAL_CAP_USD)`,
  });
  // The bound reached on priced usage alone: the model's spend. cap is the bound and value the
  // priced usage plus the refused request's worst case; code worst_case says the request was not
  // sent, as against the cost cap reached by answers (no code).
  const costBound = (worstUsd: number): Extract<Terminal, { type: 'limit' }> => ({
    type: 'limit', limit: 'cost', cap: MAX_SETTLED_USD, value: pricedUsd + worstUsd, code: 'worst_case',
  });
  const wallLimit = (t: number): Terminal => ({ type: 'limit', limit: 'wall_clock', cap: caps.maxWallMs, value: working(t) });

  for (;;) {
    if (signal?.aborted) return end('CANCELLED', { type: 'cancelled', reason: errorText(signal.reason) });
    if (out.turns >= caps.maxTurns) return end('LIMIT', { type: 'limit', limit: 'turns', cap: caps.maxTurns, value: out.turns });
    if (pricedUsd >= caps.maxCostUsd) return end('LIMIT', { type: 'limit', limit: 'cost', cap: caps.maxCostUsd, value: pricedUsd });
    const t = now();
    if (working(t) >= caps.maxWallMs) return end('LIMIT', wallLimit(t));
    if (t - started >= caps.maxElapsedMs) return end('INFRA_API', elapsedBound(t));

    const turn = out.turns + 1;
    emit({ type: 'request', turn, messages_from: logged, messages: history.slice(logged), ...(turn === 1 ? { params } : {}) });
    out.turns = turn;
    // Each attempt gets a timer at the remaining working time; it aborts the call only if it
    // fires while that attempt is in flight (not after it failed, during the wait for a retry).
    const work = new AbortController();
    // Aborted before an attempt's reserve when its worst case would pass MAX_SETTLED_USD.
    const spend = new AbortController();
    let refused: Refused | null = null;
    let detach = () => {};
    const startAttempt = (at: number) => {
      detach();
      settleWait(at);
      attemptStart = at;
      const s = timeout(caps.maxWallMs - working(at));
      const fire = () => {
        if (waitFrom === null) work.abort(s.reason);
      };
      if (s.aborted) fire();
      else {
        s.addEventListener('abort', fire, { once: true });
        detach = () => s.removeEventListener('abort', fire);
      }
    };
    startAttempt(t);
    const onAttempt = (n: number, worstUsd: number) => {
      // The model's spend first: priced usage and this request's own worst case pass the bound
      // with no failed attempt counted, so the trial ends LIMIT cost (rule P-L). Only when
      // worst-case settles of failed or aborted attempts make the difference is it INFRA_API.
      if (pricedUsd + worstUsd > MAX_SETTLED_USD) {
        refused = costBound(worstUsd);
        spend.abort(new CostLimitRefused(`priced usage $${pricedUsd.toFixed(2)} + this request's worst case $${worstUsd.toFixed(2)} would pass the bound of $${MAX_SETTLED_USD.toFixed(2)}`));
        return;
      }
      if (out.cost_usd + worstUsd > MAX_SETTLED_USD) {
        refused = spendBound(worstUsd);
        // A typed reason, so every layer it passes through (MessagesClient, the batch wrapper)
        // classifies it as this trial's INFRA_API spend_bound, never as a batch stop.
        spend.abort(new SpendBoundRefused(refused.message));
        return;
      }
      if (n > 1) startAttempt(now());
    };
    const onRetry = () => {
      out.api_retries++;
      const at = now();
      out.retry_wait_ms += at - attemptStart;
      waitFrom = at;
      armBound(at);
    };
    let r: CallResult;
    let emitFailure: { error: unknown } | undefined;
    try {
      r = await client.send(history, params, {
        signal: AbortSignal.any([...(signal ? [signal] : []), work.signal, bound.signal, spend.signal]), onSettle, onAttempt, onRetry,
        // An emit that throws here would surface from send as a client error; it is kept and
        // rethrown after send instead, as any other emit failure of the loop.
        onAttemptError: (f) => {
          try {
            emit({ type: 'attempt_error', turn, ...f });
          } catch (e) {
            emitFailure ??= { error: e };
          }
        },
      });
    } catch (e) {
      if (emitFailure) throw emitFailure.error;
      const at = now();
      settleWait(at);
      // onAttempt sets it; TypeScript does not follow a write inside a closure, so read it typed.
      const refusal = refused as Refused | null;
      if (!signal?.aborted && refusal !== null) return end(refusal.type === 'limit' ? 'LIMIT' : 'INFRA_API', refusal);
      if (!signal?.aborted && work.signal.aborted) return end('LIMIT', wallLimit(at));
      if (!signal?.aborted && bound.signal.aborted) return end('INFRA_API', elapsedBound(at));
      const failure = clientFailure(e, signal);
      return end(failure.type === 'error' ? failure.status : failure.type === 'limit' ? 'LIMIT' : 'CANCELLED', failure);
    } finally {
      detach();
    }
    if (emitFailure) throw emitFailure.error;
    const m = r.message;
    const priced = usageCostUsd(m.usage);
    // The outcome first, then the event: an emit that throws leaves the outcome current.
    if (!out.models_returned.includes(m.model)) out.models_returned.push(m.model);
    out.stop_reason = m.stop_reason;
    const u: Usage = m.usage;
    out.usage.input += u.input_tokens;
    out.usage.cache_write += u.cache_creation_input_tokens ?? 0;
    out.usage.cache_read += u.cache_read_input_tokens ?? 0;
    out.usage.output += u.output_tokens;
    if (priced !== null) pricedUsd += priced;
    if (r.refusal) out.refusal_category = r.refusal.category;
    emit({
      type: 'response', turn, id: m.id, model: m.model, stop_reason: m.stop_reason, stop_details: (m.stop_details ?? null) as Record<string, unknown> | null,
      content: m.content, usage: m.usage, attempts: r.attempts, cost_usd: priced,
    });
    // The answer is in history now and in the response event.
    logged = history.length;
    emit({ type: 'usage', turn, total: { ...out.usage }, cost_usd: out.cost_usd });

    if (priced === null) {
      return end('INFRA_HARNESS', { type: 'error', status: 'INFRA_HARNESS', code: 'unpriced_usage', message: `the usage of response ${m.id} cannot be priced (packages/core/cost.ts usageCostUsd): ${JSON.stringify(m.usage)}` });
    }
    if (r.refusal) return end('REFUSAL', null);
    // The context the stopped request held: the window it reached.
    if (m.stop_reason === 'model_context_window_exceeded') {
      const context = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      return end('LIMIT', { type: 'limit', limit: 'context_window', cap: context, value: context, code: 'stop_reason' });
    }
    const uses = m.content.filter((b): b is ToolUse & typeof b => b.type === 'tool_use');
    const truncated = m.stop_reason === 'max_tokens';
    maxTokensInARow = truncated ? maxTokensInARow + 1 : 0;
    if (maxTokensInARow >= 2) return end('LIMIT', { type: 'limit', limit: 'max_tokens', cap: 1, value: maxTokensInARow - 1 });
    if (uses.length === 0 && !truncated) return end('COMPLETED', null, 'end_turn');

    const blocks: object[] = [];
    let finished = false;
    for (const use of uses) {
      emit({ type: 'tool_call', turn, tool_use_id: use.id, name: use.name, input: use.input });
      if (finished) {
        emit({ type: 'tool_result', turn, tool_use_id: use.id, name: use.name, executed: false, is_error: true, error_code: FINISHED.error.code, content: FINISHED, exposed_ids: [], referenced_ids: [] });
        continue;
      }
      out.tool_calls++;
      let res: ToolResult;
      try {
        res = callTool(tools, use.name, use.input, ctx);
      } catch (e) {
        const body = internalError(e);
        out.tool_errors.INTERNAL++;
        emit({ type: 'tool_result', turn, tool_use_id: use.id, name: use.name, executed: true, is_error: true, error_code: 'INTERNAL', content: body, exposed_ids: [], referenced_ids: [] });
        return end('ENV_ERROR', { type: 'error', status: 'ENV_ERROR', code: 'INTERNAL', message: body.error.message });
      }
      const code = res.is_error ? ((res.content as { error?: { code?: ErrorCode } }).error?.code ?? null) : null;
      if (code !== null) out.tool_errors[code]++;
      emit({
        type: 'tool_result', turn, tool_use_id: use.id, name: use.name, executed: true, is_error: res.is_error, error_code: code, content: res.content,
        exposed_ids: res.exposed_ids, referenced_ids: res.referenced_ids, ...(res.written_ids ? { written_ids: res.written_ids } : {}),
      });
      if (res.written_ids) {
        let hash: string;
        try {
          hash = await input.stateHash();
        } catch (e) {
          return internal(e);
        }
        emit({ type: 'state_hash', turn, at: 'write', hash, tool_use_id: use.id });
      }
      blocks.push(toolResultBlock(use.id, res));
      if (use.name === 'finish' && !res.is_error) finished = true;
    }
    if (finished) return end('COMPLETED', null, 'finish');
    if (truncated) blocks.push({ type: 'text', text: CONTINUE });
    history.push({ role: 'user', content: blocks as MessageParam['content'] });
  }
}
