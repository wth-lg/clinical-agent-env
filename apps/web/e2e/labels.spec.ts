// Plain labels (pre-audit S9, P17j JU1): no route shows "Run oracle", "Run matrix",
// "Browser-direct", "Worker" or the rail label "Labels"; the buttons read "Run reference
// solution" and "Check the grader", the surface chip "Hosted", the rail "Attribution". On a PASS
// the trial header's M1-M5 row reads "Confirmed" or "Checks pending" with what is missing, and
// the codes are in the Attribution tab only.
import { expect, test, type Page } from '@playwright/test';
import { sampleBase } from './fixtures/sample-results/sample.ts';
import { trialBase, TRIALS, RUN_ID } from './fixtures/trial/trial.ts';

async function browse(page: Page, url: string) {
  await page.goto(url);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
}

const GONE = [/\bRun oracle\b/, /\bRun matrix\b/, /Browser-direct/, /\bWorker\b/];

async function expectNoOldLabels(page: Page, where: string) {
  for (const re of GONE) await expect(page.getByText(re), `${where}: ${re}`).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Labels', exact: true }), where).toHaveCount(0);
}

test('no browse route shows the old labels; the rail says Attribution and the chip says Hosted', async ({ page }) => {
  test.setTimeout(120_000);
  const base = await sampleBase(test.info().project.use.baseURL!);
  for (const q of ['?view=overview', '?view=tasks', '?view=runs', '?view=live', '?view=findings', '?view=environment', '?view=glossary']) {
    await browse(page, new URL(`./${q}`, base).href);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectNoOldLabels(page, q);
  }
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Attribution', exact: true })).toBeVisible();
  await expect(page.getByTestId('surface-chip')).toHaveText('Hosted');
});

test('the task buttons read Run reference solution and Check the grader, on every tab', async ({ page }) => {
  const base = await sampleBase(test.info().project.use.baseURL!);
  await browse(page, new URL('./?view=tasks&task=renal-dose-review&tab=grader-validation', base).href);
  const panel = page.getByTestId('task-panel-grader-validation');
  await expect(panel.getByRole('button', { name: 'Run reference solution' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Check the grader' })).toBeVisible();
  for (const tab of ['prompt', 'policy', 'rubric', 'reference-solution', 'grader-validation']) {
    await page.getByRole('tablist', { name: 'Task' }).locator(`[data-tab="${tab}"]`).click();
    await expectNoOldLabels(page, tab);
  }
});

test('a PASS trial header says Confirmed or Checks pending, with no M1-M5 codes; Attribution keeps them', async ({ page }) => {
  const base = await trialBase(test.info().project.use.baseURL!);
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.pass)}`, base).href);
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('header-confirmation')).toHaveText(/^(Confirmed\.|Checks pending: this trial still needs .+\.) See Attribution$/);
  await expect(header.getByTestId('header-criteria')).toHaveCount(0);
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5']) await expect(header.getByText(new RegExp(`\\b${id}\\b`))).toHaveCount(0);
  await header.getByRole('link', { name: 'See Attribution' }).click();
  await expect(page).toHaveURL(/[?&]tab=attribution(&|$)/);
  await expect(page.getByTestId('panel-attribution')).toContainText('M1');
});

test('a non-pass trial header keeps the M1-M5 row', async ({ page }) => {
  const base = await trialBase(test.info().project.use.baseURL!);
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.failAudited)}`, base).href);
  await expect(page.getByTestId('trial-header').getByTestId('header-criteria').locator('li')).toHaveCount(5);
});

test('a PASS that a human audit says did not pass shows Contradicted, in the danger colour, not pending (verifier JU1-1 F1)', async ({ page }) => {
  // The fixture PASS gets an audit row whose outcome is FAIL: M5 on a PASS is not met.
  await page.route(`**/data/results/runs/${RUN_ID}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    const row = { trial: TRIALS.pass, outcome: 'FAIL', taxonomy: 'reasoning', model_fault: 'yes', decisive_step: 1, evidence_ids: ['Observation/obs-t1-scr-1020'], llm_auditor_agrees: true };
    await route.fulfill({ response: res, body: `${await res.text()}${JSON.stringify(row)}\n` });
  });
  const base = await trialBase(test.info().project.use.baseURL!);
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.pass)}`, base).href);
  const c = page.getByTestId('trial-header').getByTestId('header-confirmation');
  await expect(c).toHaveAttribute('data-state', 'contradicted');
  await expect(c).toContainText('This PASS is contradicted: the human audit says this trial did not pass.');
  await expect(c).not.toContainText('still needs a human audit');
  await expect(c.locator('.text-danger')).toHaveCount(1);
});

test('the Reference solution tab grades the reference solution and shows oracle PASS 1.0 (verifier JU1-1 F2, F3)', async ({ page }) => {
  test.setTimeout(180_000);
  const base = await sampleBase(test.info().project.use.baseURL!);
  await browse(page, new URL('./?view=tasks&task=renal-dose-review&tab=reference-solution', base).href);
  await expect(page.getByTestId('task-panel-reference-solution').getByTestId('oracle-badge')).toHaveText('oracle PASS 1.0', { timeout: 150_000 });
});

test('the prompt tab and the Live launcher name the model in one form (verifier JU1-1 F2, F4)', async ({ page }) => {
  const base = await sampleBase(test.info().project.use.baseURL!);
  await browse(page, new URL('./?view=tasks&task=renal-dose-review&tab=prompt', base).href);
  await expect(page.getByTestId('task-model')).toHaveText('Runs claude-opus-5-5 at effort high');
  await browse(page, new URL('./?view=live&task=renal-dose-review', base).href);
  await expect(page.getByTestId('launcher-model')).toContainText('claude-opus-5-5 at effort high');
});

test('a PASS whose record has an internal tool error shows that it is contradicted, not pending (coordinator: PASS + INTERNAL)', async ({ page }) => {
  await page.route(`**/data/results/runs/${RUN_ID}/trials/${TRIALS.pass}.json`, async (route) => {
    const res = await route.fetch();
    const record = JSON.parse(await res.text()) as { tool_errors: Record<string, number> };
    record.tool_errors = { ...record.tool_errors, INTERNAL: 1 };
    await route.fulfill({ response: res, body: JSON.stringify(record) });
  });
  const base = await trialBase(test.info().project.use.baseURL!);
  await browse(page, new URL(`./?view=runs&run=${RUN_ID}&trial=${encodeURIComponent(TRIALS.pass)}`, base).href);
  const c = page.getByTestId('trial-header').getByTestId('header-confirmation');
  await expect(c).toHaveAttribute('data-state', 'contradicted');
  await expect(c).toContainText('This PASS is contradicted: a tool call returned an internal error.');
});
