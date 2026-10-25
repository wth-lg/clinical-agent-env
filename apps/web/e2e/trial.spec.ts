// The two-pane trial detail (plan phase P16) against the committed trials in
// e2e/fixtures/trial (built with RESULTS_ROOT pointed there), after "Browse without a key":
// the trajectory pane and the five tabs (Grading, Attribution, State diff, Environment, Raw)
// render on every fixture trial; Grading lists every rubric item with the points, met and judge
// quote of the record, and every gate check with its evidence ids, each a link that scrolls the
// trajectory to its step; the header shows, with no click, the outcome, label, decisive check and
// reason explainTrial gives (cli/audit-check.ts context), the not-audited marker on a trial with
// no audit row, and a decisive-step link that scrolls to that step; the Attribution criteria
// table equals the explanation's criteria; Replay in State diff runs in the tab with no key and
// reproduces the record's final hash; empty and error states render; axe finds nothing serious
// or critical; at 390 px nothing scrolls sideways.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MET_TEXT, NOT_AUDITED_MARKER } from '../../../packages/core/explain.ts';
import { FAULT_PRECEDENCE, isValid } from '../../../packages/core/outcomes.ts';
import { trialName } from '../../../packages/core/summary.ts';
import { explain, hasTrajectory, record, records, RUN_ID, summary, trialBase, TRIALS } from './fixtures/trial/trial.ts';

const TABS = [
  { id: 'grading', name: 'Grading' },
  { id: 'attribution', name: 'Attribution' },
  { id: 'state-diff', name: 'State diff' },
  { id: 'environment', name: 'Environment' },
  { id: 'raw', name: 'Raw' },
] as const;
const NAMES = records.map((r) => trialName(r)).sort();
const NON_PASS = NAMES.filter((n) => record(n).outcome !== 'PASS');

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}
const trialPath = (name: string, extra = '') => `./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(name)}${extra}`;
async function openTrial(page: Page, name: string, extra = '') {
  await browse(page, trialPath(name, extra));
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
}
const panel = (page: Page, tab: string) => page.getByTestId(`panel-${tab}`);
const metText = (met: unknown) => (met === true ? 'met' : met === false ? 'not met' : String(met));

test('the fixtures hold one trial of each non-pass outcome, audited and not', () => {
  expect(new Set(records.map((r) => r.outcome))).toEqual(new Set(['PASS', 'FAIL', 'LIMIT', 'REFUSAL', 'ENV_ERROR', 'GRADER_ERROR', 'INFRA_API']));
  expect(hasTrajectory(TRIALS.noTrajectory)).toBe(false);
});

test('the trajectory pane and each of the five tabs render on every fixture trial, and the tab is in the URL', async ({ page }) => {
  test.setTimeout(180_000);
  for (const name of NAMES) {
    await openTrial(page, name);
    const traj = page.getByTestId('trajectory');
    await expect(traj).toBeVisible();
    if (hasTrajectory(name)) await expect(traj.getByTestId('step').first()).toBeVisible();
    else await expect(traj.getByTestId('trajectory-error')).toBeVisible();
    // Grading is the default tab.
    await expect(page.getByRole('tab', { name: 'Grading' })).toHaveAttribute('aria-selected', 'true');
    for (const t of TABS) {
      await page.getByRole('tablist', { name: 'Trial' }).getByRole('tab', { name: t.name, exact: true }).click();
      await expect(page).toHaveURL(t.id === 'grading' ? /tab=grading|^(?!.*tab=)/ : new RegExp(`tab=${t.id}`));
      await expect(panel(page, t.id)).toBeVisible();
      await expect(panel(page, t.id)).not.toBeEmpty();
      for (const o of TABS.filter((x) => x.id !== t.id)) await expect(panel(page, o.id)).toBeHidden();
    }
    await page.reload();
    await expect(panel(page, 'raw')).toBeVisible();
  }
});

