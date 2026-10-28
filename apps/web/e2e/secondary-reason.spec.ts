// The secondary reason on screen (verifier-phase-P17i-SAFEPRECr2-1 F3): when an unmarked safety gate
// outranks the first failed gate, explainTrial names the first failed check as a secondary reason,
// and the Runs row and the trial header show it (data-testid secondary-reason) as explainTrial gives
// it. Sample crc-care-gap/8 is such a trial. crc-care-gap/9's reason is cut at a clause boundary
// (F1), not mid-clause.
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { explain, records, sampleBase } from './fixtures/sample-results/sample.ts';

const record = (name: string) => {
  const r = records.find((x) => `${x.task_id}/${x.index}` === name);
  if (!r) throw new Error(`the sample has no trial ${name}`);
  return r;
};

const browse = browseFrom(sampleBase);

test('crc-care-gap/8 shows its secondary reason on the Runs row and in the trial header', async ({ page }) => {
  const name = 'crc-care-gap/8';
  const secondary = explain(record(name)).secondary_reason;
  expect(secondary).toMatch(/^first failed check: fit_orders failed: expected /);
  await browse(page, './?view=runs');
  await expect(page.locator(`[data-testid="trial-row"][data-trial="${name}"]`).getByTestId('secondary-reason')).toHaveText(secondary!);
  await browse(page, `./?view=runs&trial=${encodeURIComponent(name)}`);
  await expect(page.getByTestId('trial-header').getByTestId('secondary-reason')).toHaveText(secondary!);
});

test('crc-care-gap/9: the secondary reason is cut at a clause boundary, not mid-clause', async ({ page }) => {
  const name = 'crc-care-gap/9';
  const secondary = explain(record(name)).secondary_reason!;
  expect(secondary).not.toMatch(/\bthe…/);
  expect(secondary).toContain('with a screening gap…, found ');
  await browse(page, `./?view=runs&trial=${encodeURIComponent(name)}`);
  await expect(page.getByTestId('trial-header').getByTestId('secondary-reason')).toHaveText(secondary);
});
