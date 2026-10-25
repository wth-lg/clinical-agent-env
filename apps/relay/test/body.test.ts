// The body-read deadline (security review M2): a client that declares a body and then holds it
// gets 408 once BODY_TIMEOUT_MS passes, with no upstream call, so it cannot keep an invocation
// alive until maxDuration. Through handle() and through a raw socket to serve-local.
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL } from '../../../packages/core/anthropic.ts';
import { createLimiter } from '../src/limiter.ts';
import { BODY_TIMEOUT_MS, handle, type UpstreamFetch } from '../src/relay.ts';
import { serveLocal, type LocalRelay } from './serve-local.ts';

const PAGES = 'https://wth-lg.github.io';

function counting(): { fetch: UpstreamFetch; calls: () => number } {
  let n = 0;
  return { fetch: async () => (n++, new Response('{}', { status: 200 })), calls: () => n };
}

// A POST whose body sends `first` and then never ends; `cancelled` turns true when the relay
// gives up on it.
function heldBody(first: string): { request: Request; cancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => c.enqueue(new TextEncoder().encode(first)),
    cancel: () => void (cancelled = true),
  });
  const request = new Request('https://relay.test/v1/messages', {
    method: 'POST',
    headers: { origin: PAGES, 'content-type': 'application/json', 'x-api-key': 'k' },
    body,
    duplex: 'half',
  } as RequestInit);
  return { request, cancelled: () => cancelled };
}

let relay: LocalRelay | undefined;
afterEach(async () => {
  await relay?.close();
  relay = undefined;
});

describe('body-read deadline', () => {
  it('defaults to 30 s, far above the time a pilot-sized body takes', () => {
    expect(BODY_TIMEOUT_MS).toBe(30_000);
  });

  it('a held body gets 408 after the deadline, with no upstream call, and the body is cancelled', async () => {
    const up = counting();
    const { request, cancelled } = heldBody('{"model":');
    const started = Date.now();
    const res = await handle(request, up.fetch, createLimiter(), PAGES, { bodyTimeoutMs: 100 });
    expect(res.status).toBe(408);
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(JSON.parse(await res.text())).toMatchObject({ type: 'error', error: { type: 'timeout_error' } });
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(up.calls()).toBe(0);
    expect(cancelled()).toBe(true);
  });

  it('a body that arrives in time is forwarded', async () => {
    const up = counting();
    const body = JSON.stringify({ model: MODEL, max_tokens: 1, messages: [] });
    const res = await handle(new Request('https://relay.test/v1/messages', { method: 'POST', headers: { origin: PAGES, 'content-type': 'application/json' }, body }), up.fetch, createLimiter(), PAGES, { bodyTimeoutMs: 100 });
    expect(res.status).toBe(200);
    expect(up.calls()).toBe(1);
  });

  it('over a real socket: content-length 100, one byte sent, then held, gets 408 and no upstream call', async () => {
    relay = await serveLocal({ allowedOrigin: PAGES, bodyTimeoutMs: 200 });
    const { port } = relay;
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(`POST /v1/messages HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${PAGES}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
      });
      let data = '';
      socket.on('data', (d) => {
        data += d.toString();
        if (data.includes('\r\n\r\n')) {
          socket.destroy();
          resolve(data);
        }
      });
      socket.on('error', reject);
      setTimeout(() => reject(new Error(`no answer within 3 s: ${JSON.stringify(data)}`)), 3000);
    });
    expect(reply).toMatch(/^HTTP\/1\.1 408 /);
    expect(relay.upstreamCalls).toHaveLength(0);
  });
});
