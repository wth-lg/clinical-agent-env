// A results fetch that fails (eval-p25u-1 defect 5, rubric C12): every view that reads the
// published results says in plain words what did not load and what to do, keeps the raw message
// behind Show details, and has a Retry button that runs the load again in place, so Runs is never a
// dead end. The fetch of data/index.json is aborted until Retry. Tasks, the Live trial and the key
// gate show results-derived figures (verifier-phase-P25u-final-copy-1 claim 4): with the fetch
// blocked they say the results did not load instead of dropping the figures or saying "no run".
import { expect, test } from '@playwright/test';
import { browse } from './browse.ts';

const VIEWS = [
  { name: 'Overview', path: './', error: 'error-state', loaded: 'takeaway' },
  { name: 'Tasks', path: './?view=tasks', error: 'error-state', loaded: 'task-rate' },
  { name: 'Runs', path: './?view=runs', error: 'error-state', loaded: 'runs-fault-summary' },
  { name: 'Findings', path: './?view=findings', error: 'error-state', loaded: 'why-fail' },
  { name: 'a published trial', path: './?view=runs&trial=first-nonpass', error: 'error-state', loaded: 'trial-header' },
  { name: 'Environment (frozen worlds)', path: './?view=environment', error: 'frozen-worlds-error', loaded: 'frozen-worlds' },
];

for (const v of VIEWS) {
  test(`${v.name}: a blocked results fetch says what failed and what to do, and Retry loads the view`, async ({ page }) => {
    let blocked = true;
    await page.route('**/data/index.json', (route) => (blocked ? route.abort() : route.continue()));
    await browse(page, v.path);
    const err = page.getByTestId(v.error);
    await expect(err).toContainText('The published results did not load');
    await expect(err).toContainText('Check your connection, then press Retry.');
    // The raw browser message is behind a disclosure, not the lead.
    await expect(err.getByTestId('error-detail')).toBeHidden();
    await err.getByText('Show details').click();
    await expect(err.getByTestId('error-detail')).toContainText('Failed to fetch');
    blocked = false;
    await err.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId(v.loaded).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(v.error)).toHaveCount(0);
  });
}

test('Tasks: with the results blocked, Replay published trials says the results did not load, never "No official run"; after Retry the rates show', async ({ page }) => {
  let blocked = true;
  await page.route('**/data/index.json', (route) => (blocked ? route.abort() : route.continue()));
  await browse(page, './?view=tasks');
  await expect(page.getByTestId('error-state')).toContainText('The published results did not load');
  await expect(page.getByTestId('task-rate-line')).toHaveCount(0);
  const card = page.getByTestId('task-list').locator('li').first();
  await card.getByRole('button', { name: 'Replay published trials' }).click();
  const replay = card.getByTestId('replay-results-error');
  await expect(replay).toContainText('The published results did not load');
  await expect(replay).toContainText('press Retry, then Replay published trials again');
  await expect(card).not.toContainText('No official run is published');
  blocked = false;
  await replay.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('task-rate').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('error-state')).toHaveCount(0);
  await expect(page.getByTestId('replay-results-error')).toHaveCount(0);
  await expect(card).not.toContainText('No official run is published');
});

test('Live trial: with the results blocked, a short line says the typical cost and duration did not load, not "no pilot has run this task"', async ({ page }) => {
  let blocked = true;
  await page.route('**/data/index.json', (route) => (blocked ? route.abort() : route.continue()));
  await browse(page, './?view=live&task=renal-dose-review');
  const line = page.getByTestId('results-failed');
  await expect(line).toContainText('The published results did not load');
  await expect(page.getByTestId('no-typical')).toHaveCount(0);
  blocked = false;
  await line.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('typical-cost').or(page.getByTestId('no-typical'))).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('results-failed')).toHaveCount(0);
});

test('key gate: with the results blocked, the pass line says the results did not load instead of a bare welcome', async ({ page }) => {
  await page.route('**/data/index.json', (route) => route.abort());
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Browse the results' })).toBeVisible();
  await expect(page.getByTestId('gate-pass-line')).toContainText('The published results did not load');
});
