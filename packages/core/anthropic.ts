// The one raw Messages client, for the browser and Node: fetch, SSE streaming, retries,
// refusal and model checks. It is the only file that names the API host (lint:
// no-direct-anthropic), and MessagesClient is the only way to send: the URL, headers and body
// builders stay private to this module. Each attempt is one Request, registered here just
// before the client hands it to its transport and unregistered when the transport returns;
// the egress guard (egress.ts) refuses any request to the API host but a registered one, once,
// unchanged. A client is built only from a live BatchGrant
// (assertClientGrant), and every attempt reserves its worst case under the ledger lock before
// fetch and settles after:
//   HTTP error status        settled at $0: the API bills no error response
//   refused by the egress guard before the Request left
//                            settled at $0, not retried
//   complete stream          settled at its usage
//   dropped, idle or errored stream, malformed frame, or an abort, after message_start
//                            settled at the usage the stream reported: message_start's input
//                            and cache counts, and message_delta's output count, or max_tokens
//                            when no message_delta came (the output is unknown, and max_tokens
//                            caps it). The claude-api reference bills a stream stopped
//                            mid-output for its input and the output already streamed
//                            (shared/model-migration.md, refusal section: "input and
//                            already-streamed output are billed at normal rates"); it does not
//                            say what a client disconnect bills, so the output is counted at
//                            its cap. The partial answer is discarded, never appended
//   the same before message_start, or a network error after send
//                            settled at the worst case: usage is unknown
// The worst case an attempt reserves prices input from a token estimate when the client saw the
// previous request of the same conversation answered: that request's prompt tokens (usage input
// + cache write + cache read) plus each byte added since as one token, plus
// INPUT_OVERHEAD_TOKENS (promptEstimate). Otherwise every body byte counts as one token.
// Retried: 408, 409, 429, 5xx (529 included), an error event mid-stream, a dropped stream, a
// network error, an attempt idle for IDLE_STREAM_MS (no response headers, or no stream bytes,
// for that long: it is cut off and settled at the worst case); up to maxAttempts (8), waiting retry-after (at most 60 s) or an exponential
// backoff with jitter from 2 s to 60 s (design section 1, "Failure modes"). An abort is
// never retried: send takes a per-request signal, combined with the grant's, and once either
// has aborted the call throws the abort reason. Aborted before the reserve, nothing is
// reserved or sent; aborted in flight, the attempt settles what its stream reported, else its
// worst case. Every failed or aborted attempt is reported to onAttemptError and logged.
// classifyFailure says how a failed call ends a trial, for the trial loop and the judge alike,
// and whether it stops the batch: a 400, 401, 403, 404 (the model: /v1/messages is the only
// endpoint), a billing error, a substituted model, an egress refusal, a spend refusal and any
// local error do (design section 1, "Failure modes"; section 5, "Outcomes"). A 400 whose prompt
// is too long for the model's context window does not: the task's list did not fit, which ends
// only that trial, as ENV_LIMIT (plan-amendment-worklist W0-A). A call that
// stops the batch closes the grant, which stops every client of the batch, and the grant
// closes on nothing else; any other 4xx fails the call only, and so does an abort. Headers
// are never logged, and the key is redacted from every log
// line and error message.
//
// Threat model: these checks guard against accidental unmetered or under-metered calls by code
// in this repo: a send that skips MessagesClient (refused by the egress guard where an entry
// point installed it), a transport that resends or edits the client's Request (refused), a
// request the cost model cannot bound (rejected before reserve). Out of scope, as a documented
// residual: a transport written to fabricate a response (say, a 200 with zero usage) after its
// one real send; the client settles what the response reports. The guard and the claim read a
// Request from its internal slots (requestUrl, headerSig), never from properties a caller can
// shadow, and the guard replaces a dispatcher in any init it forwards with its own. In Node the
// guard also holds undici's global dispatcher slots: a locked dispatcher there refuses the API
// host by every method, however the code reached the slot, so a swap of the slot, a redirect
// hop to the API host and a fetch with no dispatcher of its own all meet it. Lint
// (no-direct-dispatcher) is a second layer: it keeps every file but egress.ts from reaching
// those slots, from importing or requiring undici and from calling process.getBuiltinModule.
// A proxy reached under another name is covered when it is a metered origin: a relay the client
// sends to through its endpoint option, which the entry point lists in the guard's
// meteredOrigins, is guarded like the API host by every API and the undici slots, so only the
// claimed Request reaches it, once.
// Also out of scope, documented residuals neither the guard nor lint sees:
//   - other realms with their own fetch: node:worker_threads, browser Workers and iframes
//   - a fetch or dispatcher reference a module captured before its entry point ran
//     installEgressGuard (in Node a captured fetch still meets the guarded dispatcher unless
//     it is handed a dispatcher captured then)
//   - a request that reaches the API under another name: an IP-literal host, a DNS alias, a
//     proxy whose origin is not in meteredOrigins (an unlisted one, or a metered host under
//     another scheme or port), or a redirect a browser follows from another origin to a metered
//     one (in Node the guarded dispatcher refuses that hop)
//   - Node's http, https, http2, net and tls modules with a host built at runtime (lint flags a
//     literal API host passed to them)
import { INPUT_OVERHEAD_TOKENS, usageCostUsd, worstCaseUsd, type Usage } from './cost.ts';
import { assertClientGrant, SpendRefused, type BatchGrant, type Ledger, type Reservation, type ReserveRequest } from './ledger.ts';
import type { AttemptSettle } from './events.ts';
import { redactText } from './redact.ts';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2026-10-21';
export const MODEL = 'claude-opus-5-5';
// Design section 1, "Failure modes": a 429 honours retry-after, else exponential backoff with
// jitter, 2 s to 60 s, 8 attempts; a 529, other 5xx, network error or dropped stream gets the
// same backoff.
export const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60_000;
const RETRY_AFTER_MAX_MS = 60_000;
// An attempt that receives nothing (no response headers, then no stream bytes) for this long is
// cut off and fails as retryable (R14-13): an upstream stall is the API's fault, never the
// model's. The API streams ping events, so a live stream is never this quiet.
export const IDLE_STREAM_MS = 180_000;

