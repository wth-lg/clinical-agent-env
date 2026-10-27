// Why tasks fail (plan P17j JU7, pre-audit S4): Findings shows, per task, a bar by kind of failure
// (TAXONOMY of the current grade, not by outcome), the top failed checks with their check text and
// a Runs link whose filter shows exactly that check's trials, and the fault box: counts by audit
// label, each linking to Runs filtered by that label, the M1-M4 count and the infra re-runs. The
// Overview table gets a "most common failure" column and the run's fault box under it. Every
// number equals summary.json (fault_counts, top_failed_checks), except the M1-M4 count, which only
// the explanations give (audit-check --json gives the same). The glossary shows GR5. A run with a
// trial that blocks it (a false PASS, GR5, or a valid failure the audit labels environment or
// grader) says it is blocked, names the blocking trials and the false PASS count, and shows no pass
// count, pass-rate dot or Wilson interval anywhere (DENOMINATOR_RULE; decisions.tsv 2026-10-29T16:00;
// verifier-phase-P17i-JU7-1 B1, S1). The check and audit filters do not follow a rail link (S2).
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
    await expect(box.getByTestId('m1-m4')).toHaveAttribute('data-met', String(m1m4(id)));
    await expect(box.getByTestId('m1-m4')).toHaveAttribute('data-failures', String(fc.failures));
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

// The sample run with one audit row added.
async function withRow(page: Page, row: object) {
  await page.route(`**/data/results/runs/${summary.run_id}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${(await res.text()).trimEnd()}\n${JSON.stringify(row)}\n` });
  });
}

// No pass count, dot or Wilson interval for the run on any of the three views.
async function noRates(page: Page) {
  await expect(page.getByTestId('k-of-n')).toHaveCount(0);
  await expect(page.getByTestId('safe-pass')).toHaveCount(0);
  await expect(page.getByTestId('interval')).toHaveCount(0);
  await expect(page.getByTestId('wilson')).toHaveCount(0);
}

test('a run with a false PASS is blocked: the blocking trials and the false PASS count, no pass count, dot or interval', async ({ page }) => {
  const pass = records.find((r) => r.outcome === 'PASS' && r.task_id === 'renal-dose-review')!;
  await withRow(page, { trial: trialName(pass), outcome: 'PASS', taxonomy: null, model_fault: 'no', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, label: 'grader', note: 'the grader passed a dose the policy forbids' });
  await browse(page, './?view=overview');
  const notice = page.getByTestId('run-blocked');
  await expect(notice).toContainText('1 false PASS');
  await expect(notice.getByTestId('blocking-trial')).toHaveText([trialName(pass)]);
  await expect(page.getByText(/valid trials pass across/)).toHaveCount(0);
  await expect(page.locator('[data-testid="overview-row"][data-task="renal-dose-review"] [data-testid="false-pass"]')).toHaveText('1 false PASS');
  await noRates(page);
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  await expect(page.getByTestId('run-blocked')).toBeVisible();
  await expect(page.getByTestId('runs-k-of-n')).not.toContainText(/\d+\/\d+/);
  await expect(page.getByTestId('runs-k-of-n')).toContainText('1 false PASS');
  await noRates(page);
  await page.getByRole('link', { name: 'Findings', exact: true }).first().click();
  await expect(page.getByTestId('run-blocked')).toBeVisible();
  await noRates(page);
  // The notice's link opens the blocking trial, whose page shows no pass count either (JU7r2 F1).
  await page.getByTestId('run-blocked').getByTestId('blocking-trial').first().click();
  await expect(page.getByTestId('trial-detail')).toHaveAttribute('data-trial', trialName(pass));
  await expect(page.getByTestId('run-blocked-line')).toHaveText('the run is blocked, so it has no pass rate');
  await noRates(page);
});

test('a current GRADER_ERROR in the run blocks it (DENOMINATOR_RULE; decisions.tsv 2026-10-29T17:30)', async ({ page }) => {
  // The run's GRADER_ERROR without the regrade a fixed grader gave it.
  const regraded = records.find((r) => r.outcome === 'GRADER_ERROR' && r.regrades?.length)!;
  await page.route(`**/data/results/runs/${summary.run_id}/trials/${trialName(regraded)}.json`, async (route) => {
    const res = await route.fetch();
    const { regrades: _, ...rec } = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: rec });
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('run-blocked').getByTestId('blocking-trial')).toContainText([trialName(regraded)]);
  await noRates(page);
});

test('a valid failure the audit labels environment blocks the run, and its own row and header say so', async ({ page }) => {
  const row = audit.find((a) => a.outcome === 'FAIL')!;
  await page.route(`**/data/results/runs/${summary.run_id}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    const lines = (await res.text()).split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as { trial?: string });
    await route.fulfill({ response: res, body: `${lines.map((l) => JSON.stringify(l.trial === row.trial ? { ...l, taxonomy: null, label: 'environment', model_fault: 'no' } : l)).join('\n')}\n` });
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('run-blocked').getByTestId('blocking-trial')).toContainText([row.trial]);
  await noRates(page);
  // Its row and its trial header show the audit's label in the blocked tone (decisions.tsv 17:30 (c)).
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  const r = page.locator(`[data-testid="run"][data-official="true"] [data-testid="trial-row"][data-trial="${row.trial}"]`);
  await expect(r.getByTestId('label')).toHaveAttribute('data-label', 'environment');
  await expect(r.getByTestId('fault-note')).toHaveText('Not counted. The run is blocked until this is fixed.');
  await page.getByTestId('run-blocked').getByTestId('blocking-trial').filter({ hasText: row.trial }).click();
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('label')).toHaveAttribute('data-label', 'environment');
  await expect(header).toHaveCSS('border-left-color', await page.evaluate(() => {
    const x = document.createElement('span');
    x.className = 'text-danger';
    document.body.append(x);
    const c = getComputedStyle(x).color;
    x.remove();
    return c;
  }));
});

test('the check and audit filters do not follow a rail link or an Overview task link', async ({ page }) => {
  await browse(page, './?view=runs&task=renal-dose-review&check=apixaban_dose&audit=model');
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await expect(page).not.toHaveURL(/check=|audit=/);
  await page.locator('[data-testid="overview-row"][data-task="crc-care-gap"]').getByRole('link').first().click();
  await expect(page).not.toHaveURL(/check=|audit=/);
  await expect(page.getByTestId('extra-filter')).toHaveCount(0);
});
