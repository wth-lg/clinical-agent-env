// Task tabs (pre-audit S12, P17j JU9): ?view=tasks&task=<id>&tab=<value> opens the task on that
// tab, as docs/requirements/ui-contract.md's `tab` row and the trace routes name them, with
// prompt as the default and for a value it does not know. The tab strip follows WAI-ARIA tabs:
// ArrowRight and ArrowLeft move with wrap, Home and End go to the ends, and each move writes the
// tab into the URL, so a shared link opens the same tab; a click on the selected tab adds no
// history entry. Axe finds nothing serious or critical on any tab, light and dark. At 390 px the
// strip stays on one row and scrolls inside itself. A grader validation result started on a
// closed card is still there when the card opens.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const TASK = 'renal-dose-review';
const TABS = ['prompt', 'policy', 'chart', 'rubric', 'reference-solution', 'grader-validation'] as const;
// What each panel shows, so a selected tab is also the right content.
const CONTENT: Record<(typeof TABS)[number], string> = {
  prompt: 'task-prompt',
  policy: 'task-policy',
  chart: 'chart-source',
  rubric: 'task-check',
  'reference-solution': 'solution-step',
  'grader-validation': 'validation',
};

async function open(page: Page, query: string) {
  await page.goto(new URL(`./?view=tasks&task=${TASK}${query}`, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

const card = (page: Page) => page.locator(`[data-testid="task-card"][data-task="${TASK}"]`);
const tablist = (page: Page) => card(page).getByRole('tablist', { name: 'Task' });

async function expectSelected(page: Page, tab: (typeof TABS)[number]) {
  const tabs = tablist(page).getByRole('tab');
  await expect(tabs).toHaveCount(TABS.length);
  for (const [i, id] of TABS.entries()) {
    await expect(tabs.nth(i)).toHaveAttribute('data-tab', id);
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', String(id === tab));
    await expect(card(page).getByTestId(`task-panel-${id}`)).toBeVisible({ visible: id === tab });
  }
  await expect(card(page).getByTestId(`task-panel-${tab}`).getByTestId(CONTENT[tab]).first()).toBeVisible();
}

for (const tab of TABS) {
  test(`?tab=${tab} selects the ${tab} tab and shows its content`, async ({ page }) => {
    await open(page, `&tab=${tab}`);
    await expectSelected(page, tab);
  });
}

test('no tab, or a tab the task page does not know, opens the prompt tab', async ({ page }) => {
  await open(page, '');
  await expectSelected(page, 'prompt');
  await open(page, '&tab=state-diff');
  await expectSelected(page, 'prompt');
});

test('arrow keys, Home and End move between tabs, focus follows and the URL keeps the tab', async ({ page }) => {
  await open(page, '&tab=prompt');
  await tablist(page).getByRole('tab', { selected: true }).focus();
  const press = async (key: string, want: (typeof TABS)[number]) => {
    await page.keyboard.press(key);
    await expectSelected(page, want);
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${want}(&|$)`));
    await expect(tablist(page).getByRole('tab', { selected: true })).toBeFocused();
  };
  await press('ArrowRight', 'policy');
  await press('ArrowRight', 'chart');
  await press('ArrowLeft', 'policy');
  await press('End', 'grader-validation');
  await press('ArrowRight', 'prompt');
  await press('ArrowLeft', 'grader-validation');
  await press('Home', 'prompt');
});

test('a click selects a tab; closing the task and opening another starts on the prompt tab', async ({ page }) => {
  await open(page, '');
  await tablist(page).getByRole('tab', { name: 'Reference solution' }).click();
  await expectSelected(page, 'reference-solution');
  await expect(page).toHaveURL(/[?&]tab=reference-solution(&|$)/);
  await card(page).getByRole('button', { expanded: true }).click();
  await expect(page).not.toHaveURL(/[?&]tab=/);
  await expect(card(page).getByRole('tablist')).toHaveCount(0);
  await card(page).getByRole('button', { expanded: false }).click();
  await expectSelected(page, 'prompt');
});

test('at 390 px the keyboard focus ring of a tab is inside the strip, not clipped by it (verifier JU9r2 N1)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '&tab=prompt');
  await tablist(page).getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('ArrowRight');
  const ring = await tablist(page).getByRole('tab', { selected: true }).evaluate((el) => {
    const cs = getComputedStyle(el);
    const offset = parseFloat(cs.outlineOffset), width = parseFloat(cs.outlineWidth);
    const r = el.getBoundingClientRect(), s = el.parentElement!.getBoundingClientRect();
    const out = width + offset; // how far the ring reaches past the border box
    return { style: cs.outlineStyle, offset, top: r.top - out, bottom: r.bottom + out, stripTop: s.top, stripBottom: s.bottom };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.offset).toBeLessThan(0);
  expect(ring.top).toBeGreaterThanOrEqual(ring.stripTop);
  expect(ring.bottom).toBeLessThanOrEqual(ring.stripBottom);
});

test('a click on the selected tab, or Home on the first, adds no history entry', async ({ page }) => {
  await open(page, '&tab=prompt');
  const before = await page.evaluate(() => history.length);
  await tablist(page).getByRole('tab', { name: 'Prompt' }).click();
  await page.keyboard.press('Home');
  await expectSelected(page, 'prompt');
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('at 390 px the tab strip is one row and does not scroll the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of TABS) {
    await open(page, `&tab=${tab}`);
    await expectSelected(page, tab);
    const tops = await tablist(page).getByRole('tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(tops).size, tab).toBe(1);
    // The selected tab is in the strip's view, not scrolled out of it.
    const [t, strip] = await Promise.all([tablist(page).getByRole('tab', { selected: true }).boundingBox(), tablist(page).boundingBox()]);
    expect(t!.x, tab).toBeGreaterThanOrEqual(strip!.x - 1);
    expect(t!.x + t!.width, tab).toBeLessThanOrEqual(strip!.x + strip!.width + 1);
    const sizes = await page.evaluate(() => [document.querySelector('main')!, document.documentElement].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth })));
    for (const { sw, cw } of sizes) expect(sw, tab).toBeLessThanOrEqual(cw);
  }
});

test('the Grader validation panel does not repeat its tab name', async ({ page }) => {
  await open(page, '&tab=grader-validation');
  await expect(card(page).getByTestId('task-panel-grader-validation').getByText('Grader validation', { exact: true })).toHaveCount(0);
});

test('an oracle result started on a closed card is still shown after the card opens', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(new URL('./?view=tasks', await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await card(page).getByTestId('validation').getByRole('button', { name: 'Run reference solution' }).click();
  await expect(card(page).getByTestId('oracle-result')).toHaveAttribute('data-outcome', 'PASS', { timeout: 120_000 });
  await card(page).getByRole('button', { expanded: false }).click();
  await tablist(page).getByRole('tab', { name: 'Grader validation' }).click();
  await expect(card(page).getByTestId('task-panel-grader-validation').getByTestId('oracle-result')).toHaveAttribute('data-outcome', 'PASS');
});

test('axe finds no serious or critical violation on any task tab, light and dark', async ({ page }) => {
  test.setTimeout(120_000);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const tab of TABS) {
      await open(page, `&tab=${tab}`);
      await expectSelected(page, tab);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(bad, `${scheme} ${tab}`).toEqual([]);
    }
  }
});
