// Test only, never deployed: the relay's handle() behind a node:http server on 127.0.0.1, with a
// stub upstream and the allowed origin the test names. The real-browser spec
// (apps/web/e2e/xbrowser/relay-browser.spec.ts) and cli/test/relay-check.test.ts run against it.
// Like Vercel, it sets the client address headers (x-vercel-forwarded-for, x-forwarded-for,
// x-real-ip) from the socket, replacing any the client sent, and aborts the Request when the
// client goes away; trustClientAddress keeps the client's own values instead, a platform that
// does not overwrite them, for relay-check's negative test. It records each request (method, path, the preflight's requested headers, the
// answer) and each upstream call (url, headers, body); it never records a header value but the
// stub upstream's own copy, which the test reads to check where the key went.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createLimiter, type Limiter } from '../src/limiter.ts';
import { handle, type UpstreamFetch } from '../src/relay.ts';

const ADDRESS_HEADERS = ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip'];

export interface LogEntry {
  method: string;
  path: string;
  origin: string | null;
  requestHeaders: string | null;
  canary: string | null;
  status: number;
  allowOrigin: string | null;
  allowHeaders: string | null;
  allowMethods: string | null;
}

export interface UpstreamCall {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface StubUpstream {
  fetch: UpstreamFetch;
  calls: UpstreamCall[];
}

export interface LocalRelay {
  // The relay's Messages URL: http://127.0.0.1:<port>/v1/messages.
  url: string;
  origin: string;
  port: number;
  log: LogEntry[];
  upstreamCalls: UpstreamCall[];
  close(): Promise<void>;
}

const MODEL = 'claude-opus-5-5';
const sse = (e: { type: string }) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
// The three events of a complete answer with no content, as the API streams them.
export const STUB_EVENTS = [
  { type: 'message_start', message: { id: 'msg_stub', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
];

function stub(answer: () => Response): StubUpstream {
  const calls: UpstreamCall[] = [];
  const fetch: UpstreamFetch = async (url, init) => {
    const body = init.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : String(init.body ?? '');
    calls.push({ url, headers: Object.fromEntries(new Headers(init.headers)), body });
    return answer();
  };
  return { fetch, calls };
}

// Streams STUB_EVENTS, one every gapMs.
export function sseUpstream(gapMs = 50): StubUpstream {
  return stub(() => {
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (i > 0) await new Promise((r) => setTimeout(r, gapMs));
        if (i === STUB_EVENTS.length) return c.close();
        c.enqueue(new TextEncoder().encode(sse(STUB_EVENTS[i++]!)));
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_stub' } });
  });
}

// Answers as the API answers a key it does not know.
export function authFailUpstream(): StubUpstream {
  return stub(
    () =>
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' }, request_id: 'req_stub' }), {
        status: 401,
        headers: { 'content-type': 'application/json', 'request-id': 'req_stub' },
      }),
  );
}

function toRequest(req: IncomingMessage, port: number, signal: AbortSignal, trustClientAddress: boolean): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || (!trustClientAddress && ADDRESS_HEADERS.includes(k))) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  if (!trustClientAddress) for (const h of ADDRESS_HEADERS) headers.set(h, req.socket.remoteAddress ?? 'unknown');
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(`http://127.0.0.1:${port}${req.url ?? '/'}`, {
    method,
    headers,
    signal,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
  } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body === null) return void res.end();
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch {
    res.destroy();
  }
}

export async function serveLocal(opts: { allowedOrigin: string; upstream?: StubUpstream; limiter?: Limiter; port?: number; trustClientAddress?: boolean; bodyTimeoutMs?: number }): Promise<LocalRelay> {
  const upstream = opts.upstream ?? sseUpstream();
  const limiter = opts.limiter ?? createLimiter();
  const log: LogEntry[] = [];
  let port = 0;
  const server = createServer((req, res) => {
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    const request = toRequest(req, port, ac.signal, opts.trustClientAddress ?? false);
    void handle(request, upstream.fetch, limiter, opts.allowedOrigin, opts.bodyTimeoutMs === undefined ? {} : { bodyTimeoutMs: opts.bodyTimeoutMs }).then(
      (response) => {
        log.push({
          method: request.method,
          path: req.url ?? '',
          origin: request.headers.get('origin'),
          requestHeaders: request.headers.get('access-control-request-headers'),
          canary: request.headers.get('x-relay-canary'),
          status: response.status,
          allowOrigin: response.headers.get('access-control-allow-origin'),
          allowHeaders: response.headers.get('access-control-allow-headers'),
          allowMethods: response.headers.get('access-control-allow-methods'),
        });
        return send(res, response);
      },
      () => {
        res.writeHead(500);
        res.end();
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    url: `${origin}/v1/messages`,
    origin,
    port,
    log,
    upstreamCalls: upstream.calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
