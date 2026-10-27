// Fault tone (pre-audit S5 and M15, P17j JU2): an environment or grader fault is a trial the run
// cannot count, so its outcome chip and its label take the danger colour (the mark keeps its
// pattern, so the meaning does not rest on colour); the pilot's grader error says it is a grader bug
// fixed before the final run, and an environment error "Not counted; it is run again." (decisions.tsv
// 2026-10-29T17:30 and 19:10); a model fault stays neutral; the FAIL mark stays readable in dark
// mode (at least 3:1 against its card).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { runOf, trialBase, TRIALS } from './fixtures/trial/trial.ts';

async function openTrial(page: Page, name: string) {
  await page.goto(new URL(`./?view=runs&run=${runOf(name)}&trial=${encodeURIComponent(name)}`, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
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
  for (const [what, name] of [['environment', TRIALS.envError], ['grader', TRIALS.graderError]] as const) {
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
      await expect(header.getByTestId('fault-note')).toHaveText(what === 'grader' ? /^(Not counted\. )?A grader bug; it is fixed and regraded before the final run\.$/ : /^(Not counted; i|I)t is run again\.$/);
      await expect(header.getByTestId('fault-note')).not.toContainText('run is blocked');
      expect((await header.innerText()).match(/Not counted/g)?.length ?? 0).toBeLessThanOrEqual(1);
      // The header's left accent is the danger colour only for a trial that blocks the official run.
      expect(await rgb(page, await header.evaluate((el) => getComputedStyle(el).borderLeftColor))).not.toEqual(want);
    });
  }

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

test('dark: the FAIL mark is at least 3:1 against its card', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openTrial(page, TRIALS.failAudited);
  const header = page.getByTestId('trial-header');
  const mark = await rgb(page, await style(header.getByTestId('outcome').locator('span').first(), 'backgroundColor'));
  const card = await rgb(page, await style(header, 'backgroundColor'));
  expect(contrast(mark, card)).toBeGreaterThanOrEqual(3);
});
