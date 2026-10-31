// Top bar and polish (pre-audit U10, P17j JU12, the part that needs neither JU8 nor JU10): one
// key-state chip with Add key; the pinned clock in words; the local-run card at the width of the
// cards above it; each tool row with the first sentence of its description; and a key that does
// not start with sk-ant- refused in the page, before any network request. Environment gets its own
// axe check, light and dark (verifier-phase-P17j-retro-JU12-1 D2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { browseFrom, GATE } from './browse.ts';
import { readFileSync } from 'node:fs';
import { firstSentence, formatClock } from '../src/data/text.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const NOW = (JSON.parse(readFileSync(new URL('../../../fixtures/manifest.json', import.meta.url), 'utf8')) as { now: string }).now;

async function openApp(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByRole('button', { name: GATE }).or(page.getByRole('navigation', { name: 'Views' }))).toBeVisible();
}

const browse = browseFrom(sampleBase);

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

// UI polish PR 1 (reports/ui-polish-spec.md 1.1, 1.5, 1.6): one primary action per task row, the
// no-key reason read out with each Run button, the phone nav strip under the top bar with a skip
// link, and touch-sized icon buttons on a coarse pointer.
test('a closed task row has exactly one primary button, and with no key it is Run reference solution', async ({ page }) => {
  await browse(page, './?view=tasks');
  const rows = page.getByTestId('task-card');
  await expect(rows).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const primary = rows.nth(i).getByTestId('validation').locator('button.bg-primary');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText('Run reference solution');
  }
});

test('with no key, each Run button is described by its cost and the no-key reason, and Add key is the primary', async ({ page }) => {
  await browse(page, './?view=live&task=_toy');
  const reason = page.getByTestId('launcher-reason');
  await expect(reason).toBeVisible();
  const id = await reason.locator('[id]').first().getAttribute('id');
  expect(id).toBeTruthy();
  const run = page.getByTestId('run-x1');
  await expect(run).toHaveText('Run ×1');
  expect((await run.getAttribute('aria-describedby'))!.split(' ')).toContain(id);
  // One primary on the launcher: with no key it is Add key, since every Run button is disabled.
  await expect(page.getByTestId('launcher').locator('button.bg-primary')).toHaveCount(0);
  await expect(reason.locator('button.bg-primary')).toHaveText('Add key');
});

test.describe('phone shell at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the first Tab focuses Skip to content, which moves focus to main', async ({ page }) => {
    await browse(page, './?view=overview');
    // Leaving the gate focuses the view's heading; a reload in the same tab skips the gate and
    // starts at the top of the document, as any later load does.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('the views are a strip under the top bar: 44px links, main starts at x 0', async ({ page }) => {
    await browse(page, './?view=overview');
    const nav = page.getByRole('navigation', { name: 'Views' });
    const header = (await page.getByRole('banner').boundingBox())!;
    const strip = (await nav.boundingBox())!;
    expect(strip.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(strip.width).toBeGreaterThanOrEqual(389);
    for (const link of await nav.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('main').boundingBox())!.x).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('the Hosted chip shows its icon only, and keeps its name and title', async ({ page }) => {
    await browse(page, './?view=overview');
    const chip = page.getByRole('banner').getByTestId('surface-chip');
    await expect(chip).toHaveText('Hosted');
    const outer = chip.locator('..');
    await expect(outer).toHaveAttribute('title', /^Hosted\./);
    expect((await outer.boundingBox())!.width).toBeLessThanOrEqual(32);
  });
});

test('a rail navigation moves focus to the new view\'s heading', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Environment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Environment' })).toBeFocused();
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the hash copy button is at least 44px', async ({ page }) => {
    await browse(page, './?view=environment');
    const copy = page.getByTestId('manifest-hash').getByRole('button', { name: 'Copy the full hash' });
    const box = (await copy.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  });
});

// UI polish PR 4 (reports/ui-polish-spec.md 4.1 to 4.4): on a closed task row the grader validation
// buttons are quiet, with icons, beside the one primary; each button in the Grader validation tab
// says in one line what it does; the reference solution's result reads in plain words; the task
// tabs wrap on a phone; and the Environment Try panel fills in a working example for each tool.
test.describe('task rows at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the validation buttons on a closed row are quiet, with icons; Run trial says it needs a key; every row is the same height', async ({ page }) => {
    await browse(page, './?view=tasks');
    const rows = page.getByTestId('task-card');
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const v = rows.nth(i).getByTestId('validation');
      for (const name of ['Check the grader', 'Replay published trials']) {
        const b = v.getByRole('button', { name });
        await expect(b).not.toHaveClass(/\bbg-primary\b/);
        expect(await b.evaluate((el) => getComputedStyle(el).borderTopColor), name).toBe('rgba(0, 0, 0, 0)');
      }
      for (const name of ['Run reference solution', 'Check the grader', 'Replay published trials']) await expect(v.getByRole('button', { name }).locator('svg')).toHaveCount(1);
      await expect(v.getByRole('button', { name: 'Run trial' })).toHaveAccessibleDescription('Needs an API key');
    }
    const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size, heights.join(' ')).toBe(1);
  });
});

test('the Grader validation tab says in one line what each button does', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review&tab=grader-validation');
  const panel = page.getByTestId('task-panel-grader-validation');
  const lines: Record<string, string> = {
    'Run reference solution': 'Runs a known-good answer; it must pass.',
    'Check the grader': 'Tries planted wrong answers; each must fail.',
    'Replay published trials': 'Grades saved trials again; grades must match.',
  };
  for (const [name, line] of Object.entries(lines)) {
    await expect(panel.getByText(line, { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name })).toHaveAccessibleDescription(line);
  }
});

test('the reference solution\'s result reads in plain words, beside the oracle label', async ({ page }) => {
  test.setTimeout(180_000);
  await browse(page, './?view=tasks');
  const v = page.locator('[data-testid="validation"][data-task="renal-dose-review"]');
  await v.getByRole('button', { name: 'Run reference solution' }).click();
  const oracle = v.getByTestId('oracle-result');
  await expect(oracle).toHaveAttribute('data-outcome', 'PASS', { timeout: 150_000 });
  await expect(oracle).toContainText('Reference solution: PASS, score 1.0');
  await expect(oracle).toContainText('oracle PASS 1.0');
  // A count that is zero is left out.
  await expect(oracle).not.toContainText('judge items unknown');
  await expect(oracle).not.toContainText('cache misses');
});

test('at 390 px the task tabs wrap, so Grader validation is in view on the prompt tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browse(page, './?view=tasks&task=renal-dose-review&tab=prompt');
  const tabs = page.getByRole('tablist', { name: 'Task' });
  // The open card is far down the page; bring the strip into view, then no tab may sit past its edge.
  await tabs.scrollIntoViewIfNeeded();
  await expect(tabs.getByRole('tab', { name: 'Grader validation' })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Environment: choosing a tool fills in an example input that runs', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByRole('button', { name: 'Check a fresh copy matches' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Tool' }).selectOption('search_patients');
  const input = page.getByRole('textbox', { name: 'Input (JSON)' });
  expect(JSON.parse(await input.inputValue())).toEqual({ name: 'Harold Vance' });
  await page.getByRole('button', { name: 'Run tool', exact: true }).click();
  const r = page.getByTestId('try-result');
  await expect(r).toHaveAttribute('data-error', 'false', { timeout: 60_000 });
  await expect(r.getByTestId('try-content')).toContainText('Harold Vance');
});
