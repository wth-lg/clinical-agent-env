// The one relay module that names the upstream URL (lint: no-direct-anthropic exempts it and this
// test by path; every other relay file imports UPSTREAM_URL).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPSTREAM_URL, upstreamFetch } from '../src/upstream.ts';

afterEach(() => vi.unstubAllGlobals());

describe('upstream', () => {
  it('names the Messages endpoint of the API and nothing else', () => {
    expect(UPSTREAM_URL).toBe('https://api.anthropic.com/v1/messages');
  });

  it('sends through the global fetch with redirects refused', async () => {
    const seen: Array<{ url: unknown; init: RequestInit | undefined }> = [];
    vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => (seen.push({ url, init }), new Response('ok')));
    const res = await upstreamFetch(UPSTREAM_URL, { method: 'POST', body: '{}' });
    expect(await res.text()).toBe('ok');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(UPSTREAM_URL);
    expect(seen[0]!.init?.redirect).toBe('error');
  });

  it.each(['https://api.anthropic.com/v1/models', 'https://evil.example/v1/messages', 'http://api.anthropic.com/v1/messages'])('refuses %s without a fetch', async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(upstreamFetch(url, { method: 'POST' })).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
