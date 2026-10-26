// The hosted site through the relay (plan phase P16h, PR-web-2), mocked: the static build under
// vite preview with /api/health missing (browser-direct), and the relay route-mocked at
// RELAY_ORIGIN. Validate and the toy trial's calls go only to RELAY_URL, never to an API host; the
// local-run panel stays mounted on the key gate and in the shell (UD-1); a relay 429, a 5xx and
// an unreachable relay each show their ui-contract.md sentence in red beside the panel and its
// command, on Validate and (429, 5xx) during a trial; a failed Validate leaves no key in the
// page's markup; the page and the trial Worker refuse a fetch to RELAY_URL or an API host that
// MessagesClient did not make, also through the prototype that holds the raw function.
import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { isApiHost } from '../../../packages/core/anthropic.ts';
import { HEALTH_PATH } from '../../../packages/core/runner-api.ts';
import { APP_CSP } from '../csp.ts';
import { okResponse, SCENARIOS } from '../src/harness/scenarios.ts';
import { RELAY_FAILURE_TEXT, RELAY_TRIAL_TEXT, type RelayReason } from '../src/keygate/failure.ts';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../src/surface/command.ts';
import { RELAY_ORIGIN, RELAY_URL } from '../src/surface/relay.ts';

// The relay's CORS answer for the page (the real one names the Pages origin; the mock serves
// localhost, so it allows any).
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const sentinelKey = () => ['sk', 'ant', 'api03', randomUUID().replaceAll('-', ''), 'relay'].join('-');
const TOY = SCENARIOS.toy;
// An API host URL, joined so the lint rule no-direct-anthropic sees no literal.
const API_URL = `https://${['api', 'anthropic', 'com'].join('.')}/v1/messages`;
const TRIAL_SCRIPT = /\/assets\/trial-[^/]+\.js$/;
const WORLD = /\/data\/fixtures\/world\.ndjson\.gz$/;

interface Body { max_tokens: number; tools?: unknown[]; messages: Array<{ role: string }> }

// The relay: an error for Validate when `validate` says so, else the toy trial as live.spec.ts
// answers it (Validate "ok", each loop turn from the toy script, each judge request in turn).
// `trial` answers every trial call (loop turns and judge requests) with that error instead.
type Reply = { status: number; body: unknown; headers?: Record<string, string> };
async function mockRelay(page: Page, opts: { validate?: Reply; trial?: Reply } = {}) {
  const posts: Request[] = [];
  let judge = 0;
  await page.context().route((url) => url.origin === RELAY_ORIGIN, async (route: Route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    posts.push(r);
    const body = r.postDataJSON() as Body;
    const sse = (res: Response) => res.text().then((text) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: text, headers: CORS }));
    if (body.max_tokens === 16) {
      if (opts.validate) return route.fulfill({ status: opts.validate.status, contentType: 'application/json', headers: { ...CORS, ...opts.validate.headers }, body: JSON.stringify(opts.validate.body) });
      return sse(okResponse({ text: 'ok' }, 1));
    }
    if (opts.trial) return route.fulfill({ status: opts.trial.status, contentType: 'application/json', headers: { ...CORS, ...opts.trial.headers }, body: JSON.stringify(opts.trial.body) });
    if (body.tools === undefined) return sse(okResponse(TOY[3 + judge]!, 4 + judge++));
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    return sse(okResponse(TOY[turn - 1]!, turn));
  });
  return { posts, trialPosts: () => posts.filter((p) => (p.postDataJSON() as Body).max_tokens !== 16) };
}

// Every request the page and its Workers make, and each CSP violation the console reports.
function watch(page: Page) {
  const urls: string[] = [];
  const csp: string[] = [];
  page.context().on('request', (r) => urls.push(r.url()));
  page.on('console', (m) => (/Content Security Policy/i.test(m.text()) ? csp.push(m.text()) : undefined));
  return { urls, csp };
}

async function browserDirect(page: Page) {
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.route((url) => url.pathname.endsWith(`/${HEALTH_PATH}`), (route) => route.fulfill({ status: 404, body: 'Not Found' }));
}

async function enterKey(page: Page, key: string, cap?: string) {
  await page.getByLabel('API key', { exact: true }).fill(key);
  if (cap !== undefined) await page.getByLabel('Session spend cap (USD)').fill(cap);
  await page.getByRole('button', { name: 'Validate' }).click();
}

