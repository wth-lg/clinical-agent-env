// The live trial on the browser-direct surface (plan phase P15): the static build under vite
// preview, the Messages API route-mocked (page.route sees a dedicated Worker's fetches in
// Chromium). The toy task's trial streams in a Worker through packages/core/run.ts and is graded
// in the browser; a reload mid-trial resumes it from IndexedDB to the hash an uninterrupted run
// reaches; an org-CORS 401 shows its message and points to the local command, another 401 shows
// only the API error; a batch whose projection crosses the session cap is refused with no API
// request and no Worker. After the trials and the reload, no storage holds the sentinel key.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { REFUSAL_TEXT } from '../../../packages/core/runner-api.ts';
import { okResponse, SCENARIOS } from '../src/harness/scenarios.ts';
import { LOCAL_START_COMMAND } from '../src/surface/command.ts';

// The API origin the page may connect to, read from the CSP, as shell.spec.ts does (lint: no-direct-anthropic).
const CSP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const API_ORIGIN = /connect-src 'self' (\S+);/.exec(CSP)?.[1] ?? '';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };
const ORG_CORS = 'CORS requests are not allowed for this Organization because of its settings.';
const sentinelKey = () => ['sk', 'ant', 'api03', randomUUID().replaceAll('-', ''), 'e2e'].join('-');
const TOY = SCENARIOS.toy;

interface Body { max_tokens: number; tools?: unknown[]; messages: Array<{ role: string }> }

// Answers the key gate's Validate (16 output tokens) with "ok", each loop request with the toy
// script's turn for its position (assistant messages so far), each judge request (no tools) with
// the next judge answer. `hold` keeps the first loop request of that turn unanswered.
async function mockToy(page: Page, opts: { hold?: number; trialStatus?: { status: number; message: string } } = {}) {
  const calls: Body[] = [];
  const held: Route[] = [];
  let judge = 0;
  await page.route((url) => url.origin === API_ORIGIN, async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = r.postDataJSON() as Body;
    calls.push(body);
    const sse = (res: Response) => res.text().then((text) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: text, headers: CORS }));
    if (body.max_tokens === 16) return sse(okResponse({ text: 'ok' }, 1));
    if (opts.trialStatus) {
      return route.fulfill({ status: opts.trialStatus.status, contentType: 'application/json', headers: CORS, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: opts.trialStatus.message } }) });
    }
    if (body.tools === undefined) return sse(okResponse(TOY[3 + judge]!, 4 + judge++));
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    if (turn === opts.hold && held.length === 0) return void held.push(route);
    return sse(okResponse(TOY[turn - 1]!, turn));
  });
  return { calls, held, trialCalls: () => calls.filter((c) => c.max_tokens !== 16) };
}

async function enterKey(page: Page, key: string, cap?: string) {
  await page.getByLabel('API key', { exact: true }).fill(key);
  if (cap !== undefined) await page.getByLabel('Session spend cap (USD)').fill(cap);
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByTestId('key-chip')).toBeVisible();
}

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

// The record IndexedDB keeps for a trial (live/store.ts).
const storedRecord = (page: Page, trialId: string) => page.evaluate((id) => new Promise<unknown>((res, rej) => {
  const r = indexedDB.open('clinenv-live');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const get = r.result.transaction('trials').objectStore('trials').get(id);
    get.onsuccess = () => (r.result.close(), res((get.result as { record: unknown } | undefined)?.record ?? null));
    get.onerror = () => rej(get.error);
  };
}), trialId);

const trial = (page: Page) => page.getByTestId('live-trial');
const run = (page: Page, n: number) => page.getByRole('button', { name: `Run ×${n}`, exact: true }).click();

// The final hash the toy trial reaches uninterrupted, from the first test; the reload test must reach it too.
let uninterrupted: string | null = null;

test.describe.configure({ mode: 'serial' });

test('a trial streams in a Worker, is graded in the browser and makes no request but the mocked API', async ({ page }) => {
  const api = await mockToy(page);
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('./?view=live&task=_toy');
  await expect(page.getByTestId('surface-chip')).toContainText('Browser-direct');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  await expect(trial(page).getByTestId('tool-row')).toHaveCount(4);
  await expect(trial(page).getByTestId('thinking').first()).toContainText('I should check who I am');
  await expect(trial(page).getByTestId('meter-turn')).toHaveText('3');
  uninterrupted = await trial(page).getByTestId('final-hash').textContent();
  expect(uninterrupted).toMatch(/^[0-9a-f]{64}$/);
  expect(api.trialCalls()).toHaveLength(5);
  expect(workers.some((u) => /\/assets\/trial-[^/]+\.js$/.test(u))).toBe(true);
  await expect(page.getByTestId('live-row')).toHaveAttribute('data-outcome', 'PASS');
  expect(await storedRecord(page, (await trial(page).getAttribute('data-trial'))!)).toMatchObject({ resumed: false });
  await expect(page.getByTestId('resumed')).toHaveCount(0);
});

