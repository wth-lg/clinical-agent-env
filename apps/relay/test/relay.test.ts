// The relay's request rules (plan phase P16h, PR-relay gate cases 1 to 7 and 10), through the
// pure handle() with a spy upstream and the production limiter. No case writes the API host:
// requests to it are recognised by UPSTREAM_URL (lint: no-direct-anthropic).
import { randomBytes } from 'node:crypto';
import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL } from '../../../packages/core/anthropic.ts';
import { clientHeaderNames } from '../../../cli/relay-check.ts';
import { createLimiter } from '../src/limiter.ts';
import { ALLOW_HEADERS, ALLOW_METHODS, FORWARD_HEADERS, handle, MAX_BODY_BYTES, type UpstreamFetch } from '../src/relay.ts';
import { UPSTREAM_URL } from '../src/upstream.ts';

const PAGES = 'https://wth-lg.github.io';
const RELAY = 'https://relay.test/v1/messages';
const VERSION = '2026-10-21';

function sentinels(): { plain: string; skAnt: string } {
  return {
    plain: `clinenv-sentinel-${randomBytes(16).toString('hex')}`,
    skAnt: ['sk', 'ant', 'api03', randomBytes(36).toString('base64url')].join('-'),
  };
}

interface UpstreamCall {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
  signal: AbortSignal | null;
}

const okBody = (model: string = MODEL) => JSON.stringify({ model, max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'ping' }] });

const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const THREE_EVENTS = [
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
];

// An upstream that records each call and answers with `answer` (default: the three-event SSE stream).
function spyUpstream(answer?: (call: UpstreamCall) => Response | Promise<Response>): { fetch: UpstreamFetch; calls: UpstreamCall[] } {
  const calls: UpstreamCall[] = [];
  const fetch: UpstreamFetch = async (url, init) => {
    const body = init.body instanceof Uint8Array ? init.body : new TextEncoder().encode(String(init.body ?? ''));
    const call = { url, headers: Object.fromEntries(new Headers(init.headers)), body, signal: init.signal ?? null };
    calls.push(call);
    return answer ? answer(call) : new Response(sse(THREE_EVENTS), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_1' } });
  };
  return { fetch, calls };
}

function post(opts: { origin?: string | null; key?: string; body?: string | Uint8Array; url?: string; headers?: Record<string, string>; signal?: AbortSignal; method?: string } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': opts.key ?? 'k',
    'anthropic-version': VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    'x-vercel-forwarded-for': '203.0.113.7',
    ...opts.headers,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? PAGES;
  const method = opts.method ?? 'POST';
  return new Request(opts.url ?? RELAY, { method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body: opts.body ?? okBody() }), ...(opts.signal ? { signal: opts.signal } : {}) });
}

const preflight = (origin: string | null, requestHeaders: string, url = RELAY) =>
  new Request(url, {
    method: 'OPTIONS',
    headers: {
      ...(origin === null ? {} : { origin }),
      'access-control-request-method': 'POST',
      'access-control-request-headers': requestHeaders,
      'x-vercel-forwarded-for': '203.0.113.7',
    },
  });

const run = (req: Request, upstream: UpstreamFetch, limiter = createLimiter()) => handle(req, upstream, limiter, PAGES);
const headerList = (v: string | null) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).sort();

describe('case 1: origin', () => {
  it.each([
    ['no Origin', null],
    ['https://evil.example', 'https://evil.example'],
    ['http://wth-lg.github.io', 'http://wth-lg.github.io'],
    ['https://wth-lg.github.io.evil.example', 'https://wth-lg.github.io.evil.example'],
    ['https://other.github.io', 'https://other.github.io'],
  ])('%s gets 403 and no upstream call', async (_name, origin) => {
    const up = spyUpstream();
    const res = await run(post({ origin }), up.fetch);
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(up.calls).toHaveLength(0);
  });

  it('the Pages origin is forwarded', async () => {
    const up = spyUpstream();
    const res = await run(post(), up.fetch);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(up.calls).toHaveLength(1);
  });
});

