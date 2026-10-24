// The browse views against the committed sample run (built with
// RESULTS_ROOT=apps/web/e2e/fixtures/sample-results), after "Browse without a key": Tasks lists
// the six tasks and runs each oracle, matrix and replay in the tab with no key, the matrix's
// probe verdicts equal to what `pnpm cli matrix` wrote; Overview shows k/N, the Wilson interval
// and one swatch per trial; Runs shows each non-pass trial's outcome, label, decisive check and
// reason as explainTrial gives them, with PASS_DEFINITION and DENOMINATOR_RULE in its header;
// the help icon opens the glossary; Environment verifies the reset hash and runs a read tool.
import { expect, test, type Page } from '@playwright/test';
import { NOT_AUDITED_MARKER } from '../../../packages/core/explain.ts';
import { AUDIT_LABEL, DENOMINATOR_RULE, FAULT_DEFINITIONS, FAULT_PRECEDENCE, PASS_DEFINITION } from '../../../packages/core/outcomes.ts';
import { trialName } from '../../../packages/core/summary.ts';
import { cliMatrix, explain, sampleBase, MANIFEST_HASH, records, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

async function browse(page: Page, path = './') {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

test('the build serves the sample run', () => {
  expect(summary.run_id).toBe('sample-1');
  expect(Object.keys(summary.tasks)).toEqual(TASK_IDS);
  for (const t of Object.values(summary.tasks)) expect(t.trials).toBe(12);
});

test.describe('grader validation in the tab, no key', () => {
  test.describe.configure({ mode: 'parallel', timeout: 600_000 });

  test('Tasks lists exactly the six tasks, no _toy, each with prompt, tools and checks', async ({ page }) => {
    await browse(page, './?view=tasks');
    const cards = page.getByTestId('task-card');
    await expect(cards).toHaveCount(6);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-task')))).toEqual(TASK_IDS);
    await cards.first().getByRole('button').first().click();
    await expect(page.getByTestId('task-prompt')).toBeVisible();
    await expect(page.getByTestId('task-checks').locator('tbody tr').first()).toBeVisible();
    // Live controls are shown disabled with the reason.
    const run = page.getByTestId('validation').first().getByRole('button', { name: 'Run trial' });
    await expect(run).toBeDisabled();
    await expect(page.getByTestId('validation').first()).toContainText('Needs an API key.');
  });

  for (const id of TASK_IDS) {
    test(`${id}: oracle PASS 1.0, matrix verdicts equal the CLI's, replay reproduces the published hashes`, async ({ page }) => {
      await browse(page, './?view=tasks');
      const v = page.locator(`[data-testid="validation"][data-task="${id}"]`);
      await v.getByRole('button', { name: 'Run oracle' }).click();
      const oracle = v.getByTestId('oracle-result');
      await expect(oracle).toHaveAttribute('data-outcome', 'PASS', { timeout: 120_000 });
      await expect(oracle).toHaveAttribute('data-score', '1');
      await expect(oracle).toContainText('PASS score 1.0');

      await v.getByRole('button', { name: 'Run matrix' }).click();
      const matrix = v.getByTestId('matrix-result');
      await expect(matrix).toBeVisible({ timeout: 540_000 });
      const cli = await cliMatrix(id);
      const probes = await matrix.getByTestId('probe').evaluateAll((els) =>
        els.map((e) => ({ kind: e.getAttribute('data-kind'), id: e.getAttribute('data-id'), outcome: e.getAttribute('data-outcome'), as_expected: e.getAttribute('data-as-expected') === 'true', failed_checks: (e.getAttribute('data-failed') ?? '').split(',').filter((x) => x !== '') })));
      expect(probes.length).toBe(cli.probes.length);
      expect(probes).toEqual(cli.probes);
      await expect(matrix).toHaveAttribute('data-pass', String(cli.pass));

      await v.getByRole('button', { name: 'Replay published trials' }).click();
      const rows = v.getByTestId('replay-row');
      await expect(rows.first()).toBeVisible({ timeout: 300_000 });
      const mine = records.filter((r) => r.task_id === id);
      await expect(rows).toHaveCount(mine.length);
      for (const r of mine) {
        const row = v.locator(`[data-testid="replay-row"][data-trial="${trialName(r)}"]`);
        const replayable = r.state_hash.final !== null && !['INVALID', 'INFRA_HARNESS', 'INFRA_API', 'CANCELLED', 'ENV_ERROR'].includes(r.outcome);
        await expect(row).toHaveAttribute('data-status', replayable ? 'reproduced' : 'skipped');
        if (replayable) await expect(row).toHaveAttribute('data-final', r.state_hash.final!);
      }
    });
  }
});

test('Overview: k/N with N from the run, Wilson bounds equal summary.json, one swatch per trial, the band drawn', async ({ page }) => {
  await browse(page);
  const rows = page.getByTestId('overview-row');
  await expect(rows).toHaveCount(TASK_IDS.length);
  for (const id of TASK_IDS) {
    const s = summary.tasks[id]!;
    const row = page.locator(`[data-testid="overview-row"][data-task="${id}"]`);
    await expect(row.getByTestId('k-of-n')).toHaveText(`${s.passes}/12`);
    const whisker = row.getByTestId('whisker');
    expect(Number(await whisker.getAttribute('data-lo'))).toBe(s.wilson95!.lo);
    expect(Number(await whisker.getAttribute('data-hi'))).toBe(s.wilson95!.hi);
    await expect(row.getByTestId('band')).toHaveCount(1);
    await expect(row.getByTestId('swatches').getByRole('img')).toHaveCount(records.filter((r) => r.task_id === id).length);
  }
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
});

test('Runs: every non-pass row shows outcome, label, decisive check and reason without a click', async ({ page }) => {
  await browse(page, './?view=runs');
  await expect(page.getByTestId('pass-definition')).toHaveText(PASS_DEFINITION);
  await expect(page.getByTestId('denominator-rule')).toHaveText(DENOMINATOR_RULE);
  await expect(page.getByTestId('runs-k-of-n')).toHaveText(`All tasks: ${summary.totals.passes}/${summary.totals.trials} pass`);
  const seen = new Set<string>();
  for (const r of records) {
    const e = explain(r);
    const row = page.locator(`[data-testid="trial-row"][data-trial="${trialName(r)}"]`);
    await expect(row.getByTestId('outcome')).toHaveText(e.outcome);
    seen.add(e.outcome);
    if (e.outcome === 'PASS') continue;
    await expect(row.getByTestId('reason')).toHaveText(e.reason);
    if (e.decisive_check) await expect(row.getByTestId('decisive')).toHaveText(e.decisive_check.id);
    if (e.fault === 'infra') {
      await expect(row.getByTestId('label')).toHaveText('infra: rerun, not counted');
      await expect(row.getByTestId('label')).toHaveAttribute('data-label', 'infra');
      await expect(row.getByTestId('not-audited')).toHaveCount(0);
      continue;
    }
    await expect(row.getByTestId('label')).toHaveText(`${e.label}${e.label_subtype ? ` (${e.label_subtype})` : ''}`);
    if (e.outcome === 'REFUSAL') await expect(row.getByTestId('label')).toHaveText('model (refusal)');
    await expect(row.getByTestId('not-audited')).toHaveCount(e.audited ? 0 : 1);
    if (!e.audited) await expect(row.getByTestId('not-audited')).toHaveText(NOT_AUDITED_MARKER);
  }
  for (const o of ['FAIL', 'ENV_ERROR', 'GRADER_ERROR', 'REFUSAL', 'LIMIT', 'INFRA_API']) expect(seen, o).toContain(o);
  expect(records.some((r) => r.outcome !== 'PASS' && !explain(r).audited && explain(r).fault !== 'infra')).toBe(true);

  // The label filter.
  await page.getByRole('combobox', { name: 'Label' }).selectOption('environment');
  const envRows = records.filter((r) => explain(r).label === 'environment' && explain(r).outcome !== 'PASS');
  await expect(page.getByTestId('trial-row')).toHaveCount(envRows.length);
});

test('one click on a fault label opens the glossary, whose text equals outcomes.ts', async ({ page }) => {
  await browse(page, './?view=runs');
  await page.locator('[data-testid="trial-row"][data-outcome="FAIL"]').first().getByRole('link', { name: /How the model label is given/ }).click();
  await expect(page).toHaveURL(/view=glossary/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How failures are attributed');
  for (const f of FAULT_PRECEDENCE) {
    await expect(page.locator(`[data-testid="fault-sentence"][data-fault="${f}"]`)).toHaveText(FAULT_DEFINITIONS[f].sentence);
    for (const c of FAULT_DEFINITIONS[f].criteria) await expect(page.locator(`[data-testid="criterion"][data-id="${c.id}"]`).getByTestId('criterion-text')).toHaveText(c.text);
    const l = AUDIT_LABEL[f];
    await expect(page.locator(`[data-testid="audit-label-row"][data-fault="${f}"]`).getByTestId('audit-label')).toHaveText(l === null ? 'no label: excluded and rerun' : `${l.label}${l.subtype ? ` (subtype ${l.subtype})` : ''}`);
  }
  await expect(page.getByTestId('glossary-pass')).toHaveText(PASS_DEFINITION);
  await expect(page.getByTestId('glossary-denominator')).toHaveText(DENOMINATOR_RULE);
});

test('URL state round-trips: task, label and open trial survive a reload and history', async ({ page }) => {
  const failing = records.find((r) => r.outcome === 'FAIL' && explain(r).label === 'model')!;
  const name = trialName(failing);
  await browse(page, `./?view=runs&task=${failing.task_id}&label=model&trial=${encodeURIComponent(name)}`);
  const check = async () => {
    await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue(failing.task_id);
    await expect(page.getByRole('combobox', { name: 'Label' })).toHaveValue('model');
    await expect(page.locator(`[data-testid="trial-row"][data-trial="${name}"]`).getByTestId('trial-detail')).toBeVisible();
  };
  await check();
  await page.reload();
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  await check();
  await page.getByRole('combobox', { name: 'Label' }).selectOption('');
  await expect(page).not.toHaveURL(/label=/);
  await page.goBack();
  await check();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/view=overview/);
  await page.goBack();
  await check();
});

test('Environment: Verify reset equals the manifest hash; Try on fhir_search returns rows, exposed_ids and an unchanged hash', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByTestId('manifest-hash')).toHaveText(MANIFEST_HASH);
  await expect(page.getByTestId('tool')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Verify reset' }).click();
  await expect(page.getByTestId('reset-result')).toHaveAttribute('data-hash', MANIFEST_HASH, { timeout: 60_000 });
  await expect(page.getByTestId('reset-result')).toHaveAttribute('data-equal', 'true');
  await page.getByRole('combobox', { name: 'Tool' }).selectOption('fhir_search');
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  const r = page.getByTestId('try-result');
  await expect(r).toHaveAttribute('data-error', 'false', { timeout: 60_000 });
  await expect(r).toHaveAttribute('data-hash-before', MANIFEST_HASH);
  await expect(r).toHaveAttribute('data-hash-after', MANIFEST_HASH);
  await expect(r.getByTestId('try-unchanged')).toHaveText('unchanged');
  await expect(r.getByTestId('try-exposed')).toContainText('Patient/');
  await expect(r.getByTestId('try-content')).toContainText('"entries"');
});

test('after Browse without a key, Overview, Tasks, Runs and Environment each render data and no empty state', async ({ page }) => {
  await browse(page);
  const rail = page.getByRole('navigation', { name: 'Views' });
  const data: Record<string, string> = { Overview: 'overview-row', Tasks: 'task-card', Runs: 'trial-row', Environment: 'tool' };
  for (const [view, testId] of Object.entries(data)) {
    await rail.getByRole('link', { name: view }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(view);
    await expect(page.getByTestId(testId).first()).toBeVisible();
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  }
});
