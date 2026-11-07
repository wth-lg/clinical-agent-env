// Runs polish (P25u slice S2: J9, J10, V2b, V4, V6a). A trial row's name is a real link, so a
// modified click opens the trial in a new tab and the list stays; a non-pass row carries a heavy
// ink edge, so the "PASS with harm" chips are not the loudest rows; the "What the labels mean"
// link is underlined like every other link; the count line leads with the official trials and
// names the pilot and superseded ones as not counted; each pilot and superseded run starts closed,
// its header the summary, and opens on a filter; on a coarse pointer the "Same reason as" summary
// is a tap target.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { trialName } from '../../../packages/core/summary.ts';
import { browseFrom } from './browse.ts';
import { explain, records, sampleBase, summary } from './fixtures/sample-results/sample.ts';
import { PILOT_ERROR_ID, records as trialRecords, ROOT, RUN_ID, trialBase, type TrialFixture } from './fixtures/trial/trial.ts';

const sample = browseFrom(sampleBase);
const trial = browseFrom(trialBase);

const colorOf = (page: Page, className: string) => page.evaluate((c) => {
  const x = document.createElement('span');
  x.className = c;
  document.body.append(x);
  const v = getComputedStyle(x).color;
  x.remove();
  return v;
}, className);

const firstFail = records.find((r) => r.outcome === 'FAIL')!;

test('a trial row\'s name is a link: a plain click opens the trial in place, a modified click opens it in a new tab and keeps the list (J10)', async ({ page, context }) => {
  await sample(page, './?view=runs');
  const name = trialName(firstFail);
  const row = page.locator(`[data-testid="trial-row"][data-trial="${name}"]`);
  const link = row.getByRole('link', { name, exact: true });
  await expect(link).toHaveAttribute('href', new RegExp(`[?&]trial=${encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(&|$)`));
  await expect(link).toHaveAttribute('href', new RegExp(`[?&]run=${summary.run_id}(&|$)`));
  await expect(row.getByRole('button', { name, exact: true })).toHaveCount(0);
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })]);
  await expect(popup).toHaveURL(new RegExp(`[?&]trial=${encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(&|$)`));
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
  await popup.close();
  await link.click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
  // Back to Runs returns to that link, focused.
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  await expect(row.getByRole('link', { name, exact: true })).toBeFocused();
});

test('a non-pass row has a 2px ink edge on its left, a plain PASS row none (V2b)', async ({ page }) => {
  await sample(page, './?view=runs');
  const ink = await colorOf(page, 'text-ink');
  const fail = page.locator('[data-testid="trial-row"][data-outcome="FAIL"]').first();
  await expect(fail).toHaveCSS('border-left-width', '2px');
  await expect(fail).toHaveCSS('border-left-color', ink);
  const pass = page.locator('[data-testid="pass-group"] [data-testid="trial-row"][data-outcome="PASS"]').first();
  await expect(pass).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
});

test('the "What the labels mean" link is underlined (V4)', async ({ page }) => {
  await sample(page, './?view=runs');
  const link = page.getByTestId('runs-fault-summary').getByRole('link', { name: 'What the labels mean' });
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the "Same reason as" summary is at least 24px tall (V6a)', async ({ page }) => {
    await sample(page, './?view=runs');
    // The sample holds repeated reasons (p25c-polish.spec); the first such row's summary.
    const groups = new Map<string, number>();
    for (const r of records) {
      const e = explain(r);
      if (e.outcome === 'PASS' && e.fault === null) continue;
      groups.set(`${r.task_id}\n${e.reason}`, (groups.get(`${r.task_id}\n${e.reason}`) ?? 0) + 1);
    }
    expect([...groups.values()].some((n) => n > 1)).toBe(true);
    const summaryEl = page.getByTestId('reason-repeat').first();
    await expect(summaryEl).toBeVisible();
    const box = (await summaryEl.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});

// The trial fixture without its blocked pilot (a blocked run hides the count line, why-fail.spec):
// the official run trial-1 and the pilot pilot-pass.
const pilotPass: TrialFixture[] = readdirSync(join(ROOT, 'results/pilot-pass/trials'), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath, e.name), 'utf8')) as TrialFixture);

async function withoutBlockedPilot(page: Page) {
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files, ...rest } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { ...rest, files: files.filter((f) => !f.startsWith(`results/${PILOT_ERROR_ID}/`)) } });
  });
}

test('the count line leads with the official trials and names the pilot trials as not counted; with a filter it reads shown of total (J9)', async ({ page }) => {
  await withoutBlockedPilot(page);
  await trial(page, `./?view=runs&run=${RUN_ID}`);
  await expect(page.getByTestId('shown-count')).toHaveText(`Showing ${trialRecords.length} official trials (${pilotPass.length} more in pilots, not counted)`);
  const task = pilotPass[0]!.task_id;
  await trial(page, `./?view=runs&run=${RUN_ID}&task=${task}`);
  const shown = trialRecords.filter((r) => r.task_id === task).length;
  await expect(page.getByTestId('shown-count')).toHaveText(`Showing ${shown} of ${trialRecords.length} official trials (${pilotPass.filter((r) => r.task_id === task).length} more in pilots, not counted)`);
  const other = trialRecords.map((r) => r.task_id).find((t) => !pilotPass.some((p) => p.task_id === t))!;
  await trial(page, `./?view=runs&run=${RUN_ID}&task=${other}`);
  await expect(page.getByTestId('shown-count')).toHaveText(`Showing ${trialRecords.filter((r) => r.task_id === other).length} of ${trialRecords.length} official trials`);
});

test('a pilot run starts closed under its header, opens on a click or a filter, and the official run stays open (J9)', async ({ page }) => {
  await withoutBlockedPilot(page);
  await trial(page, `./?view=runs&run=${RUN_ID}`);
  const official = page.locator(`[data-testid="run"][data-run="${RUN_ID}"]`);
  await expect(official.getByTestId('trial-row').first()).toBeVisible();
  await expect(official.getByTestId('run-fold')).toHaveCount(0);
  const pilot = page.locator('[data-testid="run"][data-run="pilot-pass"]');
  const fold = pilot.getByTestId('run-fold');
  await expect(fold).not.toHaveAttribute('open', '');
  await expect(pilot.getByTestId('run-header')).toBeVisible();
  await expect(pilot.getByTestId('run-header')).toHaveText(/^pilot-pass: \d+\/\d+ pass/);
  await expect(pilot.getByTestId('trial-row')).toHaveCount(pilotPass.length);
  await expect(pilot.getByTestId('trial-row').first()).toBeHidden();
  await pilot.getByTestId('run-header').click();
  await expect(fold).toHaveAttribute('open', '');
  // pilot-pass holds one PASS, so its row sits in the run's own closed PASS group (ui-polish 2.2).
  const group = pilot.getByTestId('pass-group');
  await expect(group.locator('> summary')).toBeVisible();
  await group.locator('> summary').click();
  await expect(pilot.getByTestId('trial-row').first()).toBeVisible();
  await trial(page, `./?view=runs&run=${RUN_ID}&task=${pilotPass[0]!.task_id}`);
  await expect(page.locator('[data-testid="run"][data-run="pilot-pass"]').getByTestId('run-fold')).toHaveAttribute('open', '');
  await expect(page.locator('[data-testid="run"][data-run="pilot-pass"]').getByTestId('trial-row').first()).toBeVisible();
});