// localStorage, sessionStorage and every IndexedDB record, as one string.
async function storageDump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
    const records: unknown[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name!);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of db.objectStoreNames) {
        records.push(await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        }));
      }
      db.close();
    }
    return `${dump(localStorage)}\n${dump(sessionStorage)}\n${JSON.stringify(records)}`;
  });
}

// The computed --color-danger (tokens.css), to compare with an error's computed colours.
async function dangerColour(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-danger)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
}

// The error is red: its first line and its border are the danger colour.
async function expectRed(alert: Locator) {
  const danger = await dangerColour(alert.page());
  expect(await alert.locator('p').first().evaluate((el) => getComputedStyle(el).color)).toBe(danger);
  expect(await alert.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(danger);
}

const panel = (page: Page) => page.getByRole('region', { name: 'Run it on your computer' });
const trial = (page: Page) => page.getByTestId('live-trial');
const isTrialWorker = (w: { url(): string }) => /^blob:http:\/\/localhost:\d+\//.test(w.url());

// The panel's start block: LOCAL_PREREQUISITES, both install links and LOCAL_START_COMMAND.
async function expectPanel(page: Page) {
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByTestId('local-prerequisites')).toHaveText(LOCAL_PREREQUISITES);
  await expect(panel(page).getByRole('link', { name: 'Install Node.js' })).toHaveAttribute('href', NODE_INSTALL_URL);
  await expect(panel(page).getByRole('link', { name: 'Install pnpm' })).toHaveAttribute('href', PNPM_INSTALL_URL);
  await expect(panel(page).getByTestId('local-command')).toHaveText(LOCAL_START_COMMAND);
}

// Every request that left the page for another origin: only RELAY_URL, never an API host.
function expectOnlyRelay(urls: string[], baseURL: string) {
  const self = new URL(baseURL).origin;
  const remote = urls.filter((u) => /^https?:/.test(u) && new URL(u).origin !== self);
  expect(remote.filter((u) => isApiHost(new URL(u).hostname))).toEqual([]);
  expect([...new Set(remote)]).toEqual([RELAY_URL]);
}

test('the local-run panel shows on first load with no key and after a 200 Validate through the relay; Copy writes LOCAL_START_COMMAND', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
  const seen = watch(page);
  await browserDirect(page);
  const relay = await mockRelay(page);
  await page.goto('./');
  await expect(page.getByTestId('surface-chip')).toHaveText('Browser-direct');
  await expectPanel(page);
  await enterKey(page, sentinelKey());
  await expect(page.getByTestId('key-chip')).not.toHaveText('No key');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
  await expectPanel(page);
  await panel(page).getByRole('button', { name: 'Copy command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LOCAL_START_COMMAND);
  expect(relay.posts.map((p) => p.url())).toEqual([RELAY_URL]);
  expectOnlyRelay(seen.urls, baseURL!);
});

test('Validate and a trial go only to RELAY_URL: the trial streams and grades, no API host is reached, no CSP violation, no key in storage', async ({ page, baseURL }) => {
  const seen = watch(page);
  await browserDirect(page);
  const relay = await mockRelay(page);
  const key = sentinelKey();
  await page.goto('./?view=live&task=_toy');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(APP_CSP);
  await enterKey(page, key);
  await expect(page.getByTestId('key-chip')).toBeVisible();
  await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  expect(relay.trialPosts().length).toBeGreaterThan(0);
  for (const p of relay.posts) {
    expect(p.url()).toBe(RELAY_URL);
    expect(await p.headerValue('x-api-key')).toBe(key);
  }
  expectOnlyRelay(seen.urls, baseURL!);
  expect(seen.csp).toEqual([]);
  expect(await storageDump(page)).not.toContain(key);
});

test('a batch over the session cap is refused with no call to the relay', async ({ page }) => {
  await browserDirect(page);
  const relay = await mockRelay(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey(), '5');
  await expect(page.getByTestId('key-chip')).toBeVisible();
  for (const n of [1, 3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toBeVisible();
  expect(relay.trialPosts()).toHaveLength(0);
  expect(relay.posts).toHaveLength(1);
});

const FAILURES: Array<{ reason: RelayReason; reply: { status: number; body: unknown; headers?: Record<string, string> } | 'abort' }> = [
  { reason: 'limited', reply: { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'relay rate limit: retry later' } }, headers: { 'retry-after': '30' } } },
  { reason: 'unavailable', reply: { status: 502, body: { type: 'error', error: { type: 'relay_error' } } } },
  { reason: 'unavailable', reply: { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } } },
  { reason: 'unreachable', reply: 'abort' },
];

