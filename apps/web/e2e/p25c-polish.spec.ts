// P25c UI polish (builder-327; reports/verifier-phase-P25c-1.md, UI audit table): the spend meter
// says what it is; the URL's task wins on the Live trial launcher; a Try a read tool error is in
// the danger colour; the Overview row carries the refusal-excluded rate and the median duration on
// a calm secondary line; the top bar shows the effort with no key; a repeated Runs reason is
// shown once and a click away on later rows; disabled launcher controls look disabled and say
// why; Findings puts the charts before the prose.
import { expect, test, type Page } from '@playwright/test';
import { browse, browseFrom } from './browse.ts';
import { explain, records, sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';
import { okResponse } from '../src/harness/scenarios.ts';
import { RELAY_ORIGIN } from '../src/surface/relay.ts';

const sample = browseFrom(sampleBase);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };

// Answers the key gate's Validate (the one call) with "ok", so the tab holds a key.
async function withKey(page: Page) {
  await page.route((url) => url.origin === RELAY_ORIGIN, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: await okResponse({ text: 'ok' }, 1).text(), headers: CORS });
  });
  await page.goto('./?view=overview');
  await page.getByLabel('Add an API key', { exact: true }).fill(['sk', 'ant', 'api03', 'p25c-polish-e2e'].join('-'));
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByTestId('key-chip')).toBeVisible();
}

test('the spend meter reads "Session spend $a of $b cap" (I8, contract U15)', async ({ page }) => {
  await withKey(page);
  const meter = page.getByRole('banner').getByTestId('spend-meter');
  await expect(meter).toHaveText(/^Session spend \$[0-9]+\.[0-9]{2} of \$[0-9]+\.[0-9]{2} cap$/);
  await expect(meter).toContainText('of $20.00 cap');
});

test('the top bar shows the effort indicator with no key, small and quiet', async ({ page }) => {
  await browse(page, './?view=overview');
  const effort = page.getByRole('banner').getByTestId('effort');
  await expect(effort).toHaveText('Effort high');
  await expect(effort).toBeVisible();
  await expect(effort).toHaveAttribute('title', 'Every trial runs at effort high');
  // Smaller than the top bar's name text: quiet.
  const size = await effort.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const name = await page.getByRole('banner').getByText('Riverbend', { exact: true }).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeLessThan(name);
});