test('Grading lists every rubric item with the record\'s points, met and judge quote, and every gate check with its evidence ids', async ({ page }) => {
  test.setTimeout(120_000);
  for (const name of NAMES) {
    const r = record(name);
    const checks = r.checks ?? [];
    if (checks.length === 0) continue;
    await openTrial(page, name);
    const p = panel(page, 'grading');
    const rubric = checks.filter((c) => c.kind === 'rubric');
    await expect(p.getByTestId('rubric-row')).toHaveCount(rubric.length);
    for (const c of rubric) {
      const row = p.locator(`[data-testid="rubric-row"][data-id="${c.id}"]`);
      await expect(row.getByTestId('rubric-points')).toHaveText(`${c.points! > 0 ? '+' : ''}${c.points}`);
      await expect(row.getByTestId('rubric-met')).toHaveText(metText(c.met));
      const quote = typeof c.evidence?.quote === 'string' && c.evidence.quote !== '' ? c.evidence.quote : null;
      if (quote === null) await expect(row.getByTestId('rubric-quote')).toHaveText('—');
      else expect((await row.getByTestId('rubric-quote').textContent())!.replace(/\s+/g, ' ').trim()).toBe(quote.replace(/\s+/g, ' ').trim());
    }
    const gates = checks.filter((c) => c.kind === 'gate');
    await expect(p.getByTestId('gate-check')).toHaveCount(gates.length);
    for (const c of gates) {
      const row = p.locator(`[data-testid="gate-check"][data-id="${c.id}"]`);
      await expect(row).toHaveAttribute('data-met', String(c.met));
      const ids = c.ids ?? [];
      const shown = await row.getByTestId('evidence-id').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
      expect(shown, `${name} ${c.id}`).toEqual(ids);
    }
    if (typeof r.score === 'number') await expect(p.getByTestId('score-card')).toHaveText(`Score ${r.score.toFixed(2)}`);
  }
});

test('an evidence link scrolls the trajectory to its step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openTrial(page, TRIALS.failAudited);
  // Evidence ids link to steps once the trajectory is loaded.
  await expect(page.getByTestId('trajectory').getByTestId('step').first()).toBeVisible();
  const links = panel(page, 'grading').locator('[data-testid="evidence-id"][data-step]');
  const n = await links.count();
  expect(n).toBeGreaterThan(0);
  const last = links.nth(n - 1);
  const step = await last.getAttribute('data-step');
  await last.click();
  const target = page.locator(`#step-${step}`);
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute('aria-current', 'step');
});

test('the header shows outcome, label, decisive check and reason of each non-pass trial before any click', async ({ page }) => {
  test.setTimeout(120_000);
  for (const name of NON_PASS) {
    const e = await explain(name);
    await openTrial(page, name);
    const h = page.getByTestId('trial-header');
    await expect(h.getByTestId('outcome')).toHaveText(e.outcome);
    await expect(h.getByTestId('reason')).toHaveText(e.reason);
    if (e.fault === 'infra') await expect(h.getByTestId('label')).toHaveText('infra: rerun, not counted');
    else await expect(h.getByTestId('label')).toHaveText(`${e.label}${e.label_subtype ? ` (${e.label_subtype})` : ''}`);
    await expect(h.getByTestId('not-audited')).toHaveCount(e.audited || e.fault === 'infra' ? 0 : 1);
    if (e.decisive_check) {
      const d = h.getByTestId('decisive-check');
      await expect(d).toHaveAttribute('data-id', e.decisive_check.id);
      await expect(d.getByTestId('decisive')).toHaveText(e.decisive_check.id);
      await expect(d).toContainText(`enforces ${e.decisive_check.traces_to}`);
      await expect(d).toContainText(`requires ${e.decisive_check.expected}`);
      await expect(d).toContainText(`found ${e.decisive_check.found}`);
    } else await expect(h.getByTestId('decisive-check')).toHaveCount(0);
    if (e.deciding) await expect(h.getByTestId('detail-fault')).toContainText(`(${e.deciding.id})`);
    await expect(h.getByTestId('decisive-step-link')).toHaveCount(e.decisive_step === null ? 0 : 1);
    // The full explanation (trajectory, checks, world) agrees once it arrives.
    if (hasTrajectory(name)) await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
    await expect(h.getByTestId('reason')).toHaveText(e.reason);
  }
});

