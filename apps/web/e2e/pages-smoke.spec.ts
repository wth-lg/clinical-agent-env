// The deployed hosted site, offline (plan phase P25): PAGES_URL names the GitHub Pages site
// (https://wth-lg.github.io/clinical-agent-env/); unset, as in CI, every test here skips. No key
// is typed and no Messages call is made: the spec browses with "Browse without a key". It pins
// what done-when (1) promises an interviewer with only a browser: the surface chip reads Hosted,
// the key gate renders with the local-run panel (prerequisites, both install links and
// LOCAL_START_COMMAND) before any key, the served CSP meta equals APP_CSP, the Overview shows the
// final run's 120 swatches (20 per task), T1's reference solution grades PASS 1.0 in the tab, a
// published trial opens on its Grading tab with the rubric breakdown, Findings shows one interval
// per task from final-1, and no asset the page fetched holds a key-shaped string.
import { expect, test, type Page, type Response } from '@playwright/test';
import { FINAL_TRIALS_PER_TASK } from '../../../packages/core/cost.ts';
import { APP_CSP } from '../csp.ts';
import { passGate } from './browse.ts';
import { LOCAL_PREREQUISITES, LOCAL_START_COMMAND, NODE_INSTALL_URL, PNPM_INSTALL_URL } from '../src/surface/command.ts';
import { SURFACE_LABEL } from '../src/surface/detect.ts';

const PAGES_URL = process.env.PAGES_URL;
test.skip(PAGES_URL === undefined, 'set PAGES_URL to the hosted site, e.g. https://wth-lg.github.io/clinical-agent-env/');

// The final run (plan P21-P24): six tasks at FINAL_TRIALS_PER_TASK trials each, published as
// results/official.json -> runs/final-1. The counts are the P25 gate's, not read from the site.
const FINAL_RUN = 'runs/final-1';
const TASKS = 6;
const SWATCHES = TASKS * FINAL_TRIALS_PER_TASK;
// T1 (plan.md): the task whose reference run the gate names.
const T1 = 'renal-dose-review';
// As scripts/keyscan.ts matches an Anthropic key.
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{20,}/;

const at = (path: string) => new URL(path, PAGES_URL).href;
const origin = () => new URL(PAGES_URL!).origin;

// Every response body from the Pages origin for the page's own fetches (document, scripts,
// styles, data), to scan after the page has loaded.
function recordBodies(page: Page) {
  const bodies: Array<Promise<{ url: string; text: string }>> = [];
  page.on('response', (r: Response) => {
    if (new URL(r.url()).origin !== origin()) return;
    const type = r.request().resourceType();
    if (!['document', 'script', 'stylesheet', 'fetch', 'xhr'].includes(type)) return;
    bodies.push(r.body().then((b) => ({ url: r.url(), text: b.toString('latin1') }), () => ({ url: r.url(), text: '' })));
  });
  return () => Promise.all(bodies);
}

async function browse(page: Page, path: string) {
  await page.goto(at(path));
  await passGate(page);
}

