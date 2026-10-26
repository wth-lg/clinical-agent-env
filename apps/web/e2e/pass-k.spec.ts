// pass^k and the model on screen (plan P17j JU8, pre-audit S8 and M1): Overview and Findings show
// pass^3 and pass^5 per task, equal to summary.json's pass_k, with a glossary entry the column links
// to; both pages name the model and effort of the run's trials from summary.json.
import { expect, test, type Page } from '@playwright/test';
import { sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

const value = (v: number | null) => (v === null ? '' : String(v));

for (const view of ['overview', 'findings'] as const) {
  test(`${view}: pass^3 and pass^5 per task equal summary.json, and the model and effort line`, async ({ page }) => {
    await browse(page, `./?view=${view}`);
    for (const id of TASK_IDS) {
      const k = summary.tasks[id]!.pass_k;
      const row = page.locator(`[data-testid="pass-k"][data-task="${id}"]`);
      await expect(row.locator('[data-k="3"]')).toHaveAttribute('data-value', value(k['3']));
      await expect(row.locator('[data-k="5"]')).toHaveAttribute('data-value', value(k['5']));
    }
    await expect(page.getByTestId('model-line')).toHaveText(`Model ${summary.model}, effort ${summary.effort}`);
  });
}

test('the glossary explains pass^k, and the Overview column links to it', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByRole('link', { name: 'What pass^k means' }).click();
  await expect(page).toHaveURL(/view=glossary.*#pass-k$/);
  await expect(page.locator('#pass-k')).toContainText('all pass');
});
