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
import { browseFrom } from './browse.ts';
import { audit, explain, records, sampleBase, summary, TASK_IDS } from './fixtures/sample-results/sample.ts';
import { m1ToM4Met } from '../../../packages/core/explain.ts';
import { trialName } from '../../../packages/core/summary.ts';
import { FAILURE_KINDS, FAILURE_LABELS } from '../../../packages/core/summary.ts';

const browse = browseFrom(sampleBase);

const failures = (task: string) => records.filter((r) => r.task_id === task).map((r) => ({ r, e: explain(r) })).filter(({ e }) => e.valid && e.outcome !== 'PASS');
// The rule audit-check and the page count by (packages/core/explain.ts m1ToM4Met: n/a is met).
const m1m4 = (task: string) => failures(task).filter(({ e }) => m1ToM4Met(e.criteria)).length;
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
  // pass^k and its glossary link are rates too (verifier-phase-P17i-JU8-1 F2, F4).
  await expect(page.getByTestId('pass-k')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'What pass^k means' })).toHaveCount(0);
}

// On Runs, the blocked run's group of plain PASS rows gives no count at all: every row in it is a
// PASS, so its size is a pass count (verifier-phase-P17i-UI-2-1 B1, UI-2-2 N1; decisions.tsv
// 2026-10-29T16:00).
async function noPassGroupCount(page: Page, run = '[data-official="true"]') {
  const summary = page.locator(`[data-testid="run"]${run} [data-testid="pass-group"] > summary`);
  await expect(summary).toHaveText(/^Other trials$/);
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
  await noPassGroupCount(page);
  await page.getByRole('link', { name: 'Findings', exact: true }).first().click();
  await expect(page.getByTestId('run-blocked')).toBeVisible();
  await noRates(page);
  // The fault box names the false PASS beside the grader count (decisions.tsv 21:00).
  await expect(page.locator('[data-testid="fault-box"][data-task="renal-dose-review"] [data-testid="fault-false-pass"]')).toHaveText('(1 false PASS)');
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

test('a valid failure the audit labels environment blocks the run, and its own row, header, swatches and Fault row say so', async ({ page }) => {
  // The run's first FAIL by task and index, the trial Findings shows as its FAIL example.
  const first = records.filter((r) => explain(r).outcome === 'FAIL').sort((a, b) => (a.task_id === b.task_id ? a.index - b.index : a.task_id < b.task_id ? -1 : 1))[0]!;
  const row = audit.find((a) => a.trial === trialName(first))!;
  expect(explain(first).fault).toBe('model');
  await page.route(`**/data/results/runs/${summary.run_id}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    const lines = (await res.text()).split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as { trial?: string });
    await route.fulfill({ response: res, body: `${lines.map((l) => JSON.stringify(l.trial === row.trial ? { ...l, taxonomy: null, label: 'environment', model_fault: 'no' } : l)).join('\n')}\n` });
  });
  await browse(page, './?view=overview');
  await expect(page.getByTestId('run-blocked').getByTestId('blocking-trial')).toContainText([row.trial]);
  await noRates(page);
  // Its Overview swatch takes the label's mark (verifier-phase-P17i-UIRETRO-1 M3).
  await expect(page.locator(`[data-testid="overview-row"][data-task="${first.task_id}"] [data-testid="swatches"] [title^="${row.trial}:"]`)).toHaveAttribute('data-mark', 'environment');
  // Its row and its trial header show the audit's label in the blocked tone (decisions.tsv 17:30 (c)).
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  await noPassGroupCount(page);
  const r = page.locator(`[data-testid="run"][data-official="true"] [data-testid="trial-row"][data-trial="${row.trial}"]`);
  const danger = await page.evaluate(() => {
    const x = document.createElement('span');
    x.className = 'text-danger';
    document.body.append(x);
    const c = getComputedStyle(x).color;
    x.remove();
    return c;
  });
  await expect(r.getByTestId('label')).toHaveAttribute('data-label', 'environment');
  // Its chip takes the label's mark and the danger border, not the model mark (verifier-phase-P17j-retro-JU2-1 D1).
  await expect(r.getByTestId('outcome')).toHaveAttribute('data-mark', 'environment');
  await expect(r.getByTestId('outcome')).toHaveCSS('border-top-color', danger);
  // It is counted, so the note says only the block (decisions.tsv 19:10).
  await expect(r.getByTestId('fault-note')).toHaveText('The run is blocked until this is fixed.');
  await page.getByTestId('run-blocked').getByTestId('blocking-trial').filter({ hasText: row.trial }).click();
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('label')).toHaveAttribute('data-label', 'environment');
  await expect(header.getByTestId('outcome')).toHaveAttribute('data-mark', 'environment');
  await expect(header.getByTestId('outcome')).toHaveCSS('border-top-color', danger);
  await expect(header).toHaveCSS('border-left-color', danger);
  // The Fault row shows the audit's fault and names the one the criteria found (UIRETRO-1 M1).
  await expect(header.getByTestId('detail-fault')).toContainText(/^environment/);
  await expect(header.getByTestId('fault-relabelled')).toContainText("The audit relabelled it; the trial's criteria found the model at fault, decided by");
  // Its Findings example swatch takes the label's mark too (UIRETRO-1 M3).
  await page.getByRole('link', { name: 'Findings', exact: true }).first().click();
  const example = page.getByTestId('exemplars').getByRole('listitem').filter({ has: page.getByRole('link', { name: row.trial, exact: true }) });
  await expect(example.getByRole('img')).toHaveAttribute('data-mark', 'environment');
});

// The sample with no official run, and its pilot pilot-grader-error given two of the official run's
// renal-dose-review PASS records. The pilot's GRADER_ERROR blocks it (data/failures.ts runBlock), so
// it gets the official run's rule: no pass count, rate dot or Wilson interval anywhere, a line
// that says why in their place, and no "blocked" words, which belong to the official run
// (decisions.tsv 2026-10-29T16:00 and 19:10; builder-222 residual 2).
const BLOCKED_PILOT = 'pilot-grader-error';
async function blockedPilot(page: Page) {
  const passes = records.filter((r) => r.outcome === 'PASS' && r.task_id === 'renal-dose-review').slice(0, 2);
  expect(passes).toHaveLength(2);
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files, ...rest } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { ...rest, files: [...files.filter((f) => f !== 'results/official.json'), ...passes.map((r) => `results/${BLOCKED_PILOT}/trials/${trialName(r)}.json`)] } });
  });
  for (const r of passes) {
    await page.route(`**/data/results/${BLOCKED_PILOT}/trials/${trialName(r)}.json`, async (route) => {
      const res = await route.fetch({ url: route.request().url().replace(`/${BLOCKED_PILOT}/`, `/runs/${summary.run_id}/`) });
      await route.fulfill({ response: res });
    });
  }
}

test('a blocked pilot gives no pass count: its Runs header, its Overview line and its rate rows on Overview and Findings', async ({ page }) => {
  await blockedPilot(page);
  const why = 'no pass count while 1 trial needs a fix';
  await browse(page, './?view=overview');
  const pilot = page.locator(`[data-testid="overview-pilot"][data-run="${BLOCKED_PILOT}"]`);
  await expect(pilot.getByTestId('pilot-line')).toHaveText(`${BLOCKED_PILOT}: ${why}.`);
  await expect(pilot.getByTestId('pilot-rate')).toHaveCount(0);
  await expect(pilot).not.toContainText(/blocked/i);
  await noRates(page);
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  const run = page.locator(`[data-testid="run"][data-run="${BLOCKED_PILOT}"]`);
  await expect(run.getByTestId('trial-row').first()).toBeAttached();
  await expect(run.getByTestId('run-header')).toHaveText(`${BLOCKED_PILOT}: ${why} · 1 not counted`);
  await noPassGroupCount(page, `[data-run="${BLOCKED_PILOT}"]`);
  await expect(run.getByTestId('run-header')).not.toContainText(/blocked/i);
  await page.getByRole('link', { name: 'Findings', exact: true }).first().click();
  const card = page.locator(`[data-testid="pilot-findings"][data-run="${BLOCKED_PILOT}"]`);
  await expect(card.getByTestId('pilot-blocked')).toHaveText(`No pass count while 1 trial needs a fix.`);
  await expect(card.getByTestId('pilot-rate')).toHaveCount(0);
  await expect(card.getByTestId('pilot-axis')).toHaveCount(0);
  await noRates(page);
  await expect(card).not.toContainText(/blocked/i);
  // Its not-counted lines stay, one per task, with no k/N (verifier-phase-P17i-UI-FU-1 S1).
  const left = card.getByTestId('not-counted');
  await expect(left).toHaveCount(1);
  await expect(left).toHaveAttribute('data-task', 'message-queue');
  await expect(left).toHaveText(/^Not counted: 1 GRADER_ERROR \(.+\)\.$/);
  await expect(card).not.toContainText(/\d+\/\d+/);
});

// Under label=pass the Runs count line is a pass count, so it hides while a run in the list is
// blocked (the official run, or a pilot shown under it); other labels keep their counts, and a
// list with no blocked run keeps it under pass too (verifier-phase-P17i-UI-FU-1 B1).
const passCount = /\d+ of \d+ trials/;
async function noPassFilterCount(page: Page, query: string, trials: number) {
  for (const q of [`label=pass`, `label=pass&task=renal-dose-review`]) {
    await browse(page, `./?view=runs&${q}${query}`);
    await expect(page.getByTestId('trial-row').first()).toBeAttached();
    await expect(page.getByTestId('shown-count-held')).toHaveText(`Count hidden while ${trials} ${trials === 1 ? 'trial needs' : 'trials need'} a fix`);
    await expect(page.getByTestId('shown-count')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(passCount);
  }
  await browse(page, `./?view=runs&label=infra${query}`);
  await expect(page.getByTestId('shown-count')).toHaveText(/^\d+ of \d+ trials$/);
}

test('label=pass on Runs gives no count while the official run is blocked', async ({ page }) => {
  const pass = records.find((r) => r.outcome === 'PASS' && r.task_id === 'renal-dose-review')!;
  await withRow(page, { trial: trialName(pass), outcome: 'PASS', taxonomy: null, model_fault: 'no', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, label: 'grader', note: 'the grader passed a dose the policy forbids' });
  // The official run's block (1 trial) and the sample's own blocked pilot (1 GRADER_ERROR).
  await noPassFilterCount(page, '', 2);
});

test('label=pass on Runs gives no count while a shown pilot is blocked', async ({ page }) => {
  await blockedPilot(page);
  await noPassFilterCount(page, '', 1);
});

test('label=pass on Runs keeps its count when no run in the list is blocked', async ({ page }) => {
  // The sample without its blocked pilot: only the official run, which nothing blocks.
  await page.route('**/data/index.json', async (route) => {
    const res = await route.fetch();
    const { files, ...rest } = (await res.json()) as { files: string[] };
    await route.fulfill({ response: res, json: { ...rest, files: files.filter((f) => !f.startsWith(`results/${BLOCKED_PILOT}/`)) } });
  });
  for (const q of ['label=pass', 'label=pass&task=renal-dose-review']) {
    await browse(page, `./?view=runs&${q}`);
    await expect(page.getByTestId('trial-row').first()).toBeAttached();
    await expect(page.getByTestId('run-blocked')).toHaveCount(0);
    await expect(page.getByTestId('shown-count')).toHaveText(/^[1-9]\d* of \d+ trials$/);
    await expect(page.getByTestId('shown-count-held')).toHaveCount(0);
  }
});

test('the check and audit filters do not follow a rail link or an Overview task link', async ({ page }) => {
  await browse(page, './?view=runs&task=renal-dose-review&check=apixaban_dose&audit=model');
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await expect(page).not.toHaveURL(/check=|audit=/);
  await page.locator('[data-testid="overview-row"][data-task="crc-care-gap"]').getByRole('link').first().click();
  await expect(page).not.toHaveURL(/check=|audit=/);
  await expect(page.getByTestId('extra-filter')).toHaveCount(0);
});
