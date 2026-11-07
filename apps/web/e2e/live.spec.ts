// The live trial on the browser-direct surface (plan phase P15): the static build under vite
// preview, the Messages API route-mocked (page.route sees a dedicated Worker's fetches in
// Chromium). The toy task's trial streams in a Worker through packages/core/run.ts and is graded
// in the browser; a reload mid-trial resumes it from IndexedDB to the hash an uninterrupted run
// reaches; a 401 shows only the API error; a batch whose projection crosses the session cap is refused with no API
// request and no Worker. After the trials and the reload, no storage holds the sentinel key.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browse, GATE } from './browse.ts';
import { okResponse, SCENARIOS } from '../src/harness/scenarios.ts';
import { LOCAL_START_COMMAND } from '../src/surface/command.ts';
import { RELAY_ORIGIN } from '../src/surface/relay.ts';

// The hosted Messages calls go to the relay (P16h), the one origin besides its own the page may
// connect to; the mocks route it (lint: no-direct-anthropic).
const API_ORIGIN = RELAY_ORIGIN;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };
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
    // Two judge answers a trial, so a second trial in the same page is graded too.
    if (body.tools === undefined) return sse(okResponse(TOY[3 + (judge % 2)]!, 4 + judge++));
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    if (turn === opts.hold && held.length === 0) return void held.push(route);
    return sse(okResponse(TOY[turn - 1]!, turn));
  });
  // Answers the held request as if it had not been held.
  const release = async () => {
    const route = held.shift()!;
    const body = route.request().postDataJSON() as Body;
    const turn = body.messages.filter((m) => m.role === 'assistant').length + 1;
    await okResponse(TOY[turn - 1]!, turn).text().then((text) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: text, headers: CORS }));
  };
  return { calls, held, release, trialCalls: () => calls.filter((c) => c.max_tokens !== 16) };
}