test('a trial with no audit row shows the not-audited marker and M5 pending in the criteria table', async ({ page }) => {
  for (const name of [TRIALS.failUnaudited, TRIALS.limit]) {
    const e = await explain(name);
    expect(e.audited).toBe(false);
    await openTrial(page, name);
    await expect(page.getByTestId('trial-header').getByTestId('not-audited')).toHaveText(NOT_AUDITED_MARKER);
    await page.getByRole('tab', { name: 'Attribution' }).click();
    const m5 = panel(page, 'attribution').locator('[data-testid="criterion-row"][data-id="M5"]');
    await expect(m5).toHaveAttribute('data-met', 'pending');
    await expect(m5).toContainText('M5: pending');
  }
  await openTrial(page, TRIALS.failAudited);
  await expect(page.getByTestId('trial-header').getByTestId('not-audited')).toHaveCount(0);
});

test('the decisive-step link scrolls the trajectory to that step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const e = await explain(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited);
  const link = page.getByTestId('trial-header').getByTestId('decisive-step-link');
  await expect(link).toHaveText(`Decisive step ${e.decisive_step}`);
  await link.click();
  const target = page.locator(`#step-${e.decisive_step}`);
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute('aria-current', 'step');
  await expect(target).toBeFocused();
});

test('the Attribution criteria table equals the explanation\'s criteria for every trial', async ({ page }) => {
  test.setTimeout(120_000);
  for (const name of NAMES.filter(hasTrajectory)) {
    const e = await explain(name);
    await openTrial(page, name, '&tab=attribution');
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
    const p = panel(page, 'attribution');
    const ui = await p.getByTestId('criterion-row').evaluateAll((els) => els.map((x) => ({ fault: x.getAttribute('data-fault'), id: x.getAttribute('data-id'), met: x.getAttribute('data-met'), evidence: x.getAttribute('data-evidence') })));
    const want = [
      ...e.criteria.map((c) => ({ fault: 'confirmation', id: c.id, met: String(c.met), evidence: c.evidence })),
      ...FAULT_PRECEDENCE.flatMap((f) => e.fault_criteria[f].map((c) => ({ fault: f, id: c.id, met: String(c.met), evidence: c.evidence }))),
    ];
    expect(ui, name).toEqual(want);
    for (const c of e.criteria) await expect(p.locator(`[data-testid="criterion-row"][data-id="${c.id}"]`)).toContainText(`${c.id}: ${MET_TEXT[String(c.met)]}`);
    if (e.deciding) await expect(p.locator(`[data-testid="criterion-row"][data-id="${e.deciding.id}"]`)).toHaveAttribute('data-deciding', 'true');
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-criteria', e.criteria.map((c) => `${c.id}: ${MET_TEXT[String(c.met)]}`).join(', '));
  }
});

