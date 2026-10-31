// Findings against the committed sample run: docs/findings.md rendered, one Wilson interval per
// task, a bar per task by kind of failure (why-fail.spec.ts checks it against summary.json, P17j
// JU7), cost per trial, example trials, the trials each task's k/n leaves out (also in Runs),
// the glossary one click away, and the full write-up named as coming with the final run (the
// sample build has no data/writeup.html, so there is no link to a page that is not there). Then
// two builds served by their own vite preview: the real results today (the committed pilot runs,
// no official run), where Overview, Runs, Tasks and Environment each show data and no empty
// state and only Findings says no results are published; and a build with no results/ at all.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { browse as browseAt, browseFrom } from './browse.ts';
import { formatInterval } from '../src/data/ui.tsx';
import { notCounted, notCountedText } from '../src/data/marks.ts';
import { NOT_RERUN_REASON } from '../../../packages/core/outcomes.ts';
import { sampleBase, serve, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const browse = browseFrom(sampleBase);

test('Findings renders the markdown, one interval per task and a kind-of-failure bar per task', async ({ page }) => {
  await browse(page, './?view=findings');
  await expect(page.getByTestId('findings-md').getByRole('heading', { level: 1 })).toHaveText('Findings (sample run)');
  // One Wilson display (pre-audit U10, P17j JU12): the chart, from summary.json; the write-up
  // points to it and repeats no interval table.
  await expect(page.getByTestId('findings-md').locator('table')).toHaveCount(0);
  await expect(page.getByTestId('findings-md')).not.toContainText('Wilson');
  // Nor as a list or prose (verifier JU12c-1 F1): none of the chart's interval strings, for each
  // task that has one (F-B), and no interval in any percent form, whole or bracketed (F-A).
  for (const id of TASK_IDS) {
    const w = summary.tasks[id]!.wilson95;
    if (w !== null) await expect(page.getByTestId('findings-md')).not.toContainText(formatInterval(w));
  }
  await expect(page.getByTestId('findings-md')).not.toHaveText(/\d+(\.\d+)?%\s*(to|–|-|,)\s*\d+(\.\d+)?%/);
  await expect(page.getByText('How well the model did on each task, and why it failed.')).toBeVisible();
  await expect(page.getByTestId('interval-chart').getByTestId('interval')).toHaveCount(TASK_IDS.length);
  await expect(page.getByTestId('interval-chart').getByTestId('whisker')).toHaveCount(TASK_IDS.length);
  await expect(page.getByTestId('kind-bar')).toHaveCount(TASK_IDS.length);
  await expect(page.getByTestId('cost-chart').locator('li')).toHaveCount(TASK_IDS.length);
  await expect(page.getByRole('link', { name: 'Full writeup' })).toHaveCount(0);
  await expect(page.getByTestId('writeup-later')).toHaveText('The full writeup is published with the final run.');
  await expect(page.getByTestId('legend').first()).toBeVisible();
  const example = page.getByTestId('exemplars').getByRole('link').first();
  const trial = await example.textContent();
  await example.click();
  await expect(page).toHaveURL(/view=runs/);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', trial!);
  await page.goBack();
  await page.getByRole('link', { name: 'How failures are attributed' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How failures are attributed');
});

// A vite build of RESULTS_ROOT=root into a temp directory, served by its own vite preview.
async function buildAndServe(root: string): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), 'clinenv-build-'));
  const b = spawnSync(join(WEB, 'node_modules/.bin/vite'), ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: WEB, encoding: 'utf8', env: { ...process.env, RESULTS_ROOT: root } });
  if (b.status !== 0) throw new Error(`build of ${root} failed: ${b.stdout}${b.stderr}`);
  return serve(out);
}