async function enterKey(page: Page, key: string, cap?: string) {
  await page.getByLabel('Add an API key', { exact: true }).fill(key);
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
// The trial Worker starts from a same-origin blob: that imports the bundled script, so the page's CSP binds it.
const isTrialWorker = (w: { url(): string }) => /^blob:http:\/\/localhost:\d+\//.test(w.url());
const TRIAL_SCRIPT = /\/assets\/trial-[^/]+\.js$/;
const run = (page: Page, n: number) => page.getByRole('button', { name: `Run ×${n}`, exact: true }).click();

// The final hash the toy trial reaches uninterrupted, from the first test; the reload test must reach it too.
let uninterrupted: string | null = null;

test.describe.configure({ mode: 'serial' });

test('a trial streams in a Worker, is graded in the browser and makes no request but the mocked API', async ({ page }) => {
  const api = await mockToy(page);
  const workers: string[] = [];
  const scripts: string[] = [];
  page.on('worker', (w) => (isTrialWorker(w) ? workers.push(w.url()) : undefined));
  page.on('request', (r) => (TRIAL_SCRIPT.test(new URL(r.url()).pathname) ? scripts.push(r.url()) : undefined));
  await page.goto('./?view=live&task=_toy');
  await expect(page.getByTestId('surface-chip')).toContainText('Hosted');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  // P25u A8: the rows are the trial page's (RowItem): each call that ran has its step number, a
  // Turn divider opens each turn, the task prompt sits behind a disclosure, and an Elapsed meter
  // counts from the first event.
  const steps = trial(page).getByTestId('step');
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toContainText('Step 1');
  await expect(steps.last()).toContainText('Step 4');
  await expect(trial(page).getByTestId('turn-divider')).toHaveCount(3);
  await expect(trial(page).getByTestId('turn-divider').first()).toHaveText('Turn 1');
  await expect(trial(page).locator('details', { hasText: 'Task prompt' })).toHaveCount(1);
  await expect(trial(page).getByTestId('meter-elapsed')).toHaveText(/^\d+:\d\d$/);
  await expect(trial(page).getByTestId('thinking').first()).toContainText('I should check who I am');
  await expect(trial(page).getByTestId('meter-turn')).toHaveText('3');
  // The heading names the task and the trial in words; the raw id is its title and a small code
  // (ui-polish 5.1). Screen readers hear one status line, not every step (5.3).
  const id = (await trial(page).getAttribute('data-trial'))!;
  await expect(trial(page).locator('h2')).toHaveAttribute('title', id);
  await expect(trial(page).locator('h2')).toContainText(/^Practice task \(write one note\) · trial 1 of 1 · started \d\d:\d\d/);
  await expect(trial(page).getByTestId('trial-id')).toHaveText(id);
  await expect(trial(page).getByTestId('trajectory')).not.toHaveAttribute('aria-live');
  await expect(trial(page).getByRole('status')).toHaveText('Finished: PASS');
  // Once finished, the line has no turn part.
  await expect(trial(page).getByTestId('status-turn')).toHaveCount(0);
  uninterrupted = await trial(page).getByTestId('final-hash').textContent();
  expect(uninterrupted).toMatch(/^[0-9a-f]{64}$/);
  expect(api.trialCalls()).toHaveLength(5);
  expect(workers).toHaveLength(1);
  expect(scripts).toHaveLength(1);
  await expect(page.getByTestId('live-row')).toHaveAttribute('data-outcome', 'PASS');
  expect(await storedRecord(page, (await trial(page).getAttribute('data-trial'))!)).toMatchObject({ resumed: false });
  await expect(page.getByTestId('resumed')).toHaveCount(0);
});

// Trace row N10 on the hosted surface (builder-330): the session trial page behaves as on the local
// runner when this tab holds the record (IndexedDB, so a reload keeps it, with no key); for a trial
// the tab never ran it says why there is nothing to show.
test('a graded hosted trial shows its rubric score on the card, and its session trial page renders the Grading cards from the record this tab holds', async ({ page }) => {
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  const id = (await trial(page).getAttribute('data-trial'))!;
  const record = (await storedRecord(page, id)) as { score: number; checks: Array<{ kind: string }> };
  const score = `Rubric score (does not decide pass) ${record.score.toFixed(2)}`;
  // P25u A5: the card says the score is out of 1 and that the gate checks decide pass; the Your runs
  // row keeps the short form; the grade is a button on the outcome line, named by the outcome.
  await expect(trial(page).getByTestId('live-score')).toHaveText(`${score} of 1. Extra credit only; the pass or fail comes from the gate checks.`);
  await expect(page.getByTestId('live-row').getByTestId('live-score')).toHaveText(`${score} of 1`);
  await expect(page.getByTestId('live-row').getByRole('link', { name: 'See the grade' })).toBeVisible();
  // P25u A16: a finished card has no Stop; Run again starts the same task once more.
  await expect(trial(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await expect(trial(page).getByRole('button', { name: 'Run again' })).toBeVisible();
  // P25u A9: the State pane names what the model changed, in words, and keeps the hashes behind a disclosure.
  const state = trial(page).getByTestId('state-diff');
  await expect(state.getByRole('heading', { name: 'What the model changed' })).toBeVisible();
  await expect(state.getByTestId('write-row').first()).toContainText(/^[A-Z][a-z ]+ [A-Za-z]+\/[\w-]+$/);
  await expect(state.locator('summary')).toHaveText('Integrity check (state hashes)');
  await expect(state.getByTestId('final-hash')).not.toBeVisible();
  await state.locator('summary').click();
  await expect(state.getByTestId('final-hash')).toHaveText(/^[0-9a-f]{64}$/);
  await trial(page).getByRole('link', { name: 'See the grade' }).click();
  await expect(page).toHaveURL(/run=session/);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', id);
  await expect(page.getByTestId('session-banner')).toBeVisible();
  const grading = page.getByTestId('panel-grading');
  await expect(grading.getByTestId('score-card')).toHaveText(score);
  await expect(grading.getByTestId('gate-check')).toHaveCount(record.checks.filter((c) => c.kind !== 'rubric').length);
  await expect(grading.getByTestId('rubric-row')).toHaveCount(record.checks.filter((c) => c.kind === 'rubric').length);
  await expect(page.getByTestId('trial-header').getByTestId('outcome')).toHaveText('PASS');
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await expect(page.getByTestId('panel-attribution')).toContainText('not human-audited');
  // The record is this tab's: a reload, past the gate with no key, shows the same page.
  const url = page.url();
  await browse(page, url);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', id);
  await expect(page.getByTestId('panel-grading').getByTestId('score-card')).toHaveText(score);
  // A trial this tab never ran.
  await page.goto('./?view=runs&run=session&trial=nope._toy.9');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trials from this session');
  await expect(page.getByTestId('session-missing')).toContainText('No trial nope._toy.9 in this session. A trial run on the hosted site is kept only in the browser tab that ran it, and this tab has no record of it.');
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
});

test('a reload mid-trial resumes from IndexedDB to the same final hash, and no storage holds the key', async ({ page }) => {
  expect(uninterrupted).not.toBeNull();
  const key = sentinelKey();
  const api = await mockToy(page, { hold: 3 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, key);
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  await expect(trial(page).getByTestId('step')).toHaveCount(3);
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
  // The cut-off call was paid for: the tab ledger settled it at its worst case, and the record
  // counts it, so the record holds everything the ledger charged to the trial (verifier-phase-P15-2 D3).
  const record = (await storedRecord(page, before!)) as { cost_usd: number; judge_cost_usd: number };
  const charged = await page.evaluate((id) => (JSON.parse(sessionStorage.getItem('clinenv.ledger') ?? '[]') as Array<{ kind: string; trial: string | null; cost_usd: number }>)
    .filter((r) => r.kind === 'settle' && r.trial === id).reduce((a, r) => a + r.cost_usd, 0), before!);
  expect(record.cost_usd + record.judge_cost_usd).toBeCloseTo(charged, 6);
  expect(await storageDump(page)).not.toContain(key);
});

test('at phone width the in-progress trial fits: written ids truncate and the trial id breaks at its dots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockToy(page, { hold: 3 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  const written = trial(page).locator('[data-testid="step"][data-tool="write_note"] [data-testid="step-written"]');
  await expect(written).toBeVisible();
  const box = (await written.boundingBox())!;
  const row = (await trial(page).locator('[data-testid="step"][data-tool="write_note"]').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const id = (await trial(page).getAttribute('data-trial'))!;
  // The trial id under the heading may break after each dot, never inside the run id or the task id.
  const code = trial(page).getByTestId('trial-id');
  await expect(code).toHaveText(id);
  await expect(code).toHaveCSS('overflow-wrap', 'break-word');
  await expect(code.locator('wbr')).toHaveCount(id.split('.').length - 1);
  // While the trial runs, its status line gives the turn to screen readers; on screen the Turn
  // meter beside it already shows the number, so the line does not repeat it (#185 m3).
  await expect(trial(page).getByRole('status')).toHaveText(/^Turn \d, running$/);
  const turn = (await trial(page).getByTestId('status-turn').boundingBox())!;
  expect(turn.width).toBeLessThanOrEqual(1);
  // What shows on screen: the parts of the line wider than a screen-reader-only 1 px box.
  const shown = await trial(page).getByRole('status').evaluate((el) => [...el.querySelectorAll('span')].filter((x) => x.getBoundingClientRect().width > 1).map((x) => x.textContent).join(''));
  expect(shown).toBe('running');
  // The running line has its spinner (ui-polish 3.5).
  await expect(trial(page).getByTestId('running-line').locator('svg')).toHaveCount(1);
  // P25u A17: on a phone the surface chip keeps a short visible word beside its icon.
  await expect(page.getByTestId('surface-short')).toBeVisible();
  await expect(page.getByTestId('surface-short')).toHaveText('Hosted');
});

test('the status line says Starting until the first model turn, never "Turn 0" (#185 m2)', async ({ page }) => {
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  // Every value the status line takes, in order, from before the trial starts to its end.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { statuses: string[] }).statuses = seen;
    new MutationObserver(() => {
      const s = document.querySelector('[data-testid="live-trial"] [role="status"]')?.textContent ?? null;
      if (s !== null && s !== seen.at(-1)) seen.push(s);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  const statuses = await page.evaluate(() => (window as unknown as { statuses: string[] }).statuses);
  expect(statuses[0]).toBe('Starting');
  expect(statuses.filter((x) => /Turn 0/.test(x))).toEqual([]);
  expect(statuses.at(-1)).toBe('Finished: PASS');
});

// Two runs of the same task started in the same minute (the page clock is pinned) read alike, so
// the later one's heading gets " (2)" and every row button's name is unique.
test('with two runs started in the same minute, each trial row button is named with its own run heading (#185 m1)', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-31T11:42:10'));
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await run(page, 1);
  await expect(page.getByTestId('live-run')).toHaveCount(2);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  const headings = await page.getByTestId('run-name').allTextContents();
  expect(headings.map((h) => h.replace(/ \(2\)$/, ''))).toEqual([headings[1]!, headings[1]!]);
  expect(headings[0]).toBe(`${headings[1]} (2)`);
  const names: string[] = [];
  for (const r of await page.getByTestId('live-run').all()) {
    const heading = (await r.getByTestId('run-name').textContent())!;
    const button = r.getByTestId('live-row').getByRole('button');
    await expect(button).toHaveAccessibleName(`${heading}, trial 1`);
    names.push(heading);
  }
  expect(new Set(names).size).toBe(2);
});

test('without a key the Task select is shown disabled', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const select = page.getByLabel('Task');
  await expect(select).toBeDisabled();
  // Disabled is the standard look (a solid muted border, not opacity, so its text keeps its
  // contrast; P25c: a dashed border read as a drop target), with the reason as its tooltip.
  expect(await select.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  await expect(select).toHaveAttribute('title', 'Add a key first');
  // P25u J14: the empty state's duration is the range of the official run's median durations per
  // task, and its link names the official run's trials.
  const empty = page.getByTestId('no-live-runs');
  await expect(empty).toContainText(/A trial takes about \d+ to \d+ minutes, and you see each step as it runs\./);
  await expect(empty.getByRole('link', { name: /^See the official run's \d+ trials in Runs$/ })).toHaveAttribute('href', /view=runs/);
});

// P25u J11, A13, V6c: the first screen leads with Browse the results and the headline result; the
// key form follows under its own heading, says where a key comes from and what a trial costs
// (from the official run's records), how to forget it, and what Remember in this tab keeps.
test('the key gate leads with Browse the results, then the key form with its hints', async ({ page }) => {
  await page.goto('./');
  const browseButton = page.getByRole('button', { name: GATE });
  await expect(browseButton).toBeVisible();
  await expect(page.getByTestId('gate-pass-line')).toHaveText(/^\d+ of \d+ trials pass; see why each failure happened\.$/);
  // Browse is the one filled primary; Validate is bordered under it.
  expect(await browseButton.evaluate((el) => el.className)).toContain('bg-primary');
  expect(await page.getByRole('button', { name: 'Validate' }).evaluate((el) => el.className)).not.toContain('bg-primary');
  expect(await browseButton.evaluate((el) => el.compareDocumentPosition(document.querySelector('h2')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.getByRole('heading', { level: 2, name: 'Run new trials (needs an API key)' })).toBeVisible();
  await expect(page.getByLabel('Add an API key', { exact: true })).toBeVisible();
  const hints = page.getByTestId('key-hints');
  await expect(hints).toContainText('through a relay that forwards it and keeps no copy');
  await expect(hints).toContainText(/Get a key at console\.anthropic\.com under API keys\. One trial costs about \$\d+\.\d{2} to \$\d+\.\d{2}\./);
  await expect(hints.getByRole('link', { name: 'console.anthropic.com' })).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys');
  await expect(hints).toContainText('Forget key in the top bar drops it at any time.');
  const remember = page.getByLabel('Remember in this tab');
  await expect(remember).toHaveAttribute('title', 'Keeps the key if you reload this tab; closing the tab forgets it.');
  const box = (await remember.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(16);
  expect(box.height).toBeGreaterThanOrEqual(16);
  await browseButton.click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
});

// P25u A14: with no key, Watch a recorded trial replays a published trial's events through the
// live card at a fixed pace, under a banner that says so; nothing is sent to the relay or the API.
test('with no key, Watch a recorded trial replays a published trial on the live card with no API call', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => (new URL(r.url()).origin === API_ORIGIN ? sent.push(r.url()) : undefined));
  await browse(page, './?view=live&task=contrast-ct-prep');
  await page.getByTestId('launcher-reason').getByRole('button', { name: 'Watch a recorded trial' }).click();
  await expect(trial(page)).toHaveAttribute('data-replay', 'true');
  await expect(trial(page).getByTestId('replay-banner')).toHaveText(/^Replay of final-1 trial 1 \(contrast-ct-prep\/0\); no API calls\. The steps play at a fixed pace, not the real one\.$/);
  await expect(trial(page).getByTestId('step').first()).toBeVisible({ timeout: 30_000 });
  await expect(trial(page).getByTestId('step').first()).toContainText('Step 1');
  await expect(trial(page)).toHaveAttribute('data-state', 'running');
  await expect(trial(page).getByRole('button', { name: 'Stop replay' })).toBeEnabled();
  await trial(page).getByRole('button', { name: 'Stop replay' }).click();
  await expect(trial(page)).toHaveAttribute('data-state', 'cancelled');
  await expect(trial(page).getByRole('status')).toHaveText('Replay stopped');
  await expect(trial(page).getByText('You stopped this trial')).toHaveCount(0);
  expect(sent).toEqual([]);
  await expect(page.getByTestId('live-row')).toHaveCount(0);
});

test('the trial Worker\'s guard refuses fetch and WebSocket to any origin but its own and the API, and XHR and EventSource to any', async ({ page }) => {
  // .invalid never resolves, so nothing leaves the machine; a fetch the guard let through gets this answer.
  const FOREIGN = 'https://foreign.invalid';
  let reached = 0;
  await page.route(`${FOREIGN}/**`, (route) => (reached++, route.fulfill({ status: 200, body: 'reached', headers: { 'access-control-allow-origin': '*' } })));
  const api = await mockToy(page, { hold: 2 });
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  const worker = page.waitForEvent('worker', isTrialWorker);
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
      selfXhr: await attempt(() => new XMLHttpRequest().open('GET', `${location.origin}/clinical-agent-env/data/fixtures/manifest.json`)),
      self: await attempt(() => fetch(`${location.origin}/clinical-agent-env/data/fixtures/manifest.json`)),
    };
  }, FOREIGN);
  for (const via of ['fetch', 'request', 'xhr', 'websocket', 'eventsource', 'selfXhr'] as const) expect(probe[via], via).toMatch(/egress guard/);
  expect(probe.self).toBe('answered 200');
  expect(reached).toBe(0);
});

// A real server on another origin (127.0.0.1, while the page is on localhost), so a request the
// browser let leave the Worker arrives and is counted; page.route does not see redirect hops.
async function foreignServer(): Promise<{ origin: string; hits: string[]; close: () => Promise<void> }> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' });
    res.end('export const reached = true;');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { origin: `http://127.0.0.1:${port}`, hits, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

test('the browser refuses every foreign hop from the trial Worker: a same-origin redirect, the prototype fetch, a raw fetch taken before the guard and a dynamic import', async ({ page }) => {
  const foreign = await foreignServer();
  try {
    await page.route('**/clinical-agent-env/redirect-out*', (route) => route.fulfill({ status: 302, headers: { location: `${foreign.origin}/after-redirect` } }));
    // Prepended to the trial bundle, so it runs before the Worker installs its guard: a raw fetch
    // that only code running first could hold. The guard cannot reach it; the CSP still binds it.
    await page.context().route(TRIAL_SCRIPT, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: `self.__rawFetch = typeof WorkerGlobalScope === 'function' ? WorkerGlobalScope.prototype.fetch : undefined;\n${await res.text()}` });
    });
    const api = await mockToy(page, { hold: 2 });
    await page.goto('./?view=live&task=_toy');
    await enterKey(page, sentinelKey());
    const worker = page.waitForEvent('worker', isTrialWorker);
    await run(page, 1);
    await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
    const probe = await (await worker).evaluate(async (origin) => {
      const violations: string[] = [];
      self.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.effectiveDirective} ${e.blockedURI}`));
      const attempt = async (f: () => Promise<unknown>) => {
        try {
          const r = await f();
          return r instanceof Response ? `answered ${r.status}` : 'loaded';
        } catch (e) {
          return `refused: ${(e as Error).message}`;
        }
      };
      const wgs = (globalThis as unknown as { WorkerGlobalScope: { prototype: { fetch: typeof fetch } } }).WorkerGlobalScope.prototype.fetch;
      const raw = (globalThis as unknown as { __rawFetch: typeof fetch }).__rawFetch;
      const result = {
        redirect: await attempt(() => fetch(`${location.origin}/clinical-agent-env/redirect-out`)),
        // The guard wraps WorkerGlobalScope.prototype.fetch too (review-security-P16h-web-1 S1).
        prototypeFetch: await attempt(() => wgs.call(globalThis, `${origin}/proto`)),
        // A raw fetch taken before the guard: the CSP refuses the send, and the redirect's hop.
        rawFetch: await attempt(() => raw.call(globalThis, `${origin}/raw`)),
        rawRedirect: await attempt(() => raw.call(globalThis, `${location.origin}/clinical-agent-env/redirect-out?raw`)),
        dynamicImport: await attempt(() => import(/* @vite-ignore */ `${origin}/mod.js`)),
      };
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { ...result, violations };
    }, foreign.origin);
    expect.soft(probe.redirect).toMatch(/^refused/);
    expect.soft(probe.prototypeFetch).toMatch(/^refused: .*egress guard/);
    expect.soft(probe.rawFetch).toMatch(/^refused/);
    expect.soft(probe.rawRedirect).toMatch(/^refused/);
    expect.soft(probe.dynamicImport).toMatch(/^refused/);
    expect.soft(foreign.hits).toEqual([]);
    // The browser refused them, by the page's CSP, which the Worker inherits: the guard cannot see these.
    expect.soft(probe.violations.some((v) => v.startsWith('connect-src') && v.includes('/raw'))).toBe(true);
    expect.soft(probe.violations.some((v) => v.startsWith('script-src') && v.includes('/mod.js'))).toBe(true);
    // The API host still answers the Worker: the held call goes through and the trial grades PASS.
    await api.release();
    await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
    await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  } finally {
    await foreign.close();
  }
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
  // The status line gives the chip's words, not a raw outcome code (#185 m2).
  await expect(trial(page).getByRole('status')).toHaveText('Finished: API problem, not counted');
});

test('each Run size shows its projected cost, and a size over the session cap is disabled with the reason', async ({ page }) => {
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  // A toy trial projects PER_TRIAL_CAP_USD plus its judge allowance (live/checks.ts): $6 + 4 calls x
  // JUDGE_CALL_PRICE_USD ($0.40192) = $7.60768.
  // P25u A7: the toy task has no pilot, so only what each batch holds shows (no typical cost).
  for (const [n, cost] of [[1, '$7.61'], [3, '$22.82'], [10, '$76.08'], [20, '$152.15']] as const) await expect(page.getByTestId(`run-cost-${n}`)).toHaveText(`holds up to ${cost}`);
  await expect(page.getByTestId('no-typical')).toContainText('no typical cost yet');
  await expect(page.getByRole('button', { name: 'Run ×1', exact: true })).toBeEnabled();
  for (const n of [3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeDisabled();
  // Validate settled $0.011 in the tab ledger: it counts against the cap with each size's
  // projection, so Run ×3 needs $22.834, the next whole dollar $23; the button raises to $25.
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×3 needs a cap of $23 or more; ×10 and ×20 need more still.');
  // P25u A6: the meter counts money held for running trials, so it says committed, with a title that says so.
  await expect(page.getByTestId('spend-meter')).toHaveText('Committed $0.01 of $20.00 cap');
  await expect(page.getByTitle('Session spend against the session cap, including the most a running trial can still cost')).toContainText('of $20.00');
  await expect(page.getByRole('progressbar', { name: 'Session spend committed against the cap' })).toBeVisible();
  await page.getByRole('button', { name: 'Raise cap to $25' }).click();
  await expect(page.getByRole('button', { name: 'Run ×3', exact: true })).toBeEnabled();
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×10 needs a cap of $77 or more; ×20 needs more still.');
  await expect(page.getByTestId('spend-meter')).toHaveText('Committed $0.01 of $25.00 cap');
  // The cap is set here too, not only in the key gate, and holds for this tab across a reload.
  await expect(page.getByTestId('cap-where')).toContainText('this tab only');
  await page.getByLabel('Session cap (USD)').fill('250');
  await page.getByRole('button', { name: 'Set cap' }).click();
  for (const n of [1, 3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeEnabled();
  await expect(page.getByTestId('size-reason')).toHaveCount(0);
  await expect(page.getByTitle('Session spend against the session cap, including the most a running trial can still cost')).toContainText('of $250.00');
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
  page.on('worker', (w) => (isTrialWorker(w) ? workers.push(w.url()) : undefined));
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey(), '5');
  // Under a $5.00 cap no size fits: every Run button is disabled, so nothing is fetched or started.
  for (const n of [1, 3, 10, 20]) await expect(page.getByRole('button', { name: `Run ×${n}`, exact: true })).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×1 needs a cap of $8 or more; ×3, ×10 and ×20 need more still.');
  expect(api.trialCalls()).toHaveLength(0);
  expect(workers).toHaveLength(0);
  // A size that fits the cap but not what is left of it once a batch runs: its $7.61 is
  // committed, so Run ×1 is disabled too, and nothing more is fetched or started.
  await page.getByLabel('Session cap (USD)').fill('15');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await run(page, 1);
  await expect.poll(() => api.held.length, { timeout: 30_000 }).toBe(1);
  const calls = api.trialCalls().length;
  await expect(page.getByRole('button', { name: 'Run ×1', exact: true })).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toContainText('needs a cap of');
  // P25u A6: while the trial runs its hold counts as committed, not as spent.
  await expect(page.getByTestId('spend-meter')).toHaveText(/^Committed \$7\.6\d of \$15\.00 cap$/);
  expect(api.trialCalls()).toHaveLength(calls);
  expect(workers).toHaveLength(1);
  await expect(page.getByTestId('live-run')).toHaveCount(1);
});

// verifier-phase-P15-2 F2: at a cap of $30.01, Run ×3 ($30.00) was enabled and then refused,
// because Validate had committed $0.011, and the refusal read "$30.01 > $30.01". With the toy's
// projection at $7.60768 (GRADER16-193 F2), the same boundary is a cap of $22.83 for Run ×3's $22.82304.
test('a size whose projection with the spend already committed crosses the cap is disabled, and its amounts read true', async ({ page }) => {
  await mockToy(page);
  await page.goto('./?view=live&task=_toy');
  await enterKey(page, sentinelKey());
  const x3 = page.getByRole('button', { name: 'Run ×3', exact: true });
  await page.getByLabel('Session cap (USD)').fill('22.83');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await expect(x3).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×3 needs a cap of $23 or more; ×10 and ×20 need more still.');
  await page.getByLabel('Session cap (USD)').fill('22.84');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await expect(x3).toBeEnabled();
  await x3.click();
  await expect(page.getByTestId('live-run')).toHaveCount(1);
  await expect(page.getByTestId('run-refusal')).toHaveCount(0);
});
