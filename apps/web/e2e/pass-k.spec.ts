// pass^k and the model on screen (plan P17j JU8, pre-audit S8 and M1): Overview and Findings show
// pass^3 and pass^5 per task, equal to summary.json's pass_k, with a glossary entry the column links
// to; both pages name the model and effort of the run's trials from summary.json. axe finds nothing
// serious or critical on Overview, Findings and Glossary, light and dark (verifier-phase-P17i-JU8-1 F1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

// The key gate shows on the first visit only: App.tsx remembers "Browse without a key" for the session.
async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
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
    // The visible text, not only data-value (F5): contrast-ct-prep's pass^3 is 0.004545, and 0 reads 0.0%.
    const contrast = page.locator('[data-testid="pass-k"][data-task="contrast-ct-prep"]');
    await expect(contrast.locator('[data-k="3"]')).toHaveText('pass^3 0.5%');
    await expect(contrast.locator('[data-k="5"]')).toHaveText('pass^5 0.0%');
    await expect(page.getByTestId('model-line')).toHaveText(`Model ${summary.model}, effort ${summary.effort}`);
  });
}

test('the glossary explains pass^k, and the Overview column links to it', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByRole('link', { name: 'What pass^k means' }).click();
  await expect(page).toHaveURL(/view=glossary.*#pass-k$/);
  await expect(page.locator('#pass-k')).toContainText('all pass');
});

test('Overview, Findings and Glossary with the sample run: axe finds nothing serious or critical, light and dark', async ({ page }) => {
  test.setTimeout(120_000);
  for (const view of ['overview', 'findings', 'glossary'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await browse(page, `./?view=${view}`);
      if (view !== 'glossary') await expect(page.getByTestId('pass-k').first()).toBeVisible();
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
      expect(bad, `${view} ${scheme}`).toEqual([]);
    }
  }
});
