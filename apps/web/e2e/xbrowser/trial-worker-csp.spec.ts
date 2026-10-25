// The real trial Worker (src/worker/trial.ts), not a stand-in, is bound by the page's CSP in each
// browser (promoted from the P15 verifier's probe). The served trial bundle gets a probe appended
// that answers over a BroadcastChannel from inside the running Worker, after the egress guard:
// the Worker's URL is a blob:, the egress guard refuses a fetch to another origin, the browser
// refuses the prototype fetch and an import() from that origin (the CSP, under the guard), and a
// same-origin fetch still works. A real server on 127.0.0.1 records any request that gets out.
// The Messages API is route-mocked with the toy script, held on turn 2 so the Worker is alive.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import { okResponse, SCENARIOS } from '../../src/harness/scenarios.ts';

const CSP = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const API_ORIGIN = /connect-src 'self' (\S+);/.exec(CSP)?.[1] ?? '';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };
const TOY = SCENARIOS.toy;
const sentinelKey = () => ['sk', 'ant', 'api03', randomUUID().replaceAll('-', ''), 'xb'].join('-');

interface Body { max_tokens: number; tools?: unknown[]; messages: Array<{ role: string }> }

// The toy script on every API request (Validate, loop turns, judge), with turn 2 held.
async function mockToy(context: BrowserContext) {
  const held: Array<{ route: Route; turn: number }> = [];
  let judge = 0;
  const sse = (route: Route, res: Response) => res.text().then((body) => route.fulfill({ status: 200, contentType: 'text/event-stream', body, headers: CORS }));
  await context.route((url) => url.origin === API_ORIGIN, async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = r.postDataJSON() as Body;
    if (body.max_tokens === 16) return sse(route, okResponse({ text: 'ok' }, 1));
    if (body.tools === undefined) return sse(route, okResponse(TOY[3 + (judge++ % (TOY.length - 3))]!, 4 + judge));
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    if (turn === 2 && held.length === 0) return void held.push({ route, turn });
    return sse(route, okResponse(TOY[turn - 1]!, turn));
  });
  return { held, release: async () => { const h = held.shift()!; await sse(h.route, okResponse(TOY[h.turn - 1]!, h.turn)); } };
}

const PROBE = String.raw`
;(() => {
  const bc = new BroadcastChannel('trial-worker-probe');
  bc.onmessage = async ({ data: foreign }) => {
    const attempt = async (f) => { try { const r = await f(); return r instanceof Response ? 'answered ' + r.status : 'loaded'; } catch (e) { return 'refused: ' + (e && e.message); } };
    const protoFetch = WorkerGlobalScope.prototype.fetch;
    bc.postMessage({
      location: location.href,
      guardFetch: await attempt(() => fetch(foreign + '/guard-fetch')),
      protoFetch: await attempt(() => protoFetch.call(globalThis, foreign + '/proto-fetch')),
      dynamicImport: await attempt(() => import(foreign + '/mod.js')),
      sameOrigin: await attempt(() => protoFetch.call(globalThis, new URL('/clinical-agent-env/data/fixtures/manifest.json', location.origin).href)),
    });
  };
})();
`;

test('the real trial Worker runs from blob: under the page CSP: other origins are refused', async ({ page, context }) => {
  test.setTimeout(120_000);
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' });
    res.end('export const reached = true;');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const foreign = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    let patched = 0;
    await context.route('**/clinical-agent-env/assets/trial-*.js', async (route) => {
      const res = await route.fetch();
      patched++;
      await route.fulfill({ response: res, body: (await res.text()) + PROBE });
    });
    const api = await mockToy(context);
    await page.goto('./?view=live&task=_toy');
    await page.getByLabel('API key', { exact: true }).fill(sentinelKey());
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByTestId('key-chip')).toBeVisible();
    await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
    await expect.poll(() => api.held.length, { timeout: 60_000 }).toBe(1);
    const probe = (await page.evaluate((origin) => new Promise<Record<string, unknown>>((resolve) => {
      const bc = new BroadcastChannel('trial-worker-probe');
      bc.onmessage = (e) => resolve(e.data);
      bc.postMessage(origin);
      setTimeout(() => resolve({ timeout: true }), 30_000);
    }), foreign));
    await api.release();
    await expect(page.getByTestId('live-trial')).toHaveAttribute('data-state', 'graded', { timeout: 90_000 });
    expect(patched).toBeGreaterThan(0);
    expect(String(probe.location)).toMatch(/^blob:/);
    expect(String(probe.guardFetch)).toMatch(/^refused: .*egress guard/);
    expect(String(probe.protoFetch)).toMatch(/^refused/);
    expect(String(probe.dynamicImport)).toMatch(/^refused/);
    expect(probe.sameOrigin).toBe('answered 200');
    expect(hits).toEqual([]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
