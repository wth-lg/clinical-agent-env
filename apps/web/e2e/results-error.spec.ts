// A results fetch that fails (eval-p25u-1 defect 5, rubric C12): every view that reads the
// published results says in plain words what did not load and what to do, keeps the raw message
// behind Show details, and has a Retry button that runs the load again in place, so Runs is never a
// dead end. The fetch of data/index.json is aborted until Retry.
import { expect, test } from '@playwright/test';
import { browse } from './browse.ts';

const VIEWS = [
  { name: 'Overview', path: './', error: 'error-state', loaded: 'takeaway' },
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
    await expect(page.getByTestId(v.loaded)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(v.error)).toHaveCount(0);
  });
}