// The wait before retry `attempt` + 1: the exponential step (2 s, 4 s, ... up to 60 s) times a
// jitter factor from 0.5 to 1, never under 2 s.
const backoffMs = (attempt: number, random: number): number =>
  Math.max(BACKOFF_BASE_MS, Math.round(Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS) * (0.5 + random / 2)));

const API_HOST = new URL(MESSAGES_URL).hostname;
const MESSAGES_PATH = new URL(MESSAGES_URL).pathname;
// Hosts a plain-http endpoint may name: a relay on this machine (P16h's local mode). As the
// WHATWG parser leaves them, so 127.1 is 127.0.0.1 and localhost. is not localhost.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The URL a client sends to: the API by default, or a relay that forwards the same Request to
// it. An endpoint is an absolute https URL whose path is exactly the Messages path, with no
// query, fragment or credentials; plain http only on a loopback host, so the key never crosses
// a network in clear text. The message never echoes the endpoint, which may hold credentials.
function messagesEndpoint(endpoint: string | undefined): string {
  if (endpoint === undefined) return MESSAGES_URL;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError('endpoint is not an absolute URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    throw new TypeError('endpoint must be https, or plain http on 127.0.0.1, localhost or [::1]');
  }
  // href holds credentials, a query or a fragment, even an empty one, and origin holds none.
  if (url.href !== `${url.origin}${MESSAGES_PATH}`) throw new TypeError(`endpoint must be exactly <origin>${MESSAGES_PATH}, with no query, fragment or credentials`);
  return url.href;
}
const API_DOMAIN = API_HOST.slice(API_HOST.indexOf('.') + 1);

// Whether a WHATWG-parsed hostname is the API host or any other host of its domain. Parsing
// has already decoded %2E, mapped IDNA dots and lower-cased it; a trailing dot names the same
// DNS host.
export function isApiHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, '');
  return h === API_DOMAIN || h.endsWith(`.${API_DOMAIN}`);
}

// A Request read the way fetch reads it, from its internal slots: the platform getters and the
// Headers iterator, captured when this module loads (egress.ts imports it, so before the guard
// is installed). An own property, a subclass getter or a later patch of Request.prototype or
// Headers.prototype changes what JavaScript sees, not what these return or what fetch sends.
const slot = (k: 'url' | 'method' | 'headers' | 'bodyUsed') => Object.getOwnPropertyDescriptor(Request.prototype, k)!.get!;
const native = { url: slot('url'), method: slot('method'), headers: slot('headers'), bodyUsed: slot('bodyUsed') };
const headerEntries = Headers.prototype.entries;
const headerNext = Object.getPrototypeOf(headerEntries.call(new Headers())).next as (this: unknown) => IteratorResult<[string, string]>;

// The URL of a real Request, or null for any other object (the getter's brand check throws).
export function requestUrl(input: unknown): string | null {
  try {
    return native.url.call(input) as string;
  } catch {
    return null;
  }
}

function headerSig(request: Request): string {
  const it = headerEntries.call(native.headers.call(request) as Headers);
  let sig = '';
  for (let e = headerNext.call(it); !e.done; e = headerNext.call(it)) sig += `${e.value[0]}:${e.value[1]}\n`;
  return sig;
}

// Requests the client has handed to its transport and not yet seen return, each with the
// header set it was built with. Only sendOnce adds to it.
const outbound = new WeakMap<Request, string>();
// Registered Requests a claim let out: the guard forwarded them, so they may have reached the API.
const sent = new WeakSet<Request>();

// For the egress guard and the probe relay: true once for a Request the client registered, if
// it comes with no init (which could swap its body or headers), its method and headers are the
// ones it was built with and its body is unread. Any claim ends the registration, so a second
// fetch of the same Request, a copy or a clone is refused.
export function claimOutbound(request: unknown, init?: unknown): boolean {
  if (requestUrl(request) === null) return false;
  const r = request as Request;
  const sig = outbound.get(r);
  if (sig === undefined) return false;
  outbound.delete(r);
  if (init !== undefined || native.method.call(r) !== 'POST' || native.bodyUsed.call(r) || headerSig(r) !== sig) return false;
  sent.add(r);
  return true;
}

