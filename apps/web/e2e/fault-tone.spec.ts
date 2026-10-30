// Fault tone (pre-audit S5 and M15, P17j JU2): an environment or grader fault is a trial the run
// cannot count, so its outcome chip and its label take the danger colour (the mark keeps its
// pattern, so the meaning does not rest on colour); the pilot's grader error says it is a grader bug
// fixed before the final run, and an environment error "Not counted; it is run again." (decisions.tsv
// 2026-10-29T17:30 and 19:10); a model fault stays neutral; the FAIL mark stays readable in dark
// mode (at least 3:1 against its card). An ENV_LIMIT (plan-amendment-worklist W0-A) is the
// environment's too, but it is not run again: its note gives NOT_RERUN_REASON's reason, on the
// trial page and in Runs, never "it is run again", and the plain rules list it under "not run
// again" with that reason.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { NOT_RERUN_REASON } from '../../../packages/core/outcomes.ts';
import { browse } from './browse.ts';
import { explain, RUN_ID, runOf, trialBase, TRIALS } from './fixtures/trial/trial.ts';

async function openTrial(page: Page, name: string) {
  await browse(page, new URL(`./?view=runs&run=${runOf(name)}&trial=${encodeURIComponent(name)}`, await trialBase(test.info().project.use.baseURL!)).href);
  await expect(page.getByTestId('trial-header')).toBeVisible();
}

// A CSS colour as [r, g, b], read back from a canvas pixel (computed styles may be oklch).
async function rgb(page: Page, css: string): Promise<[number, number, number]> {
  return page.evaluate((c) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!] as [number, number, number];
  }, css);
}
const danger = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim());
const style = (l: Locator, prop: 'borderTopColor' | 'color' | 'backgroundColor') => l.evaluate((el, p) => getComputedStyle(el)[p as 'color'], prop);
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [what, name] of [['environment', TRIALS.envError], ['environment limit', TRIALS.envLimit], ['grader', TRIALS.graderError]] as const) {
    test(`${scheme}: an ${what} fault's chip and label take the danger colour, with the note`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openTrial(page, name);
      const header = page.getByTestId('trial-header');
      const want = await rgb(page, await danger(page));
      expect(await rgb(page, await style(header.getByTestId('outcome'), 'borderTopColor'))).toEqual(want);
      const label = header.getByTestId('label');
      await expect(label).toHaveCount(1);
      expect(await rgb(page, await style(label, 'color'))).toEqual(want);
      // One "Not counted" sentence on the header: the note says only the rest when the reason says it (F3).
      // The GRADER_ERROR exemplar is in a pilot run, which nothing blocks: its note says it is a grader
      // bug fixed before the final run; an ENV_ERROR is run again (decisions.tsv 2026-10-29T17:30, 19:10).
      const note = header.getByTestId('fault-note');
      if (what === 'grader') await expect(note).toHaveText(/^(Not counted\. )?A grader bug; it is fixed and regraded before the final run\.$/);
      else if (what === 'environment') await expect(note).toHaveText(/^(Not counted; i|I)t is run again\.$/);
      else {
        // The header's plain reason says "Not counted", so the note gives only the rest (F3).
        await expect(note).toHaveText(`It is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
        await expect(header).not.toContainText('it is run again');
        await expect(header).not.toContainText('It is run again');
      }
      await expect(header.getByTestId('fault-note')).not.toContainText('run is blocked');
      expect((await header.innerText()).match(/Not counted/g)?.length ?? 0).toBeLessThanOrEqual(1);
      // The header's left accent is the danger colour only for a trial that blocks the official run.
      expect(await rgb(page, await header.evaluate((el) => getComputedStyle(el).borderLeftColor))).not.toEqual(want);
    });
  }

  test(`${scheme}: an ENV_LIMIT says why it counts against the environment: E8 and the P-L facts on the trial page, the reason in Runs`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const e = await explain(TRIALS.envLimit);
    expect(e).toMatchObject({ outcome: 'ENV_LIMIT', fault: 'env', deciding: { id: 'E8' } });
    await openTrial(page, TRIALS.envLimit);
    const header = page.getByTestId('trial-header');
    await expect(header.getByTestId('plain-reason')).toHaveText('Not counted: the trial stopped at a turn, cost or working-time limit while it was still making progress (rule P-L), so the limit the harness set was too small for the task. The environment is at fault, not the model.');
    await expect(header.getByTestId('detail-fault')).toContainText(e.deciding!.evidence);
    await expect(header.getByTestId('detail-fault')).toContainText(/last \d+ calls?: \d+ repeats? \(share \d\.\d\d\), \d+ new ids?; progressing/);
    // In Runs, the row gives the same label, note and reason.
    await browse(page, new URL(`./?view=runs&run=${RUN_ID}`, await trialBase(test.info().project.use.baseURL!)).href);
    const row = page.locator(`[data-testid="trial-row"][data-trial="${TRIALS.envLimit}"]`);
    await expect(row.getByTestId('label')).toHaveText('environment');
    await expect(row.getByTestId('fault-note')).toHaveText(`Not counted; it is not run again: ${NOT_RERUN_REASON.ENV_LIMIT}.`);
    await expect(row.getByTestId('reason')).toHaveText(e.reason);
    await expect(row).not.toContainText('it is run again');
  });

  test(`${scheme}: a model fault stays neutral and has no note`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openTrial(page, TRIALS.failAudited);
    const header = page.getByTestId('trial-header');
    const want = await rgb(page, await danger(page));
    expect(await rgb(page, await style(header.getByTestId('label'), 'color'))).not.toEqual(want);
    expect(await rgb(page, await style(header.getByTestId('outcome'), 'borderTopColor'))).not.toEqual(want);
    await expect(header.getByTestId('fault-note')).toHaveCount(0);
    // A model fault's header accent is neutral, not the danger colour (F3).
    expect(await rgb(page, await header.evaluate((el) => getComputedStyle(el).borderLeftColor))).not.toEqual(want);
  });
}

test('the plain rules list ENV_LIMIT and GRADER_ERROR under "not run again", each with its reason', async ({ page }) => {
  await browse(page, new URL('./?view=glossary', await trialBase(test.info().project.use.baseURL!)).href);
  const line = page.getByTestId('not-counted-rule').first();
  await expect(line).toContainText(`ENV_LIMIT (not run again: ${NOT_RERUN_REASON.ENV_LIMIT})`);
  await expect(line).toContainText(`GRADER_ERROR (not run again: ${NOT_RERUN_REASON.GRADER_ERROR})`);
  await expect(line).toContainText('ENV_ERROR (run again)');
});

test('dark: the FAIL mark is at least 3:1 against its card', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openTrial(page, TRIALS.failAudited);
  const header = page.getByTestId('trial-header');
  const mark = await rgb(page, await style(header.getByTestId('outcome').locator('span').first(), 'backgroundColor'));
  const card = await rgb(page, await style(header, 'backgroundColor'));
  expect(contrast(mark, card)).toBeGreaterThanOrEqual(3);
});
