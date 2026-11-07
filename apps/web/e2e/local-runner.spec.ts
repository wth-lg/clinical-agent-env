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
import { expect, test, type Page, type Route } from '@playwright/test';
import { isApiHost } from '../../../packages/core/anthropic.ts';
import { parseEvent, type TrialEvent } from '../../../packages/core/events.ts';
import { explainContext } from '../../../packages/core/explain-context.ts';
import { explainTrial, NOT_AUDITED_MARKER, type ExplainRecord } from '../../../packages/core/explain.ts';
import { checkText as renalCheckText } from '../../../tasks/renal-dose-review.check-text.ts';
import { MAX_CONCURRENCY, parseSse, REFUSAL_TEXT, SAMPLES, SSE_END, TOKEN_HEADER, TOKEN_META } from '../../../packages/core/runner-api.ts';
import { SAMPLE, summary } from './fixtures/sample-results/sample.ts';
import { RUNNER_STOPPED, RUNNER_STOPPED_LEAD, RUNNER_STOPPED_NEXT, STOPPED_LABEL, STOPPED_REASON } from '../src/live/copy.ts';
import { LOCAL_START_COMMAND } from '../src/surface/command.ts';
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

// A runner a test killed by signal has exited too (signalCode set, exitCode null), so there is no
// exit event to wait for (P25u A2's test SIGKILLs its runner mid-trial).
const stopRunner = (r: Runner | undefined) => new Promise<void>((resolve) => {
  if (!r || r.proc.exitCode !== null || r.proc.signalCode !== null) return resolve();
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
  const field = page.getByLabel('Add an API key', { exact: true });
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

// verifier-phase-P17i-UI-5-1 m5: a runs list the runner fails to give shows the error notice with
// Retry, and Retry loads the list once the runner answers.
test('a failed runs request shows Your runs did not load with Retry, and Retry recovers', async ({ page }) => {
  let fail = true;
  let asked = 0;
  await page.route('**/api/runs', (route) => {
    asked++;
    return fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable', message: 'the runs list is not ready' }) }) : route.continue();
  });
  await open(page, runner!, '?view=live&task=_toy');
  const error = page.getByTestId('runs-error');
  await expect(error).toBeVisible();
  // P25u A2: on the local runner every page comes from the runner, so the notice does not claim the others work.
  await expect(error).toContainText('Your runs did not load.');
  await expect(error).not.toContainText('The other pages still work.');
  await expect(error).toHaveAttribute('role', 'alert');
  fail = false;
  const before = asked;
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(error).toHaveCount(0);
  expect(asked).toBeGreaterThan(before);
  await expect(page.getByTestId('no-live-runs')).toBeVisible();
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

// P25c (43-local-crc-after-reload): after a reload the meter read $0.00 while the launcher said
// "$5.71 already committed". Both now read the runner's session spend (GET api/spend, the figure
// the dry run's session_spent_usd carries), so the meter shows what the session has committed.
test('after a reload the spend meter shows the runner session\'s committed spend, the launcher\'s figure', async ({ page }) => {
  await open(page, runner!, '?view=live&task=_toy');
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  await page.reload();
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  const spend = (await (await api(page, runner!, 'api/spend')).json()) as { session_spent_usd: number };
  const dry = await fetch(new URL('api/trials?dry_run=1', runner!.url), { method: 'POST', headers: { [TOKEN_HEADER]: (await token(page))!, 'content-type': 'application/json' }, body: JSON.stringify({ ...SAMPLES.trialsRequest, tasks: ['_toy'] }) });
  const committed = ((await dry.json()) as { projection: { session_spent_usd: number } }).projection.session_spent_usd;
  expect(committed).toBeGreaterThan(0);
  expect(spend.session_spent_usd).toBeCloseTo(committed, 9);
  // P25u A6: the figure holds money reserved for running trials too, so the meter says committed.
  const text = `Committed $${committed.toFixed(2)} of $20.00 cap`;
  await expect(page.getByTestId('spend-meter')).toHaveText(text);
  // The same figure on a view that runs nothing: the source is read at load, not by the launcher (gate UIP25C-244 M2).
  await page.goto(new URL('?view=overview', runner!.url).href);
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  await expect(page.getByTestId('spend-meter')).toHaveText(text);
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
  await expect(page.getByTestId('run-cost-3')).toHaveText(`holds up to $${dry.projection.total_usd.toFixed(2)}`);
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
  // P25u A7: $10.000 + $0.011 committed needs $10.011, the next whole dollar $11.
  await expect(page.getByTestId('size-reason')).toHaveText('Run ×1 needs a cap of $11 or more; ×3, ×10 and ×20 need more still.');
  await expect(page.getByRole('button', { name: 'Raise cap to $15' })).toBeVisible();
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
  // P25u A4: the card's reason is the full explanation's, the one the session trial page gives
  // (with the task's check text), not the bare record's.
  const e = explainTrial(view.record, null, explainContext({ record: view.record, events: await streamEvents(page, runner!, id), text: renalCheckText }));
  expect(e.outcome).not.toBe('PASS');
  await expect(trial(page).getByTestId('reason')).toHaveText(e.reason);
  await expect(trial(page).getByRole('link', { name: 'See why it failed' })).toBeVisible();
  const row = page.locator(`[data-testid="live-row"][data-trial="${id}"]`);
  await expect(row).toHaveAttribute('data-outcome', e.outcome);
  await expect(row.getByTestId('outcome')).toHaveText(e.outcome);
  // P25u A15: one line per trial; the reason is on the card and the trial page, not repeated here.
  await expect(row.getByTestId('reason')).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'See why it failed' })).toBeVisible();
  if (e.decisive_check) await expect(row.getByTestId('decisive')).toHaveText(e.decisive_check.id);
  if (e.fault === 'infra') await expect(row.getByTestId('label')).toHaveAttribute('data-label', 'infra');
  else if (e.label !== null) await expect(row).toContainText(e.label);
  // The marker shows once on the row: FaultLabel's chip, or the row's own when FaultLabel has none (review-P15-1 F4).
  await expect(row.getByText(NOT_AUDITED_MARKER, { exact: true })).toHaveCount(1);
});

// Trace row N10 (builder-330): a live trial ends in its graded result. The card shows the rubric
// score under the Score card's own title, and the grade button (P25u A5: "See why it failed" on
// a non-pass, "See the grade" on a PASS) opens the trial page of run=session in the TrialPage
// layout: the header (outcome, decisive check, reason), the Grading tab (Score card, every gate
// check, the rubric rows), the Attribution tab with the not-audited marker, and the trajectory,
// all from the record the runner serves.
test('a graded live trial shows its rubric score on the card, and the grade button opens its session trial page with the Score card, gate checks and rubric rows', async ({ page }) => {
  await open(page, runner!, '?view=live&task=renal-dose-review', { cap: '950' });
  await run(page, 1);
  await expect(trial(page)).toHaveAttribute('data-state', 'graded', { timeout: 60_000 });
  const id = (await trial(page).getAttribute('data-trial'))!;
  const view = (await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { run_id: string; record: ExplainRecord & { score: number; checks: Array<{ id: string; kind: string; met: unknown }> } };
  const r = view.record;
  const events = await streamEvents(page, runner!, id);
  // The page explains the trial with the task's check text, as a published trial's detail does.
  const e = explainTrial(r, null, explainContext({ record: r, events, text: renalCheckText }));
  const score = `Rubric score (does not decide pass) ${r.score.toFixed(2)}`;
  // P25u A5: the card says the score is out of 1 and that the gate checks decide pass.
  await expect(trial(page).getByTestId('live-score')).toHaveText(`${score} of 1. Extra credit only; the pass or fail comes from the gate checks.`);
  // The Your runs row shows the same score beside its own link (gate N10-245 S1).
  const row = page.locator(`[data-testid="live-row"][data-trial="${id}"]`);
  await expect(row.getByTestId('live-score')).toHaveText(`${score} of 1`);
  const grade = e.outcome === 'PASS' ? 'See the grade' : 'See why it failed';
  await expect(row.getByRole('link', { name: grade })).toBeVisible();
  await trial(page).getByRole('link', { name: grade }).click();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page).toHaveURL(/run=session/);
  await expect(page).toHaveURL(new RegExp(`trial=${encodeURIComponent(id).replace(/[.]/g, '\\.')}`));
  const detail = page.getByTestId('trial-detail');
  await expect(detail).toHaveAttribute('data-trial', id);
  await expect(detail).toHaveAttribute('data-run', view.run_id);
  // The session notice is a banner above the page, not the page.
  await expect(page.getByTestId('session-banner')).toBeVisible();
  await expect(page.getByTestId('session-banner').getByRole('link', { name: 'Open Live trial' })).toBeVisible();
  // The header says why the trial ended as it did.
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('outcome')).toHaveText(e.outcome);
  await expect(header.getByTestId('reason')).toHaveText(e.reason);
  if (e.decisive_check) await expect(header.getByTestId('decisive-check')).toHaveAttribute('data-id', e.decisive_check.id);
  if (e.outcome !== 'PASS') await expect(header.getByText(NOT_AUDITED_MARKER, { exact: true })).toHaveCount(1);
  // Grading: the Score card, every gate check with its met state, the decisive one marked, and the rubric rows.
  const grading = page.getByTestId('panel-grading');
  await expect(grading.getByTestId('score-card')).toHaveText(score);
  const gates = r.checks.filter((c) => c.kind !== 'rubric');
  const rubric = r.checks.filter((c) => c.kind === 'rubric');
  expect(gates.length).toBeGreaterThan(0);
  expect(rubric.length).toBeGreaterThan(0);
  await expect(grading.getByTestId('gate-check')).toHaveCount(gates.length);
  for (const c of gates) await expect(grading.locator(`[data-testid="gate-check"][data-id="${c.id}"]`)).toHaveAttribute('data-met', String(c.met));
  if (e.decisive_check) await expect(grading.locator('[data-testid="gate-check"][data-decisive="true"]')).toHaveAttribute('data-id', e.decisive_check.id);
  await expect(grading.getByTestId('rubric-row')).toHaveCount(rubric.length);
  for (const c of rubric) await expect(grading.locator(`[data-testid="rubric-row"][data-id="${c.id}"]`)).toHaveAttribute('data-met', String(c.met));
  // Attribution: no audit row, so the trial is not human-audited. M3 is checked against the app's
  // manifest world, the one published trials are checked against (gate N10-245 M3): the mock
  // runner serves the build's own fixtures, so it is met.
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await expect(page.getByTestId('panel-attribution')).toContainText(NOT_AUDITED_MARKER);
  await expect(page.getByTestId('panel-attribution').locator('[data-testid="criterion-row"][data-id="M3"]')).toHaveAttribute('data-met', 'true');
  // The trajectory: one step per tool call that ran.
  const ran = events.filter((x) => x.type === 'tool_result' && x.executed).length;
  expect(ran).toBeGreaterThan(0);
  await expect(page.getByTestId('trajectory').getByTestId('step')).toHaveCount(ran);
  // Back returns to the Live trial view with the task.
  await page.getByRole('link', { name: 'Back to Live trial' }).click();
  await expect(page).toHaveURL(/view=live/);
  await expect(page).toHaveURL(/task=renal-dose-review/);
  await expect(page).not.toHaveURL(/run=session/);
});