const PILOTS = readdirSync(join(REPO, 'results'), { withFileTypes: true }).filter((d) => d.isDirectory() && /^pilot-/.test(d.name) && existsSync(join(REPO, 'results', d.name, 'trials'))).map((d) => d.name);
const pilotRecords = PILOTS.flatMap((p) => readdirSync(join(REPO, 'results', p, 'trials'), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')));

test.describe('the real results build: pilot runs, no official run', () => {
  let base = '';

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // The repo's results/ as it is until the final run: its pilot runs, no official.json.
    const root = mkdtempSync(join(tmpdir(), 'clinenv-pilot-root-'));
    for (const p of PILOTS) cpSync(join(REPO, 'results', p), join(root, 'results', p), { recursive: true });
    base = await buildAndServe(root);
  });

  test('Overview, Runs, Tasks and Environment each show data and no empty state; Findings says no results yet', async ({ page }) => {
    expect(PILOTS.length).toBeGreaterThan(0);
    await browseAt(page, base);
    const rail = page.getByRole('navigation', { name: 'Views' });
    const data: Record<string, string> = { Overview: 'overview-task', Runs: 'trial-row', Tasks: 'task-card', Environment: 'tool' };
    for (const [view, testId] of Object.entries(data)) {
      await rail.getByRole('link', { name: view }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(view);
      // Runs keeps a run's PASS rows in a closed group (ui-polish 2.2), so the first row shown.
      await expect(page.getByTestId(testId).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByTestId('empty-state')).toHaveCount(0);
      await expect(page.getByTestId('error-state')).toHaveCount(0);
    }
    await rail.getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByTestId('overview-task')).toHaveCount(TASK_IDS.length);
    await expect(page.getByTestId('overview-environment')).toBeVisible();
    await expect(page.getByTestId('overview-pilot')).toHaveCount(PILOTS.length);
    await rail.getByRole('link', { name: 'Runs' }).click();
    await expect(page.getByTestId('pilot-runs').getByRole('heading', { level: 2 })).toHaveText('Pilot runs (not counted in the results)');
    await expect(page.getByTestId('trial-row')).toHaveCount(pilotRecords.length);
    await expect(page.getByTestId('record-error')).toHaveCount(0);
    await rail.getByRole('link', { name: 'Findings' }).click();
    await expect(page.getByTestId('empty-state')).toHaveText(/No results are published yet\./);
    await expect(page.getByRole('link', { name: 'How failures are attributed' })).toBeVisible();
  });

  test('Findings shows the pilot summary, marked not counted, the legend and what the page will show (review-ui-P14-2 F1)', async ({ page }) => {
    await browseAt(page, `${base}?view=findings`);
    await expect(page.getByTestId('pilot-findings')).toHaveCount(PILOTS.length);
    await expect(page.getByRole('heading', { level: 2, name: /^pilot-\d+ \(not counted\)$/ }).first()).toBeVisible();
    await expect(page.getByTestId('pilot-rate').first()).toContainText(/Wilson 95% \d/);
    await expect(page.getByTestId('pilot-findings').first().getByTestId('legend')).toBeVisible();
    await expect(page.getByTestId('will-show').getByRole('link')).toHaveCount(3);
    // The two glossary links name the Attribution page, never "Labels" (verifier-phase-P17i-P17j-S9-1
    // S1: this state, no official run, is the only one that renders them), and "the fault labels"
    // opens the Fault labels table (N2).
    await expect(page.getByTestId('will-show').getByText(/\bLabels\b/)).toHaveCount(0);
    await expect(page.getByTestId('will-show').getByRole('link', { name: /on Attribution$/ })).toHaveCount(2);
    await page.getByTestId('will-show').getByRole('link', { name: 'see the fault labels on Attribution' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How failures are attributed');
    await expect(page).toHaveURL(/#fault-labels$/);
    await expect(page.locator('#fault-labels').getByTestId('audit-label-table')).toBeVisible();
    await browseAt(page, `${base}?view=findings`);
    await page.getByTestId('will-show').getByRole('link', { name: /Run them now on Tasks/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
  });

  test('a task opened on Tasks is not a hidden filter on Runs (review-ui-P14-2 F2)', async ({ page }) => {
    await browseAt(page, `${base}?view=tasks`);
    await page.locator('[data-testid="task-card"][data-task="contrast-ct-prep"]').getByRole('button').first().click();
    await expect(page).toHaveURL(/task=contrast-ct-prep/);
    await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Runs' }).click();
    await expect(page).not.toHaveURL(/task=/);
    await expect(page.getByTestId('trial-row')).toHaveCount(pilotRecords.length);
    // A task in a typed URL that no run holds shows as the chosen filter, with Clear filters.
    await page.goto(`${base}?view=runs&task=contrast-ct-prep`);
    await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('contrast-ct-prep');
    await page.getByTestId('clear-filters').click();
    await expect(page.getByTestId('trial-row')).toHaveCount(pilotRecords.length);
  });

  // ui-polish 2.1: the intro has a numbered Start here list; the no-official notice comes after
  // the Tasks card; each pilot has a one-line summary; the latest pilot's rates show as rows (task,
  // k/N, interval, Wilson) with a failed task's k/N linking to its trials, the older ones' rates sit
  // in a closed <details>.
  test('Overview: Start here, the notice after Tasks, the latest pilot\'s rates as rows with failures linked (ui-polish 2.1)', async ({ page }) => {
    await browseAt(page, `${base}?view=overview`);
    const start = page.getByTestId('intro-card').getByTestId('start-here');
    await expect(start.locator('li')).toHaveCount(3);
    await expect(start.getByRole('link')).toHaveText(['Read a task', 'See a failed trial', 'Check the grader, no key needed']);
    await expect(page.getByTestId('no-official')).toHaveText('The final run is not published yet. Pilot runs are below.');
    const after = await page.getByTestId('no-official').evaluate((n) => {
      const tasks = document.querySelector('[data-testid="overview-tasks"]')!;
      return Boolean(tasks.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(after).toBe(true);
    const latest = page.locator('[data-testid="overview-pilot"][data-run="pilot-3"]');
    await expect(latest.getByTestId('pilot-line')).toHaveText('pilot-3: 47 of 48 pass. 1 fail on crc-care-gap.');
    const crc = latest.locator('[data-testid="pilot-rate"][data-task="crc-care-gap"]');
    await expect(crc).toBeVisible();
    const k = crc.getByRole('link', { name: '7/8' });
    await expect(k).toHaveAttribute('href', /[?&]task=crc-care-gap(&|$)/);
    await expect(k).toHaveAttribute('href', /[?&]run=pilot-3(&|$)/);
    await expect(crc.getByTestId('wilson')).toHaveText(/^Wilson 95% \d/);
    // A task with every valid trial passing has no link.
    await expect(latest.locator('[data-testid="pilot-rate"][data-task="renal-dose-review"]').getByRole('link')).toHaveCount(0);
    for (const p of PILOTS.filter((x) => x !== 'pilot-3')) {
      const older = page.locator(`[data-testid="overview-pilot"][data-run="${p}"]`);
      await expect(older.getByTestId('pilot-line')).toBeVisible();
      await expect(older.getByTestId('pilot-rate').first()).toBeHidden();
    }
    await expect(page.getByTestId('overview-pilots')).not.toContainText('; not counted');
  });

  // ui-polish 2.2: in each run the rows to look at come first; the PASS rows sit behind a closed
  // "<n> PASS trials", open when a task filter is set.
  test('Runs: the FAIL row of pilot-3 comes first, its PASS rows are in a closed details (ui-polish 2.2)', async ({ page }) => {
    await browseAt(page, `${base}?view=runs`);
    const run = page.locator('[data-testid="run"][data-run="pilot-3"]');
    await expect(run.getByTestId('run-header')).toHaveText('pilot-3: 47/48 pass · 1 failure');
    const first = run.getByTestId('trial-row').first();
    await expect(first).toHaveAttribute('data-outcome', 'FAIL');
    await expect(first).toBeVisible();
    // The rows in view are the FAIL and any PASS with a harm or a fault; the rest of the 48 are in
    // the closed group, each a PASS, and its summary counts them.
    const shown = await run.getByTestId('trial-list').getByTestId('trial-row').count();
    const passes = run.getByTestId('pass-group');
    await expect(passes).not.toHaveAttribute('open', '');
    await expect(passes.locator('summary')).toHaveText(`${48 - shown} PASS trials`);
    await expect(passes.getByTestId('trial-row')).toHaveCount(48 - shown);
    await expect(passes.locator('[data-testid="trial-row"]:not([data-outcome="PASS"])')).toHaveCount(0);
    await expect(passes.getByTestId('trial-row').first()).toBeHidden();
    await browseAt(page, `${base}?view=runs&task=renal-dose-review`);
    await expect(page.locator('[data-testid="run"][data-run="pilot-3"]').getByTestId('pass-group')).toHaveAttribute('open', '');
    await expect(page.locator('[data-testid="run"][data-run="pilot-3"]').getByTestId('trial-row').first()).toBeVisible();
  });

  // ui-polish 2.3 and 2.4: the page says what it shows first; each pilot card is titled
  // "<run> (not counted)", has the 0/50/100% axis and the Dot/Whisker/Shaded caption once, and each
  // Wilson text stays on one line.
  test('Findings: what you will find here first, pilot titles, the axis once per card, one-line Wilson text (ui-polish 2.3, 2.4)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await browseAt(page, `${base}?view=findings`);
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('What you will find here');
    const cards = page.getByTestId('pilot-findings');
    for (let i = 0; i < PILOTS.length; i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId('pilot-axis')).toHaveCount(1);
      await expect(card.getByText(/^Dot: pass rate\. Whisker: Wilson 95% interval\. Shaded:/)).toHaveCount(1);
    }
    await expect(page.getByRole('heading', { level: 2, name: 'pilot-3 (not counted)' })).toBeVisible();
    const heights = await page.locator('[data-testid="pilot-rate"] [data-testid="wilson"]').evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) })));
    expect(heights.length).toBeGreaterThan(0);
    for (const x of heights) expect(x.h).toBeLessThanOrEqual(x.lh + 1);
  });

  test('a pilot run says in one line how it was graded (review-ui-P14-2 F5)', async ({ page }) => {
    await browseAt(page, `${base}?view=runs`);
    await expect(page.getByTestId('grading-line').first()).toHaveText(/^Graded with grader \d+ on an older world than today's; a regrade with grader \d+ gives the same outcomes\.$/);
  });
});

test.describe('a build with no results/', () => {
  let base = '';

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    base = await buildAndServe(mkdtempSync(join(tmpdir(), 'clinenv-empty-root-')));
  });

  test('Findings shows the empty state; Overview, Tasks and Environment still show the tasks and the world', async ({ page }) => {
    await browseAt(page, `${base}?view=findings`);
    await expect(page.getByTestId('empty-state')).toHaveText(/No results are published yet\./);
    const rail = page.getByRole('navigation', { name: 'Views' });
    await rail.getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByTestId('overview-task')).toHaveCount(TASK_IDS.length);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await rail.getByRole('link', { name: 'Tasks' }).click();
    await expect(page.getByTestId('task-card')).toHaveCount(TASK_IDS.length);
    await rail.getByRole('link', { name: 'Environment' }).click();
    await expect(page.getByTestId('tool').first()).toBeVisible();
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  });
});

