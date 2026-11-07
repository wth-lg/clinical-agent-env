// The result card on screen (plan-amendment-w4 PW4-F, F-2), on its own fixture (fixtures/band-verdict:
// message-queue 20/20, discharge-medrec 16/20, contrast-ct-prep 10/20, and a pilot of 8 each):
// Overview and Findings give each task's verdict as text beside its Wilson interval, equal to
// summary.json's band_verdict and to bandVerdict; Findings lists the task with no failures with a link
// to its strictness evidence and gives the difficulty history, pilot first, the official column
// "(official, in progress)" since three tasks of six are not a full run; the glossary gives the
// rule. At 390 px and on the desktop the verdict is visible text inside the viewport and the page
// does not scroll sideways; axe finds nothing serious or critical, light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BAND_VERDICT_RULE, bandVerdict } from '../../../packages/core/summary.ts';
import { browseFrom } from './browse.ts';
import { bandBase, OFFICIAL, PILOT, PILOT_ID, RUN_ID, summary, SUPERSEDED, SUPERSEDED_KEY } from './fixtures/band-verdict/band.ts';

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
    // R42: the superseded version of contrast-ct-prep is a column beside the official run. band-1
    // holds 20 valid trials of three tasks, but the environment has six: the official column is
    // "(official, in progress)" until a run covers every task at the final sample (UIBAND-219-4 M1).
    await expect(history.getByTestId('history-run')).toHaveText([PILOT_ID, `${SUPERSEDED_KEY} (contrast-ct-prep v1, superseded)`, `${RUN_ID} (official, in progress)`]);
    for (const id of Object.keys(WANT)) {
      const cells = history.locator(`[data-testid="history-row"][data-task="${id}"] [data-testid="history-cell"]`);
      const p = PILOT[id]!;
      const o = OFFICIAL[id]!;
      const v1 = SUPERSEDED[id];
      // A pilot's 8 trials are short of the final sample, so its verdict is provisional (UIBAND-219 N1).
      await expect(cells.nth(0)).toHaveText(`${p.passes}/${p.trials} ${bandVerdict(p.passes, p.trials)}, provisional (${p.trials} of 20 valid trials)`);
      await expect(cells.nth(1)).toHaveText(v1 === undefined ? 'none' : `${v1.passes}/${v1.trials} ${bandVerdict(v1.passes, v1.trials)}`);
      await expect(cells.nth(2)).toHaveText(`${o.passes}/${o.trials} ${WANT[id]}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await clean.getByRole('link', { name: 'See the strictness evidence' }).click();
    await expect(page).toHaveURL(/view=tasks.*task=message-queue.*tab=grader-validation|view=tasks.*tab=grader-validation.*task=message-queue/);
  });
}

// R42: a task's superseded version is shown beside the current one on Overview, in the history
// and in Runs, never counted: summary.json carries it under superseded, apart from tasks.
test('a superseded task version shows beside the current one on Overview and in Runs, and is not counted', async ({ page }) => {
  const v1 = SUPERSEDED['contrast-ct-prep']!;
  expect(summary.superseded[SUPERSEDED_KEY]).toMatchObject({ task: 'contrast-ct-prep', version: 'v1', summary: { passes: v1.passes, trials: v1.trials, band_verdict: bandVerdict(v1.passes, v1.trials) } });
  expect(summary.tasks['contrast-ct-prep']).toMatchObject({ passes: OFFICIAL['contrast-ct-prep']!.passes, trials: OFFICIAL['contrast-ct-prep']!.trials });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('overview-row')).toHaveCount(Object.keys(OFFICIAL).length);
  const line = page.getByTestId('superseded-line');
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute('data-task', 'contrast-ct-prep');
  await expect(line).toHaveAttribute('data-version', 'v1');
  await expect(line.getByTestId('k-of-n')).toHaveText(`${v1.passes}/${v1.trials}`);
  await expect(line.getByTestId('band-verdict')).toHaveText(bandVerdict(v1.passes, v1.trials)!);
  await line.getByRole('link', { name: 'Its trials are in Runs' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Runs');
  const section = page.getByTestId('superseded-runs');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText('Superseded task versions (not counted in the results)');
  const run = section.locator(`[data-testid="run"][data-run="${SUPERSEDED_KEY}"]`);
  await expect(run).toHaveAttribute('data-official', 'false');
  await expect(run).toHaveAttribute('data-superseded', 'contrast-ct-prep v1');
  await expect(run.getByTestId('run-header')).toHaveText(`contrast-ct-prep v1 (superseded in ${RUN_ID}): ${v1.passes}/${v1.trials} pass · ${v1.trials - v1.passes} failures`);
  // The official run's own count stays its own.
  await expect(page.getByTestId('runs-stat')).toHaveText(`${Object.values(OFFICIAL).reduce((n, t) => n + t.passes, 0)}/${Object.values(OFFICIAL).reduce((n, t) => n + t.trials, 0)}`);
  // A superseded trial opens like any other, and says what it is.
  await run.getByTestId('trial-row').first().getByRole('button').click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-run', SUPERSEDED_KEY);
  await expect(page.getByText(`the superseded v1 of contrast-ct-prep in ${RUN_ID}, not counted in the results`)).toBeVisible();
});

// P25u V3: the kind bar is the failure rate (failures over valid trials); a task with no failures
// shows an empty bar and "No failures" alone, with no fault box of zero counts.
test('Findings: a task with no failures shows an empty bar and no fault box; a failing task\'s bar is its failure rate', async ({ page }) => {
  await browse(page, './?view=findings');
  const clean = page.locator('[data-testid="kind-bar"][data-task="message-queue"]');
  await expect(clean).toHaveAttribute('data-total', '0');
  await expect(clean).toHaveAttribute('data-track', '0');
  await expect(page.locator('[data-testid="fault-box"][data-task="message-queue"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="why-fail"] > li[data-task="message-queue"]')).toContainText('No failures');
  const o = OFFICIAL['contrast-ct-prep']!;
  await expect(page.locator('[data-testid="kind-bar"][data-task="contrast-ct-prep"]')).toHaveAttribute('data-track', String((100 * (o.trials - o.passes)) / o.trials));
});

test('the glossary gives the verdict rule, and Findings links to it', async ({ page }) => {
  await browse(page, './?view=findings');
  await page.getByRole('link', { name: 'What the verdicts mean' }).first().click();
  await expect(page).toHaveURL(/view=glossary.*#band-verdict$/);
  await expect(page.getByTestId('band-verdict-rule')).toHaveText(BAND_VERDICT_RULE);
});

// verifier-phase-P17i-TWOW-229-1 B1: with the superseded column the Difficulty history table is wider
// than a phone, so its scroll container must be a focusable, named region (axe
// scrollable-region-focusable, serious), or the keyboard cannot reach what it hides. CI's fonts
// overflow at 390 px where a Mac's do not, so the check forces the overflow at 320 px.
test('the Difficulty history scrolls inside a focusable, named region that axe accepts, at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await browse(page, './?view=findings');
  const region = page.getByTestId('difficulty-history').getByRole('region', { name: 'Difficulty history table' });
  await expect(region).toHaveAttribute('tabindex', '0');
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth), 'the table overflows its box at 320 px, so the region scrolls').toBe(true);
  await region.focus();
  expect(await region.evaluate((el) => document.activeElement === el)).toBe(true);
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
  expect(bad).toEqual([]);
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