// Gate N10-245 M2: the page shows the header and the grade from the record at once; the trajectory
// fills in when the event stream ends, and a stream that never ends hides nothing else.
test('a session trial page shows the header and the Score card from the record while its event stream has not ended', async ({ page }) => {
  await open(page, runner!, '?view=live&task=_toy', { cap: '950' });
  // A graded trial this page's tab never streamed (its IndexedDB holds no events for it), started
  // through the runner's API.
  const headers = { [TOKEN_HEADER]: (await token(page))!, 'content-type': 'application/json' };
  const accepted = (await (await fetch(new URL('api/trials', runner!.url), { method: 'POST', headers, body: JSON.stringify({ tasks: ['_toy'], trials: 1, concurrency: 1, effort: 'high', session_cap_usd: 950 }) })).json()) as { trial_ids: string[] };
  const id = accepted.trial_ids[0]!;
  await expect.poll(async () => ((await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { state: string }).state, { timeout: 60_000 }).toBe('graded');
  const view = (await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { record: { score: number; outcome: string } };
  // The stream is held: nothing arrives until `release`.
  let held: Route | null = null;
  await page.route('**/api/trials/*/events', (route) => void (held = route));
  await page.goto(new URL(`?view=runs&run=session&trial=${encodeURIComponent(id)}`, runner!.url).href);
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  const score = `Rubric score (does not decide pass) ${view.record.score.toFixed(2)}`;
  await expect(page.getByTestId('panel-grading').getByTestId('score-card')).toHaveText(score);
  await expect(page.getByTestId('trial-header').getByTestId('outcome')).toHaveText(view.record.outcome);
  await expect(page.getByTestId('trajectory')).toContainText('Loading the trajectory');
  await expect(page.getByTestId('trajectory').getByTestId('step')).toHaveCount(0);
  await expect.poll(() => held !== null).toBe(true);
  await held!.continue();
  await expect(page.getByTestId('trajectory').getByTestId('step')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByTestId('panel-grading').getByTestId('score-card')).toHaveText(score);
});

test('run=session resolves first-nonpass to the first non-pass trial of this session, and says why a trial the runner does not hold is not here', async ({ page }) => {
  // A non-pass renal-dose-review trial of this test's own, so the session holds one whatever ran before.
  await open(page, runner!, '?view=live&task=renal-dose-review', { cap: '950' });
  await run(page, 1);
  await expect(trial(page)).not.toHaveAttribute('data-state', 'running', { timeout: 60_000 });
  const { runs } = (await (await api(page, runner!, 'api/runs')).json()) as { runs: Array<{ trial_ids: string[] }> };
  let first: string | null = null;
  for (const r of runs) {
    for (const id of r.trial_ids) {
      const v = (await (await api(page, runner!, `api/trials/${encodeURIComponent(id)}`)).json()) as { record: ExplainRecord | null };
      if (v.record === null) continue;
      const e = explainTrial(v.record, null, { events: [] });
      if (e.valid && e.outcome !== 'PASS') {
        first = id;
        break;
      }
    }
    if (first !== null) break;
  }
  expect(first).not.toBeNull();
  await page.goto(new URL('?view=runs&run=session&trial=first-nonpass', runner!.url).href);
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', first!);
  await expect(page.getByText('first-nonpass')).toHaveCount(0);
  await page.goto(new URL('?view=runs&run=session&trial=nope.renal-dose-review.9', runner!.url).href);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trials from this session');
  await expect(page.getByTestId('session-missing')).toHaveText('No trial nope.renal-dose-review.9 in this session. The local runner keeps the trials it started only while it runs: after a restart they are gone, and another runner\'s trials are not here. Open Live trial');
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
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
  const field = page.getByLabel('Add an API key', { exact: true });
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
    // P25u A1b: the card and the row say the user stopped it, with the Stopped chip, never "API problem".
    await expect(trial(page).getByTestId('reason')).toHaveText(STOPPED_REASON);
    await expect(trial(page).getByTestId('label')).toHaveText(STOPPED_LABEL);
    await expect(trial(page)).not.toContainText('API problem');
    await expect(trial(page).getByRole('status')).toHaveText('Stopped');
    const row = page.locator(`[data-testid="live-row"][data-trial="${id}"]`);
    await expect(row).toHaveAttribute('data-outcome', 'CANCELLED');
    await expect(row.getByTestId('label')).toHaveText(STOPPED_LABEL);
    await expect(row).not.toContainText('API problem');
    const view = (await (await api(page, stall, `api/trials/${encodeURIComponent(id)}`)).json()) as { state: string; record: { outcome: string } };
    expect([view.state, view.record.outcome]).toEqual(['cancelled', 'CANCELLED']);
  } finally {
    await stopRunner(stall);
  }
});

// P25u A2: when the runner process dies mid-trial, the card stops spinning, Stop is disabled, and
// the card and Your runs say what happened and what to do; the page then probes api/health until
// the runner is back.
test('a runner killed mid-trial: the card says the runner stopped, Stop is disabled, and the page polls for the runner', async ({ page }) => {
  const stall = await startRunner({ CLINENV_RUNNER_TEST_TRANSPORT: 'stall' });
  try {
    await open(page, stall, '?view=live&task=_toy');
    await run(page, 1);
    await expect(trial(page).getByTestId('meter-turn')).toHaveText('1');
    let probes = 0;
    await page.route('**/api/health', (route) => (probes++, route.continue()));
    stall.proc.kill('SIGKILL');
    await expect(trial(page)).toHaveAttribute('data-state', 'runner-down', { timeout: 30_000 });
    await expect(trial(page).getByRole('button', { name: 'Stop' })).toBeDisabled();
    await expect(trial(page).getByTestId('running-line')).toHaveCount(0);
    await expect(trial(page).getByTestId('runner-stopped')).toContainText(RUNNER_STOPPED_LEAD);
    await expect(trial(page).getByTestId('runner-stopped')).toContainText(RUNNER_STOPPED_NEXT);
    await expect(trial(page).getByRole('status')).toHaveText('The local runner stopped');
    const error = page.getByTestId('runs-error');
    await expect(error).toContainText(RUNNER_STOPPED);
    await expect(error).not.toContainText('The other pages still work.');
    // The page keeps probing for the runner, as the runner-down screen does.
    const before = probes;
    await expect.poll(() => probes, { timeout: 15_000 }).toBeGreaterThan(before + 1);
  } finally {
    await stopRunner(stall);
  }
});

// P25u A12: a user whose runner just stopped already has the clone, so the restart leads with
// pnpm start alone; the clone command and the prerequisites table wait behind "On another computer".
test('the runner-down screen and the local key gate lead with pnpm start in the clone, not with git clone', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto(new URL('?view=overview', runner!.url).href);
  const down = page.getByRole('heading', { name: 'Local runner not responding' });
  await expect(down).toBeVisible();
  const screen = page.locator('section', { has: down });
  await expect(screen).toContainText(RUNNER_STOPPED);
  await expect(screen.getByTestId('restart-command')).toHaveText('pnpm start');
  await expect(screen.getByRole('button', { name: 'Copy command' })).toBeVisible();
  await expect(screen.getByTestId('local-command')).not.toBeVisible();
  await screen.getByText('On another computer').click();
  await expect(screen.getByTestId('local-command')).toHaveText(LOCAL_START_COMMAND);
  await page.unroute('**/api/health');
  await page.goto(new URL('?view=overview', runner!.url).href);
  await expect(page.getByTestId('surface-chip')).toContainText('Local runner', { timeout: 30_000 });
  const field = page.getByLabel('Add an API key', { exact: true });
  await expect(field.or(page.getByTestId('key-chip')).first()).toBeVisible();
  if (!(await field.isVisible())) await page.getByRole('button', { name: 'Forget key' }).click();
  const panel = page.getByTestId('local-run-panel');
  await expect(panel).toContainText('In your clinical-agent-env folder, run');
  await expect(panel.getByTestId('restart-command')).toHaveText('pnpm start');
  // The prerequisites sentence stays on the gate (trace U12); the clone command waits behind the disclosure.
  await expect(panel.getByTestId('local-prerequisites')).toBeVisible();
  await expect(panel.getByTestId('local-command')).not.toBeVisible();
});