test('Live trial: the URL\'s task wins over the task chosen before', async ({ page }) => {
  await browse(page, './?view=live&task=crc-care-gap');
  const select = page.getByRole('combobox', { name: 'Task' });
  await expect(select).toHaveValue('crc-care-gap');
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Tasks' }).click();
  await page.locator('[data-testid="validation"][data-task="discharge-medrec"]').getByRole('button', { name: 'Run trial' }).click();
  await expect(page).toHaveURL(/view=live&task=discharge-medrec/);
  await expect(select).toHaveValue('discharge-medrec');
  // The same in place: a link to Live trial with another task, while Live trial is open.
  await page.evaluate(() => {
    history.pushState(null, '', '?view=live&task=renal-dose-review');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(select).toHaveValue('renal-dose-review');
});

test('Live trial with no key: disabled controls look disabled, not like a drop target, and say why', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const run = page.getByTestId('run-x1');
  await expect(run).toBeDisabled();
  await expect(run).toHaveAttribute('title', 'Add a key first');
  expect(await run.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  const select = page.getByRole('combobox', { name: 'Task' });
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('title', 'Add a key first');
  expect(await select.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  const set = page.getByRole('button', { name: 'Set cap' });
  await expect(set).toBeDisabled();
  await expect(set).toHaveAttribute('title', 'This is the current cap');
  expect(await set.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
});

test('Environment: a Try a read tool input that is not JSON shows an alert in the danger colour', async ({ page }) => {
  await browse(page, './?view=environment');
  await page.getByRole('textbox', { name: 'Input (JSON)' }).fill('{ "query": "creatinine" }{');
  await page.getByRole('button', { name: 'Run tool', exact: true }).click();
  const alert = page.getByTestId('try-error');
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute('role', 'alert');
  const lead = alert.locator('p').first();
  await expect(lead).toHaveText('The input is not valid JSON.');
  await expect(lead).toHaveClass(/text-danger/);
  await expect(alert.getByTestId('error-detail')).toContainText('JSON');
});

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const seconds = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`);
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

test('Overview: each row keeps k/N and the interval primary, with safe PASS, pass^k, the refusal-excluded rate and the median duration on one secondary line', async ({ page }) => {
  await sample(page, './?view=overview');
  for (const id of TASK_IDS) {
    const s = summary.tasks[id]!;
    const row = page.locator(`[data-testid="overview-row"][data-task="${id}"]`);
    const line = row.getByTestId('task-detail-line');
    await expect(line.getByTestId('safe-pass')).toHaveText(`safe PASS ${s.pass_no_harm}/${s.trials}`);
    await expect(line.getByTestId('pass-k')).toHaveCount(1);
    const refusals = line.getByTestId('refusal-excluded');
    await expect(refusals).toHaveText(s.refusals === 0 ? 'No refusals' : `Without refusals ${pct(s.refusal_excluded_rate!)} (${s.refusals} refusal${s.refusals === 1 ? '' : 's'})`);
    const mine = records.filter((r) => r.task_id === id).map((r) => Math.round((Date.parse(r.ended!) - Date.parse(r.started!)) / 1000));
    await expect(line.getByTestId('median-duration')).toHaveText(`Median duration ${seconds(median(mine))}`);
    await expect(line.getByTestId('median-duration')).toHaveAttribute('title', `The median of ${mine.length} trials, from the first request to the last reply`);
    // The pass cell is one line: k/N alone (and a false PASS count when there is one).
    await expect(row.getByTestId('k-of-n')).toHaveText(`${s.passes}/${s.trials}`);
    const cell = row.getByTestId('pass-cell');
    await expect(cell.getByTestId('safe-pass')).toHaveCount(0);
    await expect(cell.getByTestId('pass-k')).toHaveCount(0);
  }
  // The table still fits a phone.
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('Runs: a reason repeated by a later row of the same task shows once, and is one click away on the later row', async ({ page }) => {
  // The sample run's one pair of rows with the same task and reason.
  const groups = new Map<string, string[]>();
  for (const r of records) {
    const e = explain(r);
    if (e.outcome === 'PASS' && e.fault === null) continue;
    const key = `${r.task_id}\n${e.reason}`;
    groups.set(key, [...(groups.get(key) ?? []), `${r.task_id}/${r.index}`]);
  }
  const pair = [...groups.values()].find((v) => v.length > 1);
  expect(pair).toBeDefined();
  const [first, second] = pair!;
  const reason = explain(records.find((r) => `${r.task_id}/${r.index}` === first)!).reason;
  await sample(page, './?view=runs');
  const a = page.locator(`[data-testid="trial-row"][data-trial="${first}"]`);
  const b = page.locator(`[data-testid="trial-row"][data-trial="${second}"]`);
  await expect(a.getByTestId('reason')).toBeVisible();
  await expect(a.getByTestId('reason')).toHaveText(reason);
  await expect(a.getByTestId('reason-repeat')).toHaveCount(0);
  const repeat = b.getByTestId('reason-repeat');
  await expect(repeat).toHaveText(`Same reason as ${first}`);
  await expect(b.getByTestId('reason')).toBeHidden();
  await repeat.click();
  await expect(b.getByTestId('reason')).toBeVisible();
  await expect(b.getByTestId('reason')).toHaveText(reason);
  // Opening the reason is not a click on the row: the trial stays closed.
  await page.waitForTimeout(800);
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
});

test('Findings: the chart and the per-task cards come before the write-up prose', async ({ page }) => {
  await sample(page, './?view=findings');
  const chart = (await page.getByTestId('interval-chart').boundingBox())!;
  const why = (await page.getByTestId('why-fail').boundingBox())!;
  const prose = (await page.getByTestId('findings-md').boundingBox())!;
  expect(chart.y).toBeLessThan(prose.y);
  expect(why.y).toBeLessThan(prose.y);
  await expect(page.getByTestId('findings-md').getByRole('heading', { level: 1 })).toHaveText('Findings (sample run)');
});
