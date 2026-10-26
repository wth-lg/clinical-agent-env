// Price wording on the Live trial launcher (pre-audit S13, P17j JU6): every Run ×n amount is an
// upper bound and says "at most $X"; when a committed pilot holds the task, the typical cost of
// one trial (the pilot's median) shows next to them; with no key, "Add key" is a button there that
// opens the key gate.
import { expect, test, type Page } from '@playwright/test';
import { trialBase } from './fixtures/trial/trial.ts';
import { RUN_SIZES } from '../src/live/types.ts';

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

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