test('Replay in State diff runs in the tab with no key and reproduces the final hash', async ({ page }) => {
  test.setTimeout(120_000);
  const r = record(TRIALS.failAudited);
  await openTrial(page, TRIALS.failAudited, '&tab=state-diff');
  const p = panel(page, 'state-diff');
  await expect(p.getByTestId('manifest-line')).toHaveText(/^Initial state hash matches the manifest/);
  await expect(p.getByTestId('hash-initial')).toHaveAttribute('data-hash', r.state_hash.initial!);
  await expect(p.getByTestId('hash-final')).toHaveAttribute('data-hash', r.state_hash.final!);
  await p.getByRole('button', { name: 'Replay' }).click();
  const result = p.getByTestId('replay-result');
  await expect(result).toHaveAttribute('data-match', 'true', { timeout: 90_000 });
  await expect(result).toHaveAttribute('data-final', r.state_hash.final!);
  await expect(p.getByTestId('diff-row').first()).toBeVisible();
  // The validation Worker ran it, started from a blob: URL so the page's CSP binds it.
  expect(page.workers().length).toBeGreaterThan(0);
  expect(page.workers().map((w) => w.url()).filter((u) => !u.startsWith('blob:'))).toEqual([]);
  // Moving to another tab and back keeps the replay.
  await page.getByRole('tab', { name: 'Raw' }).click();
  await page.getByRole('tab', { name: 'State diff' }).click();
  await expect(result).toHaveAttribute('data-match', 'true');
});

test('empty and error states', async ({ page }) => {
  // Not graded: an excluded trial has no checks.
  for (const name of [TRIALS.envError, TRIALS.infra]) {
    await openTrial(page, name);
    await expect(panel(page, 'grading').getByTestId('grading-empty')).toBeVisible();
    await expect(panel(page, 'grading').getByTestId('score-card')).toHaveText('Score');
  }
  // A check that threw: the grader's error, in the danger style.
  await openTrial(page, TRIALS.graderError);
  await expect(panel(page, 'grading').getByTestId('grading-error')).toContainText((record(TRIALS.graderError) as unknown as { error: { message: string } }).error.message);
  // A trajectory that cannot be read.
  await openTrial(page, TRIALS.noTrajectory);
  await expect(page.getByTestId('trajectory-error')).toContainText('cannot be read');
  // A trial id no run holds.
  await browse(page, `./?view=runs&run=${RUN_ID}&trial=nope%2F99`);
  await expect(page.getByTestId('error-state')).toContainText('nope/99');
  await expect(page.getByTestId('trial-header')).toHaveCount(0);
  // first-nonpass on a run with only passes.
  await browse(page, './?view=runs&run=pilot-pass&trial=first-nonpass');
  await expect(page.getByTestId('empty-state')).toHaveText('No non-pass trial in this run');
  await expect(page.getByTestId('trial-header')).toHaveCount(0);
  // first-nonpass on the fixture run opens the first valid non-pass trial in summary order.
  await browse(page, `./?view=runs&run=${RUN_ID}&trial=first-nonpass`);
  const order = Object.keys(summary.tasks);
  const first = records.filter((r) => r.outcome !== 'PASS' && isValid(r.outcome)).sort((a, b) => order.indexOf(a.task_id) - order.indexOf(b.task_id) || a.index - b.index)[0]!;
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', trialName(first));
});

test('Back to Runs restores the list with its filters, and history moves between them', async ({ page }) => {
  await browse(page, `./?view=runs&task=renal-dose-review&label=model`);
  const name = TRIALS.failAudited;
  await page.locator(`[data-testid="trial-row"][data-trial="${name}"]`).getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await page.getByRole('tab', { name: 'Attribution' }).click();
  await page.reload();
  await expect(panel(page, 'attribution')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue('renal-dose-review');
  await expect(page.getByRole('combobox', { name: 'Label' })).toHaveValue('model');
  await expect(page).not.toHaveURL(/tab=|trial=/);
  await page.goBack();
  await expect(panel(page, 'attribution')).toBeVisible();
});

test('axe finds no serious or critical violation on any tab, light and dark', async ({ page }) => {
  test.setTimeout(120_000);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const name of [TRIALS.failAudited, TRIALS.envError]) {
      await openTrial(page, name);
      for (const t of TABS) {
        await page.getByRole('tab', { name: t.name, exact: true }).click();
        await expect(panel(page, t.id)).toBeVisible();
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
        expect(bad, `${scheme} ${name} ${t.id}`).toEqual([]);
      }
    }
  }
});