// What the egress guard throws for a request it refuses: nothing left the process. A TypeError,
// as fetch's own pre-send failures are.
export class EgressRefusal extends TypeError {
  override readonly name = 'EgressRefusal';
}

export interface ContentBlock {
  type: string;
  [k: string]: unknown;
}
export interface MessageParam {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}
export interface MessageParams {
  max_tokens: number;
  system?: string | ContentBlock[];
  tools?: Array<Record<string, unknown>>;
  tool_choice?: { type: 'auto' | 'none'; disable_parallel_tool_use?: boolean };
  cache_control?: { type: 'ephemeral'; ttl?: '5m' };
  output_config?: Record<string, unknown>;
  thinking?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stop_sequences?: string[];
}
export interface Message {
  id: string;
  model: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string | null } | null;
  usage: Usage;
}

export interface ApiErrorInfo {
  status: number | null;
  type: string | null;
  retryable: boolean;
  stopsBatch: boolean;
  // The response had started streaming, or the request may have reached the API: usage unknown.
  partial?: boolean;
  // The retry-after header of an HTTP error, in seconds.
  retryAfter?: number | null;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number | null;
  readonly errorType: string | null;
  readonly retryable: boolean;
  readonly stopsBatch: boolean;
  readonly partial: boolean;
  readonly retryAfter: number | null;
  constructor(message: string, info: ApiErrorInfo) {
    super(message);
    this.status = info.status;
    this.errorType = info.type;
    this.retryable = info.retryable;
    this.stopsBatch = info.stopsBatch;
    this.partial = info.partial ?? false;
    this.retryAfter = info.retryAfter ?? null;
  }
}

// Request rules, checked on the serialized body before any reserve or fetch, so a toJSON
// cannot send what the input objects hide. Sampling params, server fallbacks, forced
// tool_choice and prefill are 400s on this model and API version or banned by the plan; only
// 5-minute cache_control is allowed, since the cost model reserves for it.
const ALLOWED = new Set(['max_tokens', 'system', 'tools', 'tool_choice', 'cache_control', 'output_config', 'thinking', 'metadata', 'stop_sequences']);
const BANNED: Record<string, string> = {
  temperature: 'temperature is a 400 on API version 2026-10-21',
  top_p: 'top_p is a 400 on API version 2026-10-21',
  top_k: 'top_k is a 400 on API version 2026-10-21',
  fallbacks: 'server-side fallbacks are not used: a refusal is recorded, never rerouted',
  model: `the client pins model ${MODEL}`,
  messages: 'pass the conversation as the history argument',
  stream: 'the client always streams',
};

function checkCacheTtl(v: unknown, path: string): void {
  if (Array.isArray(v)) v.forEach((x, i) => checkCacheTtl(x, `${path}[${i}]`));
  else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'cache_control' && typeof x === 'object' && x !== null && 'ttl' in x && x.ttl !== '5m') {
        throw new TypeError(`${path}.cache_control.ttl ${JSON.stringify(x.ttl)}: only the 5-minute cache is allowed`);
      }
      checkCacheTtl(x, `${path}.${k}`);
    }
  }
}

// Client tools only: the design's agent acts through native client tools. A server tool (any
// type but custom) runs on Anthropic's side, bills per use, and can run several sampling passes
// inside one request, so its input tokens are not bounded by the body size the reservation
// covers. Other server-billed features (mcp_servers, container, speed) are not in ALLOWED, and
// a forced tool_choice is refused below.
function checkTools(tools: unknown): void {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) throw new TypeError('request rejected: tools must be an array of client tool definitions');
  for (const t of tools as unknown[]) {
    if (typeof t !== 'object' || t === null || Array.isArray(t)) throw new TypeError('request rejected: a tool must be a client tool definition object');
    const { type, name, input_schema } = t as Record<string, unknown>;
    if (type !== undefined && type !== 'custom') throw new TypeError(`request rejected: server tool ${String(type)}: only client tools are allowed, since a server tool bills per use beyond what the reservation covers`);
    if (typeof name !== 'string' || typeof input_schema !== 'object' || input_schema === null) throw new TypeError('request rejected: a client tool needs a name and an input_schema');
  }
}

// Returns max_tokens as the body sends it, which is what the reservation must cover.
function checkRequest(params: MessageParams, body: string): number {
  for (const k of ['model', 'messages', 'stream']) if (Object.hasOwn(params, k)) throw new TypeError(`request rejected: ${BANNED[k]}`);
  const b = JSON.parse(body) as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (k === 'model' || k === 'messages' || k === 'stream') continue;
    if (k in BANNED) throw new TypeError(`request rejected: ${BANNED[k]}`);
    if (!ALLOWED.has(k)) throw new TypeError(`request rejected: unknown parameter ${k}`);
  }
  if (b.model !== MODEL || b.stream !== true) throw new TypeError(`request rejected: ${BANNED.model}, and it always streams`);
  const choice = (b.tool_choice as { type?: unknown } | undefined)?.type;
  if (choice !== undefined && choice !== 'auto' && choice !== 'none') throw new TypeError(`request rejected: forced tool_choice ${String(choice)} is a 400 on ${MODEL}`);
  const history = Array.isArray(b.messages) ? (b.messages as Array<{ role?: unknown }>) : [];
  if (history.length === 0 || history[0]?.role !== 'user') throw new TypeError('request rejected: the conversation must start with a user turn');
  if (history.at(-1)?.role === 'assistant') throw new TypeError(`request rejected: a prefill (history ending in an assistant turn) is a 400 on ${MODEL}`);
  checkTools(b.tools);
  checkCacheTtl(b, 'request');
  if (!Number.isSafeInteger(b.max_tokens) || (b.max_tokens as number) < 1) throw new TypeError('request rejected: max_tokens must be a positive integer');
  return b.max_tokens as number;
}

