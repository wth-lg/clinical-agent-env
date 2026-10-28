// Top bar and polish (pre-audit U10, P17j JU12, the part that needs neither JU8 nor JU10): one
// key-state chip with Add key; the pinned clock in words; the local-run card at the width of the
// cards above it; each tool row with the first sentence of its description; and a key that does
// not start with sk-ant- refused in the page, before any network request. Environment gets its own
// axe check, light and dark (verifier-phase-P17j-retro-JU12-1 D2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { firstSentence, formatClock } from '../src/data/text.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const NOW = (JSON.parse(readFileSync(new URL('../../../fixtures/manifest.json', import.meta.url), 'utf8')) as { now: string }).now;

async function openApp(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByRole('button', { name: 'Browse without a key' }).or(page.getByRole('navigation', { name: 'Views' }))).toBeVisible();
}

async function browse(page: Page, path: string) {
  await openApp(page, path);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  if (await gate.isVisible()) await gate.click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

test('the top bar has one key-state chip, with Add key when there is no key', async ({ page }) => {
  await browse(page, './?view=overview');
  const bar = page.getByRole('banner');
  await expect(bar.getByTestId('key-chip')).toHaveCount(1);
  await expect(bar.getByTestId('key-chip')).toHaveText('No key');
  await expect(bar.getByText(/no key/i)).toHaveCount(1);
  await expect(bar.getByRole('button', { name: 'Add key' })).toBeVisible();
});

test('Overview shows the pinned clock in words, in the world\'s own offset', async ({ page }) => {
  // The clock is in the environment summary of an Overview with no official run, so serve none.
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }));
  await browse(page, './?view=overview');
  const clock = page.getByTestId('pinned-clock');
  await expect(clock).toHaveText(formatClock(NOW));
  await expect(clock).toHaveAttribute('title', NOW);
  // The committed world's clock today (verifier JU12a-1 F2).
  if (NOW === '2026-10-23T08:00:00-04:00') await expect(clock).toHaveText('Fri 23 Oct 2026, 08:00 (UTC−4)');
});

test('Environment shows the pinned clock in words too', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByTestId('pinned-clock')).toHaveText(formatClock(NOW));
  await expect(page.getByTestId('pinned-clock')).toHaveAttribute('title', NOW);
});

test('Environment: axe finds nothing serious or critical, light and dark (verifier-phase-P17j-retro-JU12-1 D2)', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await browse(page, './?view=environment');
    await expect(page.getByTestId('tool').first()).toBeVisible();
    await expect(page.getByTestId('pinned-clock')).toBeVisible();
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    expect(bad, scheme).toEqual([]);
  }
});

test('the local-run card lines up with the cards above it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await browse(page, './?view=overview');
  const card = await page.getByTestId('intro-card').boundingBox();
  const panel = await page.getByTestId('local-run-panel').boundingBox();
  expect(Math.abs(panel!.x - card!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(panel!.width - card!.width)).toBeLessThanOrEqual(1);
});

test('each tool row shows the first sentence of its description without opening it', async ({ page }) => {
  await browse(page, './?view=environment');
  const rows = page.getByTestId('tool');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const purpose = rows.nth(i).getByTestId('tool-purpose');
    await expect(purpose).toBeVisible();
    // The row's line is the first sentence of the tool's own description (verifier JU12a-1 F2).
    const description = (await rows.nth(i).getByTestId('tool-description').textContent()) ?? '';
    await expect(purpose).toHaveText(firstSentence(description));
  }
});

test('a key that does not start with sk-ant- is refused in the page with no network request', async ({ page }) => {
  await openApp(page, './');
  await page.getByLabel('API key', { exact: true }).fill('not-a-key');
  // Every request after Validate counts, same origin too (verifier JU12a-1 F2), except the page's own
  // static GETs of data/ and assets/: the results loader is still fetching trajectories in the
  // background when Validate is pressed, and those carry no key. Any other request (a POST, the API,
  // the relay, the runner) would be the key leaving the page.
  const requests: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    const own = r.method() === 'GET' && new URL(r.url()).origin === new URL(page.url()).origin && /\/(data|assets)\//.test(path);
    if (!own) requests.push(`${r.method()} ${r.url()}`);
  });
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('An Anthropic key starts with sk-ant-.')).toBeVisible();
  await expect(page.getByText('Check the key and paste it again.')).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});
