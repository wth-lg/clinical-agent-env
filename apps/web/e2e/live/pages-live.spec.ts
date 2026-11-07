// The hosted site, live, through the relay (plan phase P25; relay surface, P16h VERIFIED, so the
// P16f branch, a paired local runner, is not taken): the real Pages URL in Chromium with the real
// key typed into the key gate. Validate and one renal-dose-review trial go from the page and its
// trial Worker to RELAY_URL only; the tab's own ledger meters them in sessionStorage and cannot
// write the canonical ledger, so the Node side reserves each call at its worst case with
// `pnpm cli hosted-call reserve` before the browser opens the page and settles each at the usage
// the tab ledger recorded with `pnpm cli hosted-call settle` after (a failed run settles at the
// worst case, so no reservation stays open). The browser's requests go only to the Pages origin
// and the relay host, no storage holds the key, and the grade comes back with every check. Every
// header set recorded of the relay traffic passes through redactHeaders(): each POST shows its key
// header as the marker, and each response allows the Pages origin.
//   LIVE_DRY_RUN=1  prints the two worst cases, Validate (the key gate's own estimate) and the
//                   trial (the page's projection for Run ×1), as LIVE_PROJECTION_USD (X2 for
//                   `pnpm cli spend --check`), and stops: no browser, no reservation, no call.
// Run only in the live-run form (the plan's header): the own-run marker set, the key loaded
// from the secrets file, never echoed. Trace, video and screenshots are off in the live project.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { isApiHost, MODEL } from '../../../../packages/core/anthropic.ts';
import { PER_TRIAL_CAP_USD } from '../../../../packages/core/cost.ts';
import type { LedgerRow } from '../../../../packages/core/ledger.ts';
import { REDACTED, redactHeaders, redactText } from '../../../../packages/core/redact.ts';
import type { TrialRecord } from '../../../../packages/core/run.ts';
import { judgeAllowanceUsd } from '../../../../packages/grader/judge.ts';
import { checks as taskChecks } from '../../../../tasks/renal-dose-review/tests/grader.ts';
import { LEDGER_KEY } from '../../src/adapters/ledger-browser.ts';
import { validateEstimate } from '../../src/keygate/direct.ts';
import { amountText } from '../../src/live/typical.ts';
import { SURFACE_LABEL } from '../../src/surface/detect.ts';
import { RELAY_ORIGIN } from '../../src/surface/relay.ts';

const KEY = process.env.ANTHROPIC_API_KEY ?? '';
const DRY_RUN = process.env.LIVE_DRY_RUN === '1';
const PAGES_URL = process.env.PAGES_URL ?? 'https://wth-lg.github.io/clinical-agent-env/';
const TASK = 'renal-dose-review';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const TRIAL_MS = 35 * 60_000;

// Every live spec starts with this skip: without a key the live project lists the spec and
// reports it skipped instead of failing. A dry run needs no key.
test.skip(!KEY && !DRY_RUN, 'ANTHROPIC_API_KEY is not set');

const secrets = KEY === '' ? [] : [KEY];
const say = (line: string) => console.log(redactText(line, secrets));

// The page's projection for Run ×1 of the task (apps/web/src/live/checks.ts trialProjection, which
// Node cannot load for its import.meta.glob): the per-trial cap plus the task's judge allowance.
const trialProjection = PER_TRIAL_CAP_USD + judgeAllowanceUsd(taskChecks);

// `pnpm cli hosted-call <verb> --call-id <id> [--usd <x>]` from the repository root, the key
// kept out of its environment (it meters, it never calls). Returns the exit code; prints the output.
function hostedCall(verb: 'reserve' | 'settle', id: string, usd?: number): number {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ANTHROPIC_API_KEY') env[k] = v;
  const args = ['cli', 'hosted-call', verb, '--call-id', id, ...(usd === undefined ? [] : ['--usd', usd.toFixed(6)])];
  const r = spawnSync('pnpm', args, { cwd: REPO, env, encoding: 'utf8' });
  say(`hosted-call ${verb} ${id}${usd === undefined ? '' : ` --usd ${usd.toFixed(6)}`}: exit ${r.status}; ${(r.stdout + r.stderr).trim()}`);
  return r.status ?? 1;
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

// The tab ledger's rows (sessionStorage, apps/web/src/adapters/ledger-browser.ts).
const tabRows = (page: Page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '[]') as LedgerRow[], LEDGER_KEY);
const micro = (usd: number) => Math.round(usd * 1e6);
const settledUsd = (rows: LedgerRow[], trial: string) => rows.filter((r) => r.kind === 'settle' && r.trial === trial).reduce((s, r) => s + micro(r.cost_usd), 0) / 1e6;

