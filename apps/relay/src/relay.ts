// The stateless relay (plan phase P16h): the hosted Pages site's MessagesClient sends each
// Messages call here, and the relay forwards it, server to server, to UPSTREAM_URL, so the
// browser never calls the API itself (an org that refuses browser CORS still works). handle() is
// pure: the upstream fetch, the limiter and the allowed origin come in, and it reads no
// environment, writes no log and keeps nothing but the limiter's buckets.
//
// Rules, in the order they apply:
//   path      exactly /v1/messages, else 404; a query string, even an empty one, 400
//   limit     every request on the path takes a token from its client IP's bucket, else 429
//   OPTIONS   the CORS preflight: 204 for the allowed origin, 403 for any other
//   method    POST, else 405
//   origin    exactly allowedOrigin, else 403
//   body      at most MAX_BODY_BYTES (413), JSON whose model is MODEL (400); forwarded byte for
//             byte, so the ledger's byte-count reserve stays exact
//   forward   only FORWARD_HEADERS go upstream; the response streams back with its status and
//             RESPONSE_HEADERS plus the CORS headers; a client abort aborts the upstream fetch
//   errors    an upstream fetch that fails gives the fixed 502 body, never the error's message
// The key arrives in x-api-key and leaves only in x-api-key to UPSTREAM_URL. No response the
// relay builds itself holds a request header or an error message.
import type { Limiter } from './limiter.ts';
import { UPSTREAM_URL } from './upstream.ts';

export type UpstreamFetch = (url: string, init: RequestInit) => Promise<Response>;

export const PATH = '/v1/messages';
export const MODEL = 'claude-opus-5-5';
// Vercel's request body limit for a function (4.5 MB); a larger body never reaches it.
export const MAX_BODY_BYTES = 4_500_000;
export const ALLOW_METHODS = 'POST, OPTIONS';
// The headers the hosted MessagesClient sends (requestHeaders in packages/core/anthropic.ts; the
// relay test reads them from the client, so a header added there fails it until it is added here).
export const ALLOW_HEADERS = ['content-type', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access'] as const;
// What goes upstream: anthropic-dangerous-direct-browser-access has no use server to server.
export const FORWARD_HEADERS = ['x-api-key', 'anthropic-version', 'content-type', 'anthropic-beta'] as const;
const RESPONSE_HEADERS = ['content-type', 'request-id', 'retry-after'];
const RATELIMIT_PREFIX = 'anthropic-ratelimit-';
// Response headers a cross-origin page reads without Access-Control-Expose-Headers.
const SAFELISTED = new Set(['content-type']);

type Headerset = Record<string, string>;

// The header that keys the limiter: the client address Vercel sets. Vercel documents that it
// overwrites x-forwarded-for, but a proxy in front of Vercel can rewrite that one, while
// x-vercel-forwarded-for carries the same address and only Vercel sets it (README.md, "Rate
// limit"). A client-sent x-forwarded-for or x-real-ip is never read. Were the platform to append
// to a client's value rather than replace it, the last entry is the one it added. With no such
// header (not on Vercel) every request shares the bucket 'unknown'.
export const CLIENT_ADDRESS_HEADER = 'x-vercel-forwarded-for';

export function clientIp(headers: Headers): string {
  return headers.get(CLIENT_ADDRESS_HEADER)?.split(',').at(-1)?.trim() || 'unknown';
}

const corsFor = (allowedOrigin: string): Headerset => ({ 'access-control-allow-origin': allowedOrigin, vary: 'Origin' });

// A response the relay writes itself, in the API's error shape, with a fixed message.
function refuse(status: number, type: string, message: string, extra: Headerset = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', vary: 'Origin', ...extra },
  });
}

// The answer when the upstream cannot be reached: a fixed body with no message, so no error text
// (which could hold a header) reaches the client. api/messages.ts gives the same for any throw.
export function relayFailure(cors: Headerset | null): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'relay_error' } }), {
    status: 502,
    headers: { 'content-type': 'application/json', vary: 'Origin', ...(cors ?? {}) },
  });
}