test('the key gate renders with the local-run panel before any key, the CSP meta equals APP_CSP, and the chip reads Hosted', async ({ page }) => {
  const bodies = recordBodies(page);
  await page.goto(at('./'));
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(APP_CSP);
  // The key gate, with no key: the field, Validate, and the local-run panel beside it.
  await expect(page.getByLabel('Add an API key', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate' })).toBeVisible();
  const panel = page.getByTestId('local-run-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('local-prerequisites')).toHaveText(LOCAL_PREREQUISITES);
  await expect(panel.getByRole('link', { name: 'Install Node.js' })).toHaveAttribute('href', NODE_INSTALL_URL);
  await expect(panel.getByRole('link', { name: 'Install pnpm' })).toHaveAttribute('href', PNPM_INSTALL_URL);
  await expect(panel.getByTestId('local-command')).toHaveText(LOCAL_START_COMMAND);
  expect(await passGate(page)).toBe(true);
  await expect(page.getByTestId('surface-chip')).toHaveText(SURFACE_LABEL['browser-direct']);
  // The shell keeps the panel on the hosted Overview.
  await expect(page.getByTestId('local-run-panel').getByTestId('local-command')).toHaveText(LOCAL_START_COMMAND);
  // Nothing the page fetched from the site holds a key-shaped string.
  const fetched = await bodies();
  expect(fetched.length).toBeGreaterThan(1);
  expect(fetched.filter((b) => KEY_SHAPE.test(b.text)).map((b) => b.url)).toEqual([]);
});

test('the site publishes final-1 as the official run', async ({ request }) => {
  const res = await request.get(at('./data/results/official.json'));
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ run: FINAL_RUN });
});

test(`the Overview shows ${SWATCHES} swatches, ${FINAL_TRIALS_PER_TASK} per task`, async ({ page }) => {
  await browse(page, './?view=overview');
  const rows = page.getByTestId('overview-row');
  await expect(rows).toHaveCount(TASKS);
  for (const row of await rows.all()) {
    await expect(row.getByTestId('swatches').locator('[data-outcome]'), `swatches of ${await row.getAttribute('data-task')}`).toHaveCount(FINAL_TRIALS_PER_TASK);
    await expect(row.getByTestId('k-of-n')).toHaveText(new RegExp(`^\\d+/${FINAL_TRIALS_PER_TASK}$`));
  }
  await expect(page.locator('[data-testid="swatches"] [data-outcome]')).toHaveCount(SWATCHES);
});

test(`T1 (${T1}): the reference solution grades PASS 1.0 in the tab`, async ({ page }) => {
  test.setTimeout(180_000);
  await browse(page, `./?view=tasks&task=${T1}&tab=reference-solution`);
  const badge = page.getByTestId('oracle-badge');
  await expect(badge).toHaveAttribute('data-state', 'done', { timeout: 120_000 });
  await expect(badge).toHaveText('oracle PASS 1.0');
});

test('a published trial opens on its Grading tab with the rubric breakdown', async ({ page }) => {
  await browse(page, './?view=runs');
  const row = page.getByTestId('trial-row').first();
  await expect(row).toBeVisible();
  const name = (await row.getAttribute('data-trial'))!;
  await row.getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
  await expect(page.getByRole('tab', { name: 'Grading' })).toHaveAttribute('aria-selected', 'true');
  const grading = page.getByTestId('panel-grading');
  await expect(grading.getByTestId('outcome')).toBeVisible();
  // The breakdown: the rubric table (every task has rubric items) and the gate checks, each required.
  await expect(grading.getByTestId('rubric-row').first()).toBeVisible();
  await expect(grading.getByTestId('gate-check').first()).toBeVisible();
  expect(await grading.getByTestId('rubric-row').count()).toBeGreaterThan(0);
  expect(await grading.getByTestId('gate-check').count()).toBeGreaterThan(0);
});

// Every chunk the app loads is reached by visiting each view (the chunks load lazily): the URL of
// each script, stylesheet, document and data request to the Pages origin is recorded, then each
// one is fetched again and scanned (a body read through the page can be gone after a navigation).
test('no asset the app loads on any view holds a key-shaped string', async ({ page, request }) => {
  test.setTimeout(300_000);
  const urls = new Set<string>();
  page.on('request', (r) => {
    if (new URL(r.url()).origin === origin() && ['document', 'script', 'stylesheet', 'fetch', 'xhr'].includes(r.resourceType())) urls.add(r.url());
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('overview-row').first()).toBeVisible();
  for (const path of ['./?view=tasks', `./?view=tasks&task=${T1}`, './?view=runs', './?view=findings', './?view=environment', './?view=glossary']) {
    await page.goto(at(path));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto(at('./?view=runs'));
  const row = page.getByTestId('trial-row').first();
  await row.getByRole('button', { name: (await row.getAttribute('data-trial'))!, exact: true }).click();
  await expect(page.getByTestId('trial-detail')).toBeVisible();
  await page.getByRole('tab', { name: 'State diff' }).click();
  await expect(page.getByTestId('panel-state-diff')).toBeVisible();
  const scripts = [...urls].filter((u) => /\.js(\?|$)/.test(new URL(u).pathname));
  expect(scripts.length).toBeGreaterThan(3);
  const hits: string[] = [];
  for (const url of urls) {
    const res = await request.get(url);
    expect(res.ok(), url).toBe(true);
    if (KEY_SHAPE.test((await res.body()).toString('latin1'))) hits.push(url);
  }
  expect(hits).toEqual([]);
});

test(`Findings shows ${TASKS} intervals from final-1`, async ({ page }) => {
  await browse(page, './?view=findings');
  await expect(page.getByTestId('findings-md')).toBeVisible();
  await expect(page.getByTestId('interval-chart').getByTestId('interval')).toHaveCount(TASKS);
  await expect(page.getByTestId('kind-bar')).toHaveCount(TASKS);
  // The difficulty history's official column names the final run.
  await expect(page.locator('[data-testid="history-run"][data-kind="official"]')).toContainText('final-1');
});