test.describe.configure({ mode: 'serial' });

test('on the hosted site the key validates and one renal-dose-review trial runs through the relay, reserved and settled in the canonical ledger from Node', async ({ page }) => {
  test.setTimeout(TRIAL_MS + 10 * 60_000);
  const validateWorst = validateEstimate();
  say(`pages-live dry run: Validate worst case $${validateWorst.toFixed(6)} + Run ×1 projection $${trialProjection.toFixed(6)} (${amountText(trialProjection, true)}), 0 calls`);
  say(`LIVE_PROJECTION_USD=${(validateWorst + trialProjection).toFixed(6)}`);
  if (DRY_RUN) return;
  expect(process.env.CLINENV_CANONICAL_LEDGER, 'the live-run form sets CLINENV_CANONICAL_LEDGER').toBeTruthy();

  // Reserve both calls at their worst case before the browser opens the page.
  const stamp = String(Date.now());
  const ids = { validate: `p25-validate-${stamp}`, trial: `p25-trial-${stamp}` };
  const settled = { validate: false, trial: false };
  expect(hostedCall('reserve', ids.validate, validateWorst)).toBe(0);
  expect(hostedCall('reserve', ids.trial, trialProjection)).toBe(0);
  const settle = (which: keyof typeof ids, usd: number | undefined) => {
    if (settled[which]) return 0;
    settled[which] = true;
    return hostedCall('settle', ids[which], usd !== undefined && usd > 0 ? usd : undefined);
  };

  try {
    const requests: string[] = [];
    const csp: string[] = [];
    // Every header set of the relay traffic (verifier-phase-P25-1 N2): the request's and the
    // response's, each kept raw for the key check below (verifier-phase-P25-2: a check on the
    // redacted set could never fail) and recorded through redactHeaders() for anything printed.
    type HeaderSet = { kind: 'request' | 'response'; method: string; status: number | null; raw: Record<string, string>; headers: Record<string, string> };
    const headerSets: Array<Promise<HeaderSet>> = [];
    page.context().on('request', (r) => {
      requests.push(r.url());
      if (new URL(r.url()).origin === RELAY_ORIGIN) headerSets.push(r.allHeaders().then((h) => ({ kind: 'request', method: r.method(), status: null, raw: h, headers: redactHeaders(h, secrets) })));
    });
    page.context().on('response', (r) => {
      if (new URL(r.url()).origin === RELAY_ORIGIN) headerSets.push(r.allHeaders().then((h) => ({ kind: 'response', method: r.request().method(), status: r.status(), raw: h, headers: redactHeaders(h, secrets) })));
    });
    page.on('console', (m) => (/Content Security Policy/i.test(m.text()) ? csp.push(m.text()) : undefined));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`)));

    await page.goto(new URL(`?view=live&task=${TASK}`, PAGES_URL).href);
    await page.getByLabel('Add an API key', { exact: true }).fill(KEY);
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByTestId('key-chip')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('surface-chip')).toHaveText(SURFACE_LABEL['browser-direct']);
    const validateUsd = settledUsd(await tabRows(page), 'validate');
    say(`pages-live: Validate settled in the tab ledger at $${validateUsd.toFixed(6)}`);
    expect(validateUsd).toBeGreaterThan(0);
    expect(settle('validate', validateUsd)).toBe(0);

    // Run ×1 at the page's own projection.
    await expect(page.getByTestId('run-cost-1')).toHaveText(amountText(trialProjection, true));
    await page.getByRole('button', { name: 'Run ×1', exact: true }).click();
    const trial = page.getByTestId('live-trial');
    await expect(trial).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    const id = (await trial.getAttribute('data-trial'))!;
    say(`pages-live: trial ${id} running`);
    await expect(trial.getByTestId('tool-row').first()).toBeVisible({ timeout: 5 * 60_000 });
    await expect(trial).not.toHaveAttribute('data-state', 'running', { timeout: TRIAL_MS });
    await expect(trial).toHaveAttribute('data-state', 'graded');

    const r = (await storedRecord(page, id)) as TrialRecord | null;
    expect(r).not.toBeNull();
    say(`pages-live: ${id} outcome ${r!.outcome} status ${r!.status} fault ${r!.fault} score ${r!.score} turns ${r!.turns} cost $${r!.cost_usd.toFixed(4)} judge $${r!.judge_cost_usd.toFixed(4)} models ${JSON.stringify(r!.models_returned)}`);
    expect(r!.models_returned).toEqual([MODEL]);
    expect(r!.state_hash.final).not.toBeNull();
    await expect(trial.getByTestId('final-hash')).toHaveText(r!.state_hash.final!);
    await expect(trial.getByTestId('outcome')).toHaveText(r!.outcome);
    await expect(page.locator(`[data-testid="live-row"][data-trial="${id}"]`)).toHaveAttribute('data-outcome', r!.outcome);
    // The rubric breakdown: every check of the task graded, with its met flag, in the record the UI reads.
    expect(r!.checks.length).toBeGreaterThan(0);
    say(`pages-live: checks ${r!.checks.map((c) => `${c.id}=${String(c.met)}`).join(' ')}`);

    // What the tab ledger settled for the trial: its Messages and judge calls, one settle each.
    const rows = await tabRows(page);
    const trialSettles = rows.filter((x) => x.kind === 'settle' && x.trial === id);
    const calls = r!.turns + r!.api_retries + r!.judge.calls;
    expect(trialSettles.length, 'one settle per call').toBe(calls);
    const trialUsd = settledUsd(rows, id);
    expect(micro(trialUsd)).toBe(micro(r!.cost_usd) + micro(r!.judge_cost_usd));
    say(`pages-live: ${calls} calls settled in the tab ledger at $${trialUsd.toFixed(6)} = record cost + judge cost`);
    expect(settle('trial', trialUsd)).toBe(0);

    // The browser reached only the Pages origin and the relay; nothing holds the key.
    const origins = new Set(requests.map((u) => new URL(u).origin));
    say(`pages-live: ${requests.length} requests to ${[...origins].join(', ')}`);
    expect([...origins].filter((o) => o !== new URL(PAGES_URL).origin && o !== RELAY_ORIGIN)).toEqual([]);
    expect(requests.filter((u) => isApiHost(new URL(u).hostname))).toEqual([]);
    expect(requests.some((u) => new URL(u).origin === RELAY_ORIGIN)).toBe(true);
    expect(csp).toEqual([]);
    expect(await storageDump(page)).not.toContain(KEY);
    // The relay header sets, raw: every POST carried the key in x-api-key and nowhere else, and no
    // response header holds it. Recorded: x-api-key is the marker on each POST, no recorded set
    // holds the key, and every relay response allows the Pages origin.
    const sets = await Promise.all(headerSets);
    const posts = sets.filter((s) => s.kind === 'request' && s.method === 'POST');
    say(`pages-live: ${sets.length} relay header sets recorded (${posts.length} POST requests), all through redactHeaders()`);
    expect(posts.length).toBeGreaterThanOrEqual(calls + 1);
    const holdsKey = (h: Record<string, string>, except?: string) => Object.entries(h).filter(([n, v]) => n.toLowerCase() !== except && v.includes(KEY)).map(([n]) => n);
    for (const s of posts) {
      expect(s.raw['x-api-key'] === KEY, 'the POST carried the key in x-api-key').toBe(true);
      expect(holdsKey(s.raw, 'x-api-key'), 'raw request headers besides x-api-key holding the key').toEqual([]);
      expect(s.headers['x-api-key'], 'x-api-key recorded as redacted').toBe(REDACTED);
    }
    for (const s of sets.filter((s) => s.kind !== 'request' || s.method !== 'POST')) expect(holdsKey(s.raw), `raw ${s.kind} ${s.method} ${s.status ?? ''} headers holding the key`).toEqual([]);
    expect(sets.filter((s) => JSON.stringify(s.headers).includes(KEY))).toEqual([]);
    for (const s of sets.filter((s) => s.kind === 'response')) expect(s.headers['access-control-allow-origin'], `response ${s.method} ${s.status}`).toBe(new URL(PAGES_URL).origin);
  } finally {
    // A run that stopped early settles what it reserved at the worst case: nothing stays open.
    for (const which of ['validate', 'trial'] as const) if (!settled[which]) say(`pages-live: settling ${ids[which]} at its worst case (cleanup): exit ${settle(which, undefined)}`);
  }
});