// verifier-phase-P17i-W0-A-1 F4: beside each task's k/n, Findings and Runs say how many trials it
// leaves out, as ENV_LIMIT and as the other excluded outcomes, each with why; summary.json's
// env_limit counts the ENV_LIMIT. The sample has one ENV_LIMIT (results-inbox/12), one ENV_ERROR
// and one INFRA_API.
test('Findings and Runs show per task the trials k/n leaves out, ENV_LIMIT with why it is not run again', async ({ page }) => {
  const left = TASK_IDS.map((id) => ({ id, text: notCountedText(notCounted(summary.tasks[id]!)) })).filter((l) => l.text !== null);
  expect(summary.tasks['results-inbox']!.env_limit).toBe(1);
  expect(left.map((l) => l.id)).toEqual(['discharge-medrec', 'renal-dose-review', 'results-inbox']);
  const inbox = `Not counted: 1 ENV_LIMIT (not run again: ${NOT_RERUN_REASON.ENV_LIMIT}).`;
  expect(left.find((l) => l.id === 'results-inbox')!.text).toBe(inbox);
  await browse(page, './?view=findings');
  const chart = page.getByTestId('interval-chart');
  await expect(chart.getByTestId('not-counted')).toHaveCount(left.length);
  for (const l of left) await expect(chart.locator(`[data-testid="not-counted"][data-task="${l.id}"]`)).toHaveText(l.text!);
  await expect(chart.locator('li', { has: page.locator('[data-task="results-inbox"]') })).toContainText(`${summary.tasks['results-inbox']!.passes}/${summary.tasks['results-inbox']!.trials}`);
  await browse(page, './?view=runs');
  const runs = page.getByTestId('runs-not-counted');
  await expect(runs.getByTestId('not-counted')).toHaveCount(left.length);
  for (const l of left) await expect(runs.locator(`[data-task="${l.id}"]`)).toHaveText(`${l.id}: ${l.text}`);
  await browse(page, './?view=runs&task=results-inbox');
  await expect(page.getByTestId('runs-k-of-n')).toHaveText(`results-inbox: ${summary.tasks['results-inbox']!.passes}/${summary.tasks['results-inbox']!.trials} pass`);
  await expect(page.getByTestId('runs-not-counted').getByTestId('not-counted')).toHaveText([`results-inbox: ${inbox}`]);
  await browse(page, './?view=runs&task=message-queue');
  await expect(page.getByTestId('runs-not-counted')).toHaveCount(0);
});
