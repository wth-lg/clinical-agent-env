// UI polish PR 3, the trial detail (reports/ui-polish-spec.md 3.1-3.5): the rubric and exposure
// tables become one card per row on a phone with the same DOM; each rubric row is named by the
// question the item asks (tasks/check-text.ts, as the Tasks view shows it) and an unknown reads
// "judge unsure"; the header leads with a plain headline, then "Why it failed", "Whose fault" (with
// the kind as a pill) and the M1-M5 codes behind "n of 5 confirmed"; Attribution opens with its
// verdict and keeps every criterion behind "Show all criteria checked (N)"; thinking reads as a
// captioned quote, not italics, and tool names sit in a pill.
import { expect, test, type Page } from '@playwright/test';
import { browse as browseDefault, browseFrom } from './browse.ts';
import { explain, runOf, trialBase, TRIALS } from './fixtures/trial/trial.ts';
import { sampleBase, summary as sample } from './fixtures/sample-results/sample.ts';

const browse = browseFrom(trialBase);
async function openTrial(page: Page, name: string, extra = '') {
  await browse(page, `./?view=runs&run=${runOf(name)}&trial=${encodeURIComponent(name)}${extra}`);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
}
// W1: the trial fixture's PASS (renal-dose-review) has a code-only rubric, with no question and no
// penalty. The questions and penalties are read on two committed PASSes of the sample run:
// discharge-medrec's judged flags_explained, the one long question of the six tasks, and
// contrast-ct-prep's -3 iv_steroid_regimen beside its judged message_driver.
const browseSample = browseFrom(sampleBase);
const ASKS = 'discharge-medrec/0';
const ASKED = 'flags_explained';
const PENALTY = 'contrast-ct-prep/0';
async function openSample(page: Page, name: string) {
  await browseSample(page, `./?view=runs&trial=${encodeURIComponent(name)}`);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
}
const sampleTrial = (name: string) => `**/data/results/runs/${sample.run_id}/trials/${name}.json`;
const panel = (page: Page, tab: string) => page.getByTestId(`panel-${tab}`);
const WORD: Record<string, string> = { model: 'model', refusal: 'model', env: 'environment', grader: 'grader', infra: 'infra' };

test('3.1: at 390 px each rubric row is a card on the same table, every cell labelled, an empty quote hidden; at 1440 a table row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrial(page, TRIALS.pass);
  const p = panel(page, 'grading');
  const rows = p.getByTestId('rubric-row');
  await expect(rows.first()).toBeVisible();
  expect(await rows.first().evaluate((r) => getComputedStyle(r).display)).toBe('grid');
  // The column heads stay for screen readers only.
  const head = p.locator('table thead').first();
  expect(await head.evaluate((h) => h.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  for (const td of await rows.first().locator('td').all()) expect(await td.getAttribute('data-label')).not.toBeNull();
  // Each met value has its icon.
  for (const met of await p.getByTestId('rubric-met').all()) await expect(met.locator('svg')).toHaveCount(1);
  const empty = p.locator('[data-testid="rubric-row"] [data-testid="rubric-quote"]', { hasText: /^—$/ });
  if ((await empty.count()) > 0) await expect(empty.first()).toBeHidden();
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await rows.first().evaluate((r) => getComputedStyle(r).display)).toBe('table-row');
  expect(await p.getByTestId('rubric-points').first().evaluate((c) => getComputedStyle(c).whiteSpace)).toBe('nowrap');
  expect(await p.getByTestId('rubric-met').first().evaluate((c) => getComputedStyle(c).whiteSpace)).toBe('nowrap');
});

test('3.1: at 390 px the Attribution exposure table is one card per row too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrial(page, TRIALS.failAudited, '&tab=attribution');
  const row = panel(page, 'attribution').getByTestId('exposure-row').first();
  await expect(row).toBeAttached();
  expect(await row.evaluate((r) => getComputedStyle(r).display)).toBe('grid');
  for (const td of await row.locator('td').all()) expect(await td.getAttribute('data-label')).not.toBeNull();
});

test('3.2: a rubric row is named by the question its item asks, as the Tasks view shows it, with the id below', async ({ page }) => {
  const [task] = ASKS.split('/') as [string];
  await browseSample(page, `./?view=tasks&task=${task}&tab=rubric`);
  const question = page.locator(`[data-testid="task-check"][data-check="${ASKED}"] [data-testid="check-question"]`).first();
  await expect(question).not.toBeEmpty();
  const text = (await question.textContent())!;
  await openSample(page, ASKS);
  const row = panel(page, 'grading').locator(`[data-testid="rubric-row"][data-id="${ASKED}"]`);
  await expect(row.getByTestId('rubric-name')).toHaveText(text);
  await expect(row.locator('code')).toHaveText(ASKED);
  // A long question shows two lines and a toggle for the rest.
  const long = panel(page, 'grading').getByTestId('rubric-row').filter({ has: page.getByRole('button', { name: 'Show the full question' }) }).first();
  const id = (await long.getAttribute('data-id'))!;
  const pinned = panel(page, 'grading').locator(`[data-testid="rubric-row"][data-id="${id}"]`);
  const toggle = pinned.getByRole('button', { name: new RegExp(`^Show (the full question|less) for ${id}$`) });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const name = pinned.getByTestId('rubric-name');
  const clamped = (await name.boundingBox())!.height;
  await toggle.click();
  await expect(toggle).toHaveText('Show less');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await name.boundingBox())!.height).toBeGreaterThan(clamped);
});

