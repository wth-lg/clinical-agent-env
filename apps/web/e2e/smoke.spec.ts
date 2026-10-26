import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { isApiHost } from '../../../packages/core/anthropic.ts';
import { APP_CSP } from '../csp.ts';
import { RELAY_PROBE_SOURCES } from '../src/probe/csp.ts';
import { RELAY_ORIGIN } from '../src/surface/relay.ts';

// The app's CSP is APP_CSP (csp.ts), which the build writes into index.html; its connect-src
// names the relay (P16h). The test pages carry their own meta: probe.html and harness.html name
// the API host instead of the relay, since the probe page relays the Node-side client's calls
// to it, and relay-probe.html adds RELAY_PROBE_SOURCES to probe.html's connect-src. The API
// origin is read from probe.html, so this file names no API host (lint: no-direct-anthropic).
const metaCsp = (html: string) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
const source = (page: string) => readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
const PROBE_CSP = metaCsp(source('probe.html')) ?? '';
const API_ORIGIN = /connect-src \S+ (\S+);/.exec(PROBE_CSP)?.[1] ?? '';
const RELAY_PROBE_CSP = PROBE_CSP.replace(` ${API_ORIGIN};`, ` ${API_ORIGIN} ${RELAY_PROBE_SOURCES.join(' ')};`);
const PAGES = ['index.html', 'harness.html', 'probe.html', 'relay-probe.html'];
const TEST_PAGES = PAGES.filter((p) => p !== 'index.html');
const pageCsp = (page: string) => (page === 'index.html' ? APP_CSP : page === 'relay-probe.html' ? RELAY_PROBE_CSP : PROBE_CSP);

test('each test page source carries its CSP meta; index.html gets APP_CSP from the build', () => {
  expect(isApiHost(new URL(API_ORIGIN).hostname)).toBe(true);
  expect(PROBE_CSP).toBe(APP_CSP.replace(` ${RELAY_ORIGIN};`, ` ${API_ORIGIN};`));
  expect(RELAY_PROBE_CSP).not.toBe(PROBE_CSP);
  expect(metaCsp(source('index.html'))).toBeUndefined();
  for (const page of TEST_PAGES) expect(metaCsp(source(page)), page).toBe(pageCsp(page));
});

for (const page of PAGES) {
  test(`built ${page} is served with its CSP meta`, async ({ page: p }) => {
    await p.goto(page === 'index.html' ? './' : `./${page}`);
    expect(await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(pageCsp(page));
  });
}

test('the shell loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// The egress guard runs in the browser too: a page fetch to the API host is refused before it
// leaves the page. The probe relay (window.clinenvFetch) is the one path out, for requests the
// Node-side MessagesClient registered and the relay claimed (apps/web/src/probe/transport.ts).
test('the egress guard refuses a page fetch to the API host; the probe relay still sends', async ({ page }) => {
  let reached = 0;
  await page.route((url) => url.origin === API_ORIGIN, (route) => (reached++, route.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } })));
  await page.goto('./probe.html');
  await expect(page.locator('body[data-page="probe"]')).toBeAttached();
  const spelled = API_ORIGIN.replace('.', '%2E');
  const refused = await page.evaluate(async (u) => fetch(`${u}/v1/messages`, { method: 'POST', body: '{}' }).then(() => 'sent', (e: Error) => e.message), spelled);
  expect(refused).toMatch(/egress guard/);
  expect(reached).toBe(0);
  const relayed = await page.evaluate(async (u) => (window.clinenvFetch as (u: string, r: unknown) => Promise<{ status?: number }>)(u, { method: 'POST', headers: {}, body: '{}' }), `${API_ORIGIN}/v1/messages`);
  expect(relayed.status).toBe(200);
  expect(reached).toBe(1);
});

test('the static data index is served', async ({ request }) => {
  const res = await request.get('./data/index.json');
  expect(res.ok()).toBe(true);
  expect(Array.isArray((await res.json()).files)).toBe(true);
});