test('at 390 px the panes stack and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [TRIALS.failAudited, TRIALS.limit]) {
    for (const t of TABS) {
      await openTrial(page, name, `&tab=${t.id}`);
      await expect(panel(page, t.id)).toBeVisible();
      const sizes = await page.evaluate(() => [document.querySelector('main')!, document.documentElement].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth })));
      for (const { sw, cw } of sizes) expect(sw, `${name} ${t.id}`).toBeLessThanOrEqual(cw);
    }
  }
});

// Navigation around the trial detail (verifier-phase-P16-1 N1, N2; review-ui-P16-1 F1, F2, F6, F8).
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name, exact: true });

test('a rail link leaves no run or tab behind, so each Findings example opens its own trial (N1, F8)', async ({ page }) => {
  await browse(page, `./?view=runs&run=pilot-pass&trial=${encodeURIComponent(TRIALS.pass)}&tab=raw`);
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-run', 'pilot-pass');
  await rail(page, 'Overview').click();
  await expect(page).not.toHaveURL(/[?&](run|tab|trial)=/);
  await page.goBack();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-run', 'pilot-pass');
  await rail(page, 'Findings').click();
  await expect(page).not.toHaveURL(/[?&](run|tab|trial)=/);
  // A Findings address that still names another run and tab (shared, or from before this fix):
  // each example names its own run and the default tab.
  await browse(page, './?view=findings&run=pilot-pass&tab=raw');
  const examples = page.getByTestId('exemplars').getByRole('link');
  await expect(examples.first()).toBeVisible();
  const n = await examples.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const name = (await examples.nth(i).textContent())!;
    await examples.nth(i).click();
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-run', RUN_ID);
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-tab', 'grading');
    await expect(page.getByTestId('error-state')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId('exemplars')).toBeVisible();
  }
});

test('Runs in the rail on a trial detail shows the list (N2, F2)', async ({ page }) => {
  await openTrial(page, TRIALS.failAudited, '&tab=raw');
  await rail(page, 'Runs').click();
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
  await expect(page.getByTestId('trial-row').first()).toBeVisible();
  await expect(page).not.toHaveURL(/[?&](trial|tab)=/);
  // The same after a glossary link and browser Back.
  await openTrial(page, TRIALS.failAudited);
  await page.getByTestId('trial-header').getByTestId('detail-fault').getByRole('link').first().click();
  await expect(page).toHaveURL(/view=glossary/);
  await page.goBack();
  await expect(page.getByTestId('trial-detail')).toBeVisible();
  await rail(page, 'Runs').click();
  await expect(page.getByTestId('trial-detail')).toHaveCount(0);
  await expect(page.getByTestId('trial-row').first()).toBeVisible();
});

test('a trial opened from low in the list opens at its header, with focus on its heading (F1)', async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await browse(page, './?view=runs');
    const rows = page.getByTestId('trial-list').first().getByTestId('trial-row');
    await expect(rows.first()).toBeVisible();
    const last = rows.last();
    const name = (await last.getAttribute('data-trial'))!;
    await last.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.querySelector('main')!.scrollTop)).toBeGreaterThan(0);
    await last.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
    await expect(page.getByTestId('trial-header')).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await page.evaluate(() => document.querySelector('main')!.scrollTop)).toBe(0);
  }
});

