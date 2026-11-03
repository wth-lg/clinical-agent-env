// The Overview band line (ui-contract P14, pre-audit F1, trace W1-W3, U21, U26): `<k> of <n> tasks
// in band`, k and n counted from the official run's summary.json band verdicts (never a constant),
// a final result being FINAL_TRIALS_PER_TASK (20) valid trials, the line as the accessible name of
// its group, and a note naming the tasks with no final result yet. On the band fixture (three tasks
// of 20 trials: In band, Above band, Saturated) the line reads 1 of 3 and the note names the other
// three tasks of the environment; on the sample run (six tasks of 12 trials, so none final) it
// reads 0 of 0 and the note names all six as in progress with their counts. At 375 px and on the
// desktop the line is inside the viewport with no sideways scroll; axe finds nothing serious or
// critical, light and dark. With SHOTS_DIR set, the Overview is screenshotted in both themes at
// both widths.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FINAL_TRIALS_PER_TASK } from '../../../packages/core/cost.ts';
import type { Summary } from '../../../packages/core/summary.ts';
import { browseFrom } from './browse.ts';
import { bandBase, summary as bandSummary } from './fixtures/band-verdict/band.ts';
import { sampleBase, summary as sampleSummary } from './fixtures/sample-results/sample.ts';

const band = browseFrom(bandBase);
const sample = browseFrom(sampleBase);
const SIZES = [{ name: '375 px', width: 375, height: 812 }, { name: 'desktop', width: 1280, height: 900 }] as const;
// The environment's tasks, as the Overview lists them (apps/web/src/data/tasks.ts): the task
// directories, _-prefixed ones left out.
const TASKS = readdirSync(join(import.meta.dirname, '../../../tasks'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);

// The line and the note the summary calls for, counted here, apart from the UI's own code: a task
// is final at FINAL_TRIALS_PER_TASK valid trials with a verdict; the note names the rest, an
// in-progress task with its count.
function expected(s: Summary) {
  const isFinal = (id: string) => s.tasks[id] !== undefined && s.tasks[id].band_verdict !== null && s.tasks[id].trials >= FINAL_TRIALS_PER_TASK;
  const final = Object.keys(s.tasks).filter(isFinal);
  const k = final.filter((id) => s.tasks[id]!.band_verdict === 'In band').length;
  const notFinal = TASKS.filter((id) => !isFinal(id));
  const named = notFinal.map((id) => (s.tasks[id] === undefined ? id : `${id} (in progress, ${s.tasks[id].trials} of ${FINAL_TRIALS_PER_TASK} valid trials)`));
  const counts = new Set(notFinal.map((id) => s.tasks[id]?.trials ?? null));
  // One line when every task of the environment is in progress at one count (the sample run).
  const note = notFinal.length === 0 ? null
    : final.length === 0 && counts.size === 1 && !counts.has(null) ? `All six tasks are in progress: ${[...counts][0]} of ${FINAL_TRIALS_PER_TASK} valid trials each.`
      : `${notFinal.length} tasks have no final result yet and are not counted: ${named.join(', ')}.`;
  return { line: `${k} of ${final.length} tasks in band`, notFinal, note };
}

test('the fixtures: the band run has a task out of band and tasks with no record; the sample run has six tasks of 12 trials, none final', () => {
  expect(expected(bandSummary)).toMatchObject({ line: '1 of 3 tasks in band', notFinal: ['crc-care-gap', 'renal-dose-review', 'results-inbox'] });
  expect(expected(sampleSummary)).toMatchObject({ line: '0 of 0 tasks in band', notFinal: TASKS, note: 'All six tasks are in progress: 12 of 20 valid trials each.' });
  expect(expected(bandSummary).note).toBe('3 tasks have no final result yet and are not counted: crc-care-gap, renal-dose-review, results-inbox.');
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
    await expect(group).toContainText('1 of the 3 tasks with a final result (20 valid trials) has a pass rate from 20% to 70%, both included.');
    const note = group.getByTestId('band-not-final');
    await expect(note).toHaveText(want.note!);
    // The task ids the note names are the ones with no row in the table, and no table row's task is named.
    for (const id of want.notFinal) await expect(page.locator(`[data-testid="overview-row"][data-task="${id}"]`)).toHaveCount(0);
    for (const [id, t] of Object.entries(bandSummary.tasks)) {
      await expect(page.locator(`[data-testid="overview-row"][data-task="${id}"]`)).toHaveCount(1);
      expect(await note.textContent()).not.toContain(id);
      const v = page.locator(`[data-testid="overview-row"][data-task="${id}"] [data-testid="band-verdict"]`);
      await expect(v).toHaveText(t.band_verdict!);
      await expect(v).toHaveAttribute('data-provisional', 'false');
    }
    await inViewport(page);
  });

  test(`${size.name}: a run of 12 trials per task is in progress: 0 of 0, every task named with its count, none counted`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await sample(page, './?view=overview');
    const want = expected(sampleSummary);
    const group = page.getByRole('group', { name: want.line });
    await expect(group).toBeVisible();
    await expect(group.getByTestId('band-count')).toHaveText(want.line);
    await expect(group).toHaveAttribute('data-final', '0');
    await expect(group).toContainText('No task has a final result yet: a final result is 20 valid trials.');
    await expect(group.getByTestId('band-not-final')).toHaveText(want.note!);
    // Each row's verdict says it is provisional, with the count, so it cannot read against the line.
    for (const [id, t] of Object.entries(sampleSummary.tasks)) {
      const v = page.locator(`[data-testid="overview-row"][data-task="${id}"] [data-testid="band-verdict"]`);
      await expect(v).toHaveText(`${t.band_verdict}, provisional (${t.trials} of ${FINAL_TRIALS_PER_TASK} valid trials)`);
      await expect(v).toHaveAttribute('data-provisional', 'true');
      const box = (await v.boundingBox())!;
      expect(box.x + box.width, `${id} verdict ends inside the viewport`).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await inViewport(page);
  });
}

test('the Overview with the band line, on the band run and the zero-final sample run: axe finds nothing serious or critical, light and dark, at 375 px and desktop; screenshots with SHOTS_DIR', async ({ page }) => {
  test.setTimeout(240_000);
  for (const [name, open] of [['band', band], ['zero-final', sample]] as const) {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, './?view=overview');
        await expect(page.getByTestId('band-not-final')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        expect(bad, `${name} ${scheme} ${size.name}`).toEqual([]);
        if (process.env.SHOTS_DIR) {
          mkdirSync(process.env.SHOTS_DIR, { recursive: true });
          await page.screenshot({ path: join(process.env.SHOTS_DIR, `overview-${name}-${size.width}x${size.height}-${scheme}.png`), fullPage: true });
          await page.getByTestId('band-line').screenshot({ path: join(process.env.SHOTS_DIR, `band-line-${name}-${size.width}x${size.height}-${scheme}.png`) });
        }
      }
    }
  }
});