test('a reload mid-trial resumes from IndexedDB to the same final hash, and no storage holds the key', async ({ page }) => {
  expect(uninterrupted).not.toBeNull();
  const key = sentinelKey();
  const api = await mockToy(page, { hold: 3 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, key);
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  await expect(trial(page).getByTestId('tool-row')).toHaveCount(3);
  const before = await trial(page).getAttribute('data-trial');
  await page.reload();
  await api.held[0]!.abort().catch(() => undefined);
  // The key was not remembered, so the gate asks again; the trial resumes once the tab holds it.
  await enterKey(page, key);
  await expect(trial(page)).toHaveAttribute('data-trial', before!);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await expect(trial(page).getByTestId('final-hash')).toHaveText(uninterrupted!);
  await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  // The record says the trial was resumed, and the live view and its Runs row show it.
  expect(await storedRecord(page, before!)).toMatchObject({ resumed: true });
  await expect(trial(page).getByTestId('resumed')).toHaveText('resumed after reload');
  await expect(page.locator(`[data-testid="live-row"][data-trial="${before}"]`).getByTestId('resumed')).toHaveText('resumed after reload');
  // The loop's first two answers came from the checkpoint: only the cut-off request was re-sent.
  expect(api.trialCalls().filter((c) => c.tools !== undefined)).toHaveLength(4);
  expect(await storageDump(page)).not.toContain(key);
});

test('at phone width the in-progress trial fits: written ids truncate and the trial id breaks at its dots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockToy(page, { hold: 3 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  const written = trial(page).locator('[data-testid="tool-row"][data-tool="write_note"] [data-testid="written"]');
  await expect(written).toBeVisible();
  const box = (await written.boundingBox())!;
  const row = (await trial(page).locator('[data-testid="tool-row"][data-tool="write_note"]').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const id = (await trial(page).getAttribute('data-trial'))!;
  // The heading may break after each dot, never inside the run id or the task id.
  await expect(trial(page).locator('h2')).toHaveText(id);
  await expect(trial(page).locator('h2')).toHaveCSS('overflow-wrap', 'break-word');
  await expect(trial(page).locator('h2 wbr')).toHaveCount(id.split('.').length - 1);
});

test('without a key the Task select is shown disabled', async ({ page }) => {
  await page.goto('./?view=live&task=_toy');
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  const select = page.getByLabel('Task');
  await expect(select).toBeDisabled();
  expect(Number(await select.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
});

test('the trial Worker refuses fetch, XHR, WebSocket and EventSource to any origin but its own and the API', async ({ page }) => {
  // .invalid never resolves, so nothing leaves the machine; a fetch the guard let through gets this answer.
  const FOREIGN = 'https://foreign.invalid';
  let reached = 0;
  await page.route(`${FOREIGN}/**`, (route) => (reached++, route.fulfill({ status: 200, body: 'reached', headers: { 'access-control-allow-origin': '*' } })));
  const api = await mockToy(page, { hold: 2 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  const worker = page.waitForEvent('worker', (w) => /\/assets\/trial-[^/]+\.js$/.test(w.url()));
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  const probe = await (await worker).evaluate(async (foreign) => {
    const attempt = async (f: () => unknown) => {
      try {
        const r = await f();
        return r instanceof Response ? `answered ${r.status}` : 'sent';
      } catch (e) {
        return (e as Error).message;
      }
    };
    return {
      fetch: await attempt(() => fetch(`${foreign}/collect`)),
      request: await attempt(() => fetch(new Request(`${foreign}/collect`, { method: 'POST', body: 'x' }))),
      xhr: await attempt(() => new XMLHttpRequest().open('GET', `${foreign}/collect`)),
      websocket: await attempt(() => new WebSocket('wss://foreign.invalid/collect')),
      eventsource: await attempt(() => new EventSource(`${foreign}/collect`)),
      self: await attempt(() => fetch(new URL('../data/fixtures/manifest.json', location.href))),
    };
  }, FOREIGN);
  for (const via of ['fetch', 'request', 'xhr', 'websocket', 'eventsource'] as const) expect(probe[via], via).toMatch(/egress guard/);
  expect(probe.self).toBe('answered 200');
  expect(reached).toBe(0);
});

test('an org-CORS 401 stops the trial and shows its message, pointing to the exact local command', async ({ page }) => {
  await mockToy(page, { trialStatus: { status: 401, message: ORG_CORS } });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  const alert = trial(page).getByTestId('trial-error');
  await expect(alert).toContainText(ORG_CORS, { timeout: 30_000 });
  await expect(alert).toContainText("This key's organization does not allow browser access");
  // The alert explains it: the footer shows only the outcome chip, and the empty trajectory says why (review-P15-1 F3).
  await expect(trial(page).getByTestId('outcome')).toHaveText('INFRA_API');
  await expect(trial(page).getByTestId('trial-end')).not.toContainText('rerun');
  await expect(trial(page).getByTestId('label')).toHaveCount(0);
  await expect(trial(page).getByTestId('trajectory')).toHaveText('No reply came from the model.');
  await alert.getByRole('button', { name: 'Show the steps' }).click();
  const panel = page.getByTestId('local-run-panel');
  await expect(panel).toBeFocused();
  await expect(panel.getByTestId('local-command')).toHaveText(LOCAL_START_COMMAND);
  await expect(panel.getByRole('button', { name: 'Copy command' })).toBeVisible();
});

test('a 401 with another message shows the API error without the local command', async ({ page }) => {
  await mockToy(page, { trialStatus: { status: 401, message: 'invalid x-api-key' } });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  const alert = trial(page).getByTestId('trial-error');
  await expect(alert).toContainText('invalid x-api-key', { timeout: 30_000 });
  await expect(alert).not.toContainText(LOCAL_START_COMMAND);
  await expect(alert.getByRole('button', { name: 'Show the steps' })).toHaveCount(0);
});

test('each Run size shows its projected cost, and a size over the session cap is disabled with the reason', async ({ page }) => {
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  // A toy trial projects PER_TRIAL_CAP_USD plus its judge allowance: $10.00 (live/checks.ts).
  for (const [n, cost] of [[1, '$10.00'], [3, '$30.00'], [10, '$100.00'], [20, '$200.00']] as const) await expect(page.getByTestId(`run-cost-${n}`)).toHaveText(cost);
  await expect(page.getByRole('button', { name: 'Run ×1', exact: true })).toBeEnabled();
  for (const n of [3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×3, ×10 and ×20 need more than your session cap of $20.00 (Run ×3 needs $30.00). Raise the cap below to run them.');
  // The cap is set here too, not only in the key gate, and holds for this tab across a reload.
  await expect(page.getByTestId('cap-where')).toContainText('this tab only');
  await page.getByLabel('Session cap (USD)').fill('250');
  await page.getByRole('button', { name: 'Set cap' }).click();
  for (const n of [1, 3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeEnabled();
  await expect(page.getByTestId('size-reason')).toHaveCount(0);
  await expect(page.getByTitle('Session spend against the session cap')).toContainText('of $250.00');
  await page.reload();
  // The key was not remembered: the key gate asks again and shows the cap set on this page.
  await expect(page.getByLabel('Session spend cap (USD)')).toHaveValue('250');
  await enterKey(page, sentinelKey());
  await expect(page.getByLabel('Session cap (USD)')).toHaveValue('250');
  await page.getByLabel('Session cap (USD)').fill('0');
  await expect(page.getByTestId('cap-invalid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set cap' })).toBeDisabled();
});

test('a batch whose projection crosses the session cap is refused with no API request and no Worker', async ({ page }) => {
  const api = await mockToy(page, { hold: 2 });
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  const trialWorkers = () => workers.filter((u) => /\/assets\/trial-[^/]+\.js$/.test(u));
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey(), '5');
  // Under a $5.00 cap no size fits: every Run button is disabled, so nothing is fetched or started.
  for (const n of [1, 3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toContainText('Run ×1 needs $10.00');
  expect(api.trialCalls()).toHaveLength(0);
  expect(trialWorkers()).toHaveLength(0);
  // A size that fits the cap but not what is left of it: the tab ledger refuses it before any fetch.
  await page.getByLabel('Session cap (USD)').fill('15');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  const calls = api.trialCalls().length;
  await run(page, 1);
  const refusal = page.getByTestId('run-refusal');
  await expect(refusal.locator('p').first()).toHaveText(REFUSAL_TEXT.trials.spend_refused_ceiling);
  await expect(refusal.getByTestId('error-detail')).toContainText('session cap');
  await expect(refusal.getByTestId('cap-hint')).toHaveText('Change the session cap under “Run a task” on this page.');
  expect(api.trialCalls()).toHaveLength(calls);
  expect(trialWorkers()).toHaveLength(1);
  await expect(page.getByTestId('live-run')).toHaveCount(1);
});
