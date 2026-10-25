// Gate case 8: the per-client-IP token bucket in src/limiter.ts, the mechanism production uses,
// through handle() as the deployed function calls it, with a test clock.
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../../packages/core/anthropic.ts';
import { createLimiter, DEFAULT_LIMIT, DEFAULT_WINDOW_MS } from '../src/limiter.ts';
import { clientIp, handle } from '../src/relay.ts';

const PAGES = 'https://wth-lg.github.io';
const req = (ip: string | null) =>
  new Request('https://relay.test/v1/messages', {
    method: 'POST',
    headers: { origin: PAGES, 'content-type': 'application/json', 'x-api-key': 'k', ...(ip === null ? {} : { 'x-forwarded-for': ip }) },
    body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [] }),
  });
const upstream = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('case 8: limiter', () => {
  it('defaults to 120 requests per minute', () => {
    expect(DEFAULT_LIMIT).toBe(120);
    expect(DEFAULT_WINDOW_MS).toBe(60_000);
  });

  it('answers 429 for one IP past its limit, leaves a second IP alone and recovers after the refill window', async () => {
    let now = 1_000_000;
    const limiter = createLimiter({ now: () => now });
    let calls = 0;
    const up = async () => (calls++, upstream());
    for (let i = 0; i < DEFAULT_LIMIT; i++) expect((await handle(req('198.51.100.1'), up, limiter, PAGES)).status).toBe(200);
    const limited = await handle(req('198.51.100.1'), up, limiter, PAGES);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(JSON.parse(await limited.text())).toMatchObject({ type: 'error', error: { type: 'rate_limit_error' } });
    expect(calls).toBe(DEFAULT_LIMIT);
    expect((await handle(req('198.51.100.2'), up, limiter, PAGES)).status).toBe(200);
    now += DEFAULT_WINDOW_MS;
    for (let i = 0; i < DEFAULT_LIMIT; i++) expect((await handle(req('198.51.100.1'), up, limiter, PAGES)).status).toBe(200);
    expect((await handle(req('198.51.100.1'), up, limiter, PAGES)).status).toBe(429);
  });

  it('refills continuously: one request every window / limit', () => {
    let now = 0;
    const limiter = createLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a').ok).toBe(true);
    const r = limiter.take('a');
    expect(r).toEqual({ ok: false, retryAfterS: 1 });
    now += 499;
    expect(limiter.take('a').ok).toBe(false);
    now += 1;
    expect(limiter.take('a').ok).toBe(true);
  });

  it('counts preflights and refused requests too, so no route on the function is unmetered', async () => {
    const limiter = createLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const get = new Request('https://relay.test/v1/messages', { headers: { 'x-forwarded-for': '192.0.2.9' } });
    expect((await handle(get, upstream, limiter, PAGES)).status).toBe(405);
    expect((await handle(get, upstream, limiter, PAGES)).status).toBe(429);
  });

  it('keeps a bounded number of buckets', () => {
    const limiter = createLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3, now: () => 0 });
    for (const ip of ['a', 'b', 'c', 'd', 'e']) limiter.take(ip);
    expect(limiter.size()).toBeLessThanOrEqual(3);
  });

  it('keys by the first x-forwarded-for address Vercel sets', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 203.0.113.5 , 10.0.0.1' }))).toBe('203.0.113.5');
    expect(clientIp(new Headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