export const corsIfAllowed = (request: Request, allowedOrigin: string): Headerset | null =>
  request.headers.get('origin') === allowedOrigin ? corsFor(allowedOrigin) : null;

// The body, or null past `max` bytes: refused by its declared length, else read up to the limit.
async function readBody(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > max) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.byteLength;
  }
  return body;
}

function modelOf(body: Uint8Array): string | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const model = (parsed as { model?: unknown }).model;
    return typeof model === 'string' ? model : null;
  } catch {
    return null;
  }
}

// The upstream body as the client's stream: chunks pass through unchanged as they arrive, a
// client cancel aborts the upstream fetch, and an upstream failure ends the stream with a fixed
// error, never the upstream's.
function relayBody(body: ReadableStream<Uint8Array> | null, abort: () => void, done: () => void): ReadableStream<Uint8Array> | null {
  if (body === null) {
    done();
    return null;
  }
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch {
        done();
        controller.error(new TypeError('upstream stream failed'));
        return;
      }
      if (chunk.done) {
        done();
        controller.close();
      } else controller.enqueue(chunk.value);
    },
    async cancel() {
      abort();
      done();
      await reader.cancel().catch(() => {});
    },
  });
}

function responseHeaders(upstream: Headers, cors: Headerset): Headerset {
  const out: Headerset = {};
  for (const [name, value] of upstream) {
    if (RESPONSE_HEADERS.includes(name) || name.startsWith(RATELIMIT_PREFIX)) out[name] = value;
  }
  const exposed = Object.keys(out).filter((n) => !SAFELISTED.has(n)).sort();
  return { ...out, ...cors, ...(exposed.length > 0 ? { 'access-control-expose-headers': exposed.join(', ') } : {}) };
}

export async function handle(request: Request, upstreamFetch: UpstreamFetch, limiter: Limiter, allowedOrigin: string): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return refuse(404, 'not_found_error', 'not found');
  if (url.href.includes('?')) return refuse(400, 'invalid_request_error', 'the relay takes no query string');
  const cors = corsIfAllowed(request, allowedOrigin);

  const take = limiter.take(clientIp(request.headers));
  if (!take.ok) return refuse(429, 'rate_limit_error', 'relay rate limit: retry later', { 'retry-after': String(take.retryAfterS), ...(cors ?? {}), ...(cors ? { 'access-control-expose-headers': 'retry-after' } : {}) });

  if (request.method === 'OPTIONS') {
    if (cors === null) return refuse(403, 'permission_error', 'origin not allowed');
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'access-control-allow-methods': ALLOW_METHODS, 'access-control-allow-headers': ALLOW_HEADERS.join(', '), 'access-control-max-age': '600' },
    });
  }
  if (request.method !== 'POST') return refuse(405, 'invalid_request_error', 'method not allowed', { allow: ALLOW_METHODS, ...(cors ?? {}) });
  if (cors === null) return refuse(403, 'permission_error', 'origin not allowed');

  const body = await readBody(request, MAX_BODY_BYTES);
  if (body === null) return refuse(413, 'request_too_large', 'request body too large', cors);
  const model = modelOf(body);
  if (model === null) return refuse(400, 'invalid_request_error', 'the body is not a JSON object with a model', cors);
  if (model !== MODEL) return refuse(400, 'invalid_request_error', `the relay serves only ${MODEL}`, cors);

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const upstreamAbort = new AbortController();
  const abort = () => upstreamAbort.abort();
  if (request.signal.aborted) abort();
  request.signal.addEventListener('abort', abort, { once: true });
  const done = () => request.signal.removeEventListener('abort', abort);

  let upstream: Response;
  try {
    upstream = await upstreamFetch(UPSTREAM_URL, { method: 'POST', headers, body, signal: upstreamAbort.signal, redirect: 'error' });
  } catch {
    done();
    return relayFailure(cors);
  }
  return new Response(relayBody(upstream.body, abort, done), { status: upstream.status, headers: responseHeaders(upstream.headers, cors) });
}
