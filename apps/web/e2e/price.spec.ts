// Price wording on the Live trial launcher (pre-audit S13, P17j JU6; P25u A7): beside each Run ×n
// button the typical cost of one trial comes first, from the committed pilot that holds the task,
// then what the batch holds ("holds up to $X", an upper bound); with no pilot only the hold shows
// and a line says why; with no key, "Add key" is a button there that opens the key gate.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { trialBase } from './fixtures/trial/trial.ts';
import { RUN_SIZES } from '../src/live/types.ts';

const browse = browseFrom(trialBase);

test('every Run ×n amount leads with the typical cost and reads "holds up to $X"', async ({ page }) => {
  await browse(page, './?view=live&task=renal-dose-review');
  // pilot-pass holds one renal-dose-review trial at $0.88 agent cost and $0 judge cost.
  for (const n of RUN_SIZES) await expect(page.getByTestId(`run-cost-${n}`)).toHaveText(/^about \$0\.88 a trial \(pilot median\) · holds up to \$\d+\.\d{2}$/);
});

test('the line under the buttons says where the typical cost comes from', async ({ page }) => {
  await browse(page, './?view=live&task=renal-dose-review');
  await expect(page.getByTestId('typical-cost')).toHaveText('“About $0.88 a trial (pilot median)” is the median agent and judge cost of 1 trial of this task in pilot-pass. A batch holds its full amount until its trials end.');
});

test('with no pilot trial of the task, only the hold shows, and a line says there is no typical cost yet', async ({ page }) => {
  await browse(page, './?view=live&task=crc-care-gap');
  await expect(page.getByTestId('run-cost-1')).toHaveText(/^holds up to \$\d+\.\d{2}$/);
  await expect(page.getByTestId('typical-cost')).toHaveCount(0);
  await expect(page.getByTestId('no-typical')).toHaveText('No pilot has run this task, so there is no typical cost yet. A batch holds its full amount until its trials end.');
});

// Claim audit (verifier-1 addendum 2, must-fix 3): while the published results load, the line said
// "No pilot has run this task" for a task that pilots ran. It says the cost is loading until the
// load completes, and the typical cost replaces it when it does.
test('while the published results load, the line says the typical cost is loading, never that no pilot ran', async ({ page }) => {
  let release = (): void => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/data/index.json', async (route) => {
    await held;
    await route.continue();
  });
  await browse(page, './?view=live&task=renal-dose-review');
  await expect(page.getByTestId('typical-loading')).toHaveText('Loading the typical cost from the pilot runs… A batch holds its full amount until its trials end.');
  await expect(page.getByTestId('no-typical')).toHaveCount(0);
  release();
  await expect(page.getByTestId('typical-cost')).toContainText('in pilot-pass');
  await expect(page.getByTestId('typical-loading')).toHaveCount(0);
  await expect(page.getByTestId('no-typical')).toHaveCount(0);
});

test('with no key, "Add key" on the launcher is a button that opens the key gate', async ({ page }) => {
  await browse(page, './?view=live');
  await page.getByTestId('launcher-reason').getByRole('button', { name: 'Add key' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'See an AI model do clinical tasks' })).toBeVisible();
  // P25u J11: the key form sits under its own heading; "Add an API key" is the field's label.
  await expect(page.getByRole('heading', { level: 2, name: 'Run new trials (needs an API key)' })).toBeVisible();
  await expect(page.getByLabel('Add an API key', { exact: true })).toBeVisible();
});

test('Live trial with no key: axe finds no serious or critical violation and nothing scrolls sideways, light and dark, 1440 and 390 (verifier JU6-1 F1)', async ({ page }) => {
  test.setTimeout(120_000);
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await browse(page, './?view=live&task=renal-dose-review');
      await expect(page.getByTestId('run-cost-20')).toHaveText(/holds up to \$/);
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(bad, `${width} ${scheme}`).toEqual([]);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `${width} ${scheme}`).toBeLessThanOrEqual(cw);
    }
  }
});