function requestBody(history: readonly MessageParam[], params: MessageParams): string {
  return JSON.stringify({ model: MODEL, ...params, messages: history, stream: true });
}

function requestHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

const reserveFor = (body: string, maxTokens: number, trial?: string): ReserveRequest =>
  ({ bodyBytes: new TextEncoder().encode(body).length, maxTokens, ...(trial ? { trial } : {}) });

// What the ledger reserves for one attempt of this request, for a projection; it sends nothing.
export function reserveRequest(history: readonly MessageParam[], params: MessageParams, trial?: string): ReserveRequest {
  const body = requestBody(history, params);
  return reserveFor(body, checkRequest(params, body), trial);
}

const retryableStatus = (s: number) => s === 408 || s === 409 || s === 429 || s >= 500;
// The statuses that stop the batch: no other request of it can succeed either.
const stopsBatchStatus = (s: number, type: string | null) => s === 400 || s === 401 || s === 403 || s === 404 || type === 'billing_error';
// A billing failure: a billing_error, or a 400 about the credit balance or billing.
const isBilling = (e: ApiError) => e.errorType === 'billing_error' || (e.status === 400 && /credit balance|billing/i.test(e.message));
// A 400 invalid_request_error whose prompt does not fit the model's context window.
const PROMPT_TOO_LONG = /prompt is too long/i;
const isPromptTooLong = (status: number | null, type: string | null, message: string) => status === 400 && type === 'invalid_request_error' && PROMPT_TOO_LONG.test(message);
const broken = (message: string, type: string | null = 'stream_dropped', retryable = true) =>
  new ApiError(message, { status: 200, type, retryable, stopsBatch: false, partial: true });
const retryableStreamError = (type: string | null) => type === 'overloaded_error' || type === 'api_error' || type === 'rate_limit_error';

async function errorStatus(res: Response): Promise<ApiError> {
  let type: string | null = null;
  let detail = '';
  try {
    const j = (await res.json()) as { error?: { type?: string; message?: string } };
    type = j.error?.type ?? null;
    detail = j.error?.message ?? '';
  } catch {
    // a body that is not JSON: the status says enough
  }
  const retryable = retryableStatus(res.status);
  const after = Number(res.headers.get('retry-after') ?? NaN);
  return new ApiError(`HTTP ${res.status}${type ? ` ${type}` : ''}${detail ? `: ${detail}` : ''}`, {
    status: res.status, type, retryable, stopsBatch: stopsBatchStatus(res.status, type) && !isPromptTooLong(res.status, type, detail), retryAfter: Number.isFinite(after) && after >= 0 ? after : null,
  });
}

// Folds SSE events into the final message. Throws ApiError(partial) on an error event, a
// malformed frame or a stream that ends before message_stop. A tool_use whose input JSON is
// cut off is dropped from the content when the message stops at max_tokens or at the model's
// context window (model_context_window_exceeded), so the caller gets that stop and never a
// tool call with half its arguments; under any other stop reason it is an error.
// onBytes runs on every chunk; once `idle` aborts, a pending read ends as a dropped stream.
// The stop reasons that may cut a tool_use off mid-input (readStream).
const CUT_OFF_STOPS = ['max_tokens', 'model_context_window_exceeded'];

// What a stream reported about its usage before it ended or failed: message_start's usage, and
// whether a message_delta reported the output count.
interface StreamUsage {
  usage: Usage | null;
  output: boolean;
}