describe('case 2: path and method', () => {
  it('GET /v1/messages is 405 with no upstream call', async () => {
    const up = spyUpstream();
    const res = await run(post({ method: 'GET' }), up.fetch);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe(ALLOW_METHODS);
    expect(up.calls).toHaveLength(0);
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('%s /v1/messages is 405', async (method) => {
    const up = spyUpstream();
    expect((await run(post({ method }), up.fetch)).status).toBe(405);
    expect(up.calls).toHaveLength(0);
  });

  it.each([
    ['https://relay.test/v1/models', 404],
    ['https://relay.test/v1/messages/count_tokens', 404],
    ['https://relay.test/v1/messages/../models', 404],
    ['https://relay.test/v1/messages/', 404],
    ['https://relay.test/', 404],
    ['https://relay.test/api/messages', 404],
    ['https://relay.test/v1/messages?x=1', 400],
    ['https://relay.test/v1/messages?', 400],
  ])('POST %s is %i with no upstream call', async (url, status) => {
    const up = spyUpstream();
    const res = await run(post({ url }), up.fetch);
    expect(res.status).toBe(status);
    expect(up.calls).toHaveLength(0);
  });
});

describe('case 3: preflight', () => {
  it("the relay allows exactly the headers the client sends, read from the client", async () => {
    const client = await clientHeaderNames();
    expect(client).toContain('anthropic-dangerous-direct-browser-access');
    expect([...ALLOW_HEADERS].sort()).toEqual(client);
  });

  it('the Pages origin gets 204 with the exact CORS answer', async () => {
    const client = await clientHeaderNames();
    const up = spyUpstream();
    const res = await run(preflight(PAGES, client.join(',')), up.fetch);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(headerList(res.headers.get('vary'))).toContain('origin');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(headerList(res.headers.get('access-control-allow-headers'))).toEqual(client);
    expect(up.calls).toHaveLength(0);
  });

  it('a preflight that asks for one more header is not granted it', async () => {
    const client = await clientHeaderNames();
    const res = await run(preflight(PAGES, [...client, 'x-foo'].join(',')), spyUpstream().fetch);
    expect(headerList(res.headers.get('access-control-allow-headers'))).not.toContain('x-foo');
    expect(headerList(res.headers.get('access-control-allow-headers'))).toEqual(client);
  });

  it.each([null, 'https://evil.example', 'https://other.github.io'])('origin %s gets 403', async (origin) => {
    const res = await run(preflight(origin, 'content-type,x-api-key'), spyUpstream().fetch);
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-headers')).toBeNull();
  });

  it('a preflight on another path is 404', async () => {
    expect((await run(preflight(PAGES, 'content-type', 'https://relay.test/v1/models'), spyUpstream().fetch)).status).toBe(404);
  });
});

describe('case 4: key secrecy', () => {
  const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
  let captured: string[] = [];
  beforeEach(() => {
    captured = [];
    // format() renders arguments as console.log prints them (a Headers object shows its entries).
    for (const m of METHODS) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void captured.push(format(...args)));
  });
  afterEach(() => vi.restoreAllMocks());

  const drain = async (res: Response): Promise<string> => {
    try {
      return await res.text();
    } catch (e) {
      return `read failed: ${(e as Error).message}\n${(e as Error).stack ?? ''}`;
    }
  };

  // Each scenario returns the response text and headers the client saw.
  const scenarios: Record<string, (key: string) => Promise<{ text: string; headers: string; calls: UpstreamCall[] }>> = {
    success: async (key) => {
      const up = spyUpstream();
      const res = await run(post({ key }), up.fetch);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'upstream 401': async (key) => {
      const up = spyUpstream(() => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
      const res = await run(post({ key }), up.fetch);
      expect(res.status).toBe(401);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'upstream 500': async (key) => {
      const up = spyUpstream(() => new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Internal server error' } }), { status: 500, headers: { 'content-type': 'application/json' } }));
      const res = await run(post({ key }), up.fetch);
      expect(res.status).toBe(500);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'upstream stream drops': async (key) => {
      const up = spyUpstream(() => {
        let sent = false;
        const body = new ReadableStream<Uint8Array>({
          pull(c) {
            if (!sent) {
              sent = true;
              c.enqueue(new TextEncoder().encode(sse(THREE_EVENTS.slice(0, 1))));
            } else c.error(new Error(`socket closed while sending ${key}`));
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      });
      const res = await run(post({ key }), up.fetch);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'client abort': async (key) => {
      const ac = new AbortController();
      const up = spyUpstream(
        (call) =>
          new Promise<Response>((_resolve, reject) => {
            call.signal?.addEventListener('abort', () => reject(new DOMException(`aborted ${key}`, 'AbortError')));
            ac.abort();
          }),
      );
      const res = await run(post({ key, signal: ac.signal }), up.fetch);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'malformed JSON': async (key) => {
      const up = spyUpstream();
      const res = await run(post({ key, body: `{"model": "${MODEL}", ` }), up.fetch);
      expect(res.status).toBe(400);
      expect(up.calls).toHaveLength(0);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
    'oversize body': async (key) => {
      const up = spyUpstream();
      const res = await run(post({ key, body: new Uint8Array(MAX_BODY_BYTES + 1).fill(32) }), up.fetch);
      expect(res.status).toBe(413);
      expect(up.calls).toHaveLength(0);
      return { text: await drain(res), headers: JSON.stringify([...res.headers]), calls: up.calls };
    },
  };

  for (const [name, scenario] of Object.entries(scenarios)) {
    it.each(['plain', 'skAnt'] as const)(`${name}: the %s sentinel reaches only the upstream x-api-key header`, async (shape) => {
      const key = sentinels()[shape];
      const { text, headers, calls } = await scenario(key);
      expect(captured.join('\n')).not.toContain(key);
      expect(text).not.toContain(key);
      expect(headers).not.toContain(key);
      for (const call of calls) {
        expect(call.url).toBe(UPSTREAM_URL);
        const names = Object.keys(call.headers).sort();
        expect(names.every((n) => (FORWARD_HEADERS as readonly string[]).includes(n)), names.join(',')).toBe(true);
        expect(names).not.toContain('anthropic-dangerous-direct-browser-access');
        expect(names).not.toContain('origin');
        expect(names).not.toContain('x-forwarded-for');
        expect(names).not.toContain('x-vercel-forwarded-for');
        expect(call.headers['x-api-key']).toBe(key);
        for (const [n, v] of Object.entries(call.headers)) if (n !== 'x-api-key') expect(v).not.toContain(key);
        expect(new TextDecoder().decode(call.body)).not.toContain(key);
      }
    });
  }

  it('forwards exactly x-api-key, anthropic-version, content-type and anthropic-beta when sent', async () => {
    const up = spyUpstream();
    await run(post({ headers: { 'anthropic-beta': 'b1', cookie: 'c=1', authorization: 'Bearer x', 'x-other': '1' } }), up.fetch);
    expect(Object.keys(up.calls[0]!.headers).sort()).toEqual(['anthropic-beta', 'anthropic-version', 'content-type', 'x-api-key']);
    const up2 = spyUpstream();
    await run(post(), up2.fetch);
    expect(Object.keys(up2.calls[0]!.headers).sort()).toEqual(['anthropic-version', 'content-type', 'x-api-key']);
  });

  it('forwards the body byte for byte and returns only the allowed response headers', async () => {
    const body = new TextEncoder().encode(`{ "model" : "${MODEL}",\n "max_tokens": 1, "messages": [{"role":"user","content":"é \\u00e9"}] }`);
    const up = spyUpstream(
      () =>
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json', 'request-id': 'req_9', 'retry-after': '7', 'anthropic-ratelimit-requests-remaining': '0',
            'set-cookie': 'session=1', 'x-internal': 'y', server: 'z',
          },
        }),
    );
    const res = await run(post({ body }), up.fetch);
    expect([...up.calls[0]!.body]).toEqual([...body]);
    expect(res.status).toBe(429);
    const names = [...res.headers.keys()].sort();
    expect(names).toEqual(['access-control-allow-origin', 'access-control-expose-headers', 'anthropic-ratelimit-requests-remaining', 'content-type', 'request-id', 'retry-after', 'vary']);
    expect(headerList(res.headers.get('access-control-expose-headers'))).toEqual(['anthropic-ratelimit-requests-remaining', 'request-id', 'retry-after']);
  });
});

describe('case 5: streaming', () => {
  it('three SSE events sent with gaps arrive byte-equal, the first before the upstream finishes', async () => {
    const chunks = THREE_EVENTS.map((e) => sse([e]));
    let finished = false;
    let release: (() => void) | undefined;
    const up = spyUpstream(() => {
      let i = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(c) {
          if (i > 0) await new Promise<void>((r) => (release = r));
          if (i === chunks.length) {
            finished = true;
            c.close();
            return;
          }
          c.enqueue(new TextEncoder().encode(chunks[i++]));
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const res = await run(post(), up.fetch);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(chunks[0]);
    expect(finished).toBe(false);
    let text = new TextDecoder().decode(first.value);
    for (;;) {
      release?.();
      const next = await reader.read();
      if (next.done) break;
      text += new TextDecoder().decode(next.value);
    }
    expect(finished).toBe(true);
    expect(text).toBe(chunks.join(''));
  });
});

describe('case 6: model', () => {
  it.each(['claude-sonnet-5-5', 'claude-opus-5-5-fast', '', 'CLAUDE-OPUS-5-5'])('model %j gets 400 with no upstream call', async (model) => {
    const up = spyUpstream();
    expect((await run(post({ body: okBody(model) }), up.fetch)).status).toBe(400);
    expect(up.calls).toHaveLength(0);
  });

  it.each(['[]', 'null', '"x"', '{}', `{"model": ["${MODEL}"]}`, ''])('body %j gets 400 with no upstream call', async (body) => {
    const up = spyUpstream();
    expect((await run(post({ body }), up.fetch)).status).toBe(400);
    expect(up.calls).toHaveLength(0);
  });

  it('the relay model is the client model', async () => {
    const up = spyUpstream();
    expect((await run(post({ body: okBody(MODEL) }), up.fetch)).status).toBe(200);
  });

  // Security review M3: JSON.parse keeps the last of two equal keys, and the body is forwarded
  // byte for byte, so a parser upstream that kept the first could see another model.
  it.each([
    ['another model first', `{"model":"claude-haiku-4-5","model":"${MODEL}","max_tokens":1,"messages":[]}`],
    ['the relay model twice', `{"model":"${MODEL}","max_tokens":1,"model":"${MODEL}","messages":[]}`],
    ['an escaped second key', `{"model":"claude-haiku-4-5","\\u006dodel":"${MODEL}","max_tokens":1,"messages":[]}`],
    ['whitespace around the keys', `{ "model" : "x" ,\n "model" : "${MODEL}" }`],
  ])('a body with two top-level model keys (%s) gets 400 with no upstream call', async (_name, body) => {
    expect(JSON.parse(body).model).toBe(MODEL);
    const up = spyUpstream();
    const res = await run(post({ body }), up.fetch);
    expect(res.status).toBe(400);
    expect(JSON.parse(await res.text()).error.type).toBe('invalid_request_error');
    expect(up.calls).toHaveLength(0);
  });

  it.each([
    ['model inside messages', JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: [{ type: 'text', text: '"model":"x"' }] }], metadata: { model: 'x' } })],
    ['an escaped model key, once', `{"\\u006dodel":"${MODEL}","max_tokens":1,"messages":[]}`],
    ['a key that only ends in model', `{"supermodel":"x","model":"${MODEL}","max_tokens":1,"messages":[]}`],
  ])('one top-level model key (%s) is forwarded', async (_name, body) => {
    const up = spyUpstream();
    expect((await run(post({ body }), up.fetch)).status).toBe(200);
    expect(up.calls).toHaveLength(1);
  });
});

describe('case 7: client abort', () => {
  it('a client abort before the upstream answers aborts the upstream signal', async () => {
    const ac = new AbortController();
    let seen: AbortSignal | null = null;
    const up = spyUpstream(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          seen = call.signal;
          call.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          setTimeout(() => ac.abort(), 10);
        }),
    );
    await run(post({ signal: ac.signal }), up.fetch);
    expect(seen).not.toBeNull();
    expect(seen!.aborted).toBe(true);
  });

  it('a client that cancels the streamed body aborts the upstream signal', async () => {
    let seen: AbortSignal | null = null;
    const up = spyUpstream((call) => {
      seen = call.signal;
      const body = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new TextEncoder().encode(': ping\n\n')) });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const res = await run(post(), up.fetch);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(seen!.aborted).toBe(true);
  });

  it('an abort after the stream started aborts the upstream signal', async () => {
    const ac = new AbortController();
    let seen: AbortSignal | null = null;
    const up = spyUpstream((call) => {
      seen = call.signal;
      const body = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new TextEncoder().encode(': ping\n\n')) });
      return new Response(body, { status: 200 });
    });
    const res = await run(post({ signal: ac.signal }), up.fetch);
    await res.body!.getReader().read();
    ac.abort();
    expect(seen!.aborted).toBe(true);
  });
});

describe('case 10: errors', () => {
  afterEach(() => vi.restoreAllMocks());

  it('an upstream fetch that rejects with the key in its message gives the fixed 502 body', async () => {
    const key = sentinels().skAnt;
    const captured: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void captured.push(format(...a)));
    const res = await run(post({ key }), async () => {
      throw new Error(`connect ECONNREFUSED with header x-api-key: ${key}`);
    });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ type: 'error', error: { type: 'relay_error' } });
    expect(text).not.toContain(key);
    expect(JSON.stringify([...res.headers])).not.toContain(key);
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(captured.join('\n')).not.toContain(key);
  });
});
