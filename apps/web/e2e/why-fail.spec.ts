// Why tasks fail (plan P17j JU7, pre-audit S4): Findings shows, per task, a bar by kind of failure
// (TAXONOMY of the current grade, not by outcome), the top failed checks with their check text and
// a Runs link whose filter shows exactly that check's trials, and the fault box: counts by audit
// label, each linking to Runs filtered by that label, the M1-M4 count and the infra re-runs. The
// Overview table gets a "most common failure" column and the run's fault box under it. Every
// number equals summary.json (fault_counts, top_failed_checks), except the M1-M4 count, which only
// the explanations give (audit-check --json gives the same). The glossary shows GR5. A run with a
// trial that blocks it (here a false PASS, GR5) says it is blocked, shows the false PASS count
// beside k/n and has no headline pass rate (DENOMINATOR_RULE).
import { expect, test, type Page } from '@playwright/test';
import { audit, explain, records, sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';
import { trialName } from '../../../packages/core/summary.ts';
import { FAILURE_KINDS, FAILURE_LABELS } from '../../../packages/core/summary.ts';

async function browse(page: Page, path: string) {
  await page.goto(new URL(path, await sampleBase(test.info().project.use.baseURL!)).href);
  await page.getByRole('button', { name: 'Browse without a key' }).click();
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible();
}

const failures = (task: string) => records.filter((r) => r.task_id === task).map((r) => ({ r, e: explain(r) })).filter(({ e }) => e.valid && e.outcome !== 'PASS');
const m1m4 = (task: string) => failures(task).filter(({ e }) => ['M1', 'M2', 'M3', 'M4'].every((id) => e.criteria.find((c) => c.id === id)?.met === true)).length;
const official = (page: Page) => page.locator('[data-testid="run"][data-official="true"]');

test('Findings: a bar by kind of failure per task, equal to summary.json', async ({ page }) => {
  await browse(page, './?view=findings');
  await expect(page.getByTestId('kind-bar')).toHaveCount(TASK_IDS.length);
  for (const id of TASK_IDS) {
    const fc = summary.tasks[id]!.fault_counts;
    const bar = page.locator(`[data-testid="kind-bar"][data-task="${id}"]`);
    await expect(bar).toHaveAttribute('data-total', String(fc.failures));
    const segments = await bar.locator('[data-kind]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-kind'), Number(e.getAttribute('data-count'))])));
    expect(segments).toEqual(Object.fromEntries(FAILURE_KINDS.filter((k) => fc.taxonomy[k] > 0).map((k) => [k, fc.taxonomy[k]])));
  }
});

test('Findings: top failed checks with their text, and each Runs link shows exactly that check\'s trials', async ({ page }) => {
  await browse(page, './?view=findings');
  const id = 'renal-dose-review';
  const top = summary.tasks[id]!.top_failed_checks;
  const items = page.locator(`[data-testid="top-checks"][data-task="${id}"] [data-testid="top-check"]`);
  await expect(items).toHaveCount(top.length);
  for (const [i, c] of top.entries()) {
    await expect(items.nth(i)).toHaveAttribute('data-check', c.check);
    await expect(items.nth(i).getByTestId('top-check-count')).toHaveText(String(c.count));
    await expect(items.nth(i).getByTestId('top-check-text')).not.toHaveText('');
  }
  const first = top[0]!;
  await items.first().getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`check=${first.check}`));
  const rows = official(page).getByTestId('trial-row');
  await expect(rows).toHaveCount(first.count);
  const want = failures(id).filter(({ e }) => e.decisive_check?.id === first.check).map(({ r }) => trialName(r)).sort();
  expect((await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-trial')))).sort()).toEqual(want);
  for (const d of await rows.getByTestId('decisive').allTextContents()) expect(d).toBe(first.check);
});

test('Findings: the fault box counts by audit label with Runs links, the M1-M4 count and infra re-runs', async ({ page }) => {
  await browse(page, './?view=findings');
  for (const id of TASK_IDS) {
    const fc = summary.tasks[id]!.fault_counts;
    const box = page.locator(`[data-testid="fault-box"][data-task="${id}"]`);
    for (const l of FAILURE_LABELS) await expect(box.locator(`[data-testid="fault-label-count"][data-label="${l}"]`)).toHaveAttribute('data-count', String(fc.label![l]));
    await expect(box.getByTestId('m1-m4')).toHaveText(`M1-M4 met on ${m1m4(id)} of ${fc.failures} failures`);
    await expect(box.getByTestId('infra-reruns')).toHaveAttribute('data-count', String(fc.infra_reruns));
  }
  const id = 'renal-dose-review';
  const n = summary.tasks[id]!.fault_counts.label!.model;
  await page.locator(`[data-testid="fault-box"][data-task="${id}"] [data-testid="fault-label-count"][data-label="model"]`).getByRole('link').click();
  await expect(page).toHaveURL(/audit=model/);
  await expect(official(page).getByTestId('trial-row')).toHaveCount(n);
  const labelled = new Set(audit.filter((a) => a.trial.startsWith(`${id}/`)).map((a) => a.trial));
  for (const t of await official(page).getByTestId('trial-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-trial')))) expect(labelled.has(t!)).toBe(true);
});

test('Overview: the most common failure per task, and the run\'s fault box under the table', async ({ page }) => {
  await browse(page, './?view=overview');
  for (const id of TASK_IDS) {
    const fc = summary.tasks[id]!.fault_counts;
    const best = Math.max(...FAILURE_KINDS.map((k) => fc.taxonomy[k]));
    const kind = FAILURE_KINDS.find((k) => fc.taxonomy[k] === best && best > 0);
    const cell = page.locator(`[data-testid="overview-row"][data-task="${id}"] [data-testid="most-common"]`);
    await expect(cell).toHaveAttribute('data-kind', kind ?? '');
    if (kind) await expect(cell).toHaveAttribute('data-count', String(best));
  }
  const box = page.locator('[data-testid="fault-box"][data-task="all"]');
  for (const l of FAILURE_LABELS) await expect(box.locator(`[data-testid="fault-label-count"][data-label="${l}"]`)).toHaveAttribute('data-count', String(TASK_IDS.reduce((n, id) => n + summary.tasks[id]!.fault_counts.label![l], 0)));
});

test('the glossary shows GR5', async ({ page }) => {
  await browse(page, './?view=glossary');
  await expect(page.locator('[data-testid="criterion"][data-id="GR5"]')).toBeVisible();
});

test('a run with a false PASS says it is blocked, shows the count beside k/n and has no headline pass rate', async ({ page }) => {
  const pass = records.find((r) => r.outcome === 'PASS' && r.task_id === 'renal-dose-review')!;
  const row = { trial: trialName(pass), outcome: 'PASS', taxonomy: null, model_fault: 'no', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, label: 'grader', note: 'the grader passed a dose the policy forbids' };
  await page.route(`**/data/results/runs/${summary.run_id}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${(await res.text()).trimEnd()}\n${JSON.stringify(row)}\n` });
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('run-blocked')).toContainText('1 false PASS');
  await expect(page.getByText(/valid trials pass across/)).toHaveCount(0);
  await expect(page.locator('[data-testid="overview-row"][data-task="renal-dose-review"] [data-testid="false-pass"]')).toHaveText('1 false PASS');
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  await expect(page.getByTestId('run-blocked')).toBeVisible();
  await expect(page.getByTestId('runs-k-of-n')).toContainText('1 false PASS');
  await page.getByRole('link', { name: 'Findings', exact: true }).first().click();
  await expect(page.getByTestId('run-blocked')).toBeVisible();
});
