// The browse views against the committed sample run (built with
// RESULTS_ROOT=apps/web/e2e/fixtures/sample-results), after "Browse without a key": Tasks lists
// the six tasks and runs each oracle, matrix and replay in the tab with no key, the matrix's
// probe verdicts equal to what `pnpm cli matrix` wrote; Overview shows k/N, the Wilson interval
// and one swatch per trial; Runs shows each non-pass trial's outcome, label, decisive check and
// reason as explainTrial gives them, with PASS_DEFINITION and DENOMINATOR_RULE in its header;
// the help icon opens the glossary; Environment verifies the reset hash and runs a read tool. At
// 390 px no view scrolls sideways, and a record the loader cannot read is an error row, not a
// blank app.
import { expect, test, type Page } from '@playwright/test';
import { NOT_AUDITED_MARKER } from '../../../packages/core/explain.ts';
import { AUDIT_LABEL, DENOMINATOR_RULE, FAULT_DEFINITIONS, FAULT_PRECEDENCE, PASS_DEFINITION } from '../../../packages/core/outcomes.ts';
import { trialName } from '../../../packages/core/summary.ts';
import { markOf } from '../src/data/ui.tsx';
import { CHECK_TEXT, cliCriteria, cliMatrix, cliReplay, explain, sampleBase, MANIFEST_HASH, records, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';

async function browse(page: Page, path = './') {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  // A tab that already chose to browse goes straight to the view.
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
  await expect(nav).toBeVisible();
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
    await expect(page.getByTestId('task-tools')).toBeVisible();
    // Run trial is on the prompt tab; with no key it says that Live trial asks for one (JU5).
    const prompt = cards.first().getByTestId('task-panel-prompt');
    await expect(prompt.getByRole('button', { name: 'Run trial' })).toBeEnabled();
    await expect(prompt).toContainText('Live trial asks for an API key.');
    await cards.first().getByRole('tab', { name: 'Rubric' }).click();
    await expect(page.getByTestId('task-check').first()).toBeVisible();
    await page.getByTestId('task-check').first().locator('summary').click();
    await expect(page.getByTestId('check-source').first()).not.toBeEmpty();
    await cards.first().getByRole('tab', { name: 'Reference solution' }).click();
    await expect(page.getByTestId('solution-step').first()).toBeVisible();
    // A closed card keeps its grader validation row, Run trial included.
    const closed = cards.nth(1).getByTestId('validation');
    await expect(closed.getByRole('button', { name: 'Run trial' })).toBeEnabled();
    await expect(closed).toContainText('Live trial asks for an API key.');
  });

  for (const id of TASK_IDS) {
    test(`${id}: oracle PASS 1.0, matrix verdicts equal the CLI's, replay verdicts equal the CLI's`, async ({ page }) => {
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
      await expect(rows).toHaveCount(records.filter((r) => r.task_id === id).length);
      // Each verdict equals `pnpm cli replay --json`, the excluded and GRADER_ERROR records too.
      const browser = await rows.evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-trial'), { match: e.getAttribute('data-match') === 'true', outcome: e.getAttribute('data-outcome') || null }])));
      const replayed = await cliReplay(id);
      expect(browser).toEqual(Object.fromEntries(Object.entries(replayed).map(([name, t]) => [name, { match: t.match, outcome: t.outcome }])));
      for (const [name, t] of Object.entries(replayed)) if (!t.match) await expect(v.locator(`[data-testid="replay-row"][data-trial="${name}"]`)).toContainText(t.error!);
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
    const mine = records.filter((r) => r.task_id === id);
    await expect(row.getByTestId('swatches').getByRole('img')).toHaveCount(mine.length);
    // Each mark is the outcome and fault explainTrial gives, so environment, grader and infra differ.
    const marks = await row.getByTestId('swatches').getByRole('img').evaluateAll((els) => els.map((e) => e.getAttribute('data-mark')).sort());
    expect(marks).toEqual(mine.map((r) => markOf(explain(r).outcome, explain(r).fault)).sort());
  }
  const all = new Set(records.map((r) => markOf(explain(r).outcome, explain(r).fault)));
  for (const m of ['environment', 'grader', 'infra', 'refusal', 'limit', 'model', 'pass']) expect(all, m).toContain(m);
  await expect(page.getByTestId('legend').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
  await expect(page.getByTestId('data-warning')).toHaveCount(0);
});

test('Runs: every non-pass row shows outcome, label, decisive check and reason without a click', async ({ page }) => {
  // About 400 assertions over 75 rows: the default 30 s was too tight under parallel load (review-phase-P14 F4).
  test.setTimeout(120_000);
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
  await expect(page.getByTestId('taxonomy-row')).toHaveCount(6);
  await expect(page.getByTestId('glossary-pass')).toHaveText(PASS_DEFINITION);
  await expect(page.getByTestId('glossary-denominator')).toHaveText(DENOMINATOR_RULE);
});

test('the trial detail says each criterion and the fault in words, linked to the glossary', async ({ page }) => {
  const failing = records.find((r) => r.outcome === 'FAIL' && explain(r).label === 'model' && !explain(r).audited)!;
  await browse(page, `./?view=runs&trial=${encodeURIComponent(trialName(failing))}`);
  const detail = page.getByTestId('trial-detail');
  await expect(detail).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  await expect(detail.getByTestId('detail-criteria').locator('li')).toHaveCount(5);
  // Inside the line, the criterion's sentence starts lower-case and has no full stop (review-ui-P16-1 F5).
  const text = FAULT_DEFINITIONS.model.criteria[0]!.text.replace(/\.$/, '');
  await expect(detail.getByTestId('detail-fault')).toContainText(`decided by ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  await detail.getByRole('link', { name: 'model', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How failures are attributed');
  await expect(page).toHaveURL(/#fault-model$/);
});

test('every trial detail shows the criteria audit-check gives; M3 is pending because the run has no manifest', async ({ page }) => {
  // 75 rows opened one by one, each waiting for its full explanation.
  test.setTimeout(300_000);
  const cli = await cliCriteria();
  await browse(page, './?view=runs');
  const ui: Record<string, string> = {};
  for (const r of records) {
    const name = trialName(r);
    const row = page.locator(`[data-testid="trial-row"][data-trial="${name}"]`);
    await row.getByRole('button', { name, exact: true }).click();
    const detail = page.getByTestId('trial-detail');
    await expect(detail).toHaveAttribute('data-trial', name);
    await expect(detail).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
    ui[name] = (await detail.getAttribute('data-criteria'))!;
    await page.getByRole('link', { name: 'Back to Runs' }).click();
  }
  const differ = Object.keys(cli).filter((n) => ui[n] !== cli[n]).map((n) => `${n}\n  cli ${cli[n]}\n  ui  ${ui[n]}`);
  expect(differ, `${differ.length} of ${records.length} trials differ`).toEqual([]);
  const pass = records.find((r) => r.outcome === 'PASS')!;
  await browse(page, `./?view=runs&trial=${encodeURIComponent(trialName(pass))}`);
  const m3 = page.getByTestId('trial-detail').locator('[data-testid="detail-criteria"] li[data-id="M3"]');
  await expect(m3).toHaveAttribute('data-met', 'pending');
  await expect(m3).toContainText('pending: run has no manifest');
  await expect(m3).toHaveAttribute('data-evidence', /^run has no manifest; /);
});

test('a run manifest on another world makes M3 not met, and Notes shorten each hash with a copy control', async ({ page }) => {
  const manifest = `results/runs/${summary.run_id}/manifest.json`;
  const other = 'f'.repeat(64);
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { files: [...files, manifest] } });
  });
  await page.route(`**/data/${manifest}`, (route) => route.fulfill({ json: { world_hash: other } }));
  const pass = records.find((r) => r.outcome === 'PASS')!;
  await browse(page, `./?view=runs&trial=${encodeURIComponent(trialName(pass))}`);
  const detail = page.getByTestId('trial-detail');
  await expect(detail).toHaveAttribute('data-full', 'true', { timeout: 60_000 });
  await expect(detail.locator('[data-testid="detail-criteria"] li[data-id="M3"]')).toHaveAttribute('data-met', 'false');
  const notes = detail.getByTestId('detail-notes');
  await expect(notes).toContainText('E2: ');
  await expect(notes.locator(`[data-hash="${other}"]`)).toHaveCount(1);
  await expect(notes.locator(`[data-hash="${pass.state_hash.initial}"]`)).toHaveCount(1);
  expect(await notes.innerText()).not.toMatch(/[0-9a-f]{64}/);
});

test('URL state round-trips: task, label and open trial survive a reload and history', async ({ page }) => {
  const failing = records.find((r) => r.outcome === 'FAIL' && explain(r).label === 'model')!;
  const name = trialName(failing);
  await browse(page, `./?view=runs&task=${failing.task_id}&label=model&trial=${encodeURIComponent(name)}`);
  // The open trial is its own screen; Back to Runs shows the list with the filters kept.
  const check = async () => {
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
    await page.getByRole('link', { name: 'Back to Runs' }).click();
    await expect(page.getByRole('combobox', { name: 'Task' })).toHaveValue(failing.task_id);
    await expect(page.getByRole('combobox', { name: 'Label' })).toHaveValue('model');
    await page.goBack();
    await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', name);
  };
  await check();
  // The tab chose to browse, so a reload goes straight to the view (verifier-phase-P14-2 F8).
  await page.reload();
  await expect(page.getByRole('button', { name: 'Browse without a key' })).toHaveCount(0);
  await check();
  // A filter cleared on the list comes back with history.
  await page.getByRole('link', { name: 'Back to Runs' }).click();
  await page.getByRole('combobox', { name: 'Label' }).selectOption('');
  await expect(page).not.toHaveURL(/label=/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Label' })).toHaveValue('model');
  await page.goBack();
  await check();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/view=overview/);
  await page.goBack();
  await check();
});

test('Environment: Verify reset equals the manifest hash; Try on fhir_search returns rows, exposed_ids and an unchanged hash', async ({ page }) => {
  await browse(page, './?view=environment');
  await expect(page.getByTestId('manifest-hash')).toHaveAttribute('data-hash', MANIFEST_HASH);
  await expect(page.getByTestId('manifest-hash')).toContainText(`${MANIFEST_HASH.slice(0, 8)}…${MANIFEST_HASH.slice(-4)}`);
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

test('Tasks: each check says what it requires, and the reference solution lists its tool calls', async ({ page }) => {
  await browse(page, './?view=tasks&task=renal-dose-review&tab=rubric');
  const card = page.locator('[data-testid="task-card"][data-task="renal-dose-review"]');
  await expect(card.locator('[data-testid="task-check"][data-check="note_explains_eie_scr"]').getByTestId('check-question')).toContainText('entered in error');
  await expect(card.locator('[data-testid="task-check"][data-check="apixaban_dose"]')).toContainText('gate check: must be met to pass');
  // Every gate check says what it requires without a click, in the words its failure reason uses.
  for (const [id, t] of Object.entries(CHECK_TEXT['renal-dose-review']!)) await expect(card.locator(`[data-testid="task-check"][data-check="${id}"]`).getByTestId('check-requires')).toHaveText(`Requires ${t.requires}.`);
  await card.getByRole('tab', { name: 'Reference solution' }).click();
  await expect(card.getByTestId('solution-step').first()).toBeVisible();
  await expect(card.getByTestId('solution-step').first()).toContainText('1.');
  expect(await card.getByTestId('solution-step').count()).toBeGreaterThan(5);
});

test('a trial record missing cost_usd is an error row in Runs; the app and the other rows stay', async ({ page }) => {
  const bad = records.find((r) => r.task_id === 'renal-dose-review' && r.index === 3)!;
  await page.route(`**/data/results/runs/${summary.run_id}/trials/renal-dose-review/3.json`, async (route) => {
    const { cost_usd: _, ...rest } = bad as unknown as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rest) });
  });
  await browse(page, './?view=runs');
  const row = page.locator('[data-testid="record-error"][data-trial="renal-dose-review/3"]');
  await expect(row).toContainText('cost_usd is missing');
  await expect(page.getByTestId('trial-row')).toHaveCount(records.length - 1);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByTestId('data-warning')).toContainText('1 trial record cannot be read');
  await expect(page.getByTestId('overview-row')).toHaveCount(TASK_IDS.length);
});

test('at 390 px no view scrolls sideways, with a task and a failed trial open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const failing = records.find((r) => r.outcome === 'FAIL' && r.task_id === 'contrast-ct-prep')!;
  const views = ['./?view=overview', './?view=tasks&task=contrast-ct-prep&tab=reference-solution', `./?view=runs&trial=${encodeURIComponent(trialName(failing))}`, './?view=findings', './?view=environment', './?view=glossary'];
  for (const path of views) {
    await browse(page, path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    if (path.includes('tasks')) await expect(page.getByTestId('solution-step').first()).toBeVisible();
    if (path.includes('runs')) await expect(page.getByTestId('trial-detail')).toBeVisible();
    if (path.includes('overview')) await expect(page.getByTestId('overview-row').first()).toBeVisible();
    const sizes = await page.evaluate(() => [document.querySelector('main')!, document.documentElement].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth })));
    for (const { sw, cw } of sizes) expect(sw, path).toBeLessThanOrEqual(cw);
  }
});