async function readStream(body: ReadableStream<Uint8Array>, onBytes: () => void, idle: AbortSignal, seen: StreamUsage): Promise<Message> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const st: { message: Message | null } = { message: null };
  const json = new Map<number, string>();
  const truncated = new Set<number>();
  const apply = (e: Record<string, unknown>): boolean => {
    switch (e.type) {
      case 'message_start':
        st.message = { ...(e.message as Message), content: [] };
        seen.usage = { ...st.message.usage };
        return false;
      case 'content_block_start':
        if (st.message) st.message.content[e.index as number] = { ...(e.content_block as ContentBlock) };
        return false;
      case 'content_block_delta': {
        const block = st.message?.content[e.index as number];
        const d = e.delta as Record<string, string>;
        if (!block) return false;
        if (d.type === 'text_delta') block.text = `${block.text ?? ''}${d.text}`;
        else if (d.type === 'input_json_delta') json.set(e.index as number, `${json.get(e.index as number) ?? ''}${d.partial_json}`);
        else if (d.type === 'thinking_delta') block.thinking = `${block.thinking ?? ''}${d.thinking}`;
        else if (d.type === 'signature_delta') block.signature = d.signature;
        else if (d.type === 'citations_delta') block.citations = [...((block.citations as unknown[]) ?? []), (d as unknown as { citation: unknown }).citation];
        return false;
      }
      case 'content_block_stop': {
        const raw = json.get(e.index as number);
        const block = st.message?.content[e.index as number];
        if (block && raw !== undefined) {
          try {
            block.input = raw === '' ? {} : JSON.parse(raw);
          } catch {
            truncated.add(e.index as number);
          }
        }
        return false;
      }
      case 'message_delta':
        if (st.message) {
          const m = st.message;
          const d = e.delta as Partial<Message>;
          m.stop_reason = d.stop_reason ?? m.stop_reason;
          if (d.stop_details !== undefined) m.stop_details = d.stop_details;
          m.usage = { ...m.usage, ...(e.usage as Partial<Usage>) };
          seen.usage = { ...m.usage };
          if (typeof (e.usage as Partial<Usage> | undefined)?.output_tokens === 'number') seen.output = true;
        }
        return false;
      case 'message_stop':
        if (truncated.size > 0 && st.message) {
          if (!CUT_OFF_STOPS.includes(st.message.stop_reason ?? '')) throw broken('tool_use input is not valid JSON', 'invalid_tool_input', false);
          st.message.content = st.message.content.filter((_, i) => !truncated.has(i));
        }
        return true;
      case 'error': {
        const err = e.error as { type?: string; message?: string } | undefined;
        const type = err?.type ?? null;
        throw broken(`stream error ${type ?? 'unknown'}${err?.message ? `: ${err.message}` : ''}`, type, retryableStreamError(type));
      }
      default:
        return false; // ping and event types this client does not use
    }
  };
  for (;;) {
    let chunk;
    try {
      chunk = await unlessAborted(reader.read(), idle);
    } catch (e) {
      void reader.cancel().catch(() => {});
      throw broken(`stream dropped: ${(e as Error).message}`);
    }
    if (chunk.done) break;
    onBytes();
    buf += decoder.decode(chunk.value, { stream: true });
    let cut;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, '');
      const data = frame.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data === '') continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        throw broken('stream frame is not valid JSON', 'invalid_frame', false);
      }
      if (apply(event)) {
        void reader.cancel().catch(() => {});
        if (st.message === null) throw broken('stream ended without message_start');
        return st.message;
      }
    }
  }
  throw broken('stream dropped before message_stop');
}

// p, or a rejection with the signal's reason once it aborts, whichever comes first: a transport
// or a stream that ignores the Request's signal still ends.
const unlessAborted = <T>(p: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => (signal.removeEventListener('abort', onAbort), resolve(v)),
      (e) => (signal.removeEventListener('abort', onAbort), reject(e)),
    );
  });

