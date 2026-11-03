// The Overview band line (ui-contract P14, pre-audit F1, trace W1-W3, U21, U26): `<k> of <n> tasks
// in band`, k and n counted from the official run's summary.json band verdicts (never a constant),
// the line as the accessible name of its group, and a note naming the tasks with no final result
// yet. On the band fixture (three tasks: In band, Above band, Saturated) the line reads 1 of 3 and
// the note names the other three tasks of the environment; on the sample run (six tasks, five In
// band) it reads 5 of 6 with no note. At 390 px and on the desktop the line is inside the viewport
// with no sideways scroll; axe finds nothing serious or critical, light and dark. With SHOTS_DIR
// set, the Overview is screenshotted in both themes at both widths.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Summary } from '../../../packages/core/summary.ts';
import { browseFrom } from './browse.ts';
import { bandBase, summary as bandSummary } from './fixtures/band-verdict/band.ts';
import { sampleBase, summary as sampleSummary } from './fixtures/sample-results/sample.ts';

const band = browseFrom(bandBase);
const sample = browseFrom(sampleBase);
const SIZES = [{ name: '390 px', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 900 }] as const;
// The environment's tasks, as the Overview lists them (apps/web/src/data/tasks.ts): the task
// directories, _-prefixed ones left out.
const TASKS = readdirSync(join(import.meta.dirname, '../../../tasks'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);

// The line and the note the summary calls for, counted here, apart from the UI's own code.
function expected(s: Summary) {
  const final = Object.entries(s.tasks).filter(([, t]) => t.band_verdict !== null).map(([id]) => id);
  const k = Object.values(s.tasks).filter((t) => t.band_verdict === 'In band').length;
  return { line: `${k} of ${final.length} tasks in band`, notFinal: TASKS.filter((id) => !final.includes(id)) };
}

test('the fixtures: the band run has a task out of band and tasks with no result; the sample run has every task final', () => {
  expect(expected(bandSummary)).toEqual({ line: '1 of 3 tasks in band', notFinal: ['crc-care-gap', 'renal-dose-review', 'results-inbox'] });
  expect(expected(sampleSummary)).toEqual({ line: '5 of 6 tasks in band', notFinal: [] });
});

async function inViewport(page: Page) {
  const line = page.getByTestId('band-count');
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const size of SIZES) {
  test(`${size.name}: the band line counts the summary's verdicts and names the tasks with no final result`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await band(page, './?view=overview');
    const want = expected(bandSummary);
    const group = page.getByRole('group', { name: want.line });
    await expect(group).toBeVisible();
    await expect(group.getByTestId('band-count')).toHaveText(want.line);
    await expect(group).toHaveAttribute('data-in-band', '1');
    await expect(group).toHaveAttribute('data-final', '3');
    await expect(group).toContainText('1 of the 3 tasks with a final result has a pass rate from 20% to 70%, both included.');
    const note = group.getByTestId('band-not-final');
    await expect(note).toHaveText(`3 tasks have no final result yet and are not counted: ${want.notFinal.join(', ')}.`);
    // The task ids the note names are the ones with no row in the table, and no table row's task is named.
    for (const id of want.notFinal) await expect(page.locator(`[data-testid="overview-row"][data-task="${id}"]`)).toHaveCount(0);
    for (const id of Object.keys(bandSummary.tasks)) {
      await expect(page.locator(`[data-testid="overview-row"][data-task="${id}"]`)).toHaveCount(1);
      expect(await note.textContent()).not.toContain(id);
    }
    await inViewport(page);
  });

  test(`${size.name}: with every task final, the line counts all six and there is no note`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await sample(page, './?view=overview');
    const want = expected(sampleSummary);
    const group = page.getByRole('group', { name: want.line });
    await expect(group).toBeVisible();
    await expect(group.getByTestId('band-count')).toHaveText(want.line);
    await expect(group.getByTestId('band-not-final')).toHaveCount(0);
    await inViewport(page);
  });
}

test('the Overview with the band line: axe finds nothing serious or critical, light and dark, at 390 px and desktop; screenshots with SHOTS_DIR', async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await band(page, './?view=overview');
      await expect(page.getByTestId('band-not-final')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(bad, `${scheme} ${size.name}`).toEqual([]);
      if (process.env.SHOTS_DIR) {
        mkdirSync(process.env.SHOTS_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.SHOTS_DIR, `overview-band-${size.width}x${size.height}-${scheme}.png`), fullPage: true });
        await page.getByTestId('band-line').screenshot({ path: join(process.env.SHOTS_DIR, `band-line-${size.width}x${size.height}-${scheme}.png`) });
      }
    }
  }
});
