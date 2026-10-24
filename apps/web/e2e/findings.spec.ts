// Findings against the committed sample run: docs/findings.md rendered, one Wilson interval per
// task, an outcomes bar per task whose totals equal summary.json, cost per trial, example trials,
// the glossary one click away and the full write-up link. Then a build with no results/
// (RESULTS_ROOT an empty directory), served by its own vite preview: every results view shows
// the empty state, and Tasks and Environment still render.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { sampleBase, serve, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

const WEB = fileURLToPath(new URL('../', import.meta.url));

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

test('Findings renders the markdown, one interval per task and outcome bars equal to summary.json', async ({ page }) => {
  await browse(page, './?view=findings');
  await expect(page.getByTestId('findings-md').getByRole('heading', { level: 1 })).toHaveText('Findings (sample run)');
  await expect(page.getByTestId('findings-md').locator('table tbody tr')).toHaveCount(TASK_IDS.length);
  await expect(page.getByText('These results are read-only. Running new trials needs an API key.')).toBeVisible();
  await expect(page.getByTestId('interval-chart').getByTestId('interval')).toHaveCount(TASK_IDS.length);
  await expect(page.getByTestId('interval-chart').getByTestId('whisker')).toHaveCount(TASK_IDS.length);
  const bars = page.getByTestId('taxonomy-bar');
  await expect(bars).toHaveCount(TASK_IDS.length);
  for (const id of TASK_IDS) {
    const t = summary.tasks[id]!;
    const bar = page.locator(`[data-testid="taxonomy-bar"][data-task="${id}"]`);
    await expect(bar).toHaveAttribute('data-total', String(t.records));
    const segments = await bar.locator('[data-outcome]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-outcome'), Number(e.getAttribute('data-count'))])));
    expect(segments).toEqual(t.outcomes);
  }
  await expect(page.getByTestId('cost-chart').locator('li')).toHaveCount(TASK_IDS.length);
  await expect(page.getByRole('link', { name: 'Full writeup' })).toHaveAttribute('href', /\/data\/writeup\.html$/);
  const example = page.getByTestId('exemplars').getByRole('link').first();
  const trial = await example.textContent();
  await example.click();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page.locator(`[data-testid="trial-row"][data-trial="${trial}"]`).getByTestId('trial-detail')).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'How failures are attributed' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How failures are attributed');
});

test.describe('a build with no results/', () => {
  let base = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const out = mkdtempSync(join(tmpdir(), 'clinenv-empty-build-'));
    const root = mkdtempSync(join(tmpdir(), 'clinenv-empty-root-'));
    const b = spawnSync(join(WEB, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: WEB, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: root } });
    if (b.status !== 0) throw new Error(`empty build failed: ${b.stdout}${b.stderr}`);
    base = await serve(out);
  });

  test('Overview, Runs and Findings show the empty state; Tasks and Environment still render', async ({ page }) => {
    await page.goto(`${base}?view=findings`);
    await page.getByRole('button', { name: 'Browse without a key' }).click();
    await expect(page.getByTestId('empty-state')).toHaveText(/No results are published yet\./);
    await expect(page.getByRole('link', { name: 'How failures are attributed' })).toBeVisible();
    const rail = page.getByRole('navigation', { name: 'Views' });
    for (const view of ['Overview', 'Runs']) {
      await rail.getByRole('link', { name: view }).click();
      await expect(page.getByTestId('empty-state')).toHaveText(/No results are published yet\./);
    }
    await rail.getByRole('link', { name: 'Tasks' }).click();
    await expect(page.getByTestId('task-card')).toHaveCount(TASK_IDS.length);
    await rail.getByRole('link', { name: 'Environment' }).click();
    await expect(page.getByTestId('tool').first()).toBeVisible();
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  });
});
