// Task tabs (pre-audit S12, P17j JU9): ?view=tasks&task=<id>&tab=<value> opens the task on that
// tab, as docs/requirements/ui-contract.md's `tab` row and the trace routes name them, with
// prompt as the default and for a value it does not know. The tab strip follows WAI-ARIA tabs:
// ArrowRight and ArrowLeft move with wrap, Home and End go to the ends, and each move writes the
// tab into the URL, so a shared link opens the same tab.
import { expect, test, type Page } from '@playwright/test';
import { sampleBase } from './fixtures/sample-results/sample.ts';

const TASK = 'renal-dose-review';
const TABS = ['prompt', 'policy', 'rubric', 'reference-solution', 'grader-validation'] as const;
// What each panel shows, so a selected tab is also the right content.
const CONTENT: Record<(typeof TABS)[number], string> = {
  prompt: 'task-prompt',
  policy: 'task-policy',
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
  await press('ArrowRight', 'rubric');
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

test('at 390 px the tab strip does not scroll the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of TABS) {
    await open(page, `&tab=${tab}`);
    await expectSelected(page, tab);
    const sizes = await page.evaluate(() => [document.querySelector('main')!, document.documentElement].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth })));
    for (const { sw, cw } of sizes) expect(sw, tab).toBeLessThanOrEqual(cw);
  }
});