test('3.2: an unknown judge item reads "judge unsure"', async ({ page }) => {
  await page.route(sampleTrial(ASKS), async (route) => {
    const res = await route.fetch();
    const rec = JSON.parse(await res.text()) as { checks: { id: string; met: unknown }[] };
    rec.checks = rec.checks.map((c) => (c.id === ASKED ? { ...c, met: 'unknown' } : c));
    await route.fulfill({ response: res, body: JSON.stringify(rec) });
  });
  await openSample(page, ASKS);
  await expect(panel(page, 'grading').locator(`[data-testid="rubric-row"][data-id="${ASKED}"] [data-testid="rubric-met"]`)).toHaveText('judge unsure');
});

// verifier-phase-P17i-UI-3-1 F1: from sm up the rubric keeps its column balance. No column head
// wraps, and neither the Item nor the Judge quote column is squeezed: on crc-care-gap (ids, no
// question text) and on discharge-medrec (a long question). An id breaks only between words.
for (const [name, open] of [[TRIALS.limit, openTrial], [ASKS, openSample]] as const) {
  test(`F1: at 1440 the ${name} rubric has one-line column heads and Item and quote columns at least 160 px wide`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, name);
    const table = panel(page, 'grading').locator('table', { has: page.getByTestId('rubric-row') });
    await expect(table.getByTestId('rubric-row').first()).toBeVisible();
    for (const th of await table.locator('thead th').all()) {
      const lines = await th.evaluate((x) => x.getBoundingClientRect().height / parseFloat(getComputedStyle(x).lineHeight));
      expect(lines, (await th.textContent())!).toBeLessThan(2);
    }
    const row = table.getByTestId('rubric-row').first();
    expect((await row.locator('td').first().boundingBox())!.width).toBeGreaterThanOrEqual(160);
    expect((await row.getByTestId('rubric-quote').boundingBox())!.width).toBeGreaterThanOrEqual(160);
    expect(await row.locator('td').first().locator('code').evaluate((c) => getComputedStyle(c).overflowWrap)).toBe('break-word');
  });
}

// F2: each "Show the full question" toggle names its item, so no two buttons read alike. The six
// tasks have one long question (flags_explained), so the trial shows one toggle.
test('F2: each long-question toggle has a unique accessible name with its item id', async ({ page }) => {
  await openSample(page, ASKS);
  const rows = panel(page, 'grading').getByTestId('rubric-row').filter({ has: page.getByRole('button', { name: /^Show the full question/ }) });
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const id = (await row.getAttribute('data-id'))!;
    await expect(row.getByRole('button')).toHaveAccessibleName(`Show the full question for ${id}`);
  }
});

// F3: a penalty that fired (met, negative points) shows an alert mark, not a check.
test('F3: a met penalty item shows an alert icon, not a check', async ({ page }) => {
  await page.route(sampleTrial(PENALTY), async (route) => {
    const res = await route.fetch();
    const rec = JSON.parse(await res.text()) as { checks: { id: string; met: unknown }[] };
    rec.checks = rec.checks.map((c) => (c.id === 'iv_steroid_regimen' ? { ...c, met: true } : c));
    await route.fulfill({ response: res, body: JSON.stringify(rec) });
  });
  await openSample(page, PENALTY);
  const met = panel(page, 'grading').locator('[data-testid="rubric-row"][data-id="iv_steroid_regimen"] [data-testid="rubric-met"]');
  await expect(met).toHaveText('met');
  await expect(met.locator('svg')).toHaveAttribute('data-mark', 'fired');
  await expect(met.locator('svg.lucide-check')).toHaveCount(0);
  // A positive item met keeps its check.
  await expect(panel(page, 'grading').locator('[data-testid="rubric-row"][data-id="message_driver"] [data-testid="rubric-met"] svg')).toHaveAttribute('data-mark', 'met');
});

