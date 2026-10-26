// What this is and how to run it (pre-audit S6, P17j JU5): Overview opens with a short card in
// plain words (what the model does, what the world is, what one trial is, how a pass is decided),
// each sentence 25 words or fewer, with two actions: add a key and run in this tab (the key
// gate), and run on your computer (the local-run panel, on the hosted site). The key gate says in
// one sentence under the product name what the product is. On Tasks, Run trial is enabled and
// opens the Live trial view with the task selected.
import { expect, test, type Page } from '@playwright/test';
import { MODEL } from '../../../packages/core/anthropic.ts';
import { sampleBase } from './fixtures/sample-results/sample.ts';

async function openApp(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
}

async function browse(page: Page, path: string) {
  await openApp(page, path);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  if (await gate.isVisible()) await gate.click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

const sentences = (text: string) => text.trim().split(/(?<=\.)\s+/).filter((s) => s !== '');
const words = (s: string) => s.split(/\s+/).filter((w) => w !== '').length;

test('Overview opens with a plain intro card: 3-4 sentences of 25 words or fewer, naming the model', async ({ page }) => {
  await browse(page, './?view=overview');
  const card = page.getByTestId('intro-card');
  await expect(card).toBeVisible();
  const text = await card.getByTestId('intro-text').innerText();
  const all = sentences(text);
  expect(all.length).toBeGreaterThanOrEqual(3);
  expect(all.length).toBeLessThanOrEqual(4);
  for (const s of all) expect(words(s), s).toBeLessThanOrEqual(25);
  expect(text).toContain(MODEL);
});

test('the intro card action "Add a key and run in this tab" opens the key gate', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByTestId('intro-card').getByRole('button', { name: 'Add a key and run in this tab' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add an API key' })).toBeVisible();
});

test('the intro card action "Run on your computer" moves focus to the local-run panel', async ({ page }) => {
  await browse(page, './?view=overview');
  await page.getByTestId('intro-card').getByRole('button', { name: 'Run on your computer' }).click();
  await expect(page.getByTestId('local-run-panel')).toBeFocused();
});

test('the key gate says under the product name, in one sentence of 25 words or fewer, what the product is', async ({ page }) => {
  await openApp(page, './');
  const line = page.getByTestId('gate-intro');
  await expect(line).toBeVisible();
  const text = await line.innerText();
  expect(sentences(text)).toHaveLength(1);
  expect(words(text)).toBeLessThanOrEqual(25);
});

test('Tasks: Run trial is enabled and opens Live trial with the task selected', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review');
  const run = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]').getByTestId('task-panel-prompt').getByRole('button', { name: 'Run trial' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page).toHaveURL(/[?&]view=live(&|$)/);
  await expect(page).toHaveURL(/[?&]task=renal-dose-review(&|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live trial');
  await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('renal-dose-review');
});

test('Tasks: a closed card\'s Run trial also opens Live trial with its task', async ({ page }) => {
  await browse(page, './?view=tasks');
  await page.locator('[data-testid="validation"][data-task="crc-care-gap"]').getByRole('button', { name: 'Run trial' }).click();
  await expect(page).toHaveURL(/[?&]view=live(&|$)/);
  await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('crc-care-gap');
});
