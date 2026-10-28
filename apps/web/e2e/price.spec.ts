// Price wording on the Live trial launcher (pre-audit S13, P17j JU6): every Run ×n amount is an
// upper bound and says "at most $X"; when a committed pilot holds the task, the typical cost of
// one trial (the pilot's median) shows next to them; with no key, "Add key" is a button there that
// opens the key gate.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { trialBase } from './fixtures/trial/trial.ts';
import { RUN_SIZES } from '../src/live/types.ts';

const browse = browseFrom(trialBase);

test('every Run ×n amount reads "at most $X"', async ({ page }) => {
  await browse(page, './?view=live&task=renal-dose-review');
  for (const n of RUN_SIZES) await expect(page.getByTestId(`run-cost-${n}`)).toHaveText(/^at most \$\d+\.\d{2}$/);
});

test('the typical cost from the committed pilot shows next to the amounts', async ({ page }) => {
  await browse(page, './?view=live&task=renal-dose-review');
  // pilot-pass holds one renal-dose-review trial at $0.88 agent cost and $0 judge cost.
  await expect(page.getByTestId('typical-cost')).toHaveText('Typical cost: $0.88 a trial (median of 1 trial of this task in pilot-pass).');
});

test('with no pilot trial of the task, no typical cost shows', async ({ page }) => {
  await browse(page, './?view=live&task=crc-care-gap');
  await expect(page.getByTestId('run-cost-1')).toHaveText(/^at most \$/);
  await expect(page.getByTestId('typical-cost')).toHaveCount(0);
});

test('with no key, "Add key" on the launcher is a button that opens the key gate', async ({ page }) => {
  await browse(page, './?view=live');
  await page.getByTestId('launcher-reason').getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add an API key' })).toBeVisible();
});

test('Live trial with no key: axe finds no serious or critical violation and nothing scrolls sideways, light and dark, 1440 and 390 (verifier JU6-1 F1)', async ({ page }) => {
  test.setTimeout(120_000);
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await browse(page, './?view=live&task=renal-dose-review');
      await expect(page.getByTestId('run-cost-20')).toHaveText(/^at most \$/);
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(bad, `${width} ${scheme}`).toEqual([]);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `${width} ${scheme}`).toBeLessThanOrEqual(cw);
    }
  }
});