// One request, no ledger: an ApiError for an HTTP error, a broken stream or an attempt idle for
// idleMs, the fetch error as thrown for a network failure. MessagesClient.send is its only
// caller. The transport gets the registered Request and nothing else, and the registration ends
// when it returns.
async function sendOnce(f: Transport, endpoint: string, apiKey: string, body: string, signal: AbortSignal | undefined, idleMs: number, seen: StreamUsage): Promise<{ status: number; message: Message }> {
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const quiet = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new DOMException(`no data for ${idleMs} ms`, 'TimeoutError')), idleMs);
  };
  // redirect: 'error', so the host the guard checked is the only host the request reaches.
  const request = new Request(endpoint, { method: 'POST', headers: requestHeaders(apiKey), body, redirect: 'error', signal: signal ? AbortSignal.any([signal, idle.signal]) : idle.signal });
  outbound.set(request, headerSig(request));
  quiet();
  try {
    let res: Response;
    try {
      res = await unlessAborted(f(request), idle.signal);
    } catch (e) {
      // The guard refused the attempt and never let this Request out, so nothing was sent: an
      // error that is not billed and would recur on retry.
      if (e instanceof EgressRefusal && !sent.has(request)) throw new ApiError(e.message, { status: null, type: 'egress_refused', retryable: false, stopsBatch: true });
      throw e;
    } finally {
      outbound.delete(request);
    }
    quiet();
    if (res.status !== 200) throw await errorStatus(res);
    if (!res.body) throw broken('HTTP 200 without a body');
    return { status: res.status, message: await readStream(res.body, quiet, idle.signal, seen) };
  } catch (e) {
    // Cut off for idling, not aborted by the caller: the request may have reached the API.
    if (idle.signal.aborted && !signal?.aborted) throw new ApiError(`no data for ${idleMs} ms`, { status: null, type: 'stream_idle', retryable: true, stopsBatch: false, partial: true });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// How a failed call ends a trial (design section 1, "Failure modes"; section 5, "Outcomes"),
// whichever call failed: a model call in the trial loop or a judge call in the grader.
//   INVALID        a response from another model
//   INFRA_HARNESS  a request we built wrong (a 400 that is not billing or a prompt too long), the egress guard, a
//                  spend refusal, or any other local error (a request the client refused to
//                  build, a ledger fault)
//   INFRA_API      401, 403, 404, a billing error, retries exhausted, a network error, and a
//                  SpendBoundRefused, code spend_bound: the trial loop's per-trial bound
//                  (loop.ts MAX_SETTLED_USD) refused the next attempt. It ends that trial only
//                  (re-queued) and never stops the batch: whoever the error reaches, the batch
//                  wrapper included, reads the same answer
//   ENV_LIMIT      a 400 prompt is too long, code prompt_too_long: the trial's context outgrew
//                  the model's window. The trial loop ends the trial LIMIT context_window
//                  (loop.ts), which the grader grades ENV_LIMIT. Never rerun (outcomes.ts
//                  NOT_RERUN_REASON), and it does not stop the batch. A judge call's prompt is
//                  the grader's input, so the grader grades that GRADER_ERROR (grade.ts)
// stopsBatch: true for every INFRA_HARNESS (design section 5), for a 401, 403, 404 or billing
// error, and for a substituted model (coordinator decision, P8 fix round 3, 2026-10-23: an
// API-side fault a rerun does not cure). Retries exhausted and a network error do not stop the
// batch: the trial is rerun. MessagesClient.send closes the grant exactly when this says so.
export interface ClientFailure {
  status: 'INVALID' | 'INFRA_HARNESS' | 'INFRA_API' | 'ENV_LIMIT';
  code: string;
  stopsBatch: boolean;
  message: string;
}

// The trial loop's refusal of an attempt whose worst case would take the trial's settled cost
// past its bound: the reason it aborts the call with (loop.ts).
export class SpendBoundRefused extends Error {
  override readonly name = 'SpendBoundRefused';
}

export function classifyFailure(e: unknown): ClientFailure {
  if (e instanceof SpendBoundRefused) return { status: 'INFRA_API', code: 'spend_bound', stopsBatch: false, message: e.message };
  if (e instanceof SpendRefused) return { status: 'INFRA_HARNESS', code: `spend_refused_${e.cap}`, stopsBatch: true, message: e.message };
  if (e instanceof ApiError) {
    const message = e.message;
    if (e.errorType === 'model_mismatch') return { status: 'INVALID', code: 'model_mismatch', stopsBatch: true, message };
    if (isBilling(e)) return { status: 'INFRA_API', code: 'billing_error', stopsBatch: true, message };
    if (isPromptTooLong(e.status, e.errorType, message)) return { status: 'ENV_LIMIT', code: 'prompt_too_long', stopsBatch: false, message };
    const code = e.errorType ?? (e.status === null ? 'network' : `http_${e.status}`);
    if (e.status === 400 || e.errorType === 'egress_refused') return { status: 'INFRA_HARNESS', code, stopsBatch: true, message };
    return { status: 'INFRA_API', code, stopsBatch: e.stopsBatch, message };
  }
  return { status: 'INFRA_HARNESS', code: 'client_error', stopsBatch: true, message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
}

// What the client sends through: the global fetch by default. A transport receives one Request
// per attempt and may send it once (the egress guard refuses a second send, a copy or an edit).
export type Transport = (request: Request) => Promise<Response>;

export interface ClientOptions {
  grant: BatchGrant;
  ledger: Ledger;
  apiKey: string;
  // Where each Request goes: the API by default, or a relay that forwards it there unchanged
  // (messagesEndpoint says which URLs are accepted). The guard meters a relay origin only when
  // its entry point lists it in meteredOrigins (egress.ts).
  endpoint?: string;
  fetch?: Transport;
  sleep?: (ms: number) => Promise<void>;
  // One line per attempt and outcome; never headers, never the key.
  log?: (line: string) => void;
  trial?: string;
  // Attempts per send, retries included; default MAX_ATTEMPTS.
  maxAttempts?: number;
  // A number in [0, 1) for the backoff jitter; default Math.random.
  random?: () => number;
  // The idle-stream timeout of each attempt; default IDLE_STREAM_MS.
  idleStreamMs?: number;
}

export interface SendOptions {
  // Aborts this call; combined with the grant's signal.
  signal?: AbortSignal;
  // Called with each attempt's settled amount, as the ledger records it (the priced usage, or
  // the worst case when usage is unknown or cannot be priced), so a caller's cost equals the
  // ledger's, aborted and retried attempts included.
  onSettle?: (usd: number) => void;
  // Called as each attempt starts (1-based), before its reserve, with the worst case the attempt
  // would reserve; a caller that aborts the call's signal here stops it before anything is
  // reserved or sent.
  onAttempt?: (attempt: number, worstUsd: number) => void;
  // Called when an attempt failed and will be retried after a wait of waitMs: the trial loop
  // leaves failed attempts and these waits out of its working time.
  onRetry?: (attempt: number, waitMs: number) => void;
  // Called for every attempt that failed or was aborted, before onRetry, with what failed and how
  // it settled; the trial loop records it in the trajectory (event attempt_error). Never the
  // key (redacted) or the request body.
  onAttemptError?: (failure: AttemptFailure) => void;
}

// A failed or aborted attempt, as onAttemptError reports it; settle says how it settled
// (events.ts ATTEMPT_SETTLES).
export interface AttemptFailure {
  attempt: number;
  // The class of the error: ApiError, SpendBoundRefused, an abort's DOMException name.
  error: string;
  // classifyFailure's code, or aborted for an abort the caller made for another reason.
  code: string;
  // The HTTP status, when there was one.
  status: number | null;
  message: string;
  settle: AttemptSettle;
  settled_usd: number;
  // Whether the client tries again.
  retry: boolean;
}

// The input tokens a request holds at most, from what the client last saw of the same
// conversation: when this body extends the body of a request that was answered (same model,
// params and earlier messages, with messages appended), that request's prompt tokens plus each
// byte added since as one token, plus INPUT_OVERHEAD_TOKENS for the template of the new messages;
// else undefined, and worstCaseUsd counts every byte. A token covers at least one byte of the
// UTF-8 body, so the growth is never under-counted (the bound worstCaseUsd already rests on).
// The 246 recorded pilot-3 crc-care-gap requests: a token is 2.25 to 2.62 body bytes, so the
// byte count overstated the 253k-token request 2.56x. This estimate is 1.025x to 1.16x of the real
// prompt at 200k tokens and up, at most 1.43x at 100k and up, and up to 2x on small early requests
// whose tool results are large for their size (packages/core/test/spend-bound.test.ts (c)).
interface AnsweredPrompt {
  head: string;
  bytes: number;
  tokens: number;
}
const MESSAGES_TAIL = '],"stream":true}';
function promptEstimate(prev: AnsweredPrompt | undefined, body: string, bytes: number): number | undefined {
  if (prev === undefined || !body.startsWith(prev.head) || body[prev.head.length] !== ',' || bytes <= prev.bytes) return undefined;
  return prev.tokens + (bytes - prev.bytes) + INPUT_OVERHEAD_TOKENS;
}
const answeredPrompt = (body: string, bytes: number, usage: Usage): AnsweredPrompt | undefined => {
  const tokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  if (!body.endsWith(MESSAGES_TAIL) || !Number.isSafeInteger(tokens) || tokens < 0) return undefined;
  return { head: body.slice(0, -MESSAGES_TAIL.length), bytes, tokens };
};

// What an aborted call throws: the signal's reason when it is an Error (a SpendRefused from the
// grant, an AbortError DOMException from AbortController.abort()), else an AbortError.
function abortReason(signal: AbortSignal): Error {
  const r: unknown = signal.reason;
  return r instanceof Error ? r : new DOMException(r === undefined ? 'This operation was aborted' : String(r), 'AbortError');
}

// The code an aborted attempt is recorded with: the spend bound's, or aborted for any other
// reason the caller or the grant aborted (a cap, a cancel, a batch stop).
const abortCode = (reason: Error): string => (reason instanceof SpendBoundRefused ? 'spend_bound' : reason instanceof SpendRefused ? `spend_refused_${reason.cap}` : 'aborted');

const sleepUnlessAborted = (sleep: (ms: number) => Promise<void>, ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    sleep(ms).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      reject,
    );
  });

