// eval-p25u-2 MF-2: on final-1 crc-care-gap/5 the decisive step, in the header's Where and on the
// Attribution tab, is the step of the failing item of the decisive check (pt-0024's FIT order,
// ServiceRequest/sr-t0002 at step 82), not the grader's last write to the check's ids (step 102,
// pt-0009's order, an item that passed). The link scrolls to step 82, the order the Grading tab's
// failing item cites.
import { expect, test } from '@playwright/test';
import { browse } from './browse.ts';

test('crc-care-gap/5: the decisive step is the failing item\'s step 82 in the header and on Attribution', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await browse(page, './?view=runs&run=final-1&trial=crc-care-gap%2F5');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  const header = page.getByTestId('trial-header').getByTestId('decisive-step-link');
  await expect(header).toHaveText('Decisive step 82');
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await expect(page.getByTestId('panel-attribution').getByTestId('decisive-step-link')).toHaveText('Decisive step 82');
  await header.click();
  const target = page.locator('#step-82');
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute('aria-current', 'step');
  await expect(target).toContainText('pt-0024');
  await expect(target).toContainText('sr-t0002');
  // The Grading tab's failing item cites the same order at the same step.
  await page.getByRole('tab', { name: 'Grading' }).click();
  await expect(page.getByTestId('panel-grading').locator('[data-testid="gate-check"][data-id="fit_orders"]')).toContainText('step 82');
});
