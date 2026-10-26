// A false PASS (P17j JG5, outcomes.ts GR5): a PASS that the audit labels grader, with evidence, is
// the grader's fault. The trial page and its Runs row show it as JU2 shows a grader fault that
// blocks the run: the grader label in the danger colour with "Not counted. The run is blocked until
// this is fixed.", the danger rule on the header, the reason, the fault decided by GR5, and the
// criteria in place of "Confirmed"; a PASS without that audit row shows none of it.
import { expect, test, type Page } from '@playwright/test';
import { RUN_ID, trialBase, TRIALS } from './fixtures/trial/trial.ts';

const GR5_ROW = { trial: TRIALS.pass, outcome: 'PASS', taxonomy: null, model_fault: 'no', decisive_step: 3, evidence_ids: ['Patient/pt-0001'], llm_auditor_agrees: true, label: 'grader', note: 'the grader passed a dose the policy forbids' };

// The run's audit.jsonl with the GR5 row added.
async function withFalsePass(page: Page) {
  await page.route(`**/data/results/runs/${RUN_ID}/audit.jsonl`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${(await res.text()).trimEnd()}\n${JSON.stringify(GR5_ROW)}\n` });
  });
}

async function open(page: Page, query: string) {
  await page.goto(new URL(`./?view=runs&run=${RUN_ID}${query}`, await trialBase(test.info().project.use.baseURL!)).href);
  const gate = page.getByRole('button', { name: 'Browse without a key' });
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(gate.or(nav)).toBeVisible();
  if (await gate.isVisible()) await gate.click();
}

const danger = (page: Page) => page.evaluate(() => {
  const x = document.createElement('span');
  x.className = 'text-danger';
  document.body.append(x);
  const c = getComputedStyle(x).color;
  x.remove();
  return c;
});

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: a false PASS shows the grader label in the danger colour, the blocked note and GR5`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await withFalsePass(page);
    await open(page, `&trial=${encodeURIComponent(TRIALS.pass)}`);
    const header = page.getByTestId('trial-header');
    await expect(header.getByTestId('outcome')).toContainText('PASS');
    const label = header.getByTestId('label');
    await expect(label).toHaveAttribute('data-label', 'grader');
    const want = await danger(page);
    await expect(label).toHaveCSS('color', want);
    await expect(header.getByTestId('fault-note')).toHaveText('Not counted. The run is blocked until this is fixed.');
    await expect(header).toHaveCSS('border-left-color', want);
    await expect(header.getByTestId('reason')).toHaveText(/^PASS: an audit found a false PASS/);
    await expect(header.getByTestId('detail-fault')).toContainText('(GR5)');
    await expect(header.locator('[data-testid="header-criteria"] li')).toHaveCount(5);
    await expect(header.getByTestId('header-confirmation')).toHaveCount(0);
  });
}

test('the Runs row of a false PASS shows the grader label and the reason', async ({ page }) => {
  await withFalsePass(page);
  await open(page, '');
  // The pilot-pass run lists the same trial name; the GR5 row is in this run's audit.jsonl.
  const row = page.locator(`[data-testid="run"][data-run="${RUN_ID}"] [data-testid="trial-row"][data-trial="${TRIALS.pass}"]`);
  await expect(row.getByTestId('label')).toHaveAttribute('data-label', 'grader');
  await expect(row.getByTestId('reason')).toHaveText(/^PASS: an audit found a false PASS/);
});

test('a PASS without the GR5 row has no label and says Confirmed or Checks pending', async ({ page }) => {
  await open(page, `&trial=${encodeURIComponent(TRIALS.pass)}`);
  const header = page.getByTestId('trial-header');
  await expect(header.getByTestId('label')).toHaveCount(0);
  await expect(header.getByTestId('header-confirmation')).toBeVisible();
});