test('Back to Runs returns to the row the trial was opened from, and focus order follows the screen at 390 (F6)', async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await browse(page, './?view=runs');
    // The last row of the official run (a pilot run may hold a trial of the same name).
    const last = page.getByTestId('trial-list').first().getByTestId('trial-row').last();
    const name = (await last.getAttribute('data-trial'))!;
    await last.scrollIntoViewIfNeeded();
    await last.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
    await page.getByRole('link', { name: 'Back to Runs' }).click();
    const button = page.getByTestId('trial-list').first().locator(`[data-testid="trial-row"][data-trial="${name}"]`).getByRole('button', { name, exact: true });
    await expect(button).toBeInViewport();
    await expect(button).toBeFocused();
  }
  // In the DOM, and so in focus order, the tabs come before the trajectory, as they show at 390.
  await openTrial(page, TRIALS.failAudited);
  const tabsFirst = await page.evaluate(() => {
    const tabs = document.querySelector('[role="tablist"]')!;
    const traj = document.querySelector('[data-testid="trajectory"]')!;
    return Boolean(tabs.compareDocumentPosition(traj) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(tabsFirst).toBe(true);
});

test('a trial whose fault is not the model\'s is never told as a model failure (F3)', async ({ page }) => {
  for (const name of [TRIALS.graderError, TRIALS.envError, TRIALS.infra]) {
    const e = await explain(name);
    expect(e.fault, name).not.toBe('model');
    expect(e).toMatchObject({ taxonomy: null, decisive_check: null, decisive_step: null });
    await openTrial(page, name);
    const h = page.getByTestId('trial-header');
    await expect(h.getByTestId('decisive-check')).toHaveCount(0);
    await expect(h.getByTestId('decisive-step-link')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Attribution' }).click();
    const p = panel(page, 'attribution');
    await expect(p.getByTestId('taxonomy')).toHaveText(/^does not apply: /);
    await expect(p.getByTestId('exposure-row')).toHaveCount(0);
    for (const kind of ['reasoning', 'retrieval', 'output gap', 'over action', 'process']) await expect(page.getByTestId('trial-detail')).not.toContainText(`Kind: ${kind}`);
    await expect(p).not.toContainText("automatic kind");
  }
  // The check that threw is the grader's error in Grading, not a check the trial did not meet.
  const r = record(TRIALS.graderError) as unknown as { error: { check: string } };
  await openTrial(page, TRIALS.graderError);
  const row = panel(page, 'grading').locator(`[data-testid="gate-check"][data-id="${r.error.check}"]`);
  await expect(row).toHaveAttribute('data-error', 'true');
  await expect(row.getByTestId('check-state')).toHaveText('error');
  await expect(row).not.toContainText('Found ');
});

test('Attribution opens with the deciding criterion and the faults ruled out; only the deciding group is open; only codes are links (F4)', async ({ page }) => {
  for (const name of [TRIALS.limit, TRIALS.envError, TRIALS.failAudited]) {
    const e = await explain(name);
    await openTrial(page, name, '&tab=attribution');
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
    const p = panel(page, 'attribution');
    const summaryLine = p.getByTestId('criteria-summary');
    await expect(summaryLine).toContainText(`Decided by ${e.deciding!.id}`);
    // model and refusal are one fault word: the other is not listed as ruled out.
    const family = (f: string) => (f === 'refusal' ? 'model' : f);
    for (const f of FAULT_PRECEDENCE.filter((f) => family(f) !== family(e.fault!) && e.fault_criteria[f].every((c) => c.met !== true))) {
      const ids = e.fault_criteria[f].map((c) => c.id);
      await expect(summaryLine).toContainText(`${ids.length === 1 ? ids[0] : `${ids[0]}-${ids.at(-1)}`} not met`);
    }
    // The deciding fault's group is open; a group with no criterion that holds is closed.
    for (const f of FAULT_PRECEDENCE) {
      const group = p.locator(`[data-testid="fault-criteria"][data-fault="${f}"]`);
      const holds = e.fault_criteria[f].some((c) => c.met === true);
      if (f === e.fault) await expect(group).toHaveAttribute('open', '');
      else if (!holds) await expect(group).not.toHaveAttribute('open');
    }
    // Each row links its code only, and its sentence is plain text.
    const links = await p.getByTestId('criterion-row').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('a')].map((a) => a.textContent)));
    for (const l of links) expect(l.length).toBe(1);
    const rowIds = await p.getByTestId('criterion-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id')));
    expect(links.map((l) => l[0])).toEqual(rowIds);
  }
});
