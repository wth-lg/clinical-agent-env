// The live trial on the local-runner surface (plan phase P15), against the real runner: each
// runner is `node apps/runner/main.ts --mock --port 0` serving a fresh build of the UI (with the
// committed sample run, RESULTS_ROOT=e2e/fixtures/sample-results), with CLINENV_CANONICAL_LEDGER
// and ANTHROPIC_API_KEY removed and HOME, SPEND_LEDGER and CLINENV_RUNS_DIR under a fresh temp dir.
// The page is opened at the URL the runner prints. --mock answers every call from the toy
// scenario; the Stop test's runner holds every trial call until it is aborted (the runner's
// CLINENV_RUNNER_TEST_TRANSPORT=stall hook). Nothing reaches the API.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { isApiHost } from '../../../packages/core/anthropic.ts';
import { parseEvent, type TrialEvent } from '../../../packages/core/events.ts';
import { explainTrial, NOT_AUDITED_MARKER, type ExplainRecord } from '../../../packages/core/explain.ts';
import { MAX_CONCURRENCY, parseSse, REFUSAL_TEXT, SAMPLES, SSE_END, TOKEN_HEADER, TOKEN_META } from '../../../packages/core/runner-api.ts';
import { SAMPLE, summary } from './fixtures/sample-results/sample.ts';
import { RELAY_ORIGIN } from '../src/surface/relay.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const WEB = join(REPO, 'apps/web');
// The hosted Messages calls go to the relay (P16h), the one origin besides its own the page may
// connect to (lint: no-direct-anthropic).
const API_ORIGIN = RELAY_ORIGIN;
const sentinelKey = () => ['sk', 'ant', 'api03', randomUUID().replaceAll('-', ''), 'e2e'].join('-');

interface Runner { url: string; proc: ChildProcess; tmp: string }

// A fresh build of the UI, once per worker process.
let dist: string | undefined;
function freshBuild(): string {
  if (dist !== undefined) return dist;
  const out = mkdtempSync(join(tmpdir(), 'clinenv-runner-build-'));
  const b = spawnSync(join(WEB, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: WEB, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: SAMPLE } });
  if (b.status !== 0) throw new Error(`build failed: ${b.stdout}${b.stderr}`);
  return (dist = out);
}

// The env a spec's runner gets: no canonical ledger marker, no key, a fresh HOME, ledger and runs dir.
function cleanEnv(tmp: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(CLINENV_|ANTHROPIC_API_KEY$|SPEND_LEDGER$)/.test(k)) env[k] = v;
  return { ...env, HOME: tmp, SPEND_LEDGER: join(tmp, 'spend.jsonl'), CLINENV_RUNS_DIR: join(tmp, 'runs'), ...extra };
}

