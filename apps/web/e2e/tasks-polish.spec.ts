// Tasks polish (pre-audit U10, P17j JU12 part 2): a task card's title drops its policy codes, which
// sit on the meta line; the Overview task list and the trial heading drop them too, and the Overview
// meta line names them; "Check the grader" shows "case k of N" while the grader validation matrix runs,
// then says in plain words that the grader works.
import { expect, test } from '@playwright/test';
import { browseFrom } from './browse.ts';
import { sampleBase, summary } from './fixtures/sample-results/sample.ts';

const browse = browseFrom(sampleBase);

test('a task title without its policy code, the code on the meta line', async ({ page }) => {
  await browse(page, './?view=tasks');
  const card = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]');
  await expect(card.getByTestId('task-title')).toHaveText('DOAC renal and interaction dose review of the pharmacy list');
  await expect(card.getByTestId('task-codes')).toHaveText('RBC-PHARM-07');
  // A title whose "under ..." names no policy keeps its words.
  await expect(page.locator('[data-testid="task-card"][data-task="message-queue"]').getByTestId('task-title')).toContainText('under the standing protocols');
});

test('the Overview task list and the trial heading show the title without its code; the Overview meta line names it (verifier-phase-P17j-retro-JU12-1 D1)', async ({ page }) => {
  // The task list is on the Overview with no official run (TaskSummary), so serve the sample build's
  // files without official.json (verifier-phase-P17i-UIRETRO-1 B1).
  const INDEX = '**/data/index.json';
  await page.route(INDEX, async (route) => {
    const res = await route.fetch();
    const { files } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { files: files.filter((f) => f !== 'results/official.json') } });
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('no-official')).toBeVisible();
  const row = page.locator('[data-testid="overview-task"][data-task="renal-dose-review"]');
  await expect(row.getByTestId('overview-task-title')).toHaveText('DOAC renal and interaction dose review of the pharmacy list');
  await expect(row.getByTestId('overview-task-meta')).toContainText('1 policy: RBC-PHARM-07');
  await expect(page.locator('[data-testid="overview-task"][data-task="contrast-ct-prep"]').getByTestId('overview-task-title')).not.toContainText('RBC-');
  await expect(page.locator('[data-testid="overview-task"][data-task="message-queue"]').getByTestId('overview-task-title')).toContainText('under the standing protocols');
  // The trial heading reads the official run, so the full sample build again.
  await page.unroute(INDEX);
  await browse(page, './?view=runs&trial=renal-dose-review%2F0');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', 'renal-dose-review/0');
  await expect(page.getByRole('heading', { level: 1 }).getByTestId('trial-title')).toHaveText('DOAC renal and interaction dose review of the pharmacy list');
});

test('Check the grader shows "case k of N" while the matrix runs', async ({ page }) => {
  test.setTimeout(600_000);
  await browse(page, './?view=tasks');
  const v = page.locator('[data-testid="validation"][data-task="renal-dose-review"]');
  await v.getByRole('button', { name: 'Check the grader' }).click();
  await expect(v.getByTestId('run-progress')).toHaveText(/Running the grader check in this tab… case \d+ of \d+$/, { timeout: 120_000 });
  await expect(v.getByTestId('matrix-result')).toBeVisible({ timeout: 540_000 });
  // The result in plain words (ui-polish 4.2), and the count line docs/requirements/ui-contract.md names.
  await expect(v.getByTestId('matrix-result')).toContainText(/The grader works: all \d+ wrong answers failed and all \d+ right answers passed, as expected\./);
  await expect(v.getByTestId('matrix-result')).toContainText(/\bmatrix: (\d+)\/\1 probe verdicts as expected\b/);
});

