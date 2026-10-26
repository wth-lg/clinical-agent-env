// Tasks polish (pre-audit U10, P17j JU12 part 2): a task card's title drops its policy codes, which
// sit on the meta line; "Check the grader" shows "case k of N" while the grader validation matrix runs.
import { expect, test, type Page } from '@playwright/test';
import { sampleBase } from './fixtures/sample-results/sample.ts';

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

test('a task title without its policy code, the code on the meta line', async ({ page }) => {
  await browse(page, './?view=tasks');
  const card = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]');
  await expect(card.getByTestId('task-title')).toHaveText('Renal and age dose review of Harold Vance');
  await expect(card.getByTestId('task-codes')).toHaveText('RBC-PHARM-07');
  // A title whose "under ..." names no policy keeps its words.
  await expect(page.locator('[data-testid="task-card"][data-task="message-queue"]').getByTestId('task-title')).toContainText('under the standing protocols');
});

test('Check the grader shows "case k of N" while the matrix runs', async ({ page }) => {
  test.setTimeout(600_000);
  await browse(page, './?view=tasks');
  const v = page.locator('[data-testid="validation"][data-task="renal-dose-review"]');
  await v.getByRole('button', { name: 'Check the grader' }).click();
  await expect(v.getByTestId('run-progress')).toHaveText(/Running the grader check in this tab… case \d+ of \d+$/, { timeout: 120_000 });
  await expect(v.getByTestId('matrix-result')).toBeVisible({ timeout: 540_000 });
});
