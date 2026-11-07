// UI polish PR 3, the trial detail (reports/ui-polish-spec.md 3.1-3.5): the rubric and exposure
// tables become one card per row on a phone with the same DOM; each rubric row is named by the
// question the item asks (tasks/check-text.ts, as the Tasks view shows it) and an unknown reads
// "judge unsure"; the header leads with a plain headline, then "Why it failed", "Whose fault" (with
// the kind as a pill) and the M1-M5 codes behind "n of 5 confirmed"; Attribution opens with its
// verdict and keeps every criterion behind "Show all criteria checked (N)"; thinking reads as a
// captioned quote, not italics, and tool names sit in a pill.
import { expect, test, type Page } from '@playwright/test';
import { MET_TEXT } from '../../../packages/core/explain.ts';
import { browse as browseDefault, browseFrom } from './browse.ts';
import { auditOf, explain, record, runOf, trialBase, TRIALS } from './fixtures/trial/trial.ts';
import { confirmationWords, faultWhy, plainHeadline } from '../src/trial/headline.ts';
import { writtenWords } from '../src/trial/steps.ts';
import { records as sampleRecords, sampleBase, summary as sample } from './fixtures/sample-results/sample.ts';
import { eventBase, RUN_ID as EVENT_RUN, TRIAL as EVENT_TRIAL } from './fixtures/event/event.ts';

const browse = browseFrom(trialBase);
async function openTrial(page: Page, name: string, extra = '') {
  await browse(page, `./?view=runs&run=${runOf(name)}&trial=${encodeURIComponent(name)}${extra}`);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
}
// W1: the trial fixture's PASS (renal-dose-review) has a code-only rubric, with no question and no
// penalty. The questions and penalties are read on two committed PASSes of the sample run:
// discharge-medrec's first judged item (flag_outside_drug since PW4-E3 split flags_explained), and
// contrast-ct-prep's -3 iv_steroid_regimen
// beside its judged message_driver. The discharge-medrec trial and item come from the records, so a
// fixture regeneration or a rubric rename re-points them.
const browseSample = browseFrom(sampleBase);
const asks = sampleRecords.find((r) => r.task_id === 'discharge-medrec' && r.outcome === 'PASS')!;
const ASKS = `${asks.task_id}/${asks.index}`;
const ASKED = (asks.checks as ReadonlyArray<{ id: string; kind?: string; method?: string }>).find((c) => c.kind === 'rubric' && c.method === 'judge')!.id;
const PENALTY = 'contrast-ct-prep/0';
// The long-question toggle is read on the event fixture's toy trial: the toy's UI-plumbing item
// ui_long_question (tasks/_toy/tests/rubric.ts) asks a question past the 160-character clamp, which
// no clinical task's rubric does since T4 split its flag item.
const browseEvent = browseFrom(eventBase);
async function openLong(page: Page) {
  await browseEvent(page, `./?view=runs&run=${EVENT_RUN}&trial=${encodeURIComponent(EVENT_TRIAL)}`);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', EVENT_TRIAL);
}
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
  await openLong(page);
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
// question text) and on discharge-medrec (a question near the clamp). An id breaks only between words.
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