// P25u slice S2 (J12 with V7, J23, V6a, V12b, V13b): a card opens from an "Open task" link that a
// modified click can open in a new tab; its meta line shows the task's pass rate and band verdict
// from the official run; the three validation buttons share one bordered style on a closed card
// and in the Grader validation tab, with no primary among them; an unknown ?task= says so above
// the list; the title is one type step above the body; the tab strip's rows keep a gap; and a
// rubric item's "Enforces" summary is a tap target on a coarse pointer.
test('each closed card opens from an "Open task" link, shows its pass rate and verdict, and its validation buttons share one bordered style with no primary (J12, V7)', async ({ page }) => {
  await browse(page, './?view=tasks');
  const cards = page.getByTestId('task-card');
  await expect(cards).toHaveCount(6);
  const classes = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const card = cards.nth(i);
    const id = (await card.getAttribute('data-task'))!;
    const link = card.getByRole('link', { name: /Open task$/ });
    await expect(link).toHaveAttribute('href', new RegExp(`[?&]task=${id}(&|$)`));
    await expect(link).toHaveAttribute('aria-expanded', 'false');
    const t = summary.tasks[id]!;
    await expect(card.getByTestId('task-rate')).toHaveText(`${t.passes}/${t.trials} pass`);
    await expect(card.getByTestId('band-verdict')).toHaveAttribute('data-verdict', t.band_verdict!);
    const v = card.getByTestId('validation');
    await expect(v.locator('button.bg-primary')).toHaveCount(0);
    for (const name of ['Run reference solution', 'Check the grader', 'Replay published trials']) {
      const b = v.getByRole('button', { name });
      classes.add((await b.getAttribute('class'))!);
      expect(await b.evaluate((el) => getComputedStyle(el).borderTopColor), `${id} ${name}`).not.toBe('rgba(0, 0, 0, 0)');
    }
    await expect(card.getByTestId('task-title')).toHaveCSS('font-size', '15px');
  }
  expect(classes.size, [...classes].join('\n')).toBe(1);
  // The same classes in the Grader validation tab, and the open card's link closes it.
  await browse(page, './?view=tasks&task=renal-dose-review&tab=grader-validation');
  const panel = page.getByTestId('task-panel-grader-validation');
  for (const name of ['Run reference solution', 'Check the grader', 'Replay published trials']) expect(await panel.getByRole('button', { name }).getAttribute('class'), name).toBe([...classes][0]);
  const card = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]');
  const close = card.getByRole('link', { name: /Close task$/ });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await close.click();
  await expect(page).not.toHaveURL(/[?&]task=/);
  await expect(card.getByRole('tablist')).toHaveCount(0);
});

test('a modified click on "Open task" opens the task in a new tab and leaves the list closed (J12)', async ({ page, context }) => {
  await browse(page, './?view=tasks');
  const link = page.locator('[data-testid="task-card"][data-task="crc-care-gap"]').getByRole('link', { name: /Open task$/ });
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })]);
  await expect(popup).toHaveURL(/[?&]task=crc-care-gap(&|$)/);
  await popup.close();
  await expect(page).not.toHaveURL(/[?&]task=/);
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('an unknown ?task= says so above the list, which stays closed (J23)', async ({ page }) => {
  await browse(page, './?view=tasks&task=nope');
  const notice = page.getByTestId('missing-task');
  await expect(notice).toHaveText('No task "nope". The six tasks are below.');
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('task-card')).toHaveCount(6);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await browse(page, './?view=tasks&task=renal-dose-review');
  await expect(page.getByTestId('missing-task')).toHaveCount(0);
});

test('at 390 px the wrapped tab rows keep a gap, and the active tab is the rail\'s pill, not a bottom border (V12b)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browse(page, './?view=tasks&task=renal-dose-review&tab=prompt');
  const strip = page.getByRole('tablist', { name: 'Task' });
  await expect(strip).toHaveCSS('row-gap', '4px');
  // S1's TAB_STRIP, TAB, TAB_ACTIVE and TAB_IDLE (data/ui.tsx): the active tab is a filled pill
  // with no accent bottom border, an idle tab has neither.
  const active = strip.getByRole('tab', { selected: true });
  const idle = strip.getByRole('tab', { selected: false }).first();
  await expect(active).toHaveClass(/\bbg-line\/80\b/);
  await expect(active).not.toHaveClass(/\bborder-accent\b/);
  await expect(active).toHaveCSS('border-bottom-width', '0px');
  await expect(idle).not.toHaveClass(/\bbg-line\/80\b/);
  await expect(active).toHaveCSS('border-radius', '6px');
});

test('each card\'s band verdict is the shared chip with its icon (V11 adoption)', async ({ page }) => {
  await browse(page, './?view=tasks');
  const cards = page.getByTestId('task-card');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('[data-testid="task-card"] [data-testid="band-verdict"] svg')).toHaveCount(6);
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('a rubric item\'s "Enforces" summary is at least 24px tall (V6a)', async ({ page }) => {
    await browse(page, './?view=tasks&task=renal-dose-review&tab=rubric');
    const s = page.getByTestId('task-check').first().locator('summary');
    await expect(s).toHaveText(/^Enforces .*: show the text$/);
    const box = (await s.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});
