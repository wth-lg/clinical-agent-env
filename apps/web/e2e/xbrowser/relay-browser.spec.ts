// The relay in a real browser (plan phase P16h, R1). The probe page in relay mode
// (src/probe/relay.ts) builds a MessagesClient with P16g's endpoint option and the egress guard
// with the relay origin metered, so the browser sends the client's real headers and makes a real
// cross-origin CORS preflight.
//   local mode     (CI; Chromium, Firefox and WebKit) vite preview serves the probe, and
//                  apps/relay/test/serve-local.ts runs the relay on 127.0.0.1 with the page's
//                  origin allowed and a stub upstream that streams three SSE events.
//   deployed mode  (RELAY_URL set; the verifier runs it locally after the deploy, never in CI)
//                  the probe is served at https://wth-lg.github.io/clinical-agent-env/probe.html
//                  through page.route (the Pages origin only; the relay request is not routed)
//                  and calls the deployed relay with a sentinel key: the API's 401
//                  authentication_error, read from the response body, proves the preflight
//                  passed and the CORS response is readable.
// Deployed mode skips WebKit, with the reason below; local mode runs in all three browsers.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { clientHeaderNames } from '../../../../cli/relay-check.ts';
import { FORWARD_HEADERS } from '../../../relay/src/relay.ts';
import { serveLocal, sseUpstream } from '../../../relay/test/serve-local.ts';
import { relayGuardOptions } from '../../src/probe/relay.ts';

const RELAY_URL = process.env.RELAY_URL;
const PAGES_PROBE = 'https://wth-lg.github.io/clinical-agent-env/probe.html';
const WEBKIT_SKIP = 'deployed mode is checked in Chromium and Firefox (plan phase P16h gate); WebKit runs local mode only';

type Outcome = { ok: boolean; status: number | null; type?: string | null; model?: string; stop_reason?: string | null; attempts?: number; message?: string };
const relayCall = (page: Page, key: string) => page.evaluate((k) => (window as unknown as { clinenvRelayCall: (k: string) => Promise<Outcome> }).clinenvRelayCall(k), key);
const headerList = (v: string | null) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).sort();
const sentinel = () => `clinenv-sentinel-${randomBytes(16).toString('hex')}`;

// Without ?relay= the probe is the page main has: clinenvFetch and the guard with no options
// (smoke.spec.ts checks that clinenvFetch still sends and the guard still refuses the API host).
test('without ?relay= the probe defines clinenvFetch only and installs the guard with no options', async ({ page }) => {
  expect(relayGuardOptions({ search: '', origin: 'http://localhost:1' })).toEqual({});
  expect(relayGuardOptions({ search: '?other=1', origin: 'http://localhost:1' })).toEqual({});
  await page.goto('./probe.html');
  await expect(page.locator('body[data-page="probe"]')).toBeAttached();
  expect(await page.evaluate(() => [typeof (window as { clinenvFetch?: unknown }).clinenvFetch, typeof (window as { clinenvRelayCall?: unknown }).clinenvRelayCall, document.body.dataset.relay ?? null])).toEqual(['function', 'undefined', null]);
});

test.describe('local mode', () => {
  test.skip(RELAY_URL !== undefined, 'RELAY_URL is set: deployed mode runs instead');

  test("one MessagesClient call streams the stub's three events through a real preflight", async ({ page, baseURL }) => {
    const relay = await serveLocal({ allowedOrigin: new URL(baseURL!).origin, upstream: sseUpstream() });
    try {
      await page.goto(`./probe.html?relay=${encodeURIComponent(relay.url)}`);
      const key = sentinel();
      expect(await relayCall(page, key)).toEqual({ ok: true, status: 200, model: 'claude-opus-5-5', stop_reason: 'end_turn', attempts: 1 });
      await expect(page.locator('body')).toHaveAttribute('data-relay', 'ok');

      const client = await clientHeaderNames();
      expect(relay.log.map((e) => e.method)).toEqual(['OPTIONS', 'POST']);
      const [options, post] = relay.log;
      expect(headerList(options!.requestHeaders)).toEqual(client);
      expect(options!.status).toBe(204);
      expect(client.filter((h) => !headerList(options!.allowHeaders).includes(h))).toEqual([]);
      expect(post!.status).toBe(200);

      expect(relay.upstreamCalls).toHaveLength(1);
      const sent = relay.upstreamCalls[0]!.headers;
      expect(Object.keys(sent).filter((h) => !(FORWARD_HEADERS as readonly string[]).includes(h))).toEqual([]);
      expect(sent['x-api-key']).toBe(key);
    } finally {
      await relay.close();
    }
  });

  test('a fetch to the relay from the page outside the client is refused and never reaches it', async ({ page, baseURL }) => {
    const relay = await serveLocal({ allowedOrigin: new URL(baseURL!).origin });
    try {
      await page.goto(`./probe.html?relay=${encodeURIComponent(relay.url)}`);
      const result = await page.evaluate(async (u) => {
        try {
          await fetch(u, { method: 'POST', body: '{}' });
          return 'sent';
        } catch (e) {
          return (e as Error).name;
        }
      }, relay.url);
      expect(result).toBe('EgressRefusal');
      expect(relay.log).toEqual([]);
    } finally {
      await relay.close();
    }
  });
});

test.describe('deployed mode', () => {
  test.skip(RELAY_URL === undefined, 'set RELAY_URL to the deployed relay to run deployed mode (locally, after the deploy)');

  test('the probe at the Pages origin reads the API 401 through the deployed relay', async ({ page, baseURL, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_SKIP);
    const relay = new URL(RELAY_URL!);
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(readFileSync(new URL('../../probe.html', import.meta.url), 'utf8'))?.[1] ?? '';
    expect(csp.split(';').find((d) => d.trim().startsWith('connect-src'))?.split(/\s+/), `add ${relay.origin} to connect-src in apps/web/probe.html`).toContain(relay.origin);

    const local = new URL(baseURL!);
    await page.route('https://wth-lg.github.io/**', async (route) => {
      const u = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: `${local.origin}${u.pathname}${u.search}` }) });
    });
    const key = sentinel();
    // For pnpm keyscan over the Vercel log capture: the key is in a 0600 file, never printed.
    const file = join(mkdtempSync(join(tmpdir(), 'relay-browser-')), 'sentinel-key');
    writeFileSync(file, `${key}\n`, { mode: 0o600 });
    console.log(`relay-browser deployed mode (${browserName}): sentinel key file ${file}`);

    await page.goto(`${PAGES_PROBE}?relay=${encodeURIComponent(`${relay.origin}/v1/messages`)}`);
    const outcome = await relayCall(page, key);
    expect(outcome).toMatchObject({ ok: false, status: 401, type: 'authentication_error' });
    expect(JSON.stringify(outcome)).not.toContain(key);
  });
});