test('3.3: the header leads with a headline, then Why it failed, Whose fault with the kind pill, and the codes behind "n of 5 confirmed"', async ({ page }) => {
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  const h = page.getByTestId('trial-header');
  const headline = h.getByTestId('trial-headline');
  await expect(headline).toContainText(e.decisive_check!.id);
  // The headline comes before the verdict chip.
  expect(await headline.evaluate((x) => Boolean(x.compareDocumentPosition(document.querySelector('[data-testid="trial-header"] [data-testid="outcome"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const dts = (await h.locator('dt').allTextContents()).filter((t) => ['Why it failed', 'Whose fault', 'Also failed'].includes(t));
  expect(dts).toEqual(['Why it failed', 'Whose fault']);
  await expect(h.locator('dt', { hasText: 'Why it failed' }).locator('xpath=following-sibling::dd[1]')).toHaveAttribute('data-testid', 'decisive-check');
  const fault = h.getByTestId('detail-fault');
  await expect(fault.getByRole('link').first()).toHaveText(WORD[e.fault!]!);
  await expect(fault.getByTestId('kind-pill')).toHaveText(`Kind: ${e.taxonomy!.replace(/_/g, ' ')}`);
  const criteria = h.getByTestId('header-criteria-summary');
  const confirmed = e.criteria.filter((c) => c.met === true || c.met === 'n/a').length;
  await expect(criteria).toContainText(`${confirmed} of ${e.criteria.length} confirmed`);
  await expect(h.locator('[data-testid="header-criteria"] li')).toHaveCount(5);
  await expect(h.locator('[data-testid="header-criteria"] li').first()).toBeHidden();
  await criteria.click();
  await expect(h.locator('[data-testid="header-criteria"] li').first()).toBeVisible();
});

test('3.4: Attribution opens with its verdict, and every criterion is behind "Show all criteria checked (N)"', async ({ page }) => {
  for (const name of [TRIALS.envLimit, TRIALS.failAudited]) {
    const e = await explain(name);
    await openTrial(page, name, '&tab=attribution');
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
    const p = panel(page, 'attribution');
    const verdict = p.getByTestId('attribution-verdict');
    await expect(verdict).toContainText(`Fault: ${WORD[e.fault!]}, decided by ${e.deciding!.id}`);
    expect(await verdict.evaluate((v) => v.parentElement!.firstElementChild === v)).toBe(true);
    const all = p.getByTestId('all-criteria');
    const n = await p.getByTestId('criterion-row').count();
    await expect(all.locator('> summary')).toHaveText(`Show all criteria checked (${n})`);
    await expect(all).not.toHaveAttribute('open');
    if (e.confirmation) await expect(p.getByTestId('confirmation')).toContainText(`${e.confirmation} (M1–M5)`);
  }
});

// The fixture trajectories hold no thinking; the published pilot-3 trials do.
test('3.5: thinking is a captioned quote in plain type, and a tool name sits in a pill', async ({ page }) => {
  await browseDefault(page, './?view=runs&run=pilot-3&trial=crc-care-gap%2F7');
  await expect(page.getByTestId('trial-detail')).toBeVisible();
  const traj = page.getByTestId('trajectory');
  const thinking = traj.getByTestId('thinking').first();
  await expect(thinking).toBeVisible();
  expect(await thinking.evaluate((x) => getComputedStyle(x).fontStyle)).toBe('normal');
  await expect(thinking.getByText('Thinking', { exact: true })).toBeVisible();
  const name = traj.getByTestId('tool-name').first();
  expect(await name.evaluate((x) => getComputedStyle(x).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});

// The 3.1 phone target (under 9,000 px for pilot-3 crc-care-gap/7): below sm the trajectory is
// folded under "Show all n steps", after the verdict, the reasons and the rubric; it opens by
// keyboard and by a step link, and from sm up it is always open with no summary.
test('3.1: at 390 px the trajectory folds under "Show all n steps", the page is under 9,000 px, and the steps open by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browseDefault(page, './?view=runs&run=pilot-3&trial=crc-care-gap%2F7');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  const fold = page.getByTestId('trajectory-fold');
  await expect(fold).not.toHaveAttribute('open');
  const summary = fold.locator('> summary');
  await expect(summary).toHaveText(/^Show all \d+ steps$/);
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeHidden();
  // The header and the rubric come before the fold.
  expect(await page.getByTestId('rubric-row').first().evaluate((r) => Boolean(r.compareDocumentPosition(document.querySelector('[data-testid="trajectory-fold"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const height = await page.evaluate(() => document.querySelector('main')!.scrollHeight);
  expect(height).toBeLessThan(9000);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('open', '');
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeVisible();
  await expect(summary).toHaveText('Hide the steps');
});

test('3.1: at 390 px a step link opens the folded trajectory at that step; at 1440 the trajectory is open with no summary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  await expect(page.getByTestId('trajectory-fold')).not.toHaveAttribute('open');
  await page.getByTestId('trial-header').getByTestId('decisive-step-link').click();
  const target = page.locator(`#step-${e.decisive_step}`);
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute('aria-current', 'step');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTrial(page, TRIALS.pass);
  await expect(page.getByTestId('trajectory-fold')).toHaveAttribute('open', '');
  await expect(page.getByTestId('trajectory-fold').locator('> summary')).toBeHidden();
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeVisible();
});