export interface CallResult {
  status: number;
  message: Message;
  refusal: { category: string | null; explanation: string | null } | null;
  attempts: number;
}

export class MessagesClient {
  readonly #grant: BatchGrant;
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: Transport;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #log: (line: string) => void;
  readonly #trial: string | undefined;
  readonly #maxAttempts: number;
  readonly #random: () => number;
  readonly #idleMs: number;
  // The last answered request of each conversation this client sent (promptEstimate).
  readonly #prompts = new WeakMap<readonly MessageParam[], AnsweredPrompt>();

  constructor(opts: ClientOptions) {
    assertClientGrant(opts.grant, opts.ledger);
    // fetch would throw this before sending, with the key in its message; throw it here instead.
    try {
      new Headers(requestHeaders(opts.apiKey));
    } catch {
      throw new TypeError('apiKey is not a valid header value');
    }
    this.#endpoint = messagesEndpoint(opts.endpoint);
    this.#grant = opts.grant;
    this.#apiKey = opts.apiKey;
    this.#fetch = opts.fetch ?? ((request) => fetch(request));
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#log = (line) => opts.log?.(redactText(line, [opts.apiKey]));
    this.#trial = opts.trial;
    this.#maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
    this.#random = opts.random ?? Math.random;
    this.#idleMs = opts.idleStreamMs ?? IDLE_STREAM_MS;
  }