for (const { reason, reply } of FAILURES) {
  const label = reply === 'abort' ? 'unreachable' : String(reply.status);
  test(`a relay ${label} shows its ui-contract.md sentence in red, pointing to the panel with LOCAL_START_COMMAND`, async ({ page }) => {
    await browserDirect(page);
    if (reply === 'abort') await page.context().route((url) => url.origin === RELAY_ORIGIN, (route) => route.abort('failed'));
    else await mockRelay(page, { validate: reply });
    await page.goto('./');
    await enterKey(page, sentinelKey());
    const alert = page.getByRole('alert');
    await expect(alert.locator('p').first()).toHaveText(RELAY_FAILURE_TEXT[reason].lead);
    await expect(alert).toContainText(RELAY_FAILURE_TEXT[reason].next);
    await expectRed(alert);
    await expect(alert.getByTestId('local-command')).toHaveCount(0);
    await expectPanel(page);
    await alert.getByRole('button', { name: 'Show the steps' }).click();
    await expect(panel(page)).toBeFocused();
  });
}

// The key field is uncontrolled (review-security-P16h-web-1 M2): React mirrors a controlled
// input's value into its value attribute, so a key left after a failed Validate showed in the
// page's markup. It stays only in the field's live value, which a retry reads.
const REFUSED: Reply[] = [
  { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'relay rate limit: retry later' } }, headers: { 'retry-after': '30' } },
  { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } },
];
for (const reply of REFUSED) {
  test(`after a failed Validate (relay ${reply.status}) the key is in no attribute or markup of the page, and Validate again sends it`, async ({ page }) => {
    await browserDirect(page);
    const relay = await mockRelay(page, { validate: reply });
    await page.goto('./');
    const key = sentinelKey();
    await enterKey(page, key);
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain(key);
    for (const reveal of [false, true]) {
      if (reveal) await page.getByRole('button', { name: 'Show key' }).click();
      expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain(key);
      await expect(page.getByLabel('API key', { exact: true })).toHaveValue(key);
    }
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect.poll(() => relay.posts.length).toBe(2);
    expect(await relay.posts[1]!.headerValue('x-api-key')).toBe(key);
  });
}

// A relay failure during a trial (ruling 2026-10-28T02:00): the trial stops with the red error,
// its sentence names the browsers, and the local-run panel follows it. retry-after: 0 lets the
// client spend its attempts at once (exposed, as apps/relay exposes it); an unreachable relay
// backs off for minutes, so failure.test.ts covers that reason (trialRelayReason).
const NOW = { 'retry-after': '0', 'access-control-expose-headers': 'retry-after' };
const TRIAL_FAILURES: Array<{ reason: RelayReason; reply: Reply }> = [
  { reason: 'limited', reply: { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'relay rate limit: retry later' } }, headers: NOW } },
  { reason: 'unavailable', reply: { status: 502, body: { type: 'error', error: { type: 'relay_error' } }, headers: NOW } },
];

for (const { reason, reply } of TRIAL_FAILURES) {
  test(`a relay ${reply.status} during a trial shows its ui-contract.md sentence in red, then the local-run panel with LOCAL_START_COMMAND`, async ({ page }) => {
    test.setTimeout(90_000);
    await browserDirect(page);
    const relay = await mockRelay(page, { trial: reply });
    await page.goto('./?view=live&task=_toy');
    await enterKey(page, sentinelKey());
    await expect(page.getByTestId('key-chip')).toBeVisible();
    await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
    const alert = trial(page).getByTestId('trial-error');
    const lead = alert.locator('p').first();
    await expect(lead).toHaveText(RELAY_TRIAL_TEXT[reason].lead, { timeout: 60_000 });
    await expect(alert).toContainText(RELAY_TRIAL_TEXT[reason].next);
    await expect(alert.getByTestId('local-command')).toHaveCount(0);
    await expectRed(alert);
    await expectPanel(page);
    await alert.getByRole('button', { name: 'Show the steps' }).click();
    await expect(panel(page)).toBeFocused();
    expect(relay.trialPosts().length).toBeGreaterThan(0);
  });
}