// F2: each "Show the full question" toggle names its item, so no two buttons read alike. The toy's
// ui_long_question is the one long question, so the event fixture's trial shows one toggle.
test('F2: each long-question toggle has a unique accessible name with its item id', async ({ page }) => {
  await openLong(page);
  const rows = panel(page, 'grading').getByTestId('rubric-row').filter({ has: page.getByRole('button', { name: /^Show the full question/ }) });
  // count() does not wait, so wait for the first toggle row to render before counting.
  await expect(rows.first()).toBeVisible();
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

test('3.3: the header leads with a plain headline, then the chips with the kind pill, Whose fault, Where, the Exact check, and the codes behind "n of 5 confirmed"', async ({ page }) => {
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  const h = page.getByTestId('trial-header');
  const headline = h.getByTestId('trial-headline');
  // P25u J2: the headline is plain words, with no check id; the exact check is behind a disclosure.
  await expect(headline).toHaveText(plainHeadline(e, record(TRIALS.failAudited).checks, e.taxonomy)!);
  await expect(headline).not.toContainText(e.decisive_check!.id);
  // The headline comes before the verdict chip.
  expect(await headline.evaluate((x) => Boolean(x.compareDocumentPosition(document.querySelector('[data-testid="trial-header"] [data-testid="outcome"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const dts = (await h.locator('dt').allTextContents()).filter((t) => ['Why it failed', 'Whose fault', 'Where', 'Exact check', 'Also failed'].includes(t));
  expect(dts).toEqual(['Whose fault', 'Where', 'Exact check']);
  await expect(h.locator('dt', { hasText: 'Exact check' }).locator('xpath=following-sibling::dd[1]')).toHaveAttribute('data-testid', 'decisive-check');
  const fault = h.getByTestId('detail-fault');
  await expect(fault.getByRole('link').first()).toHaveText(WORD[e.fault!]!);
  await expect(h.getByTestId('header-chips').getByTestId('kind-pill')).toHaveText(`Kind: ${e.taxonomy!.replace(/_/g, ' ')}`);
  const criteria = h.getByTestId('header-criteria-summary');
  const confirmed = e.criteria.filter((c) => c.met === true || c.met === 'n/a').length;
  await expect(criteria).toContainText(`${confirmed} of ${e.criteria.length} confirmed: ${confirmationWords(e.criteria)}`);
  await expect(h.locator('[data-testid="header-criteria"] li')).toHaveCount(5);
  await expect(h.locator('[data-testid="header-criteria"] li').first()).toBeHidden();
  await criteria.click();
  await expect(h.locator('[data-testid="header-criteria"] li').first()).toBeVisible();
});

// P25c fix (builder-326, trace rows W8, U30): the confirmation criteria M1-M5, each met or not met,
// are visible with no click; only the fault criteria stay behind the details.
test('3.4: Attribution opens with its verdict, shows M1-M5 met or not met, and keeps the fault criteria behind "Show the fault criteria checked (N)"', async ({ page }) => {
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
    await expect(all.locator('> summary')).toHaveText(`Show the fault criteria checked (${n - e.criteria.length})`);
    await expect(all).not.toHaveAttribute('open');
    for (const c of e.criteria) {
      const row = p.locator(`[data-testid="criterion-row"][data-id="${c.id}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(`${c.id}: ${MET_TEXT[String(c.met)]}`);
    }
    for (const row of await p.locator('[data-testid="criterion-row"]:not([data-fault="confirmation"])').all()) await expect(row).toBeHidden();
    // Copy rule C5's phrase (P25u J8b).
    if (e.confirmation) await expect(p.getByTestId('confirmation')).toContainText(`${e.confirmation}: ${confirmationWords(e.criteria)}.`);
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

// P25u S3 (reports/p25u-synthesis.md, slice S3): the trial page for an interviewer opening it cold.

test('J2: the header says why in plain words, keeps the one grader sentence, and puts the exact check behind a closed disclosure', async ({ page }) => {
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  const h = page.getByTestId('trial-header');
  await expect(h.getByTestId('fault-why')).toHaveText(faultWhy(e)!);
  await expect(h.getByTestId('fault-why')).toContainText("Why it is the model's fault: the records it needed were shown to it or within reach (M1)");
  // The reason the Runs row shows (trace row U31) stays visible, once.
  await expect(h.getByTestId('reason')).toBeVisible();
  await expect(h.getByTestId('reason')).toHaveText(e.reason);
  await expect(h.getByTestId('reason')).toHaveCount(1);
  // The requires and found text is closed until asked for, and the check id shows on its summary.
  const exact = h.getByTestId('exact-check');
  await expect(exact).not.toHaveAttribute('open');
  await expect(exact.locator('> summary')).toContainText(e.decisive_check!.id);
  await expect(h.getByTestId('decisive-found')).toBeHidden();
  await exact.locator('> summary').click();
  await expect(h.getByTestId('decisive-found')).toHaveText(e.decisive_check!.found);
  await expect(h.getByTestId('decisive-check')).toContainText(`requires ${e.decisive_check!.expected}`);
});

test('J4: Where lists the steps the slip ran through, in order, each a link, with the decisive step among them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  const r = record(TRIALS.failAudited);
  const exposure = r.attribution!.exposure;
  expect(exposure.length).toBeGreaterThan(0);
  const list = page.getByTestId('trial-header').getByTestId('where-steps');
  const items = list.locator('li');
  const kinds = await items.evaluateAll((els) => els.map((x) => x.getAttribute('data-kind')));
  expect(kinds.filter((k) => k === 'shown').length).toBe(exposure.filter((x) => x.first_exposed_step !== null).length);
  expect(kinds.filter((k) => k === 'decisive')).toEqual(['decisive']);
  const steps = (await items.evaluateAll((els) => els.map((x) => x.getAttribute('data-step')))).filter((s) => s !== '').map(Number);
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
  for (const x of exposure) if (x.first_exposed_step !== null) await expect(list.locator(`li[data-kind="shown"][data-step="${x.first_exposed_step}"]`)).toContainText(`${x.id} was first shown to the model`);
  await expect(list.getByTestId('decisive-step-link')).toHaveText(`Decisive step ${e.decisive_step}`);
  // Each step is a link that scrolls the trajectory to it.
  const first = list.getByTestId('where-step-link').first();
  const n = await first.getAttribute('data-step');
  await first.click();
  await expect(page.locator(`#step-${n}`)).toBeInViewport();
  // The Attribution tab shows the same list in place of the bare decisive step.
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await expect(page.getByTestId('panel-attribution').getByTestId('where-steps').locator('li')).toHaveCount(kinds.length);
});

test('J17, J8b: Attribution leads the human audit with a plain sentence, keeps the note behind a disclosure, and uses the shared confirmation phrase', async ({ page }) => {
  const e = await explain(TRIALS.failAudited);
  const audit = auditOf(TRIALS.failAudited)!;
  await openTrial(page, TRIALS.failAudited, '&tab=attribution');
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  const p = page.getByTestId('panel-attribution');
  const headline = plainHeadline(e, record(TRIALS.failAudited).checks, e.taxonomy)!;
  await expect(p.getByTestId('audit-plain')).toHaveText(`A person reviewed this trial and agrees it is the model's fault: ${headline.charAt(0).toLowerCase()}${headline.slice(1)}`);
  if (audit.note) {
    const note = p.getByTestId('audit-note');
    await expect(note).not.toHaveAttribute('open');
    await expect(note.locator('> summary')).toHaveText("Read the auditor's note");
    await note.locator('> summary').click();
    await expect(note).toContainText(audit.note);
  }
  await expect(p.getByTestId('confirmation')).toContainText('confirmed by the record (M1–M4) and the human audit (M5)');
  await expect(p.getByTestId('confirmation-criteria').locator('h4')).toContainText('Confirmed by the record (M1–M4) and the human audit (M5)');
});

test('V9: Grading opens with the gate result in the verdict\'s mark, and the rubric score comes last with its gloss', async ({ page }) => {
  const r = record(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  const p = page.getByTestId('panel-grading');
  const gates = r.checks!.filter((c) => c.kind !== 'rubric');
  const met = gates.filter((c) => c.met === true).length;
  await expect(p.getByTestId('metric-gates')).toHaveText(`Gate checks ${met} of ${gates.length} met`);
  await expect(p.getByTestId('metric-gates-note')).toHaveText('A trial passes only when every gate check is met.');
  // The gate tile comes before the score tile, which comes after cost, tokens and duration.
  const order = await p.locator('[data-testid="metric-gates"], [data-testid="metric-cost"], [data-testid="metric-tokens"], [data-testid="metric-duration"], [data-testid="score-card"]').evaluateAll((els) => els.map((x) => x.getAttribute('data-testid')));
  expect(order).toEqual(['metric-gates', 'metric-cost', 'metric-tokens', 'metric-duration', 'score-card']);
  await expect(p.getByTestId('score-card-gloss')).toHaveText('extra credit; does not decide pass');
  // The tile carries the FAIL mark.
  await expect(p.getByTestId('metric-gates').locator('span[aria-hidden]')).toHaveCount(1);
  // A pass says every check is met.
  await openTrial(page, TRIALS.pass);
  await expect(page.getByTestId('panel-grading').getByTestId('metric-gates-note')).toHaveText('Every gate check is met, so the trial passes.');
});

test('J24: a requires text with an empty "()" shows without it', async ({ page }) => {
  // contrast-ct-prep's radiologist_consulted names the studies a severe reaction stops, and the
  // fixture's list has none, so the task text ends "stops ()".
  await openTrial(page, TRIALS.noTrajectory);
  const row = page.getByTestId('panel-grading').locator('[data-testid="gate-check"][data-id="radiologist_consulted"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Requires a message or task to the radiologist');
  await expect(row).not.toContainText('()');
});

test('V8, V13c: the trial page sits on the page column every other view uses, with the same title size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.failAudited);
  const section = page.getByTestId('trial-detail').locator('xpath=ancestor::section[1]');
  expect(await section.evaluate((x) => getComputedStyle(x).maxWidth)).toBe('1024px');
  expect(await page.getByRole('heading', { level: 1 }).evaluate((x) => getComputedStyle(x).fontSize)).toBe('20px');
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  const runs = page.getByRole('heading', { level: 1 }).locator('xpath=ancestor::section[1]');
  expect(await runs.evaluate((x) => getComputedStyle(x).maxWidth)).toBe('1024px');
});

test('V12c: the active trial tab is a filled pill, as the rail\'s active item is', async ({ page }) => {
  await openTrial(page, TRIALS.failAudited, '&tab=attribution');
  const active = page.getByRole('tab', { name: 'Attribution' });
  await expect(active).toHaveAttribute('aria-selected', 'true');
  expect(await active.evaluate((x) => getComputedStyle(x).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(await active.evaluate((x) => getComputedStyle(x).borderRadius)).not.toBe('0px');
  expect(await page.getByRole('tab', { name: 'Grading' }).evaluate((x) => getComputedStyle(x).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});

test('V14: every evidence id link is at least 24px tall on the desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.failAudited, '&tab=state-diff');
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeVisible();
  const links = page.getByTestId('panel-state-diff').locator('[data-testid="evidence-id"][data-step]');
  expect(await links.count()).toBeGreaterThan(0);
  const heights = await links.evaluateAll((els) => els.map((x) => x.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(24);
});

test('V16: a "Skip the trajectory" link before the rows takes the keyboard past them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.failAudited);
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeVisible();
  const skip = page.getByTestId('skip-trajectory');
  await skip.focus();
  await expect(skip).toBeVisible();
  await skip.press('Enter');
  await expect(page.locator('#trajectory-end')).toBeFocused();
});

test('A10: an open tool call shows captioned Arguments and Result lists, and a call the environment refused says so under its closed row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.envError);
  const traj = page.getByTestId('trajectory');
  const failed = traj.locator('[data-testid="step"][data-error="INTERNAL"]').first();
  await expect(failed).toBeVisible();
  await expect(failed.getByTestId('step-error')).toHaveText('Failed inside the environment: INTERNAL: the FHIR store failed');
  await expect(failed.getByTestId('step-detail')).toHaveCount(0);
  await failed.getByRole('button').first().click();
  await expect(failed.getByTestId('step-arguments')).toContainText('Arguments');
  await expect(failed.getByTestId('step-result')).toContainText('Result');
  await expect(failed.getByTestId('step-detail').locator('pre')).toHaveCount(await failed.getByTestId('step-detail').locator('pre').count());
  // A key/value list, not a JSON dump of the whole call.
  await expect(failed.getByTestId('step-detail')).not.toContainText('"input"');
  await expect(failed.getByTestId('step-arguments').locator('dt').first()).toBeVisible();
});

test('A11: a written-ids line puts the provenance last and keeps the target whole', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.failAudited);
  const traj = page.getByTestId('trajectory');
  const row = traj.locator('[data-testid="step"][data-tool="write_note"]').first();
  await expect(row).toBeVisible();
  const written = row.getByTestId('step-written');
  await expect(written).toHaveText(/^wrote DocumentReference\/doc-t\d+ \+ provenance$/);
  await expect(written).not.toHaveText(/Provenance\//);
  // The target of a patient read ("Patient/pt-0061") is whole, not "pt-…".
  const read = traj.locator('[data-testid="step"][data-tool="fhir_read"]').first();
  const target = read.getByTestId('step-target');
  await expect(target).toHaveText(/\S/);
  expect(await target.evaluate((x) => ({ text: x.textContent, fits: x.scrollWidth <= x.clientWidth + 1 }))).toMatchObject({ fits: true });
  expect(writtenWords(['Provenance/prov-t0001', 'DocumentReference/doc-t0001'])).toBe('DocumentReference/doc-t0001 + provenance');
});

// S1 gate F2: a trial the person running it stopped (CANCELLED) reads "Stopped: not counted" on its
// chip, and the header and the Grading tab say the same, never the record's "excluded and rerun" or
// "the API or the harness ended the trial" (packages/core wording, which no UI slice edits).
test('a CANCELLED trial\'s header and Grading tab agree with its chip: stopped, not counted, nothing about the model', async ({ page }) => {
  // The fixture's INFRA_API record served as a CANCELLED one (its status decides I4).
  await page.route(`**/data/results/runs/${runOf(TRIALS.infra)}/trials/${TRIALS.infra}.json`, async (route) => {
    const res = await route.fetch();
    const r = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...r, outcome: 'CANCELLED', status: 'CANCELLED', detail: null } });
  });
  await openTrial(page, TRIALS.infra);
  const h = page.getByTestId('trial-header');
  await expect(h.getByTestId('outcome')).toHaveText('CANCELLED');
  await expect(h.getByTestId('plain-reason')).toHaveText('Stopped: not counted. You stopped this trial before the model finished, so it says nothing about the model.');
  await expect(h.getByTestId('reason')).toHaveCount(0);
  await expect(h.getByTestId('detail-fault')).toContainText('The trial ended when Stop was pressed, not because of anything the model did.');
  await expect(h.getByTestId('detail-fault')).toContainText('Rule I4: a stop from outside the harness ended the run before the trial ended.');
  // The page's own words carry none of the record's "rerun" phrasing. The fault chip is
  // data/ui.tsx (S1's A1a makes it "Stopped: not counted"), so it is left out of this read.
  const own = await h.evaluate((x) => { const c = x.cloneNode(true) as HTMLElement; c.querySelectorAll('[data-testid="label"]').forEach((el) => el.remove()); return c.textContent ?? ''; });
  for (const words of ['excluded and rerun', 'run again', 'API or the harness', 'API problem']) expect(own).not.toContain(words);
  await expect(page.getByTestId('panel-grading').getByTestId('grading-empty')).toHaveText('Not graded. You stopped this trial before the model finished, so it is not counted; the grader did not check it.');
});

test.describe('coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('V6b: the "n of 5 confirmed" summary, the Exact check summary and Back to Runs are 44px targets', async ({ page }) => {
    await openTrial(page, TRIALS.failAudited);
    const h = page.getByTestId('trial-header');
    for (const el of [h.getByTestId('header-criteria-summary'), h.getByTestId('exact-check').locator('> summary'), page.getByRole('link', { name: 'Back to Runs' })]) {
      const box = (await el.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
