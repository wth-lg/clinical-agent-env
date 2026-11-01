// The result card on screen (plan-amendment-w4 PW4-F, F-2), on its own fixture (fixtures/band-verdict:
// message-queue 20/20, discharge-medrec 16/20, contrast-ct-prep 10/20, and a pilot of 8 each):
// Overview and Findings give each task's verdict as text beside its Wilson interval, equal to
// summary.json's band_verdict and to bandVerdict; Findings lists the task with no failures with a link
// to its strictness evidence and gives the difficulty history, pilot first; the glossary gives the
// rule. At 390 px and on the desktop the verdict is visible text inside the viewport and the page
// does not scroll sideways; axe finds nothing serious or critical, light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BAND_VERDICT_RULE, bandVerdict } from '../../../packages/core/summary.ts';
import { browseFrom } from './browse.ts';
import { bandBase, OFFICIAL, PILOT, PILOT_ID, RUN_ID, summary } from './fixtures/band-verdict/band.ts';

const browse = browseFrom(bandBase);
const WANT: Record<string, string> = { 'message-queue': 'Saturated', 'discharge-medrec': 'Above band', 'contrast-ct-prep': 'In band' };
const SIZES = [{ name: '390 px', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 900 }] as const;

// The verdict is visible text, inside the viewport, and the page has no sideways scroll.
async function readable(page: Page, task: string, scope: string) {
  const v = page.locator(`${scope} [data-testid="band-verdict"][data-task="${task}"]`).first();
  await expect(v).toBeVisible();
  await expect(v).toHaveText(WANT[task]!);
  const box = (await v.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x, `${task} verdict starts inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${task} verdict ends inside the viewport`).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('the fixture: summary.json band_verdict is bandVerdict, and the three verdicts are the ones the spec checks', () => {
  for (const [id, t] of Object.entries(summary.tasks)) {
    expect(t.band_verdict).toBe(bandVerdict(t.passes, t.trials));
    expect(t.band_verdict).toBe(WANT[id]);
    expect(`${t.passes}/${t.trials}`).toBe(`${OFFICIAL[id]!.passes}/${OFFICIAL[id]!.trials}`);
  }
});

for (const size of SIZES) {
  test(`${size.name}: Overview and Findings give the verdict as text beside the Wilson interval`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await browse(page, './?view=overview');
    for (const id of Object.keys(WANT)) {
      const row = page.locator(`[data-testid="overview-row"][data-task="${id}"]`);
      await expect(row.getByTestId('wilson')).toBeVisible();
      await readable(page, id, `[data-testid="overview-row"][data-task="${id}"]`);
    }
    await browse(page, './?view=findings');
    for (const id of Object.keys(WANT)) {
      const li = page.locator('[data-testid="interval-chart"] li').filter({ has: page.locator(`[data-testid="band-verdict"][data-task="${id}"]`) });
      await expect(li.getByTestId('wilson')).toBeVisible();
      await readable(page, id, '[data-testid="interval-chart"]');
    }
  });

  test(`${size.name}: Findings lists the task with no failures and gives the difficulty history`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await browse(page, './?view=findings');
    const clean = page.getByTestId('no-failures-row');
    await expect(clean).toHaveCount(1);
    await expect(clean).toHaveAttribute('data-task', 'message-queue');
    await expect(clean.getByTestId('no-failures-text')).toHaveText('No failures in 20 trials.');
    const history = page.getByTestId('difficulty-history');
    await expect(history.getByTestId('history-run')).toHaveText([PILOT_ID, `${RUN_ID} (final)`]);
    for (const id of Object.keys(WANT)) {
      const cells = history.locator(`[data-testid="history-row"][data-task="${id}"] [data-testid="history-cell"]`);
      const p = PILOT[id]!;
      const o = OFFICIAL[id]!;
      await expect(cells.nth(0)).toHaveText(`${p.passes}/${p.trials} ${bandVerdict(p.passes, p.trials)}`);
      await expect(cells.nth(1)).toHaveText(`${o.passes}/${o.trials} ${WANT[id]}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await clean.getByRole('link', { name: 'See the strictness evidence' }).click();
    await expect(page).toHaveURL(/view=tasks.*task=message-queue.*tab=grader-validation|view=tasks.*tab=grader-validation.*task=message-queue/);
  });
}

test('the glossary gives the verdict rule, and Findings links to it', async ({ page }) => {
  await browse(page, './?view=findings');
  await page.getByRole('link', { name: 'What the verdicts mean' }).first().click();
  await expect(page).toHaveURL(/view=glossary.*#band-verdict$/);
  await expect(page.getByTestId('band-verdict-rule')).toHaveText(BAND_VERDICT_RULE);
});

test('Overview, Findings and Glossary with the band fixture: axe finds nothing serious or critical, light and dark, at 390 px and desktop', async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const view of ['overview', 'findings', 'glossary'] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await browse(page, `./?view=${view}`);
        if (view !== 'glossary') await expect(page.getByTestId('band-verdict').first()).toBeVisible();
        const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
        expect(bad, `${view} ${scheme} ${size.name}`).toEqual([]);
      }
    }
  }
});
