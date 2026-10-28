// The in-browser replay compares tool results as the CLI does (P17j JU13, run-log follow-up C7 S1):
// cli replay grades each trial again with compareResults (packages/core/run.ts gradeTrajectory),
// so a re-executed call whose result differs from the recorded tool_result ends the replay with
// "a different result" naming the call, even when the state hashes agree. A planted difference in
// a published trajectory must end the browser's replay the same way. The Tasks route with the
// mismatch row passes axe in light and dark and does not scroll sideways at 390 px
// (verifier-phase-P17j-retro-JU13-1 D1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { sampleBase, summary } from './fixtures/sample-results/sample.ts';

const TRIAL = 'renal-dose-review/0';

const browse = browseFrom(sampleBase);

test('a planted tool-result difference ends the browser replay with the call that does not replay', async ({ page }) => {
  test.setTimeout(300_000);
  // A read's recorded result changes (search_patients total 1 -> 2); the store, and so every state
  // hash, stays the same, so only the result comparison can catch it.
  await page.route(`**/data/results/runs/${summary.run_id}/trajectories/${TRIAL}.jsonl`, async (route) => {
    const res = await route.fetch();
    let planted = false;
    const lines = (await res.text()).split('\n').map((l) => {
      if (planted || l.trim() === '') return l;
      const e = JSON.parse(l) as { type?: string; name?: string; content?: { total?: number } };
      if (e.type !== 'tool_result' || e.name !== 'search_patients' || typeof e.content?.total !== 'number') return l;
      planted = true;
      return JSON.stringify({ ...e, content: { ...e.content, total: e.content.total + 1 } });
    });
    await route.fulfill({ response: res, body: lines.join('\n') });
  });
  await browse(page, './?view=tasks');
  const v = page.locator('[data-testid="validation"][data-task="renal-dose-review"]');
  await v.getByRole('button', { name: 'Replay published trials' }).click();
  const row = v.locator(`[data-testid="replay-row"][data-trial="${TRIAL}"]`);
  await expect(row).toHaveAttribute('data-match', 'false', { timeout: 240_000 });
  await expect(row).toContainText('a different result');
  await expect(row).toContainText('search_patients');
  // A trajectory left as published still reproduces.
  await expect(v.locator('[data-testid="replay-row"][data-trial="renal-dose-review/1"]')).toHaveAttribute('data-match', 'true');
  // The same page, mismatch row on screen: no reload, so the replay result stays.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(row).toBeVisible();
    const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => x.id);
    expect(bad, scheme).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  const [doc, main] = await page.evaluate(() => [document.documentElement, document.querySelector('main')!].map((el) => ({ sw: el.scrollWidth, cw: el.clientWidth })));
  expect(doc!.sw, 'document').toBeLessThanOrEqual(doc!.cw);
  expect(main!.sw, 'main').toBeLessThanOrEqual(main!.cw);
});