// The plants that reach a raw function through the prototype that holds it (security review
// review-security-P16h-web-1 S1). Each names the prototype it found, so a scope without one fails
// the match rather than passing vacuously. Each runs in the browser, so each walks the chain itself.
const protoFetch = async (url: string) => {
  for (let i = 0; i < 200 && Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.writable !== false; i++) await new Promise((r) => setTimeout(r, 50));
  let owner: { fetch: typeof fetch } | null = null;
  for (let p = Object.getPrototypeOf(globalThis) as object | null; p !== null && owner === null; p = Object.getPrototypeOf(p) as object | null) if (Object.hasOwn(p, 'fetch')) owner = p as { fetch: typeof fetch };
  if (owner === null) return 'no prototype holds fetch';
  return owner.fetch.call(globalThis, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(() => 'sent', (e: Error) => `${e.name}: ${e.message}`);
};
const protoBeacon = (url: string) => {
  let owner: { sendBeacon: Navigator['sendBeacon'] } | null = null;
  for (let p = Object.getPrototypeOf(navigator) as object | null; p !== null && owner === null; p = Object.getPrototypeOf(p) as object | null) if (Object.hasOwn(p, 'sendBeacon')) owner = p as { sendBeacon: Navigator['sendBeacon'] };
  if (owner === null) return 'no prototype holds sendBeacon';
  try {
    return `sent ${owner.sendBeacon.call(navigator, url, '{}')}`;
  } catch (e) {
    return `${(e as Error).name}: ${(e as Error).message}`;
  }
};

test('the egress guard refuses a fetch to RELAY_URL or an API host planted in the page and in the trial Worker; none reaches either', async ({ page }) => {
  const seen = watch(page);
  await browserDirect(page);
  const relay = await mockRelay(page);
  // The world fixture is held, so the Worker has installed its guard and not yet built its client.
  let releaseWorld!: () => void;
  const worldHeld = new Promise<void>((r) => (releaseWorld = r));
  await page.context().route((url) => WORLD.test(url.pathname), async (route) => {
    await worldHeld;
    await route.continue();
  });
  await page.goto('./?view=live&task=_toy');
  // Waits until the scope's guard has locked its fetch (the Worker's module may still be loading
  // when its worker event fires), then sends one POST to the relay outside MessagesClient.
  const plant = async (url: string) => {
    for (let i = 0; i < 200 && Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.writable !== false; i++) await new Promise((r) => setTimeout(r, 50));
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(() => 'sent', (e: Error) => `${e.name}: ${e.message}`);
  };
  expect(await page.evaluate(plant, RELAY_URL)).toMatch(/^EgressRefusal: egress guard/);
  expect(await page.evaluate(plant, API_URL)).toMatch(/^EgressRefusal: egress guard/);
  // The page keeps sendBeacon on Navigator.prototype; the guard locks it there too (review S1).
  expect(await page.evaluate(protoBeacon, RELAY_URL)).toMatch(/^EgressRefusal: egress guard/);
  expect(relay.posts).toHaveLength(0);
  await enterKey(page, sentinelKey());
  await expect(page.getByTestId('key-chip')).toBeVisible();
  const validateOnly = relay.posts.length;
  const worker = page.waitForEvent('worker', isTrialWorker);
  const scripts: string[] = [];
  page.context().on('request', (r) => (TRIAL_SCRIPT.test(new URL(r.url()).pathname) ? scripts.push(r.url()) : undefined));
  await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
  const inWorker = await (await worker).evaluate(plant, RELAY_URL);
  expect(inWorker).toMatch(/^EgressRefusal: egress guard/);
  expect(await (await worker).evaluate(plant, API_URL)).toMatch(/^EgressRefusal: egress guard/);
  // A dedicated Worker keeps fetch on WorkerGlobalScope.prototype; the guard locks it there too.
  expect(await (await worker).evaluate(protoFetch, RELAY_URL)).toMatch(/^EgressRefusal: egress guard/);
  expect(relay.posts).toHaveLength(validateOnly);
  releaseWorld();
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  expect(scripts).toHaveLength(1);
  expect(seen.urls.filter((u) => /^https?:/.test(u) && isApiHost(new URL(u).hostname))).toEqual([]);
});