  // Sends history + params and, on a complete answer that is not a refusal, appends it to
  // history. Anything else leaves history as it was. A failure that stops the batch
  // (classifyFailure) closes the grant first; an abort never does.
  async send(history: MessageParam[], params: MessageParams, opts: SendOptions = {}): Promise<CallResult> {
    const signal = opts.signal ? AbortSignal.any([this.#grant.signal, opts.signal]) : this.#grant.signal;
    try {
      return await this.#send(history, params, opts, signal);
    } catch (e) {
      if (!signal.aborted && classifyFailure(e).stopsBatch) await this.#grant.close();
      throw e;
    }
  }

  async #send(history: MessageParam[], params: MessageParams, opts: SendOptions, signal: AbortSignal): Promise<CallResult> {
    const body = requestBody(history, params);
    const bodyBytes = new TextEncoder().encode(body).length;
    const inputTokens = promptEstimate(this.#prompts.get(history), body, bodyBytes);
    const req: ReserveRequest = { bodyBytes, maxTokens: checkRequest(params, body), ...(inputTokens !== undefined ? { inputTokens } : {}), ...(this.#trial ? { trial: this.#trial } : {}) };
    const worst = worstCaseUsd(req);
    const settle = async (res: Reservation, usage: Usage | null): Promise<number> => {
      await this.#grant.settle(res, usage);
      const usd = (usage === null ? null : usageCostUsd(usage)) ?? res.worst_usd;
      opts.onSettle?.(usd);
      return usd;
    };
    const failed = (f: Omit<AttemptFailure, 'message'> & { message: string }) => {
      const message = redactText(f.message, [this.#apiKey]);
      this.#log(`attempt ${f.attempt}: ${f.error} ${f.code}: ${message} (settled $${f.settled_usd.toFixed(4)}, ${f.settle}${f.retry ? ', retrying' : ''})`);
      opts.onAttemptError?.({ ...f, message });
    };
    // An abort before the reserve: nothing reserved, sent or settled.
    const abortedBefore = (attempt: number): Error => {
      const reason = abortReason(signal);
      failed({ attempt, error: reason.name, code: abortCode(reason), status: null, message: reason.message, settle: 'none', settled_usd: 0, retry: false });
      return reason;
    };
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw abortedBefore(attempt);
      opts.onAttempt?.(attempt, worst);
      if (signal.aborted) throw abortedBefore(attempt);
      let res: Reservation;
      try {
        res = await this.#grant.reserve(req);
      } catch (e) {
        const f = classifyFailure(e);
        failed({ attempt, error: e instanceof Error ? e.name : typeof e, code: f.code, status: null, message: e instanceof Error ? e.message : String(e), settle: 'none', settled_usd: 0, retry: false });
        throw e;
      }
      const seen: StreamUsage = { usage: null, output: false };
      // What the stream reported, the output at max_tokens when no message_delta counted it; null
      // when nothing was reported (the worst case).
      const reported = (): Usage | null => (seen.usage === null ? null : { ...seen.usage, output_tokens: seen.output ? seen.usage.output_tokens : req.maxTokens });
      let out: { status: number; message: Message };
      try {
        out = await sendOnce(this.#fetch, this.#endpoint, this.#apiKey, body, signal, this.#idleMs, seen);
      } catch (e) {
        // Aborted in flight: the request may have reached the API, so what the stream reported,
        // else the worst case, and no retry.
        if (signal.aborted) {
          const usage = reported();
          const usd = await settle(res, usage);
          const reason = abortReason(signal);
          failed({ attempt, error: reason.name, code: abortCode(reason), status: null, message: reason.message, settle: usage === null ? 'worst_case' : 'partial_usage', settled_usd: usd, retry: false });
          throw reason;
        }
        const known = e instanceof ApiError;
        // An HTTP error status is not billed; a broken stream or lost connection may be: what the
        // stream reported, else the worst case.
        const usage = known && !e.partial ? { input_tokens: 0, output_tokens: 0 } : reported();
        const usd = await settle(res, usage);
        const err = known ? e : new ApiError(`network error: ${(e as Error).message}`, { status: null, type: null, retryable: true, stopsBatch: false, partial: true });
        err.message = redactText(err.message, [this.#apiKey]);
        if (err.stack) err.stack = redactText(err.stack, [this.#apiKey]);
        const retry = !(err.stopsBatch || !err.retryable || attempt >= this.#maxAttempts);
        failed({
          attempt, error: err.name, code: classifyFailure(err).code, status: err.status, message: err.message, settled_usd: usd, retry,
          settle: known && !e.partial ? 'not_billed' : usage === null ? 'worst_case' : 'partial_usage',
        });
        if (!retry) throw err;
        const wait = err.retryAfter !== null ? Math.min(err.retryAfter * 1000, RETRY_AFTER_MAX_MS) : backoffMs(attempt, this.#random());
        opts.onRetry?.(attempt, wait);
        await sleepUnlessAborted(this.#sleep, wait, signal);
        continue;
      }
      const priced = usageCostUsd(out.message.usage);
      if (priced !== null) {
        const next = answeredPrompt(body, bodyBytes, out.message.usage);
        if (next) this.#prompts.set(history, next);
      }
      await settle(res, out.message.usage);
      const { message } = out;
      if (message.model !== MODEL) {
        this.#log(`attempt ${attempt}: response model ${message.model} is not ${MODEL}`);
        throw new ApiError(`response model ${message.model} is not ${MODEL}`, { status: out.status, type: 'model_mismatch', retryable: false, stopsBatch: true });
      }
      if (message.stop_reason === 'refusal') {
        const refusal = { category: message.stop_details?.category ?? null, explanation: message.stop_details?.explanation ?? null };
        this.#log(`attempt ${attempt}: refusal ${refusal.category ?? 'uncategorized'}`);
        return { status: out.status, message, refusal, attempts: attempt };
      }
      this.#log(`attempt ${attempt}: ${out.status} ${message.stop_reason}`);
      history.push({ role: 'assistant', content: message.content });
      return { status: out.status, message, refusal: null, attempts: attempt };
    }
  }
}
