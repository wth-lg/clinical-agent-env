// The deployed function (api/messages.ts), gate case 10: whatever handle() does, a client gets a
// response; a throw, a rejection or a non-Error becomes the fixed 502 body with no message, and no
// sentinel reaches the console or the response.
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fn, { ALLOWED_ORIGIN, respond } from '../api/messages.ts';

const key = ['sk', 'ant', 'api03', randomBytes(36).toString('base64url')].join('-');
const req = (origin = ALLOWED_ORIGIN) => new Request('https://relay.test/v1/messages', { method: 'POST', headers: { origin, 'x-api-key': key, 'content-type': 'application/json' }, body: '{}' });

afterEach(() => vi.restoreAllMocks());

describe('api/messages.ts', () => {
  it('serves the Pages origin only', () => {
    expect(ALLOWED_ORIGIN).toBe('https://wth-lg.github.io');
    expect(typeof fn.fetch).toBe('function');
  });

  it.each([
    ['a synchronous throw', () => { throw new Error(`boom ${key}`); }],
    ['a rejection', async () => { throw new Error(`boom ${key}`); }],
    ['a non-Error throw', () => { throw key; }],
    ['a rejection with a non-Error', () => Promise.reject({ key })],
  ])('turns %s in handle into the fixed 502 and never rethrows', async (_name, failing) => {
    const captured: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void captured.push(a.map(String).join(' ')));
    const res = await respond(req(), failing as never);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ type: 'error', error: { type: 'relay_error' } });
    expect(text).not.toContain(key);
    expect(JSON.stringify([...res.headers])).not.toContain(key);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(captured.join('\n')).not.toContain(key);
  });

  it('gives a foreign origin the 502 without the CORS header', async () => {
    const res = await respond(req('https://evil.example'), (() => { throw new Error('x'); }) as never);
    expect(res.status).toBe(502);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('the default export answers through handle with the module limiter and the Pages origin', async () => {
    const res = await fn.fetch(new Request('https://relay.test/v1/messages', { headers: { origin: 'https://evil.example', 'x-forwarded-for': '192.0.2.1' } }));
    expect(res.status).toBe(405);
    const foreign = await fn.fetch(req('https://evil.example'));
    expect(foreign.status).toBe(403);
  });
});