async function startRunner(extra: Record<string, string> = {}): Promise<Runner> {
  const tmp = mkdtempSync(join(tmpdir(), 'clinenv-runner-'));
  const env = cleanEnv(tmp, { NODE_ENV: 'test', CLINENV_TEST_HOOKS: '1', CLINENV_WEB_DIST: freshBuild(), ...extra });
  const proc = spawn('node', ['apps/runner/main.ts', '--mock', '--port', '0'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise<string>((resolve, reject) => {
    let out = '';
    proc.stdout!.on('data', (c: Buffer) => {
      out += c.toString();
      const m = /clinenv local runner: (http\S+)/.exec(out);
      if (m) resolve(m[1]!);
    });
    proc.stderr!.on('data', (c: Buffer) => (out += c.toString()));
    proc.on('exit', (code) => reject(new Error(`runner exited ${code}: ${out}`)));
  });
  return { url, proc, tmp };
}

const stopRunner = (r: Runner | undefined) => new Promise<void>((resolve) => {
  if (!r || r.proc.exitCode !== null) return resolve();
  r.proc.once('exit', () => resolve());
  r.proc.kill('SIGTERM');
});

const token = (page: Page) => page.locator(`meta[name="${TOKEN_META}"]`).getAttribute('content');

async function api(page: Page, runner: Runner, path: string): Promise<Response> {
  return fetch(new URL(path, runner.url), { headers: { [TOKEN_HEADER]: (await token(page))! } });
}

// Every frame of a trial's stream, read in Node.
async function streamEvents(page: Page, runner: Runner, trialId: string): Promise<TrialEvent[]> {
  const { frames } = parseSse(await (await api(page, runner, `api/trials/${encodeURIComponent(trialId)}/events`)).text());
  return frames.filter((f) => f.event !== SSE_END).map((f) => parseEvent(JSON.parse(f.data)));
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

// Opens the runner's page, validates a sentinel key with it and records what the page sends:
// every request URL, and each CSP violation and console line about one.
async function open(page: Page, runner: Runner, path: string, opts: { key?: string; cap?: string } = {}) {
  const requests: string[] = [];
  const csp: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => (/Content Security Policy/i.test(m.text()) ? csp.push(m.text()) : undefined));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective}`)));
  await page.goto(new URL(path, runner.url).href);
  // A health probe that misses its timeout under load shows the runner-down screen, which retries
  // and reloads: wait for the chip, not a fixed 5 s for the key field.
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  // The runner keeps a key an earlier test validated: forget it, so this test's key is the one held.
  const field = page.getByLabel('API key', { exact: true });
  await expect(field.or(page.getByTestId('key-chip')).first()).toBeVisible();
  if (!(await field.isVisible())) await page.getByRole('button', { name: 'Forget key' }).click();
  await field.fill(opts.key ?? sentinelKey());
  if (opts.cap !== undefined) await page.getByLabel('Session spend cap (USD)').fill(opts.cap);
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByTestId('key-chip')).toBeVisible();
  return { requests, csp };
}

const trial = (page: Page) => page.getByTestId('live-trial');
const run = (page: Page, n: number) => page.getByRole('button', { name: `Run ×${n}`, exact: true }).click();

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let runner: Runner | undefined;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  runner = await startRunner();
});
test.afterAll(() => stopRunner(runner));

test('the chip shows the local runner and the browse views render the sample run', async ({ page }) => {
  await open(page, runner!, '?view=runs');
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner');
  await expect(page.locator(`[data-testid="run"][data-run="${summary.run_id}"]`)).toBeVisible();
  await expect(page.getByTestId('trial-row').first()).toBeVisible();
});

// verifier-phase-P15-1 G1: under load the first health probe can miss HEALTH_TIMEOUT_MS; the
// runner-down screen retries every RETRY_MS, and open() waits for the chip rather than the key field.
test('open() waits out health probes that time out until the runner-down screen recovers', async ({ page }) => {
  let slow = 2;
  await page.route('**/api/health', (route) => (slow-- > 0 ? undefined : route.continue()));
  await open(page, runner!, '?view=live&task=_toy');
  expect(slow).toBeLessThan(0);
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner');
});

test('a trial streams over SSE and grades, with no request to the API and no CSP violation', async ({ page }) => {
  const seen = await open(page, runner!, '?view=live&task=_toy');
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await expect(trial(page).getByTestId('outcome')).toHaveText('PASS');
  await expect(trial(page).getByTestId('tool-row')).toHaveCount(4);
  const id = (await trial(page).getAttribute('data-trial'))!;
  const view = (await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { record: { state_hash: { final: string } } };
  await expect(trial(page).getByTestId('final-hash')).toHaveText(view.record.state_hash.final);
  // Neither the relay nor the API host: on the local runner the trial runs in Node.
  expect(seen.requests.filter((u) => new URL(u).origin === API_ORIGIN || isApiHost(new URL(u).hostname))).toEqual([]);
  expect(seen.requests.some((u) => u.includes(`/api/trials/${encodeURIComponent(id)}/events`))).toBe(true);
  expect(seen.csp).toEqual([]);
});

test('a reload mid-trial reconnects with Last-Event-ID and reaches the same final hash; no storage holds the key', async ({ page }) => {
  const key = sentinelKey();
  const CUT = 6;
  let phase: 'first' | 'held' | 'reloaded' = 'first';
  const lastIds: Array<string | null> = [];
  await page.route('**/api/trials/*/events', async (route) => {
    if (phase === 'reloaded') {
      lastIds.push(route.request().headers()['last-event-id'] ?? null);
      return route.continue();
    }
    if (phase === 'held') return; // the page's own reconnect before the reload: left unanswered
    phase = 'held';
    // The stream drops after CUT events: what the page has when the reload comes.
    const res = await route.fetch();
    const { frames } = parseSse(await res.text());
    const body = frames.slice(0, CUT).map((f) => `id: ${f.id}\nevent: ${f.event}\ndata: ${f.data}\n\n`).join('');
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body });
  });
  await open(page, runner!, '?view=live&task=_toy', { key });
  await run(page, 1);
  await expect(trial(page).getByTestId('meter-turn')).toHaveText('1');
  const id = (await trial(page).getAttribute('data-trial'))!;
  await expect(trial(page)).toHaveAttribute('data-state', 'running');
  phase = 'reloaded';
  await page.reload();
  await expect(trial(page)).toHaveAttribute('data-trial', id);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  expect(lastIds[0]).toBe(String(CUT - 1));
  const full = await streamEvents(page, runner!, id);
  const final = full.find((e) => e.type === 'state_hash' && e.at === 'final');
  await expect(trial(page).getByTestId('final-hash')).toHaveText(final?.type === 'state_hash' ? final.hash : 'missing');
  expect(await storageDump(page)).not.toContain(key);
});

test('Run ×3 starts one batch of 3 trials and Run ×20 one batch of 20', async ({ page }) => {
  await open(page, runner!, '?view=live&task=_toy', { cap: '500' });
  const posts: Array<{ trials: number; tasks: string[] }> = [];
  page.on('request', (r) => (r.method() === 'POST' && /\/api\/trials$/.test(new URL(r.url()).pathname) && new URL(r.url()).search === '' ? posts.push(r.postDataJSON()) : undefined));
  // Each size shows the runner's own projection for it (POST api/trials?dry_run=1).
  const dry = (await (await fetch(new URL('api/trials?dry_run=1', runner!.url), {
    method: 'POST', headers: { [TOKEN_HEADER]: (await token(page))!, 'content-type': 'application/json' },
    body: JSON.stringify({ tasks: ['_toy'], trials: 3, concurrency: Math.min(3, MAX_CONCURRENCY), effort: 'high', session_cap_usd: 500 }),
  })).json()) as { projection: { total_usd: number } };
  await expect(page.getByTestId('run-cost-3')).toHaveText(`at most $${dry.projection.total_usd.toFixed(2)}`);
  await run(page, 3);
  await expect(page.locator('[data-testid="live-run"][data-trials="3"]')).toBeVisible();
  await run(page, 20);
  await expect(page.locator('[data-testid="live-run"][data-trials="20"]')).toBeVisible({ timeout: 30_000 });
  expect(posts.map((p) => [p.tasks, p.trials])).toEqual([[['_toy'], 3], [['_toy'], 20]]);
  const { runs } = (await (await api(page, runner!, 'api/runs')).json()) as { runs: Array<{ trial_ids: string[] }> };
  expect(runs.slice(-2).map((r) => r.trial_ids.length)).toEqual([3, 20]);
});

// verifier-phase-P15-2 F2 on the local runner: the dry run's session_spent_usd (what the runner
// session has spent or holds open) counts with each size's projection. The dry run is answered
// here, so the amounts are fixed while the runner's own batches from earlier tests still settle.
test('a size whose cost with the runner session\'s committed spend crosses the cap is disabled, with amounts that read true', async ({ page }) => {
  await page.route('**/api/trials?dry_run=1', (route) => {
    const { trials } = route.request().postDataJSON() as { trials: number };
    const projection = { ...SAMPLES.dryRun.projection, total_usd: 10 * trials, session_spent_usd: 0.011 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...SAMPLES.dryRun, projection }) });
  });
  await open(page, runner!, '?view=live&task=_toy');
  const x1 = page.getByRole('button', { name: 'Run ×1', exact: true });
  await page.getByLabel('Session cap (USD)').fill('10.01');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await expect(x1).toBeDisabled();
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×1, ×3, ×10 and ×20 need more than your session cap of $10.010 (Run ×1: $10.000 + $0.011 already committed = $10.011). Raise the cap below to run them.');
  await page.getByLabel('Session cap (USD)').fill('10.02');
  await page.getByRole('button', { name: 'Set cap' }).click();
  await expect(x1).toBeEnabled();
});

test('a runner 409 spend_refused_ceiling shows the REFUSAL_TEXT string and the runner message', async ({ page }) => {
  const message = 'ceiling: session cap $5.00 would be crossed by this batch';
  await page.route('**/api/trials', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { type: 'spend_refused_ceiling', message }, projection: SAMPLES.dryRun.projection }) })
    : route.continue());
  await open(page, runner!, '?view=live&task=_toy');
  await run(page, 1);
  const refusal = page.getByTestId('run-refusal');
  await expect(refusal.locator('p').first()).toHaveText(REFUSAL_TEXT.trials.spend_refused_ceiling);
  await expect(refusal.getByTestId('error-detail')).toHaveText(message);
});

test('a non-pass live trial shows in its Runs row the outcome, label, decisive check and reason of explainTrial', async ({ page }) => {
  await open(page, runner!, '?view=live&task=renal-dose-review', { cap: '950' });
  await run(page, 1);
  await expect(trial(page)).not.toHaveAttribute('data-state', 'running', { timeout: 60_000 });
  const id = (await trial(page).getAttribute('data-trial'))!;
  const view = (await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { record: ExplainRecord };
  const e = explainTrial(view.record, null, { events: await streamEvents(page, runner!, id) });
  expect(e.outcome).not.toBe('PASS');
  const row = page.locator(`[data-testid="live-row"][data-trial="${id}"]`);
  await expect(row).toHaveAttribute('data-outcome', e.outcome);
  await expect(row.getByTestId('outcome')).toHaveText(e.outcome);
  await expect(row.getByTestId('reason')).toHaveText(e.reason);
  if (e.decisive_check) await expect(row.getByTestId('decisive')).toHaveText(e.decisive_check.id);
  if (e.fault === 'infra') await expect(row.getByTestId('label')).toHaveAttribute('data-label', 'infra');
  else if (e.label !== null) await expect(row).toContainText(e.label);
  // The marker shows once on the row: FaultLabel's chip, or the row's own when FaultLabel has none (review-P15-1 F4).
  await expect(row.getByText(NOT_AUDITED_MARKER, { exact: true })).toHaveCount(1);
});

// verifier-phase-P15-1, folded follow-up: no repo test covered the Forget-failure notice.
test('a Forget the runner refuses shows its own red notice with the runner message as detail; the key field is not invalid', async ({ page }) => {
  await open(page, runner!, '?view=runs');
  const message = 'the runner could not drop the key';
  await page.route('**/api/key', (route) => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { type: 'internal', message } }) })
    : route.continue());
  await page.getByRole('button', { name: 'Forget key' }).click();
  const notice = page.getByTestId('forget-notice');
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice.locator('p').first()).toHaveText('The local runner did not forget the key.');
  await expect(notice.locator('p').nth(1)).toContainText(message);
  const field = page.getByLabel('API key', { exact: true });
  await expect(field).toBeVisible();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});

test('Stop records CANCELLED', async ({ page }) => {
  const stall = await startRunner({ CLINENV_RUNNER_TEST_TRANSPORT: 'stall' });
  try {
    await open(page, stall, '?view=live&task=_toy');
    await run(page, 1);
    await expect(trial(page).getByTestId('meter-turn')).toHaveText('1');
    const id = (await trial(page).getAttribute('data-trial'))!;
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(trial(page)).toHaveAttribute('data-state', 'cancelled', { timeout: 30_000 });
    await expect(trial(page).getByTestId('outcome')).toHaveText('CANCELLED');
    await expect(page.locator(`[data-testid="live-row"][data-trial="${id}"]`)).toHaveAttribute('data-outcome', 'CANCELLED');
    const view = (await (await api(page, stall, `api/trials/${encodeURIComponent(id)}`)).json()) as { state: string; record: { outcome: string } };
    expect([view.state, view.record.outcome]).toEqual(['cancelled', 'CANCELLED']);
  } finally {
    await stopRunner(stall);
  }
});
